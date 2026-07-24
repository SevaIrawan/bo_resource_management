import { AdminExpandCard } from '@/components/admin/AdminExpandCard';
import {
  normalizePlatformWorkerSettings,
  persistTelegramWorkerSettings,
  persistWhatsAppWorkerSettings,
  readTelegramWorkerSettings,
  readWhatsAppWorkerSettings,
  workerSettingsEqual,
  workerSettingsSummary,
  type HumanDelayProfile,
  type PlatformWorkerSettings,
  type TelegramAdminRightsSettings,
} from '@/config/workerPlatformSettings';
import { TABLES } from '@/config/tables';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import {
  brandGroupPhotoPreviewUrl,
  pickAndSaveBrandGroupPhoto,
  resolveBrandGroupPhotoPath,
} from '@/lib/brandGroupPhotoClient';
import { resolveMonitoringUserId } from '@/lib/monitoringDataUser';
import { getSupabase } from '@/lib/supabase';
import { ImagePlus, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type WorkerPlatform = 'whatsapp' | 'telegram';

const TG_ADMIN_RIGHT_KEYS: (keyof TelegramAdminRightsSettings)[] = [
  'changeInfo',
  'postMessages',
  'editMessages',
  'deleteMessages',
  'banUsers',
  'inviteUsers',
  'pinMessages',
  'addAdmins',
  'manageCall',
  'anonymous',
  'deleteStories',
];

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="worker-settings-toggle" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="worker-settings-toggle__input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="worker-settings-toggle__label">{label}</span>
    </label>
  );
}

function NumberRow({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="worker-settings-number">
      <label className="worker-settings-number__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="worker-settings-number__input"
      />
    </div>
  );
}

interface BrandPhotoRow {
  brandName: string;
  photoPath: string | null;
  previewUrl: string | null;
}

async function loadAllUserBrandNames(userId: string): Promise<string[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLES.brands)
    .select('name')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error || !data) return [];
  return (data as { name: string }[])
    .map((b) => b.name.trim())
    .filter(Boolean);
}

function BrandPhotoSection() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [rows, setRows] = useState<BrandPhotoRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPhotos = useCallback(async () => {
    if (!user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const dataUserId = await resolveMonitoringUserId(user.id, user.userName);
      const brandNames = await loadAllUserBrandNames(dataUserId);

      const photoRows: BrandPhotoRow[] = await Promise.all(
        brandNames.map(async (brandName) => {
          const resolved = await resolveBrandGroupPhotoPath(brandName, dataUserId);
          let previewUrl: string | null = null;
          if (resolved.ok) {
            previewUrl = await brandGroupPhotoPreviewUrl(resolved.path, dataUserId, brandName);
          }
          return {
            brandName,
            photoPath: resolved.ok ? resolved.path : null,
            previewUrl,
          };
        }),
      );
      setRows(photoRows);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.userName]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  useEffect(() => {
    const reload = () => void loadPhotos();
    window.addEventListener('rm-operations-reload', reload);
    window.addEventListener('rm-reporting-reload', reload);
    return () => {
      window.removeEventListener('rm-operations-reload', reload);
      window.removeEventListener('rm-reporting-reload', reload);
    };
  }, [loadPhotos]);

  async function handleUpload(brandName: string) {
    if (!user?.id) return;
    const dataUserId = await resolveMonitoringUserId(user.id, user.userName);
    const result = await pickAndSaveBrandGroupPhoto(brandName, dataUserId);
    if (result.ok) {
      setRows((prev) =>
        prev.map((r) =>
          r.brandName === brandName
            ? { ...r, photoPath: result.path, previewUrl: result.dataUrl ?? r.previewUrl }
            : r,
        ),
      );
    }
  }

  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <section className="worker-settings-section">
        <h4 className="worker-settings-section__title">{t('admin.brandPhoto.title')}</h4>
        <div className="brand-photo-loading">
          <Loader2 className="animate-spin" size={16} />
        </div>
      </section>
    );
  }

  if (rows.length === 0) return null;

  const configuredCount = rows.filter((r) => r.photoPath).length;

  return (
    <section className="worker-settings-section">
      <button
        type="button"
        className="worker-settings-section__expand-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="worker-settings-section__expand-title">{t('admin.brandPhoto.title')}</span>
        <span className="worker-settings-section__expand-badge">
          {configuredCount}/{rows.length}
        </span>
        <svg
          className={`worker-settings-section__expand-chevron${expanded ? ' worker-settings-section__expand-chevron--open' : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="brand-photo-list">
          {rows.map((row) => (
            <div key={row.brandName} className="brand-photo-item">
              <div className="brand-photo-item__preview">
                {row.previewUrl ? (
                  <img src={row.previewUrl} alt={row.brandName} className="brand-photo-item__img" />
                ) : (
                  <div className="brand-photo-item__placeholder">
                    <ImagePlus size={20} />
                  </div>
                )}
              </div>
              <div className="brand-photo-item__info">
                <span className="brand-photo-item__name">{row.brandName}</span>
                {!row.photoPath && (
                  <span className="brand-photo-item__hint">{t('admin.brandPhoto.notSet')}</span>
                )}
              </div>
              <button
                type="button"
                className="brand-photo-item__btn"
                onClick={() => void handleUpload(row.brandName)}
              >
                {row.photoPath ? t('admin.brandPhoto.change') : t('admin.brandPhoto.upload')}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkerPlatformSettingsPanel({ platform }: { platform: WorkerPlatform }) {
  const { t } = useLanguage();
  const ns = platform === 'whatsapp' ? 'admin.workerWhatsApp' : 'admin.workerTelegram';
  const readSaved =
    platform === 'whatsapp' ? readWhatsAppWorkerSettings : readTelegramWorkerSettings;
  const persistSaved =
    platform === 'whatsapp' ? persistWhatsAppWorkerSettings : persistTelegramWorkerSettings;

  const [saved, setSaved] = useState<PlatformWorkerSettings>(() => readSaved());
  const [draft, setDraft] = useState<PlatformWorkerSettings>(() => readSaved());
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const reload = useCallback(() => {
    const next = readSaved();
    setSaved(next);
    setDraft(next);
  }, [readSaved]);

  useEffect(() => {
    const sync = () => reload();
    window.addEventListener('rm-worker-settings-changed', sync);
    return () => window.removeEventListener('rm-worker-settings-changed', sync);
  }, [reload]);

  const dirty = useMemo(() => !workerSettingsEqual(draft, saved), [draft, saved]);

  function patch(patch: Partial<PlatformWorkerSettings>) {
    setSaveMessage(null);
    setDraft((prev) =>
      normalizePlatformWorkerSettings({ ...prev, ...patch }, platform),
    );
  }

  function handleSave() {
    const next = normalizePlatformWorkerSettings(draft, platform);
    persistSaved(next);
    setSaved(next);
    setDraft(next);
    setSaveMessage(t('admin.workerCommon.saved'));
  }

  function handleDiscard() {
    setDraft(saved);
    setSaveMessage(null);
  }

  const humanOptions: HumanDelayProfile[] = ['safe', 'fast', 'off'];

  return (
    <div className="worker-settings-panel">
      <section className="worker-settings-section">
        <h4 className="worker-settings-section__title">{t(`${ns}.sectionStandard`)}</h4>
        <p className="worker-settings-section__desc">{t(`${ns}.sectionStandardDesc`)}</p>
        <div className="worker-settings-grid">
          <div className="worker-settings-field">
            <label className="worker-settings-number__label" htmlFor={`${platform}-human-profile`}>
              {t('admin.workerCommon.humanProfile')}
            </label>
            <select
              id={`${platform}-human-profile`}
              className="worker-settings-select"
              value={draft.standard.humanProfile}
              onChange={(e) =>
                patch({
                  standard: {
                    ...draft.standard,
                    humanProfile: e.target.value as HumanDelayProfile,
                  },
                })
              }
            >
              {humanOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {t(`admin.workerCommon.humanProfile_${opt}`)}
                </option>
              ))}
            </select>
          </div>
          <NumberRow
            id={`${platform}-per-run`}
            label={t('admin.workerCommon.perRun')}
            value={draft.standard.perRun}
            min={1}
            max={25}
            onChange={(perRun) => patch({ standard: { ...draft.standard, perRun } })}
          />
          <NumberRow
            id={`${platform}-between-groups`}
            label={t('admin.workerCommon.betweenGroupsSec')}
            value={draft.standard.betweenGroupsSec}
            min={5}
            max={3600}
            onChange={(betweenGroupsSec) =>
              patch({ standard: { ...draft.standard, betweenGroupsSec } })
            }
          />
          <NumberRow
            id={`${platform}-between-targets`}
            label={t('admin.workerCommon.betweenTargetsSec')}
            value={draft.standard.betweenTargetsSec}
            min={5}
            max={600}
            onChange={(betweenTargetsSec) =>
              patch({ standard: { ...draft.standard, betweenTargetsSec } })
            }
          />
          <NumberRow
            id={`${platform}-after-create`}
            label={t('admin.workerCommon.afterCreateSec')}
            value={draft.standard.afterCreateSec}
            min={5}
            max={3600}
            onChange={(afterCreateSec) =>
              patch({ standard: { ...draft.standard, afterCreateSec } })
            }
          />
          <NumberRow
            id={`${platform}-flood-extra`}
            label={t('admin.workerCommon.floodWaitExtraSec')}
            value={draft.standard.floodWaitExtraSec}
            min={0}
            max={600}
            onChange={(floodWaitExtraSec) =>
              patch({ standard: { ...draft.standard, floodWaitExtraSec } })
            }
          />
          {platform === 'telegram' ? (
            <>
              <NumberRow
                id={`${platform}-max-floodwait`}
                label={t('admin.workerCommon.maxFloodwaitAutoSleepSec')}
                value={draft.standard.maxFloodwaitAutoSleepSec}
                min={60}
                max={86400}
                onChange={(maxFloodwaitAutoSleepSec) =>
                  patch({ standard: { ...draft.standard, maxFloodwaitAutoSleepSec } })
                }
              />
              <NumberRow
                id={`${platform}-photo-retry`}
                label={t('admin.workerTelegram.setPhotoMaxRetry')}
                value={draft.standard.setPhotoMaxRetry}
                min={0}
                max={5}
                onChange={(setPhotoMaxRetry) =>
                  patch({ standard: { ...draft.standard, setPhotoMaxRetry } })
                }
              />
            </>
          ) : null}
          <NumberRow
            id={`${platform}-pause-run-low`}
            label={t('admin.workerCommon.pauseBetweenRunsMinLow')}
            value={draft.standard.pauseBetweenRunsMinLow}
            min={0}
            max={180}
            onChange={(pauseBetweenRunsMinLow) =>
              patch({ standard: { ...draft.standard, pauseBetweenRunsMinLow } })
            }
          />
          <NumberRow
            id={`${platform}-pause-run-high`}
            label={t('admin.workerCommon.pauseBetweenRunsMinHigh')}
            value={draft.standard.pauseBetweenRunsMinHigh}
            min={0}
            max={180}
            onChange={(pauseBetweenRunsMinHigh) =>
              patch({ standard: { ...draft.standard, pauseBetweenRunsMinHigh } })
            }
          />
          <NumberRow
            id={`${platform}-pause-script-low`}
            label={t('admin.workerCommon.pauseBetweenScriptsMinLow')}
            value={draft.standard.pauseBetweenScriptsMinLow}
            min={0}
            max={180}
            onChange={(pauseBetweenScriptsMinLow) =>
              patch({ standard: { ...draft.standard, pauseBetweenScriptsMinLow } })
            }
          />
          <NumberRow
            id={`${platform}-pause-script-high`}
            label={t('admin.workerCommon.pauseBetweenScriptsMinHigh')}
            value={draft.standard.pauseBetweenScriptsMinHigh}
            min={0}
            max={180}
            onChange={(pauseBetweenScriptsMinHigh) =>
              patch({ standard: { ...draft.standard, pauseBetweenScriptsMinHigh } })
            }
          />
        </div>
      </section>

      <section className="worker-settings-section">
        <h4 className="worker-settings-section__title">{t(`${ns}.sectionCreateGroup`)}</h4>
        <p className="worker-settings-section__desc">{t(`${ns}.sectionCreateGroupDesc`)}</p>
        <div className="worker-settings-toggle-grid">
          {platform === 'whatsapp' ? (
            <>
              <ToggleRow
                id={`${platform}-msg-admins-only`}
                label={t('admin.workerWhatsApp.messagesAdminsOnly')}
                checked={draft.createGroup.messagesAdminsOnly}
                onChange={(messagesAdminsOnly) =>
                  patch({ createGroup: { ...draft.createGroup, messagesAdminsOnly } })
                }
              />
              <ToggleRow
                id={`${platform}-add-admins-only`}
                label={t('admin.workerWhatsApp.addMembersAdminsOnly')}
                checked={draft.createGroup.addMembersAdminsOnly}
                onChange={(addMembersAdminsOnly) =>
                  patch({ createGroup: { ...draft.createGroup, addMembersAdminsOnly } })
                }
              />
              <ToggleRow
                id={`${platform}-info-admins-only`}
                label={t('admin.workerWhatsApp.infoAdminsOnly')}
                checked={draft.createGroup.infoAdminsOnly}
                onChange={(infoAdminsOnly) =>
                  patch({ createGroup: { ...draft.createGroup, infoAdminsOnly } })
                }
              />
            </>
          ) : (
            <>
              <ToggleRow
                id={`${platform}-hide-history`}
                label={t('admin.workerTelegram.hideChatHistoryForMembers')}
                checked={draft.createGroup.hideChatHistoryForMembers}
                onChange={(hideChatHistoryForMembers) =>
                  patch({ createGroup: { ...draft.createGroup, hideChatHistoryForMembers } })
                }
              />
              <p className="worker-settings-section__sub">{t('admin.workerTelegram.adminRightsTitle')}</p>
              {TG_ADMIN_RIGHT_KEYS.map((key) => (
                <ToggleRow
                  key={key}
                  id={`${platform}-right-${key}`}
                  label={t(`admin.workerTelegram.right_${key}`)}
                  checked={draft.createGroup.telegramAdminRights[key]}
                  onChange={(value) =>
                    patch({
                      createGroup: {
                        ...draft.createGroup,
                        telegramAdminRights: {
                          ...draft.createGroup.telegramAdminRights,
                          [key]: value,
                        },
                      },
                    })
                  }
                />
              ))}
            </>
          )}
        </div>
      </section>

      <section className="worker-settings-section">
        <h4 className="worker-settings-section__title">{t(`${ns}.sectionInviteLink`)}</h4>
        <p className="worker-settings-section__desc">{t(`${ns}.sectionInviteLinkDesc`)}</p>
        <div className="worker-settings-grid">
          <NumberRow
            id={`${platform}-invite-delay-min`}
            label={t('admin.workerCommon.inviteDelayMinSec')}
            value={draft.inviteLink.delayMinSec}
            min={5}
            max={600}
            onChange={(delayMinSec) =>
              patch({ inviteLink: { ...draft.inviteLink, delayMinSec } })
            }
          />
          <NumberRow
            id={`${platform}-invite-delay-max`}
            label={t('admin.workerCommon.inviteDelayMaxSec')}
            value={draft.inviteLink.delayMaxSec}
            min={5}
            max={900}
            onChange={(delayMaxSec) =>
              patch({ inviteLink: { ...draft.inviteLink, delayMaxSec } })
            }
          />
          <NumberRow
            id={`${platform}-invite-batch`}
            label={t('admin.workerCommon.inviteBatchEvery')}
            value={draft.inviteLink.batchEvery}
            min={1}
            max={100}
            onChange={(batchEvery) => patch({ inviteLink: { ...draft.inviteLink, batchEvery } })}
          />
          <NumberRow
            id={`${platform}-invite-batch-delay-min`}
            label={t('admin.workerCommon.inviteBatchDelayMinSec')}
            value={draft.inviteLink.batchDelayMinSec}
            min={30}
            max={3600}
            onChange={(batchDelayMinSec) =>
              patch({ inviteLink: { ...draft.inviteLink, batchDelayMinSec } })
            }
          />
          <NumberRow
            id={`${platform}-invite-batch-delay-max`}
            label={t('admin.workerCommon.inviteBatchDelayMaxSec')}
            value={draft.inviteLink.batchDelayMaxSec}
            min={30}
            max={7200}
            onChange={(batchDelayMaxSec) =>
              patch({ inviteLink: { ...draft.inviteLink, batchDelayMaxSec } })
            }
          />
          <NumberRow
            id={`${platform}-invite-max-run`}
            label={t('admin.workerCommon.inviteMaxPerRun')}
            value={draft.inviteLink.maxPerRun}
            min={0}
            max={500}
            onChange={(maxPerRun) => patch({ inviteLink: { ...draft.inviteLink, maxPerRun } })}
          />
          {platform === 'telegram' ? (
            <>
              <NumberRow
                id={`${platform}-invite-retry`}
                label={t('admin.workerCommon.inviteExportRetries')}
                value={draft.inviteLink.inviteExportRetries}
                min={0}
                max={20}
                onChange={(inviteExportRetries) =>
                  patch({ inviteLink: { ...draft.inviteLink, inviteExportRetries } })
                }
              />
              <NumberRow
                id={`${platform}-invite-retry-sec`}
                label={t('admin.workerCommon.inviteExportRetrySec')}
                value={draft.inviteLink.inviteExportRetrySec}
                min={1}
                max={120}
                onChange={(inviteExportRetrySec) =>
                  patch({ inviteLink: { ...draft.inviteLink, inviteExportRetrySec } })
                }
              />
            </>
          ) : null}
        </div>
      </section>

      <section className="worker-settings-section">
        <h4 className="worker-settings-section__title">{t(`${ns}.sectionSetAdmin`)}</h4>
        <p className="worker-settings-section__desc">{t(`${ns}.sectionSetAdminDesc`)}</p>
        <div className="worker-settings-grid">
          {platform === 'telegram' ? (
            <>
              <NumberRow
                id={`${platform}-max-admin-slots`}
                label={t('admin.workerCommon.maxAdminSlots')}
                value={draft.setAdmin.maxAdminSlots}
                min={1}
                max={5}
                onChange={(maxAdminSlots) =>
                  patch({ setAdmin: { ...draft.setAdmin, maxAdminSlots } })
                }
              />
              <NumberRow
                id={`${platform}-resolve-attempts`}
                label={t('admin.workerCommon.resolveEntityMaxAttempts')}
                value={draft.setAdmin.resolveEntityMaxAttempts}
                min={1}
                max={10}
                onChange={(resolveEntityMaxAttempts) =>
                  patch({ setAdmin: { ...draft.setAdmin, resolveEntityMaxAttempts } })
                }
              />
            </>
          ) : null}
          <NumberRow
            id={`${platform}-set-admin-delay`}
            label={t('admin.workerCommon.betweenTargetsSec')}
            value={draft.setAdmin.betweenTargetsSec}
            min={5}
            max={600}
            onChange={(betweenTargetsSec) =>
              patch({ setAdmin: { ...draft.setAdmin, betweenTargetsSec } })
            }
          />
        </div>
      </section>

      <section className="worker-settings-section">
        <h4 className="worker-settings-section__title">{t(`${ns}.sectionLeaveDelete`)}</h4>
        <p className="worker-settings-section__desc">{t(`${ns}.sectionLeaveDeleteDesc`)}</p>
        <div className="worker-settings-toggle-grid">
          <ToggleRow
            id={`${platform}-leave-enabled`}
            label={t('admin.workerCommon.leaveEnabled')}
            checked={draft.leaveDelete.leaveEnabled}
            onChange={(leaveEnabled) =>
              patch({ leaveDelete: { ...draft.leaveDelete, leaveEnabled } })
            }
          />
          <ToggleRow
            id={`${platform}-delete-enabled`}
            label={t('admin.workerCommon.deleteEnabled')}
            checked={draft.leaveDelete.deleteEnabled}
            onChange={(deleteEnabled) =>
              patch({ leaveDelete: { ...draft.leaveDelete, deleteEnabled } })
            }
          />
          {platform === 'telegram' ? (
            <ToggleRow
              id={`${platform}-require-owner`}
              label={t('admin.workerCommon.requireOwnerForDelete')}
              checked={draft.leaveDelete.requireOwnerForDelete}
              onChange={(requireOwnerForDelete) =>
                patch({ leaveDelete: { ...draft.leaveDelete, requireOwnerForDelete } })
              }
            />
          ) : (
            <ToggleRow
              id={`${platform}-clear-history`}
              label={t('admin.workerWhatsApp.clearChatHistoryOnDelete')}
              checked={draft.leaveDelete.clearChatHistoryOnDelete}
              onChange={(clearChatHistoryOnDelete) =>
                patch({ leaveDelete: { ...draft.leaveDelete, clearChatHistoryOnDelete } })
              }
            />
          )}
          <NumberRow
            id={`${platform}-leave-delay`}
            label={t('admin.workerCommon.leaveBetweenGroupsSec')}
            value={draft.leaveDelete.betweenGroupsSec}
            min={5}
            max={3600}
            onChange={(betweenGroupsSec) =>
              patch({ leaveDelete: { ...draft.leaveDelete, betweenGroupsSec } })
            }
          />
        </div>
      </section>

      <BrandPhotoSection />

      <div className="operations-stock-policy-footer">
        {saveMessage ? (
          <p className="operations-stock-policy-footer__status" role="status">
            {saveMessage}
          </p>
        ) : null}
        <div className="operations-stock-policy-actions">
          <button
            type="button"
            className="operations-stock-policy-discard-btn"
            onClick={handleDiscard}
            disabled={!dirty}
          >
            {t('admin.workerCommon.discard')}
          </button>
          <button
            type="button"
            className="operations-stock-policy-save-btn"
            onClick={handleSave}
            disabled={!dirty}
          >
            {t('admin.workerCommon.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkerWhatsAppSettingsCard() {
  const { t } = useLanguage();
  const [summary, setSummary] = useState(() => workerSettingsSummary(readWhatsAppWorkerSettings()));

  useEffect(() => {
    const sync = () => setSummary(workerSettingsSummary(readWhatsAppWorkerSettings()));
    window.addEventListener('rm-worker-settings-changed', sync);
    return () => window.removeEventListener('rm-worker-settings-changed', sync);
  }, []);

  return (
    <AdminExpandCard cardId="worker-whatsapp" title={t('admin.workerWhatsApp.title')} summary={summary}>
      <WorkerPlatformSettingsPanel platform="whatsapp" />
    </AdminExpandCard>
  );
}

export function WorkerTelegramSettingsCard() {
  const { t } = useLanguage();
  const [summary, setSummary] = useState(() => workerSettingsSummary(readTelegramWorkerSettings()));

  useEffect(() => {
    const sync = () => setSummary(workerSettingsSummary(readTelegramWorkerSettings()));
    window.addEventListener('rm-worker-settings-changed', sync);
    return () => window.removeEventListener('rm-worker-settings-changed', sync);
  }, []);

  return (
    <AdminExpandCard cardId="worker-telegram" title={t('admin.workerTelegram.title')} summary={summary}>
      <WorkerPlatformSettingsPanel platform="telegram" />
    </AdminExpandCard>
  );
}

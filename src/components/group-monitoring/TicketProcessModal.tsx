import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { BrandImage } from '@/components/brand/BrandImage';
import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { DarkSelect } from '@/components/ui/DarkSelect';
import { exportTicketGroupExcel } from '@/lib/exportExcel';
import { getErrorMessage } from '@/lib/errorMessage';
import type { TicketSummaryGroup } from '@/lib/ticketGroups';
import { ticketNoteForDisplay } from '@/lib/ticketNote';
import { upsertIssueHandle } from '@/lib/ticketWorkflowDb';
import {
  DEFAULT_TICKET_PROCESS_RECORD,
  getTicketProcess,
  setTicketProcessCache,
  TICKET_TASK_STATUSES,
  taskStatusI18nKey,
  type TicketProcessRecord,
  type TicketTaskStatus,
} from '@/lib/ticketWorkflowLocal';
import { ticketTypeLabel } from '@/lib/ticketTypeLabel';
import { useLanguage } from '@/hooks/useLanguage';

interface TicketProcessModalProps {
  group: TicketSummaryGroup;
  open: boolean;
  onClose: () => void;
}

export function TicketProcessModal({ group, open, onClose }: TicketProcessModalProps) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<TicketProcessRecord>(DEFAULT_TICKET_PROCESS_RECORD);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!open) return;
    const loaded = getTicketProcess(group.issueId);
    setDraft(loaded);
    draftRef.current = loaded;
    setSaveError(null);
  }, [open, group.issueId]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const issueName = ticketTypeLabel(t, group.ticketType, 'export');
  const platformLabel =
    group.platform === 'whatsapp'
      ? t('groupMonitoring.platform.whatsapp')
      : t('groupMonitoring.platform.telegram');
  const platformAsset = group.platform === 'whatsapp' ? 'whatsapp' : 'telegram';
  const formatNote = (line: (typeof group.lines)[number]) =>
    ticketNoteForDisplay(t, group.ticketType, line.description, line);

  const handleTaskStatusChange = (taskStatus: TicketTaskStatus) => {
    setDraft((prev) => {
      const next = { ...prev, taskStatus };
      draftRef.current = next;
      return next;
    });
  };

  const handleSave = async () => {
    const record = draftRef.current;
    setSaving(true);
    setSaveError(null);
    try {
      await upsertIssueHandle(group, record);
      setTicketProcessCache(group.issueId, record);
      onClose();
    } catch (error) {
      setSaveError(
        getErrorMessage(error, t('groupMonitoring.ticketPanel.processModal.saveFailed')),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    exportTicketGroupExcel(group, issueName, formatNote);
  };

  if (!open) return null;

  return (
    <BrandModalRoot onBackdropClick={onClose}>
      <div
        className="brand-modal-panel brand-modal-panel--ticket-process"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-process-title"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header ticket-process-modal-header">
          <div className="ticket-process-modal-header-main">
            <h2 id="ticket-process-title" className="brand-modal-title">
              {issueName}
            </h2>
            <p className="brand-modal-subtitle ticket-process-modal-subtitle">
              <BrandImage
                asset={platformAsset}
                alt={group.platform}
                className="ticket-process-modal-platform-icon"
              />
              <span>{platformLabel}</span>
              <span>{group.accountName}</span>
              <span>{group.phoneNumber}</span>
            </p>
          </div>

          <div className="ticket-process-modal-header-controls">
            <DarkSelect
              value={draft.taskStatus}
              onChange={(status) => handleTaskStatusChange(status as TicketTaskStatus)}
              options={TICKET_TASK_STATUSES.map((status) => ({
                value: status,
                label: t(taskStatusI18nKey(status)),
              }))}
              ariaLabel={t('groupMonitoring.ticketPanel.processModal.taskLabel')}
              triggerClassName="ticket-process-task-select"
              menuAlign="right"
            />
            <button
              type="button"
              className="brand-modal-close"
              onClick={onClose}
              aria-label={t('groupMonitoring.ticketPanel.closeDetail')}
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className="brand-modal-form ticket-process-modal-body">
          <fieldset className="ticket-process-fieldset">
            <legend className="brand-modal-label">
              {t('groupMonitoring.ticketPanel.processModal.dueDateSection')}
            </legend>
            <div className="ticket-process-date-row">
              <label className="ticket-process-field">
                <span className="brand-modal-label">
                  {t('groupMonitoring.ticketPanel.processModal.startTask')}
                </span>
                <input
                  type="date"
                  className="brand-modal-input ticket-process-date-input"
                  value={draft.startTask}
                  onChange={(event) =>
                    setDraft((prev) => {
                      const next = { ...prev, startTask: event.target.value };
                      draftRef.current = next;
                      return next;
                    })
                  }
                />
              </label>
              <label className="ticket-process-field">
                <span className="brand-modal-label">
                  {t('groupMonitoring.ticketPanel.processModal.endTask')}
                </span>
                <input
                  type="date"
                  className="brand-modal-input ticket-process-date-input"
                  value={draft.endTask}
                  onChange={(event) =>
                    setDraft((prev) => {
                      const next = { ...prev, endTask: event.target.value };
                      draftRef.current = next;
                      return next;
                    })
                  }
                />
              </label>
            </div>
          </fieldset>

          <label className="ticket-process-field ticket-process-field--remark">
            <span className="brand-modal-label">
              {t('groupMonitoring.ticketPanel.processModal.remarkTask')}
            </span>
            <textarea
              className="brand-modal-input ticket-process-remark"
              rows={4}
              value={draft.remark}
              placeholder={t('groupMonitoring.ticketPanel.processModal.remarkPlaceholder')}
              onChange={(event) =>
                setDraft((prev) => {
                  const next = { ...prev, remark: event.target.value };
                  draftRef.current = next;
                  return next;
                })
              }
            />
          </label>

          {saveError ? <p className="brand-modal-error">{saveError}</p> : null}
        </div>

        <footer className="brand-modal-actions ticket-process-modal-footer">
          <button
            type="button"
            className="brand-modal-btn brand-modal-btn--ghost ticket-process-export-btn"
            onClick={handleExport}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {t('groupMonitoring.ticketPanel.processModal.exportDetail')}
          </button>
          <button
            type="button"
            className="brand-modal-btn brand-modal-btn--primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving
              ? t('groupMonitoring.ticketPanel.processModal.saving')
              : t('groupMonitoring.ticketPanel.processModal.save')}
          </button>
        </footer>
      </div>
    </BrandModalRoot>
  );
}

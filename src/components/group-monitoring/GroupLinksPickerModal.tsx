import { BrandModalRoot } from '@/components/ui/BrandModalRoot';
import { useLanguage } from '@/hooks/useLanguage';

export type GroupLinksViewMode = 'account' | 'adminMaster' | 'junk';

interface GroupLinksPickerModalProps {
  open: boolean;
  accountName: string;
  onClose: () => void;
  onSelect: (mode: GroupLinksViewMode) => void;
}

export function GroupLinksPickerModal({
  open,
  accountName,
  onClose,
  onSelect,
}: GroupLinksPickerModalProps) {
  const { t } = useLanguage();

  if (!open) return null;

  return (
    <BrandModalRoot onBackdropClick={onClose}>
      <div
        className="brand-modal-panel brand-modal-panel--group-links-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-links-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="brand-modal-header">
          <h2 id="group-links-picker-title" className="brand-modal-title">
            {t('groupMonitoring.groupLinks.pickerTitle')}
          </h2>
          <p className="brand-modal-subtitle">{accountName}</p>
        </header>

        <div className="group-links-picker-body">
          <button
            type="button"
            className="group-links-picker-option"
            onClick={() => onSelect('account')}
          >
            <span className="group-links-picker-option-title">
              {t('groupMonitoring.groupLinks.modeAccount')}
            </span>
            <span className="group-links-picker-option-desc">
              {t('groupMonitoring.groupLinks.modeAccountDesc')}
            </span>
          </button>
          <button
            type="button"
            className="group-links-picker-option"
            onClick={() => onSelect('adminMaster')}
          >
            <span className="group-links-picker-option-title">
              {t('groupMonitoring.groupLinks.modeAdminMaster')}
            </span>
            <span className="group-links-picker-option-desc">
              {t('groupMonitoring.groupLinks.modeAdminMasterDesc')}
            </span>
          </button>
          <button
            type="button"
            className="group-links-picker-option"
            onClick={() => onSelect('junk')}
          >
            <span className="group-links-picker-option-title">
              {t('groupMonitoring.groupLinks.modeJunk')}
            </span>
            <span className="group-links-picker-option-desc">
              {t('groupMonitoring.groupLinks.modeJunkDesc')}
            </span>
          </button>
        </div>

        <footer className="brand-modal-actions">
          <button type="button" className="brand-modal-btn brand-modal-btn--ghost" onClick={onClose}>
            {t('groupMonitoring.accountCard.closeModal')}
          </button>
        </footer>
      </div>
    </BrandModalRoot>
  );
}

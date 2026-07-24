import { useMemo } from 'react';
import { DarkSelect } from '@/components/ui/DarkSelect';
import {
  ACCOUNT_OPS_ROLE_OPTIONS,
  normalizeAccountOpsRole,
  type AccountOpsRole,
} from '@/config/accountOpsRole';
import { useLanguage } from '@/hooks/useLanguage';

interface AccountOpsRoleSelectProps {
  id: string;
  value: AccountOpsRole | '';
  disabled?: boolean;
  onChange: (value: AccountOpsRole | '') => void;
}

export function AccountOpsRoleSelect({
  id,
  value,
  disabled = false,
  onChange,
}: AccountOpsRoleSelectProps) {
  const { t } = useLanguage();
  const selected = normalizeAccountOpsRole(value) ?? '';

  const options = useMemo(
    () => [
      {
        value: '',
        label: t('groupMonitoring.accountCard.opsRoleSelectPlaceholder'),
      },
      ...ACCOUNT_OPS_ROLE_OPTIONS.map((role) => ({
        value: role,
        label:
          role === 'master'
            ? t('groupMonitoring.accountCard.opsRoleMaster')
            : t('groupMonitoring.accountCard.opsRoleGcs'),
      })),
    ],
    [t],
  );

  return (
    <DarkSelect
      id={id}
      value={selected}
      onChange={(next) => {
        const role = normalizeAccountOpsRole(next);
        onChange(role ?? '');
      }}
      options={options}
      disabled={disabled}
      ariaLabel={t('groupMonitoring.accountCard.opsRoleLabel')}
      className="brand-modal-select-wrap"
      triggerClassName="brand-modal-select-trigger"
      menuPlacement="up"
    />
  );
}

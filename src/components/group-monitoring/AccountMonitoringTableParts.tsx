import { useLanguage } from '@/hooks/useLanguage';

/** 9 kolom card view — lebar via CSS % (total 100%). */
export const ACCOUNT_TABLE_COLUMN_COUNT = 9;

export type AccountMonitoringTableLayout = 'brandCard' | 'flat';

export function AccountMonitoringTableColGroup({
  layout = 'brandCard',
}: {
  layout?: AccountMonitoringTableLayout;
}) {
  if (layout === 'flat') {
    return (
      <colgroup>
        <col className="brand-col brand-col--account" />
        <col className="brand-col brand-col--brand-name" />
        <col className="brand-col brand-col--location" />
        <col className="brand-col brand-col--status" />
        <col className="brand-col brand-col--session" />
        <col className="brand-col brand-col--on-device" />
        <col className="brand-col brand-col--in-brand" />
        <col className="brand-col brand-col--admin" />
        <col className="brand-col brand-col--action" />
      </colgroup>
    );
  }

  return (
    <colgroup>
      <col className="brand-col brand-col--account" />
      <col className="brand-col brand-col--location" />
      <col className="brand-col brand-col--status" />
      <col className="brand-col brand-col--session" />
      <col className="brand-col brand-col--on-device" />
      <col className="brand-col brand-col--in-brand" />
      <col className="brand-col brand-col--admin" />
      <col className="brand-col brand-col--last-update" />
      <col className="brand-col brand-col--action" />
    </colgroup>
  );
}

export function AccountMonitoringTableHead({
  layout = 'brandCard',
}: {
  layout?: AccountMonitoringTableLayout;
}) {
  const { t } = useLanguage();

  if (layout === 'flat') {
    return (
      <thead className="brand-card-table-head">
        <tr>
          <th className="brand-col-head brand-col-head--account">
            {t('groupMonitoring.accountCard.colAccount')}
          </th>
          <th className="brand-col-head brand-col-head--brand-name">
            {t('groupMonitoring.accountCard.colBrand')}
          </th>
          <th className="brand-col-head brand-col-head--location">
            {t('groupMonitoring.accountCard.colLocation')}
          </th>
          <th className="brand-col-head brand-col-head--status">
            {t('groupMonitoring.accountCard.colStatus')}
          </th>
          <th className="brand-col-head brand-col-head--session">
            {t('groupMonitoring.accountCard.colSession')}
          </th>
          <th className="brand-col-head brand-col-head--on-device">
            {t('groupMonitoring.accountCard.colOnDevice')}
          </th>
          <th className="brand-col-head brand-col-head--in-brand">
            {t('groupMonitoring.accountCard.colInBrand')}
          </th>
          <th className="brand-col-head brand-col-head--admin">
            {t('groupMonitoring.accountCard.colAdmin')}
          </th>
          <th className="brand-col-head brand-col-head--action">
            {t('groupMonitoring.accountCard.colAction')}
          </th>
        </tr>
      </thead>
    );
  }

  return (
    <thead className="brand-card-table-head">
      <tr>
        <th className="brand-col-head brand-col-head--account">
          {t('groupMonitoring.accountCard.colAccount')}
        </th>
        <th className="brand-col-head brand-col-head--location">
          {t('groupMonitoring.accountCard.colLocation')}
        </th>
        <th className="brand-col-head brand-col-head--status">
          {t('groupMonitoring.accountCard.colStatus')}
        </th>
        <th className="brand-col-head brand-col-head--session">
          {t('groupMonitoring.accountCard.colSession')}
        </th>
        <th className="brand-col-head brand-col-head--on-device">
          {t('groupMonitoring.accountCard.colOnDevice')}
        </th>
        <th className="brand-col-head brand-col-head--in-brand">
          {t('groupMonitoring.accountCard.colInBrand')}
        </th>
        <th className="brand-col-head brand-col-head--admin">
          {t('groupMonitoring.accountCard.colAdmin')}
        </th>
        <th className="brand-col-head brand-col-head--last-update">
          {t('groupMonitoring.accountCard.colLastUpdate')}
        </th>
        <th className="brand-col-head brand-col-head--action">
          {t('groupMonitoring.accountCard.colAction')}
        </th>
      </tr>
    </thead>
  );
}

import { useLanguage } from '@/hooks/useLanguage';

/** 8 kolom — lebar via CSS % (total 100%). */
export const ACCOUNT_TABLE_COLUMN_COUNT = 8;

export function AccountMonitoringTableColGroup() {
  return (
    <colgroup>
      <col className="brand-col brand-col--account" />
      <col className="brand-col brand-col--brand" />
      <col className="brand-col brand-col--status" />
      <col className="brand-col brand-col--session" />
      <col className="brand-col brand-col--groups" />
      <col className="brand-col brand-col--admin" />
      <col className="brand-col brand-col--scraper" />
      <col className="brand-col brand-col--action" />
    </colgroup>
  );
}

export function AccountMonitoringTableHead() {
  const { t } = useLanguage();

  return (
    <thead className="brand-card-table-head">
      <tr>
        <th className="brand-col-head brand-col-head--account">
          {t('groupMonitoring.accountCard.colAccount')}
        </th>
        <th className="brand-col-head brand-col-head--brand">
          {t('groupMonitoring.accountCard.colBrand')}
        </th>
        <th className="brand-col-head brand-col-head--status">
          {t('groupMonitoring.accountCard.colStatus')}
        </th>
        <th className="brand-col-head brand-col-head--session">
          {t('groupMonitoring.accountCard.colSession')}
        </th>
        <th className="brand-col-head brand-col-head--groups">
          {t('groupMonitoring.accountCard.colGroups')}
        </th>
        <th className="brand-col-head brand-col-head--admin">
          {t('groupMonitoring.accountCard.colAdmin')}
        </th>
        <th className="brand-col-head brand-col-head--scraper">
          {t('groupMonitoring.accountCard.colScraper')}
        </th>
        <th className="brand-col-head brand-col-head--action">
          {t('groupMonitoring.accountCard.colAction')}
        </th>
      </tr>
    </thead>
  );
}

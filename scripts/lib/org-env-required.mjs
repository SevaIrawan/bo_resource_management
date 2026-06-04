/** Kunci wajib di .env / org-default.env yang dibundel ke installer. */
export const ORG_ENV_REQUIRED_KEYS = [
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_API_ID',
  'TELEGRAM_API_HASH',
];

/**
 * @param {Record<string, string | undefined>} parsed
 * @returns {string[]}
 */
export function missingOrgEnvKeys(parsed) {
  return ORG_ENV_REQUIRED_KEYS.filter((k) => !parsed[k]?.trim());
}

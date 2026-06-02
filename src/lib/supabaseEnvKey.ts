/** Kunci API Supabase untuk klien JS — service role diutamakan (bypass RLS, desktop internal). */
export function resolveSupabaseApiKey(env: {
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}): string {
  const role = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (role) return role;
  return env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
}

export const ORG_ENV_REQUIRED_KEYS = [
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_API_ID',
  'TELEGRAM_API_HASH',
] as const;

export function missingOrgEnvKeys(parsed: Record<string, string | undefined>): string[] {
  const missing: string[] = [];
  for (const key of ORG_ENV_REQUIRED_KEYS) {
    if (!parsed[key]?.trim()) missing.push(key);
  }
  return missing;
}

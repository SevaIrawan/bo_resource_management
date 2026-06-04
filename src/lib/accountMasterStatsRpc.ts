import { getSupabase } from '@/lib/supabase';
import type { MasterGroupStats } from '@/lib/accountSyncData';
import type { Platform } from '@/types/database';

const UUID_RE = /^[0-9a-f-]{36}$/i;

function normalizeDbAccountId(accountId: string): string | null {
  const trimmed = accountId.trim();
  if (UUID_RE.test(trimmed)) return trimmed;
  if (trimmed.startsWith('acc-')) {
    const id = trimmed.slice(4);
    return UUID_RE.test(id) ? id : null;
  }
  return null;
}

type RpcRow = {
  brand_master_total?: number;
  joined_in_master?: number;
  admin_in_master?: number;
};

/** Agregasi master↔daily di Postgres (cepat, tanpa loop renderer). */
export async function fetchMasterGroupStatsViaRpc(input: {
  accountId: string;
  brand: string;
  platform: Platform;
}): Promise<MasterGroupStats | null> {
  const dbId = normalizeDbAccountId(input.accountId);
  const brand = input.brand.trim();
  if (!dbId || !brand) return null;

  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('rm_account_master_stats', {
    p_account_id: dbId,
    p_brand: brand,
    p_platform: input.platform,
  });

  if (error) {
    const msg = String(error.message ?? '').toLowerCase();
    const code = String((error as { code?: string }).code ?? '');
    if (
      msg.includes('rm_account_master_stats') ||
      msg.includes('42883') ||
      msg.includes('does not exist') ||
      msg.includes('timeout') ||
      msg.includes('57014') ||
      msg.includes('statement timeout') ||
      msg.includes('internal server error') ||
      code === '57014'
    ) {
      console.warn('[rm_account_master_stats] RPC skipped:', error.message);
      return null;
    }
    console.warn('[rm_account_master_stats] RPC failed:', error.message);
    return null;
  }

  const row = (typeof data === 'object' && data !== null ? data : {}) as RpcRow;
  return {
    brandMasterTotal: Number(row.brand_master_total ?? 0),
    joinedInMaster: Number(row.joined_in_master ?? 0),
    adminInMaster: Number(row.admin_in_master ?? 0),
  };
}

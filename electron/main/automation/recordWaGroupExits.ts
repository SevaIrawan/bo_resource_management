import type { AutomationJobRecord } from './jobQueueTypes';

export type WaExitKind = 'leave' | 'delete';

const EXIT_ACTIONS = new Set(['leave_group', 'delete_group', 'exit_delete_group']);

type PendingExit = { groupId: string; kind: WaExitKind };

function pendingExits(job: AutomationJobRecord): PendingExit[] {
  if (job.platform !== 'whatsapp' || !EXIT_ACTIONS.has(job.action)) return [];
  const pending: PendingExit[] = [];
  for (const row of job.payload.groupOutcomes ?? []) {
    const groupId = String(row.groupId ?? '').trim();
    if (!groupId) continue;
    if (row.exitStatus === 'left' && row.exitRecorded !== true) {
      pending.push({ groupId, kind: 'leave' });
    }
    if (row.deleteStatus === 'deleted' && row.deleteRecorded !== true) {
      pending.push({ groupId, kind: 'delete' });
    }
  }
  return pending;
}

async function postGroupExit(input: {
  accountId: string;
  brand: string;
  groupId: string;
  action: WaExitKind;
}): Promise<boolean> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) return false;

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/rm_record_group_exit`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_account_id: input.accountId,
      p_brand: input.brand,
      p_group_id: input.groupId,
      p_action: input.action,
    }),
  });
  return response.ok;
}

/**
 * Catat Leave/Delete WhatsApp yang sudah sukses. Gagal RPC tidak mengubah job;
 * flag baru disimpan setelah RPC berhasil supaya bisa diulang.
 */
export function scheduleWaGroupExitRecording(
  job: AutomationJobRecord,
  persist: (groupId: string, kind: WaExitKind) => void,
): void {
  const pending = pendingExits(job);
  if (pending.length === 0) return;

  void (async () => {
    for (const item of pending) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const ok = await postGroupExit({
            accountId: job.accountId,
            brand: job.brandName,
            groupId: item.groupId,
            action: item.kind,
          });
          if (ok) {
            persist(item.groupId, item.kind);
            break;
          }
        } catch {
          /* coba lagi */
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  })();
}

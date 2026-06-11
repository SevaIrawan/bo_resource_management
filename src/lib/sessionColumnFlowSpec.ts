import type { SessionUiStatus } from '@/types/accountMonitoringUi';

/**
 * Spesifikasi resmi — kolom Session di grid (`account.sessionStatus`).
 * Dipakai dokumentasi + audit; implementasi di `syncFlowService.ts` + `useAccountSyncFlow.ts`.
 *
 * UX (konfirmasi produk):
 * - "Modal utama" pada jalur INVALID = modal login; tutup (X/backdrop) = batalkan scan, kolom Session tidak berubah.
 * - Jalur VALID + SYNC: tidak ada modal login; langsung backend lalu Now/Later atau resume-empty.
 * - resume-empty hanya bila 0 grup (device/DB/brand); Now/Later bila ada data yang bisa di-scrape.
 * - VALID + RUN/SYNC: probe device tetap jalan; gagal → login meski badge grid masih valid.
 * - Login FAIL: WA auto-QR; TG error + pesan (tanpa auto-loop QR).
 * - VALID + tombol X (Clear Session, hover row/kolom): WA purge disk + TG stop sidecar + DB invalid → badge Invalid; Sync berikutnya `open_login`.
 */
export const SESSION_COLUMN_FLOW = {
  invalid: {
    sync: ['login_modal_qr_phone', 'close_login_modal', 'update_groups_admin_columns'] as const,
    run: ['login_modal_qr_phone', 'close_login_modal', 'update_groups_admin_columns'] as const,
  },
  valid: {
    sync: [
      'check_device_session',
      'detect_brand_x_and_device_groups',
      'update_groups_admin_columns',
      'scrape_now_or_not_modal_or_resume_empty',
    ] as const,
    run: ['check_device_session', 'execute_scraper'] as const,
  },
} as const;

export type SessionColumnAction = 'sync' | 'run';

export function expectedStepsFor(
  sessionStatus: SessionUiStatus,
  action: SessionColumnAction,
): readonly string[] {
  return SESSION_COLUMN_FLOW[sessionStatus][action];
}

/** Harus sama dengan `routeFromSessionColumn` di syncFlowService. */
export function sessionColumnRoute(sessionStatus: SessionUiStatus): 'open_login' | 'check_device' {
  return sessionStatus === 'invalid' ? 'open_login' : 'check_device';
}

export function assertSessionColumnRouting(): void {
  const cases: Array<{
    status: SessionUiStatus;
    action: SessionColumnAction;
    route: 'open_login' | 'check_device';
  }> = [
    { status: 'invalid', action: 'sync', route: 'open_login' },
    { status: 'invalid', action: 'run', route: 'open_login' },
    { status: 'valid', action: 'sync', route: 'check_device' },
    { status: 'valid', action: 'run', route: 'check_device' },
  ];

  for (const c of cases) {
    const route = sessionColumnRoute(c.status);
    if (route !== c.route) {
      throw new Error(
        `sessionColumnRoute(${c.status}) expected ${c.route}, got ${route}`,
      );
    }
    const steps = expectedStepsFor(c.status, c.action);
    if (steps.length === 0) {
      throw new Error(`expectedStepsFor(${c.status}, ${c.action}) is empty`);
    }
  }
}

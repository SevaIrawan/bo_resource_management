import {
  checkUserActionDeviceSession,
  type UserSessionGateMode,
} from '@/lib/userActionSession';

export type { UserSessionGateMode };

export type VerifyUserSessionResult =
  | { ok: true; dbSessionStatus: 'valid' }
  | {
      ok: false;
      kind: 'db_invalid';
      reloginCode: 'SESSION_INVALID_RELOGIN' | 'SESSION_INVALID_FORCE_SCRAPER';
    }
  | {
      ok: false;
      kind: 'device_failed';
      message: string;
      shouldInvalidate: boolean;
      reloginCode: 'SESSION_INVALID_RELOGIN' | 'SESSION_INVALID_FORCE_SCRAPER';
    };

/** Sync / Run: DB → probe device strict → gagal = siap invalidasi DB + modal login. */
export async function verifyUserSessionForAction(input: {
  sessionId: string;
  platform: import('@/types/database').Platform;
  dbAccountId: string;
  mode: UserSessionGateMode;
  hasDaily?: boolean;
}): Promise<VerifyUserSessionResult> {
  const result = await checkUserActionDeviceSession(input);

  if (result.ok) {
    return { ok: true, dbSessionStatus: 'valid' };
  }

  if (result.kind === 'db_invalid') {
    return {
      ok: false,
      kind: 'db_invalid',
      reloginCode: result.reloginCode,
    };
  }

  return {
    ok: false,
    kind: 'device_failed',
    message: result.message,
    shouldInvalidate: result.shouldInvalidate,
    reloginCode: result.reloginCode,
  };
}

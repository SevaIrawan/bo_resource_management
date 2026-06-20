import { ipcMain } from 'electron';
import { runTelegramAutomation } from './tgAutomationClient';
import type { AutomationRunPayload, AutomationRunResult } from './types';
import { runWhatsAppAutomation } from './waAutomation';

const accountLocks = new Map<string, Promise<unknown>>();

function withAutomationAccountLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = accountLocks.get(sessionId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  accountLocks.set(sessionId, next);
  void next.finally(() => {
    if (accountLocks.get(sessionId) === next) {
      accountLocks.delete(sessionId);
    }
  });
  return next;
}

export async function runAutomationAction(payload: AutomationRunPayload): Promise<AutomationRunResult> {
  return withAutomationAccountLock(payload.sessionId, async () => {
    if (payload.platform === 'telegram') {
      return runTelegramAutomation(payload);
    }
    if (payload.platform === 'whatsapp') {
      return runWhatsAppAutomation(payload);
    }
    return {
      status: 'error',
      action: payload.action,
      message: `Unsupported platform: ${payload.platform}`,
      errorCode: 'UNSUPPORTED_PLATFORM',
    };
  });
}

export function registerAutomationIpc(): void {
  ipcMain.handle('automation:run', async (_event, payload: AutomationRunPayload) => {
    return runAutomationAction(payload);
  });
}

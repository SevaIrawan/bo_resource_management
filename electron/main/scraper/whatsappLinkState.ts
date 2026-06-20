/**
 * WA Web link state via `WAWebSocketModel.Socket.state` (whatsapp-web.js `client.getState()`).
 * Bukan timeout scrape — hanya status tautan Linked Device.
 */
export type WaLinkStatus = 'linked' | 'loading' | 'unlinked';

const LOADING_STATES = new Set(['OPENING', 'UNLAUNCHED', 'PAIRING']);

/** Perlu scan QR / unlink di HP — session tidak lagi tertaut. */
const UNLINKED_STATES = new Set([
  'UNPAIRED',
  'UNPAIRED_IDLE',
  'TOS_BLOCK',
  'SMB_TOS_BLOCK',
  'PROXYBLOCK',
  'DEPRECATED_VERSION',
]);

export function classifyWaSocketState(state: string | null | undefined): WaLinkStatus {
  if (!state) return 'loading';
  if (state === 'CONNECTED') return 'linked';
  if (LOADING_STATES.has(state)) return 'loading';
  if (UNLINKED_STATES.has(state)) return 'unlinked';
  if (state === 'CONFLICT' || state === 'TIMEOUT') return 'unlinked';
  return 'loading';
}

export function waLinkProbeMessage(status: WaLinkStatus, state: string | null | undefined): string {
  const s = state ?? 'null';
  if (status === 'linked') return 'WA_LINKED';
  if (status === 'loading') return `WA_LINK_LOADING:${s}`;
  return `WA_UNLINKED:${s}`;
}

export function isWaUnlinkedProbeMessage(message: string | undefined): boolean {
  if (!message) return false;
  return message.startsWith('WA_UNLINKED:');
}

export function isWaLinkLoadingProbeMessage(message: string | undefined): boolean {
  if (!message) return false;
  return message.startsWith('WA_LINK_LOADING:') || message === 'WA_LINK_UNKNOWN';
}

/** Bookmark tab header: In Progress | Completed */
export type TicketWorkflowBookmark = 'in_progress' | 'completed';

export type TicketTaskStatus = 'todo' | 'in_progress' | 'interrupted' | 'complete';

export interface TicketProcessRecord {
  taskStatus: TicketTaskStatus;
  /** `yyyy-mm-dd` untuk input type="date" */
  startTask: string;
  endTask: string;
  remark: string;
}

export const TICKET_WORKFLOW_CHANGED_EVENT = 'rm-ticket-workflow-changed';

export const TICKET_TASK_STATUSES: TicketTaskStatus[] = [
  'todo',
  'in_progress',
  'interrupted',
  'complete',
];

export const DEFAULT_TICKET_PROCESS_RECORD: TicketProcessRecord = {
  taskStatus: 'todo',
  startTask: '',
  endTask: '',
  remark: '',
};

let processCache: Record<string, TicketProcessRecord> = {};

function notifyWorkflowChanged(): void {
  if (typeof window === 'undefined') return;
  // Hindari update Provider saat render komponen lain (mis. buka modal + hydrate cache).
  queueMicrotask(() => {
    window.dispatchEvent(new Event(TICKET_WORKFLOW_CHANGED_EVENT));
  });
}

function normalizeRecord(record: Partial<TicketProcessRecord>): TicketProcessRecord {
  return {
    ...DEFAULT_TICKET_PROCESS_RECORD,
    ...record,
    taskStatus: TICKET_TASK_STATUSES.includes(record.taskStatus as TicketTaskStatus)
      ? (record.taskStatus as TicketTaskStatus)
      : 'todo',
  };
}

export function hydrateTicketProcessCache(handles: Record<string, TicketProcessRecord>): void {
  processCache = { ...handles };
  notifyWorkflowChanged();
}

export function getTicketProcess(issueId: string): TicketProcessRecord {
  const stored = processCache[issueId];
  if (!stored) return { ...DEFAULT_TICKET_PROCESS_RECORD };
  return normalizeRecord(stored);
}

/** Update cache (kartu + filter); persist ke DB lewat Save di modal. */
export function setTicketProcessCache(issueId: string, record: TicketProcessRecord): void {
  processCache[issueId] = normalizeRecord(record);
  notifyWorkflowChanged();
}

/** To Do, In Progress, Interrupted → bookmark In Progress. */
export function isInProgressBookmarkTask(status: TicketTaskStatus): boolean {
  return status === 'todo' || status === 'in_progress' || status === 'interrupted';
}

/** Complete → bookmark Completed. */
export function isCompletedBookmarkTask(status: TicketTaskStatus): boolean {
  return status === 'complete';
}

export function ticketMatchesWorkflowBookmark(
  issueId: string,
  bookmark: TicketWorkflowBookmark,
): boolean {
  const { taskStatus } = getTicketProcess(issueId);
  if (bookmark === 'completed') return isCompletedBookmarkTask(taskStatus);
  return isInProgressBookmarkTask(taskStatus);
}

export function taskStatusI18nKey(status: TicketTaskStatus): string {
  const map: Record<TicketTaskStatus, string> = {
    todo: 'groupMonitoring.ticketPanel.processModal.taskTodo',
    in_progress: 'groupMonitoring.ticketPanel.processModal.taskInProgress',
    interrupted: 'groupMonitoring.ticketPanel.processModal.taskInterrupted',
    complete: 'groupMonitoring.ticketPanel.processModal.taskComplete',
  };
  return map[status];
}

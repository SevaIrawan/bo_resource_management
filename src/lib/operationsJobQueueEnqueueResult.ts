const ENQUEUE_ERROR_PREFIX = '\0JQERR\0';

export function enqueueErrorResult(message: string): string {
  return `${ENQUEUE_ERROR_PREFIX}${message}`;
}

export function isEnqueueErrorResult(message: string | null | undefined): message is string {
  return Boolean(message?.startsWith(ENQUEUE_ERROR_PREFIX));
}

export function parseEnqueueErrorResult(message: string): string {
  return message.slice(ENQUEUE_ERROR_PREFIX.length);
}

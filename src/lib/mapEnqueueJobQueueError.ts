/** Map kode error enqueue/run job queue ke teks UI (i18n). */
export function mapEnqueueJobQueueError(error: string, t: (key: string) => string): string {
  switch (error) {
    case 'JOB_ALREADY_QUEUED_FOR_GROUP':
      return t('operations.jobQueue.alreadyQueuedGroup');
    case 'JOB_ALREADY_RUNNING_FOR_ACCOUNT':
      return t('operations.jobQueue.accountBusy');
    case 'JOB_ALREADY_QUEUED_FOR_ACCOUNT':
      return t('operations.jobQueue.oneJobPerAccount');
    case 'NO_LEFT_GROUPS':
      return t('operations.jobQueue.enqueueNoLeftGroups');
    case 'NO_CREATED_GROUPS':
      return t('operations.jobQueue.enqueueNoCreatedGroups');
    case 'PHOTO_NOT_FOUND':
      return t('operations.jobQueue.enqueuePhotoNotFound');
    case 'DELETE_DISABLED':
      return t('operations.jobQueue.exitDeleteDisabledInSettings');
    case 'JOB_QUEUE_DESKTOP_REQUIRED':
      return t('operations.jobQueue.desktopRequired');
    case 'JOB_NOT_FOUND':
      return t('operations.jobQueue.enqueueJobNotFound');
    case 'RUN_FAILED':
      return t('operations.jobQueue.runFailed');
    default:
      return t('operations.jobQueue.enqueueFailed');
  }
}

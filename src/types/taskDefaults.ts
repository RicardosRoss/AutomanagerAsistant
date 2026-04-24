export const DEFAULT_TASK_DURATION_MINUTES = 60;
export const MIN_PRODUCTION_TASK_DURATION_MINUTES = 5;
export const MIN_DEVELOPMENT_TASK_DURATION_MINUTES = 1;
export const MAX_TASK_DURATION_MINUTES = 480;

export function getMinTaskDurationMinutes(): number {
  return process.env.NODE_ENV === 'production'
    ? MIN_PRODUCTION_TASK_DURATION_MINUTES
    : MIN_DEVELOPMENT_TASK_DURATION_MINUTES;
}

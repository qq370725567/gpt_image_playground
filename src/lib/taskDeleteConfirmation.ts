const TASK_DELETE_SUPPRESS_KEY = 'gpt-image-playground.task-delete-confirmation-suppressed-until'

function getTodayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
}

export function shouldSkipTaskDeleteConfirmation() {
  if (typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem(TASK_DELETE_SUPPRESS_KEY) === getTodayKey()
  } catch {
    return false
  }
}

export function skipTaskDeleteConfirmationForToday() {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(TASK_DELETE_SUPPRESS_KEY, getTodayKey())
  } catch {
    // localStorage 不可用时只保留当前操作，不影响删除流程。
  }
}

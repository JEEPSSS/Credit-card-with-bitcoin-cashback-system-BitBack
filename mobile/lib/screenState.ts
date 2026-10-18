/**
 * The failure to show above data that is already on screen.
 *
 * Every screen showed its error only when it had nothing to display, so a
 * refresh that failed - offline, or the server down - left the old figures in
 * place with no sign they were out of date: the pull-to-refresh spinner simply
 * stopped. Found on a device with airplane mode on. When there is data and the
 * last load failed, this returns the message, and `Screen` shows it with a
 * retry above the content. With no data, the screen's own full error stands.
 */
export function refreshError(state: { data: unknown; error: string | null }): string | null {
  return state.data !== null && state.data !== undefined && state.error ? state.error : null;
}

/**
 * Centralised error helpers.
 *
 *  logError  — log with a tag prefix and return the user-readable message
 *              (use when the caller wants to surface the message via toast).
 *  silentError — only log in development, when ignoring is intentional.
 *                `reason` documents why this catch is safe to swallow.
 */

export function logError(tag: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // eslint-disable-next-line no-console
  console.error(`[${tag}]`, e);
  return msg;
}

export function silentError(tag: string, reason: string, e: unknown): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[${tag}] silent (${reason}):`, e);
  }
}

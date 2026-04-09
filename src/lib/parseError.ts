/**
 * Extract a human-readable message from a Tauri command error.
 * Tauri errors arrive as objects like { code: "...", message: "..." },
 * not as Error instances.
 */
export function parseError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    if ('message' in err && typeof (err as { message: unknown }).message === 'string') {
      return (err as { message: string }).message;
    }
    return JSON.stringify(err);
  }
  return String(err);
}

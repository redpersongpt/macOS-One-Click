export function formatMacOsLabel(value: string): string {
  return /^macos\s+/i.test(value) ? value : `macOS ${value}`;
}

export function shortMacOsLabel(value: string): string {
  return value.replace(/^macos\s+/i, '');
}

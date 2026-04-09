import { describe, expect, it } from 'vitest';
import { parseError } from '../lib/parseError';

describe('parseError', () => {
  it('prefers native Error messages', () => {
    expect(parseError(new Error('native failure'))).toBe('native failure');
  });

  it('uses tauri-style error objects', () => {
    expect(parseError({ code: 'IO_ERROR', message: 'Disk not writable' })).toBe('Disk not writable');
  });

  it('serializes unknown objects instead of returning object Object', () => {
    expect(parseError({ code: 'X', detail: { nested: true } })).toContain('"code":"X"');
  });
});

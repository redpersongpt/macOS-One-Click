import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupOrphanedBuilds } from '../electron/efiBuildFlow.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'efi-test-'));
}

describe('cleanupOrphanedBuilds', () => {
  let base: string;

  beforeEach(() => {
    base = makeTmpDir();
  });

  afterEach(() => {
    try { fs.rmSync(base, { recursive: true, force: true }); } catch (_) {}
  });

  it('removes all EFI_Build_* directories', async () => {
    const d1 = path.join(base, 'EFI_Build_1000000');
    const d2 = path.join(base, 'EFI_Build_2000000');
    fs.mkdirSync(d1);
    fs.mkdirSync(d2);
    const removed = await cleanupOrphanedBuilds(base);
    expect(removed).toBe(2);
    expect(fs.existsSync(d1)).toBe(false);
    expect(fs.existsSync(d2)).toBe(false);
  });

  it('skips the keepPath directory', async () => {
    const keep = path.join(base, 'EFI_Build_9999999');
    const stale = path.join(base, 'EFI_Build_1111111');
    fs.mkdirSync(keep);
    fs.mkdirSync(stale);
    const removed = await cleanupOrphanedBuilds(base, keep);
    expect(removed).toBe(1);
    expect(fs.existsSync(keep)).toBe(true);
    expect(fs.existsSync(stale)).toBe(false);
  });

  it('does not touch non-EFI_Build directories', async () => {
    const other = path.join(base, 'some-other-dir');
    const efi = path.join(base, 'EFI_Build_123');
    fs.mkdirSync(other);
    fs.mkdirSync(efi);
    await cleanupOrphanedBuilds(base);
    expect(fs.existsSync(other)).toBe(true);
    expect(fs.existsSync(efi)).toBe(false);
  });

  it('does not touch non-directory EFI_Build_ files', async () => {
    const file = path.join(base, 'EFI_Build_fake.txt');
    fs.writeFileSync(file, 'x');
    await cleanupOrphanedBuilds(base);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('returns 0 when there are no EFI_Build_* directories', async () => {
    const removed = await cleanupOrphanedBuilds(base);
    expect(removed).toBe(0);
  });

  it('silently handles a non-existent userDataPath', async () => {
    const missing = path.join(base, 'nonexistent');
    await expect(cleanupOrphanedBuilds(missing)).resolves.not.toThrow();
  });

  it('removes nested contents of orphaned directories', async () => {
    const stale = path.join(base, 'EFI_Build_5000');
    fs.mkdirSync(path.join(stale, 'EFI', 'OC', 'Kexts'), { recursive: true });
    fs.writeFileSync(path.join(stale, 'EFI', 'OC', 'config.plist'), '<plist/>');
    await cleanupOrphanedBuilds(base);
    expect(fs.existsSync(stale)).toBe(false);
  });
});

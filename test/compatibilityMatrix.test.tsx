import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import CompatibilityMatrix from '../src/components/CompatibilityMatrix';
import type { CompatibilityMatrixRow } from '../electron/compatibilityMatrix';

function makeRow(overrides: Partial<CompatibilityMatrixRow> = {}): CompatibilityMatrixRow {
  return {
    versionId: 'ventura-13',
    versionName: 'macOS Ventura',
    status: 'supported',
    reason: 'Best first build for this hardware.',
    recommended: false,
    ...overrides,
  };
}

describe('CompatibilityMatrix – blank-area elimination', () => {
  it('cards have NO min-h class (dead space removed)', () => {
    const rows = [
      makeRow({ versionId: 'ventura-13', versionName: 'macOS Ventura', status: 'supported' }),
      makeRow({ versionId: 'sonoma-14', versionName: 'macOS Sonoma', status: 'experimental' }),
    ];
    const { container } = render(
      <CompatibilityMatrix rows={rows} selectedVersion="macOS Ventura" onSelect={vi.fn()} />,
    );
    const cards = container.querySelectorAll('[class*="rounded-2xl"]');
    cards.forEach((card) => {
      expect(card.className).not.toMatch(/min-h-/);
    });
  });

  it('cards use p-4 padding (not oversized p-5 or p-6)', () => {
    const rows = [makeRow()];
    const { container } = render(<CompatibilityMatrix rows={rows} />);
    const card = container.querySelector('[class*="rounded-2xl"][class*="border"]');
    expect(card?.className).toMatch(/\bp-4\b/);
  });

  it('version name uses text-lg (not oversized text-xl or text-2xl)', () => {
    const rows = [makeRow({ versionName: 'macOS Ventura' })];
    const { container } = render(<CompatibilityMatrix rows={rows} />);
    const versionEl = container.querySelector('[class*="text-lg"][class*="font-black"]');
    expect(versionEl).toBeTruthy();
    expect(versionEl?.textContent).toBe('macOS Ventura');
  });

  it('reason text uses text-xs (not oversized text-sm)', () => {
    const rows = [makeRow({ reason: 'Best first build.' })];
    const { container } = render(<CompatibilityMatrix rows={rows} />);
    const reasonEl = container.querySelector('[class*="text-xs"][class*="text-white/65"]');
    expect(reasonEl).toBeTruthy();
    expect(reasonEl?.textContent).toBe('Best first build.');
  });

  it('blocked rows are non-interactive', () => {
    const onSelect = vi.fn();
    const rows = [makeRow({ status: 'blocked', versionId: 'sequoia-15', versionName: 'macOS Sequoia' })];
    const { container } = render(
      <CompatibilityMatrix rows={rows} selectedVersion="macOS Ventura" onSelect={onSelect} />,
    );
    const button = container.querySelector('button');
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(true);
  });
});

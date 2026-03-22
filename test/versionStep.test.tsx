import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import VersionStep from '../src/components/steps/VersionStep';
import type { CompatibilityReport } from '../electron/compatibility';
import type { CompatibilityMatrix } from '../electron/compatibilityMatrix';

function fakeReport(overrides: Partial<CompatibilityReport> = {}): CompatibilityReport {
  return {
    isCompatible: true,
    level: 'supported',
    errors: [],
    warnings: [],
    eligibleVersions: [],
    recommendedVersion: null,
    manualVerificationRequired: false,
    ...overrides,
  } as CompatibilityReport;
}

function fakeMatrix(): CompatibilityMatrix {
  return {
    recommendedVersion: 'macOS Ventura',
    rows: [
      {
        versionId: 'ventura-13',
        versionName: 'macOS Ventura',
        icon: '🏔',
        numeric: 13,
        status: 'supported',
        reason: 'Best first build for this hardware.',
        recommended: true,
        reportLevel: 'supported',
      },
      {
        versionId: 'sonoma-14',
        versionName: 'macOS Sonoma',
        icon: '🌊',
        numeric: 14,
        status: 'experimental',
        reason: 'Community-proven with extra tuning.',
        recommended: false,
        reportLevel: 'experimental',
      },
    ],
  };
}

describe('VersionStep – layout and copy', () => {
  it('heading uses text-3xl (not oversized text-4xl)', () => {
    const { container } = render(
      <VersionStep
        report={fakeReport()}
        matrix={fakeMatrix()}
        selectedVersion="macOS Ventura"
        onSelect={vi.fn()}
      />,
    );
    const heading = container.querySelector('h2');
    expect(heading?.className).toMatch(/text-3xl/);
    expect(heading?.className).not.toMatch(/text-4xl/);
  });

  it('description is concise (under 80 chars)', () => {
    render(
      <VersionStep
        report={fakeReport()}
        matrix={fakeMatrix()}
        selectedVersion="macOS Ventura"
        onSelect={vi.fn()}
      />,
    );
    const desc = screen.getByText(/Pick the version most likely/);
    expect(desc.textContent!.length).toBeLessThan(90);
  });

  it('recommended card button shows version name, not generic "Use Recommended Version"', () => {
    render(
      <VersionStep
        report={fakeReport()}
        matrix={fakeMatrix()}
        selectedVersion="macOS Sonoma"
        onSelect={vi.fn()}
        onUseRecommendedVersion={vi.fn()}
      />,
    );
    expect(screen.getByText(/Use macOS Ventura/)).toBeInTheDocument();
    expect(screen.queryByText('Use Recommended Version')).toBeNull();
  });

  it('shows "Continue with" button when recommended version is already selected', () => {
    render(
      <VersionStep
        report={fakeReport()}
        matrix={fakeMatrix()}
        selectedVersion="macOS Ventura"
        onSelect={vi.fn()}
        onUseRecommendedVersion={vi.fn()}
      />,
    );
    // Should show "Continue with" since selected === recommended
    expect(screen.getByText(/Continue with macOS Ventura/)).toBeInTheDocument();
    // Should NOT show "Use" since we're already on it
    expect(screen.queryByText(/Use macOS Ventura/)).toBeNull();
  });

  it('shows "Use" button when a non-recommended version is selected', () => {
    render(
      <VersionStep
        report={fakeReport()}
        matrix={fakeMatrix()}
        selectedVersion="macOS Sonoma"
        onSelect={vi.fn()}
        onUseRecommendedVersion={vi.fn()}
      />,
    );
    expect(screen.getByText(/Use macOS Ventura/)).toBeInTheDocument();
    expect(screen.queryByText(/Continue with/)).toBeNull();
  });

  it('root container uses space-y-5 (not excessive space-y-7)', () => {
    const { container } = render(
      <VersionStep
        report={fakeReport()}
        matrix={fakeMatrix()}
        selectedVersion="macOS Ventura"
        onSelect={vi.fn()}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/space-y-5/);
    expect(root.className).not.toMatch(/space-y-7/);
  });
});

// ── Confidence Score System ──────────────────────────────────────────────────
// Computes a 0–100 confidence score for the current build, based on GPU support,
// CPU generation maturity, kext complexity, and known problem setups.

import type { HardwareProfile } from '../../electron/configGenerator';
import type { CompatibilityReport } from '../../electron/compatibility';
import type { ValidationResult } from '../../electron/configValidator';
import type { GpuAssessment } from '../../electron/hackintoshRules';

export interface ConfidenceResult {
  score: number;
  label: 'High confidence' | 'Medium confidence' | 'Low confidence';
  explanation: string;
  factors: ConfidenceFactor[];
}

export interface ConfidenceFactor {
  name: string;
  impact: number; // -30 to +20
  detail: string;
}

// ── CPU maturity scores ─────────────────────────────────────────────────────

const CPU_MATURITY: Record<string, number> = {
  'Coffee Lake': 20,
  'Kaby Lake': 18,
  'Comet Lake': 17,
  'Skylake': 16,
  'Haswell': 14,
  'Broadwell': 14,
  'Ivy Bridge': 10,
  'Sandy Bridge': 8,
  'Ryzen': 12,
  'Threadripper': 10,
  'Alder Lake': 8,
  'Raptor Lake': 6,
  'Rocket Lake': 6,
  'Penryn': 5,
  'Bulldozer': 4,
  'Cascade Lake-X': 10,
  'Haswell-E': 12,
  'Broadwell-E': 12,
  'Ivy Bridge-E': 8,
};

export function computeConfidenceScore(
  profile: HardwareProfile,
  compat: CompatibilityReport | null,
  gpuAssessments: GpuAssessment[],
  validationResult?: ValidationResult | null,
): ConfidenceResult {
  const factors: ConfidenceFactor[] = [];
  let base = 50; // Start at 50

  // ── Factor 1: CPU generation maturity
  const cpuScore = CPU_MATURITY[profile.generation] ?? 0;
  factors.push({
    name: 'CPU Generation',
    impact: cpuScore,
    detail: cpuScore >= 15
      ? `${profile.generation} is a well-supported generation with mature kext and power management support.`
      : cpuScore >= 8
      ? `${profile.generation} is supported but may require additional configuration or has known edge cases.`
      : `${profile.generation} has limited community testing or requires significant workarounds.`,
  });
  base += cpuScore;

  // ── Factor 2: GPU support tier
  const bestGpu = gpuAssessments.find(g => g.tier === 'supported')
    ?? gpuAssessments.find(g => g.tier === 'supported_with_limit')
    ?? gpuAssessments.find(g => g.tier === 'partial_support')
    ?? gpuAssessments[0];

  if (bestGpu) {
    if (bestGpu.tier === 'supported') {
      factors.push({ name: 'GPU Support', impact: 15, detail: `${bestGpu.name} has native macOS driver support.` });
      base += 15;
    } else if (bestGpu.tier === 'supported_with_limit') {
      factors.push({ name: 'GPU Support', impact: 5, detail: `${bestGpu.name} is supported but limited to an older macOS version.` });
      base += 5;
    } else if (bestGpu.tier === 'partial_support') {
      factors.push({ name: 'GPU Support', impact: -5, detail: `${bestGpu.name} has partial support — some features may not work.` });
      base -= 5;
    } else {
      factors.push({ name: 'GPU Support', impact: -20, detail: `${bestGpu.name} is not supported by macOS. The system will use iGPU or software rendering.` });
      base -= 20;
    }
  }

  // ── Factor 3: Kext complexity
  const conditionalKexts = profile.kexts.filter(k => {
    const known = ['Lilu', 'VirtualSMC', 'WhateverGreen', 'AppleALC'];
    return !known.includes(k);
  });
  if (conditionalKexts.length <= 2) {
    factors.push({ name: 'Kext Complexity', impact: 5, detail: 'Minimal kext footprint — fewer moving parts means fewer potential issues.' });
    base += 5;
  } else if (conditionalKexts.length <= 5) {
    factors.push({ name: 'Kext Complexity', impact: 0, detail: `${conditionalKexts.length} conditional kexts — reasonable complexity for this hardware.` });
  } else {
    factors.push({ name: 'Kext Complexity', impact: -5, detail: `${conditionalKexts.length} conditional kexts — higher complexity increases the chance of kext conflicts.` });
    base -= 5;
  }

  // ── Factor 4: Known problem setups
  if (profile.architecture === 'AMD' && profile.isLaptop) {
    factors.push({ name: 'AMD Laptop', impact: -25, detail: 'AMD laptops have very limited macOS support. iGPU acceleration, trackpad, and power management are major challenges.' });
    base -= 25;
  }
  if (profile.isVM) {
    factors.push({ name: 'Virtual Machine', impact: -10, detail: 'VMs have limited GPU passthrough and some kexts behave differently.' });
    base -= 10;
  }
  if (profile.generation === 'Alder Lake' || profile.generation === 'Raptor Lake') {
    factors.push({ name: 'Hybrid Architecture', impact: -5, detail: 'P-core/E-core hybrid CPUs require CPUTopologyRebuild and have less testing than traditional architectures.' });
    base -= 5;
  }

  // ── Factor 5: Scan confidence
  if (profile.scanConfidence === 'high') {
    factors.push({ name: 'Hardware Detection', impact: 5, detail: 'All hardware was detected with high confidence using vendor IDs.' });
    base += 5;
  } else if (profile.scanConfidence === 'low') {
    factors.push({ name: 'Hardware Detection', impact: -10, detail: 'Some hardware was inferred from name patterns. Kext selection may not be perfectly matched.' });
    base -= 10;
  }

  // ── Factor 6: Compatibility report
  if (compat) {
    if (compat.level === 'supported') {
      factors.push({ name: 'Compatibility', impact: 5, detail: 'Compatibility analysis found no issues.' });
      base += 5;
    } else if (compat.level === 'experimental') {
      factors.push({ name: 'Compatibility', impact: -8, detail: 'Compatibility analysis considers this build experimental. Expect older macOS ceilings or extra manual tuning.' });
      base -= 8;
    } else if (compat.level === 'risky') {
      factors.push({ name: 'Compatibility', impact: -18, detail: 'Compatibility analysis considers this build risky. Community evidence exists, but manual fixes are likely.' });
      base -= 18;
    } else if (compat.level === 'blocked') {
      factors.push({ name: 'Compatibility', impact: -30, detail: 'Compatibility analysis found blocking issues.' });
      base -= 30;
    }

    if (compat.warnings.length > 0) {
      const penalty = Math.min(compat.warnings.length * 2, 10);
      factors.push({ name: 'Compatibility Warnings', impact: -penalty, detail: `${compat.warnings.length} warning(s) from compatibility analysis.` });
      base -= penalty;
    }

    if (compat.communityEvidence) {
      const evidenceImpact = compat.communityEvidence.signal === 'strong'
        ? 10
        : compat.communityEvidence.signal === 'moderate'
          ? 6
          : 2;
      factors.push({
        name: 'Community Evidence',
        impact: evidenceImpact,
        detail: `${compat.communityEvidence.matchedCount} documented SUCCESS post(s) matched similar hardware, with a ${compat.communityEvidence.matchLevel} community match and ${compat.communityEvidence.bestMatchConfidence} source confidence.`,
      });
      base += evidenceImpact;

      if (compat.communityEvidence.highestReportedVersionNumeric != null) {
        const targetVersion = Number.parseFloat((profile.targetOS.match(/(\d+(?:\.\d+)?)/)?.[1]) ?? '15');
        const versionImpact = targetVersion <= compat.communityEvidence.highestReportedVersionNumeric ? 5 : -8;
        factors.push({
          name: 'macOS Version Match',
          impact: versionImpact,
          detail: targetVersion <= compat.communityEvidence.highestReportedVersionNumeric
            ? `Selected target stays within the strongest community-reported ceiling (${compat.communityEvidence.highestReportedVersion}).`
            : `Selected target is newer than the strongest community-reported ceiling (${compat.communityEvidence.highestReportedVersion}).`,
        });
        base += versionImpact;
      }
    }
  }

  if (validationResult) {
    if (validationResult.overall === 'pass') {
      factors.push({
        name: 'Validation Result',
        impact: 10,
        detail: 'EFI validation passed without warnings.',
      });
      base += 10;
    } else if (validationResult.overall === 'warning') {
      factors.push({
        name: 'Validation Result',
        impact: -6,
        detail: `${validationResult.issues.length} validation warning(s) remain to be reviewed.`,
      });
      base -= 6;
    } else {
      factors.push({
        name: 'Validation Result',
        impact: -20,
        detail: 'Validation found blocking issues in the generated EFI.',
      });
      base -= 20;
    }
  }

  // Clamp to 0–100
  const score = Math.max(0, Math.min(100, base));
  const label = score >= 70 ? 'High confidence' : score >= 45 ? 'Medium confidence' : 'Low confidence';

  // Build explanation
  const explanation = label === 'High confidence'
    ? 'High confidence — the hardware path, community evidence, and current validation state line up well.'
    : label === 'Medium confidence'
      ? 'Medium confidence — the build is plausible, but some hardware or validation edges still need manual attention.'
      : 'Low confidence — expect manual fixes and iterative troubleshooting before this path becomes reliable.';

  return { score, label, explanation, factors };
}

import type { HardwareProfile } from './configGenerator.js';
import { parseMacOSVersion } from './hackintoshRules.js';

export type CommunityEvidenceConfidence = 'low' | 'medium' | 'high';
export type CommunityEvidenceSignal = 'none' | 'weak' | 'moderate' | 'strong';
export type CommunityMatchLevel = 'none' | 'weak' | 'partial' | 'strong';

export interface CommunityEvidenceRecord {
  id: string;
  sourceTitle: string;
  sourceUrl: string;
  hardware: {
    architecture?: Array<'Intel' | 'AMD'>;
    generations?: string[];
    formFactor: 'laptop' | 'desktop';
    modelPatterns?: string[];
    gpuPatterns?: string[];
  };
  achievedVersion: string;
  whatWorked: string[];
  whatDidNotWork: string[];
  notes: string;
  confidence: CommunityEvidenceConfidence;
}

export interface CommunityEvidenceSummary {
  signal: CommunityEvidenceSignal;
  matchLevel: CommunityMatchLevel;
  matchExplanation: string | null;
  matchedCount: number;
  bestMatchScore: number;
  bestMatchConfidence: CommunityEvidenceConfidence | 'none';
  highestReportedVersion: string | null;
  highestReportedVersionNumeric: number | null;
  summary: string | null;
  whatUsuallyWorks: string[];
  whatDidNotWork: string[];
  sources: Array<Pick<CommunityEvidenceRecord, 'sourceTitle' | 'sourceUrl' | 'confidence' | 'achievedVersion'>>;
}

export const COMMUNITY_SUCCESS_EVIDENCE: CommunityEvidenceRecord[] = [
  {
    id: 'thinkpad-t440p-big-sur',
    sourceTitle: 'Hackintosh on Thinkpad T440p with big sur!',
    sourceUrl: 'https://www.reddit.com/r/hackintosh/comments/170easo',
    hardware: {
      architecture: ['Intel'],
      generations: ['Haswell'],
      formFactor: 'laptop',
      modelPatterns: ['thinkpad t440p'],
      gpuPatterns: ['hd 4600'],
    },
    achievedVersion: 'macOS Big Sur 11',
    whatWorked: ['Boot', 'Intel iGPU acceleration', 'General desktop use'],
    whatDidNotWork: ['Random trackpad clicks on some starts'],
    notes: 'Documented SUCCESS post for a Haswell ThinkPad T440p with Intel HD 4600.',
    confidence: 'high',
  },
  {
    id: 'thinkpad-t440p-big-sur-modded',
    sourceTitle: 'T440p on BigSur 11.6 with modded trackpad issues',
    sourceUrl: 'https://www.reddit.com/r/hackintosh/comments/qxbrqg',
    hardware: {
      architecture: ['Intel'],
      generations: ['Haswell'],
      formFactor: 'laptop',
      modelPatterns: ['thinkpad t440p'],
      gpuPatterns: ['hd 4600'],
    },
    achievedVersion: 'macOS Big Sur 11',
    whatWorked: ['Boot', 'Big Sur install'],
    whatDidNotWork: ['Modded trackpad issues'],
    notes: 'Another documented Big Sur T440p SUCCESS post, but with input caveats.',
    confidence: 'medium',
  },
  {
    id: 'thinkpad-t440s-big-sur',
    sourceTitle: 'Thinkpad T440S OpenCore',
    sourceUrl: 'https://www.reddit.com/r/hackintosh/comments/jbhtuq',
    hardware: {
      architecture: ['Intel'],
      generations: ['Haswell'],
      formFactor: 'laptop',
      modelPatterns: ['thinkpad t440s'],
      gpuPatterns: ['hd 4400'],
    },
    achievedVersion: 'macOS Big Sur 11',
    whatWorked: ['OpenCore boot', 'Intel iGPU path'],
    whatDidNotWork: ['Detailed non-working list was not captured in the snippet'],
    notes: 'Documented SUCCESS post for a Haswell ThinkPad T440s using OpenCore.',
    confidence: 'medium',
  },
  {
    id: 'elitebook-840g1-catalina',
    sourceTitle: 'Catalina 10.15.7 HP Elitebook 840 G1 with Clover 5122',
    sourceUrl: 'https://www.reddit.com/r/hackintosh/comments/j9lwvn',
    hardware: {
      architecture: ['Intel'],
      generations: ['Haswell'],
      formFactor: 'laptop',
      modelPatterns: ['elitebook 840 g1'],
      gpuPatterns: ['hd 4400'],
    },
    achievedVersion: 'macOS Catalina 10.15',
    whatWorked: ['Catalina boot', 'Intel iGPU path'],
    whatDidNotWork: ['Exact caveats were not documented in the snippet'],
    notes: 'Haswell HD 4400 business-ultrabook success with Catalina.',
    confidence: 'medium',
  },
  {
    id: 'elitebook-840g1-generic',
    sourceTitle: 'hp elitebook 840g1 hackintosh',
    sourceUrl: 'https://www.reddit.com/r/hackintosh/comments/whc003',
    hardware: {
      architecture: ['Intel'],
      generations: ['Haswell'],
      formFactor: 'laptop',
      modelPatterns: ['elitebook 840 g1'],
      gpuPatterns: ['hd 4400'],
    },
    achievedVersion: 'macOS Monterey 12',
    whatWorked: ['Monterey boot', 'General laptop use'],
    whatDidNotWork: ['Exact caveats were not documented in the snippet'],
    notes: 'Another Haswell HD 4400 business-laptop SUCCESS post.',
    confidence: 'low',
  },
  {
    id: 'thinkcentre-m83-monterey',
    sourceTitle: 'Lenovo ThinkCentre M83 (Monterey/HD 4600 success)',
    sourceUrl: 'https://www.reddit.com/r/hackintosh/comments/1aizf5z',
    hardware: {
      architecture: ['Intel'],
      generations: ['Haswell'],
      formFactor: 'desktop',
      modelPatterns: ['thinkcentre m83'],
      gpuPatterns: ['hd 4600'],
    },
    achievedVersion: 'macOS Monterey 12',
    whatWorked: ['Stable boot', 'SSD boot', 'Intel iGPU acceleration'],
    whatDidNotWork: [],
    notes: 'Haswell small-form-factor desktop success on Monterey.',
    confidence: 'medium',
  },
  {
    id: 'thinkpad-x230-catalina',
    sourceTitle: 'Successfully running macOS Catalina on my ThinkPad X230!',
    sourceUrl: 'https://www.reddit.com/r/hackintosh/comments/ifu54n',
    hardware: {
      architecture: ['Intel'],
      generations: ['Ivy Bridge'],
      formFactor: 'laptop',
      modelPatterns: ['thinkpad x230', 'thinkpad x230t'],
      gpuPatterns: ['hd 4000'],
    },
    achievedVersion: 'macOS Catalina 10.15',
    whatWorked: ['Catalina boot', 'GPU acceleration'],
    whatDidNotWork: ['Wireless card needed adjustment'],
    notes: 'Documented Catalina SUCCESS post for the X230 platform.',
    confidence: 'high',
  },
  {
    id: 'thinkpad-x230-big-sur',
    sourceTitle: 'Thinkpad X230 - Perfect 12" MBP!',
    sourceUrl: 'https://www.reddit.com/r/hackintosh/comments/1dhmmff',
    hardware: {
      architecture: ['Intel'],
      generations: ['Ivy Bridge'],
      formFactor: 'laptop',
      modelPatterns: ['thinkpad x230', 'thinkpad x230t'],
      gpuPatterns: ['hd 4000'],
    },
    achievedVersion: 'macOS Big Sur 11',
    whatWorked: ['Big Sur boot', 'Daily-driver use'],
    whatDidNotWork: ['Exact caveats were not documented in the snippet'],
    notes: 'Modern SUCCESS post confirming continued X230 community viability.',
    confidence: 'medium',
  },
  {
    id: 'thinkpad-x201-big-sur',
    sourceTitle: 'Hackintosh Big Sur on ThinkPad X201',
    sourceUrl: 'https://www.reddit.com/r/hackintosh/comments/tm2m9z',
    hardware: {
      architecture: ['Intel'],
      generations: ['Unknown'],
      formFactor: 'laptop',
      modelPatterns: ['thinkpad x201', 'thinkpad x201i'],
      gpuPatterns: ['intel hd'],
    },
    achievedVersion: 'macOS Big Sur 11',
    whatWorked: ['Wi-Fi', 'Bluetooth', 'iMessage/iCloud', 'GPU acceleration'],
    whatDidNotWork: ['Sleep', 'SSD boot can be inconsistent'],
    notes: 'Very old ThinkPad success story; clearly not perfect, but still community-proven as a manual path.',
    confidence: 'medium',
  },
  {
    id: 'x1-carbon-gen2-big-sur',
    sourceTitle: 'Hackintosh Lenovo X1 Carbon Gen 2',
    sourceUrl: 'https://www.reddit.com/r/hackintosh/comments/17y7fnv',
    hardware: {
      architecture: ['Intel'],
      generations: ['Haswell'],
      formFactor: 'laptop',
      modelPatterns: ['x1 carbon gen 2', 'x1 carbon 2nd', 'x1c2'],
      gpuPatterns: ['hd 4400'],
    },
    achievedVersion: 'macOS Big Sur 11',
    whatWorked: ['Big Sur boot', 'Boot from SSD', 'Trackpad touch-click'],
    whatDidNotWork: ['Sleep', 'HiDPI quirks', 'Keyboard/gesture glitches'],
    notes: 'Documented X1 Carbon Gen2 success, but with a visibly rough UX and multiple post-install tweaks.',
    confidence: 'medium',
  },
  {
    id: 'x1-carbon-gen5-sonoma',
    sourceTitle: 'Lenovo X1 Carbon Gen5 Sonoma success',
    sourceUrl: 'https://www.reddit.com/r/hackintosh/comments/1bw653g',
    hardware: {
      architecture: ['Intel'],
      generations: ['Kaby Lake', 'Skylake'],
      formFactor: 'laptop',
      modelPatterns: ['x1 carbon gen5', 'x1 carbon 5th', 'x1c5'],
      gpuPatterns: ['hd 620', 'uhd 620'],
    },
    achievedVersion: 'macOS Sonoma 14',
    whatWorked: ['Sonoma boot', 'Near-full daily-driver use'],
    whatDidNotWork: ['Audio may need patching', 'BIOS/device-id tweaks may still be required'],
    notes: 'Kaby Lake-class X1 Carbon success path with extra patching still expected.',
    confidence: 'low',
  },
  {
    id: 'thinkpad-t480-ventura',
    sourceTitle: 'Thinkpad T480 Ventura',
    sourceUrl: 'https://www.reddit.com/r/hackintosh/comments/176z5xv',
    hardware: {
      architecture: ['Intel'],
      generations: ['Kaby Lake', 'Comet Lake'],
      formFactor: 'laptop',
      modelPatterns: ['thinkpad t480', 'thinkpad t480s'],
      gpuPatterns: ['uhd 620'],
    },
    achievedVersion: 'macOS Ventura 13',
    whatWorked: ['Ventura install', 'General laptop use', 'iServices on some builds'],
    whatDidNotWork: ['Thunderbolt can remain unresolved', 'Wi-Fi/Bluetooth tuning may still be needed'],
    notes: 'T480-class community path is viable, but still not fully clean on every device.',
    confidence: 'medium',
  },
  {
    id: 'thinkpad-t480-sonoma',
    sourceTitle: 'Thinkpad T480 Sonoma 14.2.1',
    sourceUrl: 'https://www.reddit.com/r/hackintosh/comments/18y5yae',
    hardware: {
      architecture: ['Intel'],
      generations: ['Kaby Lake', 'Comet Lake'],
      formFactor: 'laptop',
      modelPatterns: ['thinkpad t480', 'thinkpad t480s'],
      gpuPatterns: ['uhd 620'],
    },
    achievedVersion: 'macOS Sonoma 14',
    whatWorked: ['Sonoma boot', 'General laptop use'],
    whatDidNotWork: ['Some users still report Wi-Fi dropouts or Thunderbolt limitations'],
    notes: 'More recent T480-class success path, but still not a zero-tweak laptop target.',
    confidence: 'medium',
  },
];

interface CommunityEvidenceMatch {
  record: CommunityEvidenceRecord;
  score: number;
  matchedFormFactor: boolean;
  matchedArchitecture: boolean;
  matchedGeneration: boolean;
  matchedModel: boolean;
  matchedGpu: boolean;
}

function scoreEvidenceMatch(profile: HardwareProfile, record: CommunityEvidenceRecord): CommunityEvidenceMatch {
  const board = profile.motherboard.toLowerCase();
  const gpu = profile.gpu.toLowerCase();
  let score = 0;
  const matchedFormFactor = record.hardware.formFactor === (profile.isLaptop ? 'laptop' : 'desktop');
  const matchedArchitecture = !record.hardware.architecture || record.hardware.architecture.includes(profile.architecture as 'Intel' | 'AMD');
  const matchedGeneration = !record.hardware.generations || record.hardware.generations.includes(profile.generation);
  const matchedModel = !!record.hardware.modelPatterns?.some((pattern) => board.includes(pattern.toLowerCase()));
  const matchedGpu = !!record.hardware.gpuPatterns?.some((pattern) => gpu.includes(pattern.toLowerCase()));

  if (matchedFormFactor) score += 1;
  if (matchedArchitecture) score += 1;
  if (matchedGeneration) score += 2;
  if (matchedModel) score += 2;
  if (matchedGpu) score += 1;

  return {
    record,
    score,
    matchedFormFactor,
    matchedArchitecture,
    matchedGeneration,
    matchedModel,
    matchedGpu,
  };
}

function confidenceWeight(confidence: CommunityEvidenceConfidence): number {
  switch (confidence) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
    default:
      return 1;
  }
}

function uniqueTop(items: string[], limit: number): string[] {
  return [...new Set(items.filter(Boolean))].slice(0, limit);
}

function classifyCommunityMatchLevel(bestMatch: CommunityEvidenceMatch | undefined): CommunityMatchLevel {
  if (!bestMatch) return 'none';
  if (bestMatch.score >= 6) return 'strong';
  if (bestMatch.score >= 5) return 'partial';
  return 'weak';
}

function describeCommunityMatch(bestMatch: CommunityEvidenceMatch | undefined, matchLevel: CommunityMatchLevel): string | null {
  if (!bestMatch || matchLevel === 'none') return null;

  if (matchLevel === 'strong') {
    if (bestMatch.matchedModel) {
      return 'Strong match: same CPU generation, same system class, and a closely matching model family were found in documented success posts.';
    }
    return 'Strong match: same CPU generation, same system class, and a closely matching GPU path were found in documented success posts.';
  }

  if (matchLevel === 'partial') {
    return 'Partial match: the community data lines up on CPU generation and system class, but the exact model or GPU route is not identical.';
  }

  return 'Weak match: only general hardware similarity was found. Treat the community signal as low-confidence guidance, not a proven copy path.';
}

export function getCommunityEvidenceSummary(profile: HardwareProfile): CommunityEvidenceSummary {
  const matched = COMMUNITY_SUCCESS_EVIDENCE
    .map((record) => scoreEvidenceMatch(profile, record))
    .filter((entry) => entry.score >= 4)
    .sort((left, right) => right.score - left.score);

  if (matched.length === 0) {
    return {
      signal: 'none',
      matchLevel: 'none',
      matchExplanation: null,
      matchedCount: 0,
      bestMatchScore: 0,
      bestMatchConfidence: 'none',
      highestReportedVersion: null,
      highestReportedVersionNumeric: null,
      summary: null,
      whatUsuallyWorks: [],
      whatDidNotWork: [],
      sources: [],
    };
  }

  const weightedCount = matched.reduce((total, entry) => total + confidenceWeight(entry.record.confidence), 0);
  const signal: CommunityEvidenceSignal = weightedCount >= 6
    ? 'strong'
    : weightedCount >= 4
      ? 'moderate'
      : 'weak';

  const ceilingCandidates = matched
    .filter((entry) => entry.record.confidence !== 'low')
    .map((entry) => parseMacOSVersion(entry.record.achievedVersion));
  const fallbackCandidates = matched.map((entry) => parseMacOSVersion(entry.record.achievedVersion));
  const highestReportedVersionNumeric = Math.max(...(ceilingCandidates.length > 0 ? ceilingCandidates : fallbackCandidates));
  const highestReportedVersion = matched
    .map((entry) => entry.record)
    .find((record) => parseMacOSVersion(record.achievedVersion) === highestReportedVersionNumeric)?.achievedVersion ?? null;

  const whatUsuallyWorks = uniqueTop(matched.flatMap((entry) => entry.record.whatWorked), 5);
  const whatDidNotWork = uniqueTop(matched.flatMap((entry) => entry.record.whatDidNotWork), 5);
  const hardwareLabel = profile.isLaptop ? `${profile.generation} laptops` : `${profile.generation} desktops`;
  const bestMatch = matched[0];
  const matchLevel = classifyCommunityMatchLevel(bestMatch);

  return {
    signal,
    matchLevel,
    matchExplanation: describeCommunityMatch(bestMatch, matchLevel),
    matchedCount: matched.length,
    bestMatchScore: bestMatch?.score ?? 0,
    bestMatchConfidence: bestMatch?.record.confidence ?? 'none',
    highestReportedVersion,
    highestReportedVersionNumeric,
    summary: `${matched.length} documented SUCCESS post${matched.length === 1 ? '' : 's'} for similar ${hardwareLabel}. Treat this as advisory evidence only; most reports top out around ${highestReportedVersion ?? 'an older macOS release'} and still mention manual quirks.`,
    whatUsuallyWorks,
    whatDidNotWork,
    sources: matched.slice(0, 3).map(({ record }) => ({
      sourceTitle: record.sourceTitle,
      sourceUrl: record.sourceUrl,
      confidence: record.confidence,
      achievedVersion: record.achievedVersion,
    })),
  };
}

import type { HardwareProfile } from '../../electron/configGenerator.js';
import type { ResourcePlan } from '../../electron/resourcePlanner.js';

export function buildResourcePlanOwnerKey(profile: HardwareProfile | null): string | null {
  if (!profile) return null;
  return JSON.stringify({
    cpu: profile.cpu,
    architecture: profile.architecture,
    generation: profile.generation,
    motherboard: profile.motherboard,
    targetOS: profile.targetOS,
    smbios: profile.smbios,
    kexts: [...profile.kexts].sort(),
    ssdts: [...profile.ssdts].sort(),
  });
}

export function resolveVisibleResourcePlan(
  currentPlan: ResourcePlan | null,
  currentOwnerKey: string | null,
  fallbackPlan: ResourcePlan | null,
  fallbackOwnerKey: string | null,
): ResourcePlan | null {
  if (currentPlan) return currentPlan;
  if (!currentOwnerKey || !fallbackPlan || currentOwnerKey !== fallbackOwnerKey) return null;
  return fallbackPlan;
}

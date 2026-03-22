export interface KextRegistryEntry {
  repo: string;
  assetFilter?: string;
  directUrl?: string;
  staticVersion?: string;
  embeddedFallback?: boolean;
}

export interface KextReleaseProbe {
  version?: string | null;
  assetUrl?: string | null;
  assetName?: string | null;
  error?: string | null;
}

export interface KextSourceResolution {
  route: 'bundled' | 'github' | 'direct' | 'embedded' | 'failed';
  available: boolean;
  version: string | null;
  assetUrl: string | null;
  message: string;
}

function normalizeMessage(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export function resolveKextSourcePlan(
  kextName: string,
  entry: KextRegistryEntry | undefined,
  probe?: KextReleaseProbe | null,
  options?: { directUrlReachable?: boolean; directUrlError?: string | null },
): KextSourceResolution {
  if (!entry) {
    return {
      route: 'bundled',
      available: true,
      version: 'bundled',
      assetUrl: null,
      message: `${kextName} is bundled with the app.`,
    };
  }

  if (entry.directUrl) {
    if (options?.directUrlReachable !== false) {
      return {
        route: 'direct',
        available: true,
        version: entry.staticVersion ?? 'direct',
        assetUrl: entry.directUrl,
        message: `${kextName} can be downloaded directly without the GitHub API.`,
      };
    }

    if (entry.embeddedFallback) {
      return {
        route: 'embedded',
        available: true,
        version: 'embedded',
        assetUrl: null,
        message: `${kextName} direct download is unavailable, but a bundled fallback is ready.`,
      };
    }

    return {
      route: 'failed',
      available: false,
      version: null,
      assetUrl: null,
      message: normalizeMessage(options?.directUrlError, `${kextName} direct download is unavailable.`),
    };
  }

  if (probe?.assetUrl) {
    return {
      route: 'github',
      available: true,
      version: probe.version ?? 'unknown',
      assetUrl: probe.assetUrl,
      message: `${kextName} latest release asset was resolved from GitHub.`,
    };
  }

  if (entry.embeddedFallback) {
    return {
      route: 'embedded',
      available: true,
      version: 'embedded',
      assetUrl: null,
      message: probe?.error
        ? `${kextName} GitHub lookup failed, but a bundled fallback is ready.`
        : `${kextName} release asset was not found, but a bundled fallback is ready.`,
    };
  }

  return {
    route: 'failed',
    available: false,
    version: probe?.version ?? null,
    assetUrl: null,
    message: normalizeMessage(
      probe?.error,
      `No usable release asset was found for ${kextName}.`,
    ),
  };
}

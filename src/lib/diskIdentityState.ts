export interface RendererDiskInfo {
  device: string;
  devicePath?: string;
  isSystemDisk: boolean;
  partitionTable: string;
  sizeBytes?: number;
  model?: string;
  vendor?: string;
  serialNumber?: string;
  transport?: string;
  removable?: boolean;
  identityConfidence?: string;
  identityFieldsUsed?: string[];
}

export interface ExpectedDiskIdentity {
  devicePath?: string;
  sizeBytes?: number;
  model?: string;
  vendor?: string;
  serialNumber?: string;
  transport?: string;
  removable?: boolean;
  partitionTable?: string;
}

export function diskInfoMatchesDevice(
  device: string,
  info: RendererDiskInfo | null | undefined,
): info is RendererDiskInfo {
  return !!info && info.device === device;
}

export function pickSelectedDiskInfo(
  device: string,
  latestInfo: RendererDiskInfo | null | undefined,
  capturedInfo: RendererDiskInfo | null | undefined,
): RendererDiskInfo | null {
  if (diskInfoMatchesDevice(device, latestInfo)) return latestInfo;
  if (diskInfoMatchesDevice(device, capturedInfo)) return capturedInfo;
  return null;
}

export function toExpectedDiskIdentity(
  info: RendererDiskInfo | null | undefined,
): ExpectedDiskIdentity | undefined {
  if (!info) return undefined;
  return {
    devicePath: info.devicePath,
    sizeBytes: info.sizeBytes,
    model: info.model,
    vendor: info.vendor,
    serialNumber: info.serialNumber,
    transport: info.transport,
    removable: info.removable,
    partitionTable: info.partitionTable,
  };
}

export function shouldRetryDiskInfoLookup(
  error: unknown,
  attemptIndex: number,
  maxAttempts: number,
): boolean {
  if (attemptIndex >= maxAttempts - 1) return false;
  const message = String((error as { message?: string } | null | undefined)?.message ?? error ?? '').toLowerCase();
  if (!message) return true;
  return !(
    message.includes('not found')
    || message.includes('disconnected')
    || message.includes('no longer available')
    || message.includes('target disk')
  );
}

// ─── Hardware Detection ─────────────────────────────────────────────────────

export interface DetectedHardware {
  cpu: CpuInfo;
  gpu: GpuInfo[];
  audio: AudioDevice[];
  network: NetworkDevice[];
  input: InputDevice[];
  memory: MemoryInfo;
  motherboard: MotherboardInfo;
  storage: StorageDevice[];
  chassis: ChassisInfo;
  platform: string;
  isLaptop: boolean;
}

export interface CpuInfo {
  name: string;
  vendor: string;
  cores: number;
  threads: number;
  baseClock?: number;
  generation?: string;
  architecture?: string;
  codename?: string;
  family?: number;
  model?: number;
  stepping?: number;
}

export interface GpuInfo {
  name: string;
  vendor: string;
  vendorId?: string;
  deviceId?: string;
  vramMb?: number;
  isDiscrete: boolean;
  isIgpu: boolean;
}

export interface AudioDevice {
  name: string;
  codec?: string;
  vendorId?: string;
  deviceId?: string;
}

export interface NetworkDevice {
  name: string;
  deviceType: 'ethernet' | 'wifi' | 'bluetooth';
  vendorId?: string;
  deviceId?: string;
  chipset?: string;
}

export interface InputDevice {
  name: string;
  deviceType: 'ps2' | 'i2c' | 'usb';
  instanceId?: string;
}

export interface MemoryInfo {
  totalMb: number;
  slots: MemorySlot[];
}

export interface MemorySlot {
  sizeMb: number;
  speedMhz?: number;
  memoryType?: string;
  manufacturer?: string;
}

export interface MotherboardInfo {
  manufacturer?: string;
  product?: string;
  chipset?: string;
}

export interface StorageDevice {
  name: string;
  sizeBytes: number;
  mediaType?: string;
  interfaceType?: string;
}

export interface ChassisInfo {
  chassisType?: string;
  manufacturer?: string;
  hasBattery: boolean;
}

// ─── Hardware Profile ───────────────────────────────────────────────────────

export interface HardwareProfile {
  cpu: string;
  cpuVendor: string;
  coreCount?: number;
  generation: string;
  architecture: string;
  codename: string;
  gpu: string;
  gpuVendor: string;
  gpuDeviceId?: string;
  gpuDevices?: HardwareGpuDeviceSummary[];
  igpu?: string;
  igpuDeviceId?: string;
  audioCodec?: string;
  ethernetChipset?: string;
  wifiChipset?: string;
  inputType: string;
  motherboard: string;
  isLaptop: boolean;
  isVm?: boolean;
  hasDiscreteGpu: boolean;
  hasIgpu: boolean;
  ramGb: number;
  smbios?: string;
  targetOs?: string;
  configStrategy?: string;
}

export interface HardwareGpuDeviceSummary {
  name: string;
  vendorName?: string;
  vendorId?: string;
  deviceId?: string;
}

// ─── EFI Build ──────────────────────────────────────────────────────────────

export interface BuildResult {
  efiPath: string;
  configPlistPath: string;
  kexts: KextResult[];
  ssdts: string[];
  opencoreVersion: string;
  warnings: string[];
}

export interface KextResult {
  name: string;
  version?: string;
  source: string;
  status: 'downloaded' | 'cached' | 'failed' | 'optional';
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  sectionsPresent: string[];
  sectionsMissing: string[];
}

export interface ValidationIssue {
  severity: string;
  section: string;
  message: string;
  path?: string;
}

// ─── Disk / USB ─────────────────────────────────────────────────────────────

export interface DiskInfo {
  devicePath: string;
  model?: string;
  vendor?: string;
  serialNumber?: string;
  sizeBytes: number;
  sizeDisplay: string;
  transport?: string;
  removable: boolean;
  partitionTable?: string;
  partitions: PartitionInfo[];
  isSystemDisk: boolean;
}

export interface PartitionInfo {
  number: number;
  label?: string;
  filesystem?: string;
  sizeBytes: number;
  mountPoint?: string;
}

// ─── Task / Progress ────────────────────────────────────────────────────────

export interface TaskUpdate {
  taskId: string;
  kind: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  message?: string;
  detail?: unknown;
}

// ─── Flash Authorization ────────────────────────────────────────────────────

export interface FlashConfirmation {
  token: string;
  device: string;
  expiresAt: number;
  diskDisplay: string;
  efiHash: string;
}

// ─── Firmware ───────────────────────────────────────────────────────────────

export interface FirmwareReport {
  uefiMode: FirmwareCheck;
  secureBoot: FirmwareCheck;
  vtX: FirmwareCheck;
  vtD: FirmwareCheck;
  above4g: FirmwareCheck;
  biosVendor?: string;
  biosVersion?: string;
  confidence: string;
}

export interface FirmwareCheck {
  name: string;
  status: string;
  evidence: string;
  required: boolean;
}

// ─── Recovery ───────────────────────────────────────────────────────────────

export interface RecoveryCacheInfo {
  available: boolean;
  osVersion?: string;
  dmgPath?: string;
  sizeBytes?: number;
}

// ─── State ──────────────────────────────────────────────────────────────────

export interface PersistedState {
  currentStep?: string;
  profile?: unknown;
  timestamp?: number;
  efiPath?: string;
  recoveryDownloadOffset?: number;
  recoveryDmgDest?: string;
  recoveryTargetOs?: string;
}

// ─── Compatibility ──────────────────────────────────────────────────────────

export interface CompatibilityReport {
  overall: 'supported' | 'partial' | 'unsupported';
  strategy?: 'canonical' | 'conservative' | 'blocked';
  cpuSupported: boolean;
  gpuSupported: boolean;
  audioSupported: boolean;
  networkSupported: boolean;
  recommendedOs?: string;
  supportedOsVersions: string[];
  issues: CompatibilityIssue[];
  confidence: number;
}

export interface CompatibilityIssue {
  component: string;
  severity: string;
  message: string;
  workaround?: string;
}

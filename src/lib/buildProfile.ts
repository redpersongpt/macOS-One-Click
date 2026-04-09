import type { DetectedHardware, HardwareProfile } from '../bridge/types';

/**
 * Derives a HardwareProfile from raw DetectedHardware.
 * The profile is the normalized input the backend expects for
 * compatibility checks, EFI builds, and config generation.
 */
export function buildProfile(hw: DetectedHardware): HardwareProfile {
  const igpu = hw.gpu.find((g) => g.isIgpu);
  const dgpu = hw.gpu.find((g) => g.isDiscrete);
  const primaryGpu = dgpu ?? igpu ?? hw.gpu[0];

  const wifi = hw.network.find((n) => n.deviceType === 'wifi');
  const ethernet = hw.network.find((n) => n.deviceType === 'ethernet');
  const primaryInput = hw.input[0];

  return {
    cpu: hw.cpu.name,
    cpuVendor: hw.cpu.vendor,
    generation: hw.cpu.generation ?? 'Unknown',
    architecture: hw.cpu.architecture ?? 'Unknown',
    codename: hw.cpu.codename ?? 'Unknown',
    gpu: primaryGpu?.name ?? 'None',
    gpuVendor: primaryGpu?.vendor ?? 'Unknown',
    gpuDeviceId: primaryGpu?.deviceId,
    igpu: igpu?.name,
    igpuDeviceId: igpu?.deviceId,
    audioCodec: hw.audio[0]?.codec,
    ethernetChipset: ethernet?.chipset,
    wifiChipset: wifi?.chipset,
    inputType: primaryInput?.deviceType ?? 'usb',
    motherboard: hw.motherboard.product ?? hw.motherboard.manufacturer ?? 'Unknown',
    isLaptop: hw.isLaptop,
    hasDiscreteGpu: hw.gpu.some((g) => g.isDiscrete),
    hasIgpu: hw.gpu.some((g) => g.isIgpu),
    ramGb: Math.round(hw.memory.totalMb / 1024),
  };
}

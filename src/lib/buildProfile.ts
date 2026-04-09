import type { DetectedHardware, HardwareProfile } from '../bridge/types';

function detectVirtualMachine(hw: DetectedHardware): boolean {
  const fingerprint = [
    hw.platform,
    hw.motherboard.manufacturer,
    hw.motherboard.product,
    hw.chassis.manufacturer,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /(vmware|virtualbox|virtual machine|qemu|kvm|hyper-v|parallels|bhyve|bochs)/.test(fingerprint);
}

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
    coreCount: hw.cpu.cores,
    generation: hw.cpu.generation ?? 'Unknown',
    architecture: hw.cpu.architecture ?? 'Unknown',
    codename: hw.cpu.codename ?? 'Unknown',
    gpu: primaryGpu?.name ?? 'None',
    gpuVendor: primaryGpu?.vendor ?? 'Unknown',
    gpuDeviceId: primaryGpu?.deviceId,
    gpuDevices: hw.gpu.map((gpu) => ({
      name: gpu.name,
      vendorName: gpu.vendor,
      vendorId: gpu.vendorId,
      deviceId: gpu.deviceId,
    })),
    igpu: igpu?.name,
    igpuDeviceId: igpu?.deviceId,
    audioCodec: hw.audio[0]?.codec,
    ethernetChipset: ethernet?.chipset,
    wifiChipset: wifi?.chipset,
    inputType: primaryInput?.deviceType ?? 'usb',
    motherboard: hw.motherboard.product ?? hw.motherboard.manufacturer ?? 'Unknown',
    isLaptop: hw.isLaptop,
    isVm: detectVirtualMachine(hw),
    hasDiscreteGpu: hw.gpu.some((g) => g.isDiscrete),
    hasIgpu: hw.gpu.some((g) => g.isIgpu),
    ramGb: Math.round(hw.memory.totalMb / 1024),
  };
}

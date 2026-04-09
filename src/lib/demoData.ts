import type {
  BuildResult,
  CompatibilityReport,
  DetectedHardware,
  DiskInfo,
  FirmwareReport,
  FlashConfirmation,
  KextResult,
  ValidationResult,
} from '../bridge/types';

export const DEMO_HARDWARE: DetectedHardware = {
  cpu: {
    name: 'Intel Core i7-10700K',
    vendor: 'Intel',
    cores: 8,
    threads: 16,
    generation: 'Comet Lake',
    architecture: 'Intel',
    codename: 'Comet Lake',
  },
  gpu: [
    {
      name: 'Intel UHD 630',
      vendor: 'Intel',
      vendorId: '8086',
      deviceId: '9bc5',
      isDiscrete: false,
      isIgpu: true,
    },
    {
      name: 'AMD Radeon RX 580',
      vendor: 'AMD',
      vendorId: '1002',
      deviceId: '67df',
      vramMb: 8192,
      isDiscrete: true,
      isIgpu: false,
    },
  ],
  audio: [{ name: 'Realtek ALC892', codec: 'ALC892' }],
  network: [
    {
      name: 'Intel I219-V',
      deviceType: 'ethernet',
      vendorId: '8086',
      chipset: 'I219-V',
    },
    {
      name: 'Intel Wi-Fi 6 AX200',
      deviceType: 'wifi',
      vendorId: '8086',
      chipset: 'AX200',
    },
  ],
  input: [{ name: 'PS/2 Keyboard', deviceType: 'ps2' }],
  memory: {
    totalMb: 32768,
    slots: [
      { sizeMb: 16384, speedMhz: 3200, memoryType: 'DDR4' },
      { sizeMb: 16384, speedMhz: 3200, memoryType: 'DDR4' },
    ],
  },
  motherboard: {
    manufacturer: 'ASUS',
    product: 'ROG STRIX Z490-E GAMING',
    chipset: 'Z490',
  },
  storage: [
    {
      name: 'Samsung 970 EVO Plus 1TB',
      sizeBytes: 1000204886016,
      mediaType: 'NVMe',
    },
  ],
  chassis: { chassisType: 'Desktop', manufacturer: 'ASUS', hasBattery: false },
  platform: 'demo',
  isLaptop: false,
};

export function makeDemoCompatibilityReport(): CompatibilityReport {
  return {
    overall: 'supported',
    cpuSupported: true,
    gpuSupported: true,
    audioSupported: true,
    networkSupported: true,
    recommendedOs: 'Ventura',
    supportedOsVersions: ['Monterey', 'Ventura', 'Sonoma'],
    issues: [
      {
        component: 'Wi-Fi',
        severity: 'warning',
        message: 'Intel AX200 requires itlwm.kext instead of native macOS support.',
        workaround: 'The demo build includes the matching Intel wireless stack.',
      },
    ],
    confidence: 0.92,
  };
}

export function makeDemoFirmwareReport(): FirmwareReport {
  return {
    uefiMode: {
      name: 'UEFI Mode',
      status: 'confirmed',
      evidence: 'Firmware profile reports pure UEFI boot without CSM.',
      required: true,
    },
    secureBoot: {
      name: 'Secure Boot',
      status: 'failing',
      evidence: 'Factory profile still has Secure Boot enabled.',
      required: true,
    },
    vtX: {
      name: 'VT-x',
      status: 'confirmed',
      evidence: 'CPU virtualization is enabled in the saved firmware profile.',
      required: true,
    },
    vtD: {
      name: 'VT-d',
      status: 'inferred',
      evidence: 'Chipset supports VT-d, but the saved profile could not verify the toggle.',
      required: false,
    },
    above4g: {
      name: 'Above 4G Decoding',
      status: 'inferred',
      evidence: 'Z490 boards commonly expose Above 4G in PCIe settings.',
      required: false,
    },
    biosVendor: 'American Megatrends',
    biosVersion: '2201',
    confidence: 'medium',
  };
}

function demoKexts(targetOs: string): KextResult[] {
  return [
    { name: 'Lilu.kext', version: '1.6.8', source: 'demo-cache', status: 'cached' },
    { name: 'VirtualSMC.kext', version: '1.3.3', source: 'demo-cache', status: 'cached' },
    { name: 'WhateverGreen.kext', version: '1.6.9', source: 'demo-cache', status: 'cached' },
    { name: 'AppleALC.kext', version: '1.9.1', source: 'demo-cache', status: 'cached' },
    { name: 'IntelMausi.kext', version: '1.0.8', source: 'demo-cache', status: 'cached' },
    {
      name: 'AirportItlwm.kext',
      version: `${targetOs.toLowerCase()}-preview`,
      source: 'demo-cache',
      status: 'cached',
    },
  ];
}

export function makeDemoBuildResult(targetOs: string): BuildResult {
  return {
    efiPath: `/demo/builds/${targetOs.toLowerCase()}-z490/EFI`,
    configPlistPath: `/demo/builds/${targetOs.toLowerCase()}-z490/EFI/OC/config.plist`,
    kexts: demoKexts(targetOs),
    ssdts: [
      'SSDT-AWAC.aml',
      'SSDT-EC-USBX-DESKTOP.aml',
      'SSDT-PLUG-DRTNIA.aml',
      'SSDT-RHUB.aml',
    ],
    opencoreVersion: '1.0.4',
    warnings: [
      'Demo build uses placeholder SMBIOS values. Generate real serials before booting.',
      'Intel Wi-Fi support remains non-native and depends on AirportItlwm.',
    ],
  };
}

export function makeDemoValidationResult(): ValidationResult {
  return {
    valid: true,
    sectionsPresent: [
      'ACPI',
      'Booter',
      'DeviceProperties',
      'Kernel',
      'Misc',
      'NVRAM',
      'PlatformInfo',
      'UEFI',
    ],
    sectionsMissing: [],
    issues: [
      {
        severity: 'warning',
        section: 'PlatformInfo',
        message: 'Demo build keeps placeholder serial fields for safety.',
        path: 'EFI/OC/config.plist',
      },
    ],
  };
}

export function makeDemoUsbDevices(): DiskInfo[] {
  return [
    {
      devicePath: '/dev/demo-usb0',
      model: 'SanDisk Ultra Fit',
      vendor: 'SanDisk',
      serialNumber: 'DEMO-USB-001',
      sizeBytes: 32212254720,
      sizeDisplay: '32.2 GB',
      transport: 'usb',
      removable: true,
      partitionTable: 'gpt',
      partitions: [
        {
          number: 1,
          label: 'EFI',
          filesystem: 'FAT32',
          sizeBytes: 536870912,
          mountPoint: '/Volumes/EFI-DEMO',
        },
      ],
      isSystemDisk: false,
    },
    {
      devicePath: '/dev/demo-usb1',
      model: 'Samsung BAR Plus',
      vendor: 'Samsung',
      serialNumber: 'DEMO-USB-002',
      sizeBytes: 257698037760,
      sizeDisplay: '257.7 GB',
      transport: 'usb',
      removable: true,
      partitionTable: 'gpt',
      partitions: [],
      isSystemDisk: false,
    },
    {
      devicePath: '/dev/demo-system',
      model: 'Internal NVMe',
      vendor: 'Samsung',
      serialNumber: 'SYS-0001',
      sizeBytes: 1000204886016,
      sizeDisplay: '1.0 TB',
      transport: 'nvme',
      removable: false,
      partitionTable: 'gpt',
      partitions: [
        {
          number: 1,
          label: 'EFI',
          filesystem: 'FAT32',
          sizeBytes: 536870912,
          mountPoint: '/boot/efi',
        },
      ],
      isSystemDisk: true,
    },
  ];
}

export function makeDemoFlashConfirmation(device: string): FlashConfirmation {
  return {
    token: 'DEMO-FLASH',
    device,
    expiresAt: Date.now() + 5 * 60 * 1000,
    diskDisplay: 'Demo USB Target',
    efiHash: 'demo-hash-9f5c61',
  };
}

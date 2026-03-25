import { exec } from 'child_process';
import util from 'util';
import os from 'os';
import fs from 'fs';
import { inferLaptopFormFactor } from './formFactor.js';

const execPromise = util.promisify(exec);

// ── Types ─────────────────────────────────────────────────────────────────────

export type DetectionConfidence = 'detected' | 'partially-detected' | 'unverified';

export interface GpuDevice {
  name: string;
  vendorId: string | null;   // e.g. "10de", "1002", "8086"
  deviceId: string | null;   // e.g. "2484"
  vendorName: string;        // resolved from vendorId or raw name
  confidence: DetectionConfidence;
}

export interface CpuInfo {
  name: string;
  vendor: string;            // "GenuineIntel" | "AuthenticAMD" | "Apple" | ...
  vendorName: string;        // "Intel" | "AMD" | "Apple"
  confidence: DetectionConfidence;
}

export interface AudioDevice {
  /** Raw device name from OS */
  name: string;
  /** PnP vendor ID, e.g. "10ec" for Realtek */
  vendorId: string | null;
  /** PnP device ID, e.g. "0282" for ALC282 */
  deviceId: string | null;
  /** Resolved codec name, e.g. "ALC282" */
  codecName: string | null;
  confidence: DetectionConfidence;
}

export type NetworkDeviceType = 'ethernet' | 'wifi' | 'unknown';

export interface NetworkDevice {
  /** Raw device name from OS */
  name: string;
  /** PCI/PnP vendor ID, e.g. "8086" for Intel */
  vendorId: string | null;
  /** PCI/PnP device ID */
  deviceId: string | null;
  /** Resolved vendor name */
  vendorName: string;
  /** Resolved adapter family/chipset, e.g. "Intel I219-V", "Realtek RTL8111" */
  adapterFamily: string | null;
  /** ethernet or wifi */
  type: NetworkDeviceType;
  confidence: DetectionConfidence;
}

export type InputStackType = 'ps2' | 'i2c' | 'unknown';

export interface InputDevice {
  /** Raw device name from OS */
  name: string;
  /** Full PnP device ID string */
  pnpDeviceId: string;
  /** Whether this device indicates I2C input hardware */
  isI2C: boolean;
  confidence: DetectionConfidence;
}

/**
 * I2C HID device signatures in PnP device IDs.
 * PNP0C50 = HID-over-I2C standard device
 * INT33C2/C3/C6 = Intel I2C controller (Haswell/Broadwell era)
 * INT3432/3433 = Intel I2C controller (Skylake+ era)
 * MSFT0001 = Microsoft I2C HID minidriver
 * Any ACPI path containing "I2C" indicates I2C bus presence
 */
const I2C_PNP_SIGNATURES = /PNP0C50|INT33C[2-6]|INT343[2-3]|MSFT0001|\\\\.*I2C/i;

export function isI2CDeviceId(pnpDeviceId: string): boolean {
  return I2C_PNP_SIGNATURES.test(pnpDeviceId);
}

export function deriveInputStack(inputDevices: InputDevice[], isLaptop: boolean): InputStackType {
  if (!isLaptop) return 'unknown';
  if (inputDevices.length === 0) return 'unknown';
  const hasI2C = inputDevices.some(d => d.isI2C);
  if (hasI2C) return 'i2c';
  // If we detected HID devices but none are I2C, assume PS2
  return 'ps2';
}

export interface DetectedHardware {
  cpu: CpuInfo;
  gpus: GpuDevice[];
  primaryGpu: GpuDevice;
  motherboardVendor: string;
  motherboardModel: string;
  ramBytes: number;
  coreCount: number;
  isLaptop: boolean;
  isVM: boolean;
  audioDevices: AudioDevice[];
  networkDevices: NetworkDevice[];
  inputDevices: InputDevice[];
}

// ── PCI vendor ID map (GPU vendors relevant to Hackintosh) ────────────────────

const GPU_VENDOR_MAP: Record<string, string> = {
  '10de': 'NVIDIA',
  '1002': 'AMD',
  '8086': 'Intel',
  '1414': 'Microsoft',  // Hyper-V virtual GPU
  '15ad': 'VMware',
  '1234': 'QEMU',
};

/** PCI vendor IDs that correspond to real physical GPU hardware */
const REAL_GPU_VENDORS = new Set(['8086', '10de', '1002']);

// ── HDA audio vendor/device mapping ──────────────────────────────────────────
// Realtek HDA device IDs → ALC codec names (most common in office laptops/desktops)
// Source: HD Audio Device IDs cross-referenced with AppleALC supported codecs wiki

const HDA_VENDOR_MAP: Record<string, string> = {
  '10ec': 'Realtek',
  '14f1': 'Conexant',
  '111d': 'IDT',
  '8384': 'SigmaTel',
  '1013': 'Cirrus Logic',
  '8086': 'Intel HDMI',
};

const REALTEK_DEVICE_TO_CODEC: Record<string, string> = {
  '0215': 'ALC215', '0221': 'ALC221', '0222': 'ALC222', '0225': 'ALC225',
  '0230': 'ALC230', '0233': 'ALC233', '0235': 'ALC235', '0236': 'ALC236',
  '0245': 'ALC245', '0255': 'ALC255', '0256': 'ALC256', '0257': 'ALC257',
  '0260': 'ALC260', '0262': 'ALC262', '0268': 'ALC268', '0269': 'ALC269',
  '0270': 'ALC270', '0272': 'ALC272', '0274': 'ALC274', '0275': 'ALC275',
  '0280': 'ALC280', '0282': 'ALC282', '0283': 'ALC283', '0284': 'ALC284',
  '0285': 'ALC285', '0286': 'ALC286', '0288': 'ALC288', '0289': 'ALC289',
  '0290': 'ALC290', '0292': 'ALC292', '0293': 'ALC293', '0294': 'ALC294',
  '0295': 'ALC295', '0298': 'ALC298', '0299': 'ALC299',
  '0662': 'ALC662', '0663': 'ALC663', '0668': 'ALC668',
  '0670': 'ALC670', '0671': 'ALC671', '0700': 'ALC700',
  '0882': 'ALC882', '0883': 'ALC883', '0885': 'ALC885', '0887': 'ALC887',
  '0888': 'ALC888', '0889': 'ALC889', '0891': 'ALC891', '0892': 'ALC892',
  '0897': 'ALC897', '0898': 'ALC898', '0899': 'ALC899',
  '0b00': 'ALC1200', '0b50': 'ALC1220',
};

// ── Network adapter vendor/device mapping ────────────────────────────────────
// Maps PCI vendor+device IDs to adapter families for Hackintosh kext selection.
// Only covers adapters relevant to macOS kext decisions (Intel Ethernet, Realtek,
// Intel Wi-Fi, Broadcom Wi-Fi, Atheros/Killer).

const NETWORK_VENDOR_MAP: Record<string, string> = {
  '8086': 'Intel',
  '10ec': 'Realtek',
  '14e4': 'Broadcom',
  '1969': 'Atheros',
  '168c': 'Atheros',
  '1b4b': 'Marvell',
  '1186': 'D-Link',
  '15b7': 'Killer',
};

// Intel Ethernet device IDs → adapter family
// Source: IntelMausi supported list + AppleIGB compatibility
const INTEL_ETHERNET_DEVICES: Record<string, string> = {
  // I217 (Haswell desktop/laptop)
  '153a': 'Intel I217-LM', '153b': 'Intel I217-V',
  // I218 (Haswell/Broadwell laptop)
  '155a': 'Intel I218-LM', '1559': 'Intel I218-V',
  '15a0': 'Intel I218-LM', '15a1': 'Intel I218-V',
  '15a2': 'Intel I218-LM', '15a3': 'Intel I218-V',
  // I219 (Skylake+ desktop/laptop — very common in office machines)
  '156f': 'Intel I219-LM', '1570': 'Intel I219-V',
  '15b7': 'Intel I219-LM', '15b8': 'Intel I219-V',
  '15bb': 'Intel I219-LM', '15bc': 'Intel I219-V',
  '15bd': 'Intel I219-LM', '15be': 'Intel I219-V',
  '15d7': 'Intel I219-LM', '15d8': 'Intel I219-V',
  '15e3': 'Intel I219-LM', '15e4': 'Intel I219-V',  // v8+
  '0d4e': 'Intel I219-LM', '0d4f': 'Intel I219-V',
  '0d4c': 'Intel I219-LM', '0d4d': 'Intel I219-V',
  '0d53': 'Intel I219-LM', '0d55': 'Intel I219-V',
  '15f9': 'Intel I219-LM', '15fa': 'Intel I219-V',
  '15fb': 'Intel I219-LM', '15fc': 'Intel I219-V',
  // I211 (desktop, needs AppleIGB on Monterey+)
  '1539': 'Intel I211-AT',
  // I210
  '1533': 'Intel I210-AT', '1536': 'Intel I210-IT',
  // I225/I226 (Alder Lake+ desktop)
  '15f2': 'Intel I225-V', '15f3': 'Intel I225-LM',
  '125b': 'Intel I226-V', '125c': 'Intel I226-LM',
  // Older (82574L, 82579LM — ThinkPad/Latitude era)
  '10d3': 'Intel 82574L', '10ea': 'Intel 82577LM',
  '10eb': 'Intel 82577LC', '10ef': 'Intel 82578DC',
  '10f0': 'Intel 82578DM', '1502': 'Intel 82579LM',
  '1503': 'Intel 82579V',
};

// Realtek Ethernet device IDs → adapter family
const REALTEK_ETHERNET_DEVICES: Record<string, string> = {
  '8136': 'Realtek RTL8101/8102', '8168': 'Realtek RTL8111',
  '8169': 'Realtek RTL8169', '8125': 'Realtek RTL8125',
  '8126': 'Realtek RTL8126', '2502': 'Realtek RTL8125',
  '2600': 'Realtek RTL8125',
};

// Intel Wi-Fi device IDs → adapter family (common office laptop cards)
// Source: OpenIntelWireless/itlwm supported device list
const INTEL_WIFI_DEVICES: Record<string, string> = {
  // Intel Wireless 7260 (Haswell era)
  '08b1': 'Intel Wireless 7260', '08b2': 'Intel Wireless 7260',
  // Intel Wireless 7265 (Broadwell era)
  '095a': 'Intel Wireless 7265', '095b': 'Intel Wireless 7265',
  // Intel Wireless 3160/3165/3168
  '08b3': 'Intel Wireless 3160', '08b4': 'Intel Wireless 3160',
  '3165': 'Intel Wireless 3165', '3166': 'Intel Wireless 3165',
  '3168': 'Intel Wireless 3168',
  // Intel Wireless 8260 (Skylake era)
  '24f3': 'Intel Wireless 8260', '24f4': 'Intel Wireless 8260',
  // Intel Wireless 8265 (Kaby Lake era)
  '24fd': 'Intel Wireless 8265',
  // Intel Wireless 9260/9461/9462/9560 (Coffee Lake era)
  '2526': 'Intel Wireless 9260',
  '9df0': 'Intel Wireless 9560', '9df4': 'Intel Wireless 9560',
  '30dc': 'Intel Wireless 9560', '31dc': 'Intel Wireless 9560',
  '9461': 'Intel Wireless 9461', '9462': 'Intel Wireless 9462',
  // Intel Wi-Fi 6 AX200/AX201/AX210/AX211
  '2723': 'Intel Wi-Fi 6 AX200',
  '02f0': 'Intel Wi-Fi 6 AX201', '06f0': 'Intel Wi-Fi 6 AX201',
  'a0f0': 'Intel Wi-Fi 6 AX201', '34f0': 'Intel Wi-Fi 6 AX201',
  '2725': 'Intel Wi-Fi 6E AX210',
  '7a70': 'Intel Wi-Fi 6E AX211', '51f0': 'Intel Wi-Fi 6E AX211',
  '51f1': 'Intel Wi-Fi 6E AX211', '54f0': 'Intel Wi-Fi 6E AX211',
};

// Broadcom Wi-Fi device IDs → adapter family (common in Dell/HP)
const BROADCOM_WIFI_DEVICES: Record<string, string> = {
  '4331': 'Broadcom BCM4331', '4353': 'Broadcom BCM43224',
  '43a0': 'Broadcom BCM4360', '43a3': 'Broadcom BCM4350',
  '43b1': 'Broadcom BCM4352', '43b2': 'Broadcom BCM4352',
  '43ba': 'Broadcom BCM43602', '43dc': 'Broadcom BCM4355',
  '4464': 'Broadcom BCM4364', '4488': 'Broadcom BCM4377',
};

// Atheros/Killer Ethernet device IDs
const ATHEROS_ETHERNET_DEVICES: Record<string, string> = {
  'e091': 'Killer E2200', 'e0a1': 'Killer E2400',
  'e0b1': 'Killer E2500', '10a1': 'Killer E2600',
  '1091': 'Atheros AR8161', '1083': 'Atheros AR8151',
  'e062': 'Qualcomm Atheros Killer E2200',
};

/**
 * Classify network device type from PCI class or device name.
 */
export function classifyNetworkType(name: string, pciClass?: string): NetworkDeviceType {
  const lower = name.toLowerCase();
  if (lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('wireless') ||
      lower.includes('wlan') || lower.includes('802.11') || lower.includes('centrino') ||
      lower.includes('airport') || lower.includes('dual band')) {
    return 'wifi';
  }
  if (lower.includes('ethernet') || lower.includes('gigabit') || lower.includes('network connection') ||
      lower.includes('lan') || lower.includes('nic') || lower.includes('gbe') ||
      lower.includes('i217') || lower.includes('i218') || lower.includes('i219') ||
      lower.includes('i211') || lower.includes('i225') || lower.includes('i226') ||
      lower.includes('rtl8111') || lower.includes('rtl8168') || lower.includes('rtl8125') ||
      lower.includes('killer e') || lower.includes('82579') || lower.includes('82574')) {
    return 'ethernet';
  }
  // PCI class 0200 = Ethernet, 0280 = Wireless
  if (pciClass === '0200') return 'ethernet';
  if (pciClass === '0280') return 'wifi';
  return 'unknown';
}

/**
 * Resolve a network adapter's family/chipset from vendor+device IDs.
 */
export function resolveNetworkAdapter(vendorId: string | null, deviceId: string | null, name: string): {
  vendorName: string;
  adapterFamily: string | null;
  type: NetworkDeviceType;
} {
  const vid = vendorId?.toLowerCase() ?? '';
  const did = deviceId?.toLowerCase() ?? '';
  const vendorName = (vid && NETWORK_VENDOR_MAP[vid]) || 'Unknown';

  let adapterFamily: string | null = null;
  let type: NetworkDeviceType = classifyNetworkType(name);

  if (vid === '8086') {
    // Intel — check Ethernet first, then Wi-Fi
    if (INTEL_ETHERNET_DEVICES[did]) {
      adapterFamily = INTEL_ETHERNET_DEVICES[did];
      type = 'ethernet';
    } else if (INTEL_WIFI_DEVICES[did]) {
      adapterFamily = INTEL_WIFI_DEVICES[did];
      type = 'wifi';
    } else {
      // Fallback: classify from name
      adapterFamily = type === 'wifi' ? 'Intel Wi-Fi (unknown model)' :
                       type === 'ethernet' ? 'Intel Ethernet (unknown model)' : null;
    }
  } else if (vid === '10ec') {
    if (REALTEK_ETHERNET_DEVICES[did]) {
      adapterFamily = REALTEK_ETHERNET_DEVICES[did];
      type = 'ethernet';
    } else {
      adapterFamily = 'Realtek (unknown model)';
    }
  } else if (vid === '14e4') {
    if (BROADCOM_WIFI_DEVICES[did]) {
      adapterFamily = BROADCOM_WIFI_DEVICES[did];
      type = 'wifi';
    } else {
      adapterFamily = type === 'wifi' ? 'Broadcom Wi-Fi (unknown model)' :
                       type === 'ethernet' ? 'Broadcom Ethernet (unknown model)' : null;
    }
  } else if (vid === '1969' || vid === '168c' || vid === '15b7') {
    if (ATHEROS_ETHERNET_DEVICES[did]) {
      adapterFamily = ATHEROS_ETHERNET_DEVICES[did];
      type = 'ethernet';
    } else if (type === 'wifi') {
      adapterFamily = 'Atheros Wi-Fi (unknown model)';
    } else {
      adapterFamily = 'Atheros/Killer (unknown model)';
    }
  }

  return { vendorName, adapterFamily, type };
}

export function resolveAudioCodec(vendorId: string | null, deviceId: string | null): string | null {
  if (!vendorId || !deviceId) return null;
  const vid = vendorId.toLowerCase();
  const did = deviceId.toLowerCase();

  if (vid === '10ec') {
    return REALTEK_DEVICE_TO_CODEC[did] ?? `Realtek (DEV_${did.toUpperCase()})`;
  }
  const vendorName = HDA_VENDOR_MAP[vid];
  if (vendorName) return `${vendorName} (DEV_${did.toUpperCase()})`;
  return null;
}

export function resolveGpuVendor(vendorId: string | null, rawName: string): string {
  if (vendorId) {
    const known = GPU_VENDOR_MAP[vendorId.toLowerCase()];
    if (known) return known;
  }
  const n = rawName.toLowerCase();
  if (n.includes('microsoft remote display adapter') || n.includes('microsoft basic display adapter') || n.includes('remote display adapter')) return 'Microsoft';
  if (n.includes('nvidia') || n.includes('geforce') || n.includes('quadro') || n.includes('rtx') || n.includes('gtx')) return 'NVIDIA';
  if (n.includes('amd') || n.includes('radeon') || n.includes('rx ') || n.includes('vega') || n.includes('navi')) return 'AMD';
  if (n.includes('intel') || n.includes('iris') || n.includes('uhd') || n.includes('hd graphics')) return 'Intel';
  return 'Unknown';
}

function pickFallbackCpuName(): string {
  return os.cpus()[0]?.model?.trim() || 'Unknown CPU';
}

/**
 * Check if a GPU name is generic/uninformative (e.g. "Microsoft Basic Display Adapter",
 * "Standard VGA Graphics Adapter", "Unknown GPU").
 */
export function isGenericGpuName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('basic display adapter')
    || lower.includes('standard vga')
    || lower.includes('standard display')
    || lower === 'unknown gpu'
    || lower === '';
}

export function isSoftwareDisplayAdapter(gpu: GpuDevice): boolean {
  // If PCI vendor ID belongs to a real GPU vendor (Intel, NVIDIA, AMD), this is
  // physical hardware running with a generic/missing driver — not a software adapter.
  // Common case: old laptops with missing Intel GPU driver show "Microsoft Basic
  // Display Adapter" but PNPDeviceID still contains VEN_8086 (real Intel hardware).
  if (gpu.vendorId && REAL_GPU_VENDORS.has(gpu.vendorId.toLowerCase())) {
    return false;
  }
  const name = gpu.name.toLowerCase();
  return gpu.vendorId === '1414'
    || name.includes('remote display adapter')
    || name.includes('basic display adapter')
    || name.includes('render only')
    || name.includes('indirect display');
}

export function normalizeWindowsGpuList(gpus: GpuDevice[]): GpuDevice[] {
  const filtered = gpus.filter((gpu) => !isSoftwareDisplayAdapter(gpu));
  if (filtered.length > 0) return filtered;
  return gpus;
}

// ── Intel iGPU inference from CPU name ──────────────────────────────────────

/**
 * When the only GPU is a generic adapter (e.g. "Microsoft Basic Display Adapter")
 * but PCI vendor ID is Intel (8086), infer the iGPU family from the CPU generation.
 * Returns a descriptive name that classifyGpu can use for support tier assessment.
 *
 * This does NOT invent fake precision — it maps to the iGPU generation/family,
 * not a specific model SKU.
 */
export function inferIntelIgpuName(cpuName: string): string | null {
  const model = cpuName.toLowerCase();

  // Standard Core i-series
  const match = model.match(/i\d-?\s?(1?\d{4})/);
  if (match) {
    const num = parseInt(match[1]);
    if (num >= 12000) return 'Intel UHD Graphics (12th Gen+)';
    if (num >= 11000) return 'Intel UHD Graphics (11th Gen)';
    if (num >= 10000 && num < 11000 && (/\bg[147]\b/.test(model) || model.includes('ice lake'))) return 'Intel Iris Plus Graphics (Ice Lake)';
    if (num >= 10000) return 'Intel UHD Graphics 630';
    if (num >= 8000) return 'Intel UHD Graphics 630';
    if (num >= 7000) return 'Intel HD Graphics 620/630';
    if (num >= 6000) return 'Intel HD Graphics 520/530';
    if (num >= 5000) return 'Intel HD Graphics 5500/6000';
    if (num >= 4000) return 'Intel HD Graphics 4400/4600';
    if (num >= 3000) return 'Intel HD Graphics 4000';
    if (num >= 2000) return 'Intel HD Graphics 2000/3000';
  }

  // Legacy Core i-series (3-digit model numbers)
  const legacyMatch = model.match(/i[357]-?\s*(\d{3,4})([a-z]{0,2})/);
  if (legacyMatch) {
    const num = parseInt(legacyMatch[1], 10);
    if (num >= 600 && num < 1000) return 'Intel HD Graphics (1st Gen)';
    if (num >= 400 && num < 600) return 'Intel HD Graphics (1st Gen)';
  }

  // Pentium/Celeron
  if (model.includes('pentium') || model.includes('celeron')) {
    return 'Intel HD Graphics (budget)';
  }

  return null;
}

/**
 * Enhance generic GPU adapter names when real hardware PCI IDs are present.
 * This replaces uninformative names like "Microsoft Basic Display Adapter" with
 * CPU-inferred Intel iGPU family names for better classification downstream.
 */
export function enhanceGenericGpuNames(gpus: GpuDevice[], cpuName: string): GpuDevice[] {
  return gpus.map(gpu => {
    if (!isGenericGpuName(gpu.name)) return gpu;
    if (gpu.vendorId?.toLowerCase() !== '8086') return gpu;

    // Real Intel hardware with generic driver — infer iGPU name from CPU
    const inferredName = inferIntelIgpuName(cpuName);
    if (inferredName) {
      return {
        ...gpu,
        name: `${inferredName} (driver not installed)`,
        confidence: 'partially-detected' as const,
      };
    }
    return {
      ...gpu,
      name: 'Intel iGPU (driver not installed)',
      confidence: 'partially-detected' as const,
    };
  });
}

function resolveCpuVendor(vendorStr: string, rawName: string): { vendor: string; vendorName: string } {
  const v = vendorStr.toLowerCase();
  if (v.includes('genuineintel') || v.includes('intel')) return { vendor: 'GenuineIntel', vendorName: 'Intel' };
  if (v.includes('authenticamd') || v.includes('amd')) return { vendor: 'AuthenticAMD', vendorName: 'AMD' };
  if (v.includes('apple')) return { vendor: 'Apple', vendorName: 'Apple' };
  // Fallback from CPU name
  const n = rawName.toLowerCase();
  if (n.includes('intel')) return { vendor: 'GenuineIntel', vendorName: 'Intel' };
  if (n.includes('amd') || n.includes('ryzen') || n.includes('threadripper')) return { vendor: 'AuthenticAMD', vendorName: 'AMD' };
  if (n.includes('apple') || n.includes(' m1') || n.includes(' m2') || n.includes(' m3') || n.includes(' m4')) return { vendor: 'Apple', vendorName: 'Apple' };
  return { vendor: vendorStr || 'Unknown', vendorName: 'Unknown' };
}

// ── Windows scan architecture: 3 processes instead of 12 ─────────────────────
// Each PowerShell process loads the .NET/CIM runtime (~2-5s on cold HDD).
// By merging queries into fewer processes, we eliminate repeated startup cost.
//
// Tier 1 (1 process): Core identity — CPU, GPU, board, chassis, system, battery.
//   This single process produces enough data for a complete machine profile.
//   On a cold-cache HDD laptop, this takes ~8-12s instead of 7 × 3-5s = 15-25s.
//
// Tier 2 (1 process): Enrichment — audio, network, HID devices.
//   All three Win32_PnPEntity queries merged into one process with combined filter.
//   If this fails, Tier 1 still produces a usable profile.

/** Tier 1: One PowerShell process fetching all core identity data as a JSON blob. */
const WINDOWS_TIER1_SCRIPT = `
$cpu = Get-CimInstance CIM_Processor | Select-Object -First 1 Name, Manufacturer, NumberOfCores;
$gpu = Get-CimInstance CIM_VideoController | Select-Object Name, PNPDeviceID, VideoProcessor;
$board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1 Manufacturer, Product;
$chassis = (Get-CimInstance CIM_SystemEnclosure).ChassisTypes;
$sys = Get-CimInstance CIM_ComputerSystem | Select-Object -First 1 Manufacturer, Model;
$batt = Get-CimInstance Win32_Battery | Select-Object -First 1 Name;
@{
  cpu = $cpu;
  gpu = if ($gpu -is [array]) { $gpu } else { @($gpu) };
  board = $board;
  chassis = $chassis;
  sys = $sys;
  hasBattery = ($null -ne $batt);
} | ConvertTo-Json -Depth 3 -Compress
`.replace(/\n/g, ' ').trim();

/** Tier 2: One PowerShell process fetching all PnP enrichment devices. */
const WINDOWS_TIER2_SCRIPT = `
$pnp = Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPClass -in 'MEDIA','NET','HIDClass' } | Select-Object Name, PNPDeviceID, PNPClass;
@{
  devices = if ($pnp -is [array]) { $pnp } else { @($pnp) };
} | ConvertTo-Json -Depth 3 -Compress
`.replace(/\n/g, ' ').trim();

// Legacy per-field queries kept for reference and fallback testing
export const WINDOWS_HARDWARE_QUERIES = {
  tier1: WINDOWS_TIER1_SCRIPT,
  tier2: WINDOWS_TIER2_SCRIPT,
} as const;

// ── Windows ───────────────────────────────────────────────────────────────────

/**
 * Parse a PnP device entry's vendor/device IDs from PNPDeviceID string.
 */
function parsePnpIds(pnpDeviceId: string): { vendorId: string | null; deviceId: string | null } {
  const venMatch = pnpDeviceId.match(/VEN_([0-9A-Fa-f]{4})/);
  const devMatch = pnpDeviceId.match(/DEV_([0-9A-Fa-f]{4})/);
  return {
    vendorId: venMatch ? venMatch[1].toLowerCase() : null,
    deviceId: devMatch ? devMatch[1].toLowerCase() : null,
  };
}

export async function detectWindowsHardware(): Promise<DetectedHardware> {
  const ps = (cmd: string, fallback = '', timeout = 8_000) =>
    execPromise(`powershell -NoProfile -Command "${cmd}"`, {
      timeout,
      maxBuffer: 2 * 1024 * 1024,
    }).catch(() => ({ stdout: fallback }));

  // ── Tier 1 + Tier 2 run in parallel: 2 processes instead of 12 ──
  // Tier 1 (core identity): 25s timeout — must complete for a usable profile.
  // Tier 2 (PnP enrichment): 20s timeout — optional, can fail without losing machine class.
  const [tier1Res, tier2Res] = await Promise.all([
    ps(WINDOWS_HARDWARE_QUERIES.tier1, '{}', 25_000),
    ps(WINDOWS_HARDWARE_QUERIES.tier2, '{}', 20_000),
  ]);

  // ── Parse Tier 1: core identity ──
  let cpuName = pickFallbackCpuName();
  let cpuVendorRaw = '';
  let gpuEntries: any[] = [];
  let boardVendor = 'Unknown', boardModel = 'Unknown';
  let chassisNums: number[] = [];
  let manufStr = '';
  let modelName = '';
  let batteryPresent = false;
  let coreCount = os.cpus().length;

  try {
    const t1 = JSON.parse(tier1Res.stdout.trim());
    // CPU
    cpuName = t1.cpu?.Name?.trim() || cpuName;
    cpuVendorRaw = t1.cpu?.Manufacturer?.trim() || '';
    coreCount = parseInt(t1.cpu?.NumberOfCores) || coreCount;
    // GPU
    gpuEntries = Array.isArray(t1.gpu) ? t1.gpu.filter(Boolean) : (t1.gpu ? [t1.gpu] : []);
    // Board
    boardVendor = t1.board?.Manufacturer?.trim() || 'Unknown';
    boardModel = t1.board?.Product?.trim() || 'Unknown';
    // Chassis
    const rawChassis = t1.chassis;
    if (Array.isArray(rawChassis)) chassisNums = rawChassis.map(Number).filter(n => !isNaN(n) && n > 0);
    else if (typeof rawChassis === 'number') chassisNums = [rawChassis];
    // System
    manufStr = t1.sys?.Manufacturer?.trim() || '';
    modelName = t1.sys?.Model?.trim() || '';
    // Battery
    batteryPresent = t1.hasBattery === true;
  } catch { /* Tier 1 JSON parse failed — use fallbacks from pickFallbackCpuName/os.cpus */ }

  const { vendor, vendorName } = resolveCpuVendor(cpuVendorRaw, cpuName);

  // Parse GPU entries from Tier 1
  let gpus: GpuDevice[] = [];
  try {
    gpus = gpuEntries.map((e: any) => {
      const pnp: string = e.PNPDeviceID ?? '';
      const { vendorId, deviceId } = parsePnpIds(pnp);
      let name: string = e.Name ?? 'Unknown GPU';
      const chipType: string = e.VideoProcessor ?? '';
      if (isGenericGpuName(name) && chipType && !isGenericGpuName(chipType)) {
        name = chipType.trim();
      }
      return {
        name,
        vendorId,
        deviceId,
        vendorName: resolveGpuVendor(vendorId, name),
        confidence: vendorId ? 'detected' : 'partially-detected',
      } satisfies GpuDevice;
    });
  } catch { /* GPU parse failed — use empty */ }
  if (gpus.length === 0) {
    gpus = [{ name: 'Unknown GPU', vendorId: null, deviceId: null, vendorName: 'Unknown', confidence: 'unverified' }];
  }
  gpus = normalizeWindowsGpuList(gpus);
  gpus = enhanceGenericGpuNames(gpus, cpuName);

  // ── Parse Tier 2: PnP enrichment (audio, network, HID) ──
  const audioDevices: AudioDevice[] = [];
  const networkDevices: NetworkDevice[] = [];
  const inputDevices: InputDevice[] = [];

  try {
    const t2 = JSON.parse(tier2Res.stdout.trim());
    const devices: any[] = Array.isArray(t2.devices) ? t2.devices.filter(Boolean) : [];

    for (const entry of devices) {
      const pnp: string = entry.PNPDeviceID ?? '';
      const pnpClass: string = entry.PNPClass ?? '';
      const entryName: string = entry.Name ?? 'Unknown Device';
      const { vendorId: vid, deviceId: did } = parsePnpIds(pnp);

      if (pnpClass === 'MEDIA') {
        const codecName = resolveAudioCodec(vid, did);
        audioDevices.push({
          name: entryName,
          vendorId: vid,
          deviceId: did,
          codecName,
          confidence: vid ? 'detected' : 'partially-detected',
        });
      } else if (pnpClass === 'NET') {
        const resolved = resolveNetworkAdapter(vid, did, entryName);
        networkDevices.push({
          name: entryName,
          vendorId: vid,
          deviceId: did,
          vendorName: resolved.vendorName,
          adapterFamily: resolved.adapterFamily,
          type: resolved.type,
          confidence: vid ? 'detected' : 'partially-detected',
        });
      } else if (pnpClass === 'HIDClass') {
        if (pnp) {
          inputDevices.push({
            name: entryName,
            pnpDeviceId: pnp,
            isI2C: isI2CDeviceId(pnp),
            confidence: 'detected',
          });
        }
      }
    }
  } catch { /* Tier 2 enrichment failed — audio/network/input stay empty */ }

  // ── Laptop / VM classification (uses Tier 1 data only) ──
  const gpuNameStr = gpus.map(g => g.name).join(' / ');
  const isLaptop = inferLaptopFormFactor({
    cpuName,
    chassisTypes: chassisNums,
    modelName,
    batteryPresent,
    manufacturer: manufStr,
    gpuName: gpuNameStr,
  });

  // VM detection
  const manuf = manufStr.toLowerCase();
  const isVM = /vmware|qemu|innotek|microsoft corporation|parallels|xen|hyper-v/i.test(manuf);

  return {
    cpu: { name: cpuName, vendor, vendorName, confidence: vendor !== 'Unknown' ? 'detected' : 'unverified' },
    gpus,
    primaryGpu: gpus[0],
    motherboardVendor: boardVendor,
    motherboardModel: boardModel,
    ramBytes: os.totalmem(),
    coreCount,
    isLaptop,
    isVM,
    audioDevices,
    networkDevices,
    inputDevices,
  };
}

// ── Linux ─────────────────────────────────────────────────────────────────────

export async function detectLinuxHardware(): Promise<DetectedHardware> {
  const run = (cmd: string, fallback = '') =>
    execPromise(cmd, {
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    }).catch(() => ({ stdout: fallback }));

  const [cpuRes, gpuRes, boardVendorRes, boardModelRes, chassisRes, sysVendorRes, batteryRes, memRes, audioRes, networkRes, i2cRes] = await Promise.all([
    run('cat /proc/cpuinfo'),
    run('lspci -nn 2>/dev/null | grep -iE "VGA|3D|Display"'),
    run('cat /sys/class/dmi/id/board_vendor 2>/dev/null'),
    run('cat /sys/class/dmi/id/board_name 2>/dev/null || cat /sys/class/dmi/id/product_name 2>/dev/null'),
    run('cat /sys/class/dmi/id/chassis_type 2>/dev/null'),
    run('cat /sys/class/dmi/id/sys_vendor 2>/dev/null'),
    run('ls /sys/class/power_supply 2>/dev/null | grep -E "^BAT"'),
    run('grep MemTotal /proc/meminfo'),
    run('lspci -nn 2>/dev/null | grep -iE "audio|HDA"'),
    run('lspci -nn 2>/dev/null | grep -iE "Ethernet|Network|Wireless|Wi-Fi"'),
    run('ls /sys/bus/i2c/devices 2>/dev/null; for d in /sys/bus/i2c/devices/*/name; do cat "$d" 2>/dev/null; done'),
  ]);

  // CPU
  const cpuLines = cpuRes.stdout.split('\n');
  const cpuName = (cpuLines.find(l => l.startsWith('model name')) ?? '').split(':')[1]?.trim() || 'Unknown CPU';
  const cpuVendorRaw = (cpuLines.find(l => l.startsWith('vendor_id')) ?? '').split(':')[1]?.trim() || '';
  const { vendor, vendorName } = resolveCpuVendor(cpuVendorRaw, cpuName);

  // GPU — `lspci -nn` format: "01:00.0 VGA compatible controller [0300]: NVIDIA ... [10de:2484] (rev a1)"
  const gpuLines = gpuRes.stdout.trim().split('\n').filter(Boolean);
  const gpus: GpuDevice[] = gpuLines.map(line => {
    const idMatch = line.match(/\[([0-9a-f]{4}):([0-9a-f]{4})\]/i);
    const vendorId = idMatch ? idMatch[1].toLowerCase() : null;
    const deviceId = idMatch ? idMatch[2].toLowerCase() : null;
    // Name is between "]: " and " [xx:xx]" or end
    const nameMatch = line.match(/\]:\s*(.+?)(?:\s*\[[0-9a-f]{4}:[0-9a-f]{4}\])?(?:\s*\(rev|$)/i);
    const name = nameMatch ? nameMatch[1].trim() : line.split(':').slice(2).join(':').trim() || 'Unknown GPU';
    return { name, vendorId, deviceId, vendorName: resolveGpuVendor(vendorId, name), confidence: vendorId ? 'detected' as const : 'partially-detected' as const };
  });
  if (gpus.length === 0) gpus.push({ name: 'Unknown GPU', vendorId: null, deviceId: null, vendorName: 'Unknown', confidence: 'unverified' });

  // RAM
  const memKB = parseInt((memRes.stdout.match(/\d+/) ?? ['0'])[0]);
  const ramBytes = memKB * 1024 || os.totalmem();

  // Chassis / laptop
  const chassisType = parseInt(chassisRes.stdout.trim()) || 0;
  const sysVendorStr = sysVendorRes.stdout.trim();
  const linuxGpuNameStr = gpus.map(g => g.name).join(' / ');
  const isLaptop = inferLaptopFormFactor({
    cpuName,
    chassisTypes: chassisType ? [chassisType] : [],
    modelName: boardModelRes.stdout.trim(),
    batteryPresent: batteryRes.stdout.trim().length > 0,
    manufacturer: sysVendorStr,
    gpuName: linuxGpuNameStr,
  });

  // VM
  const sysVendor = sysVendorStr.toLowerCase();
  const isVM = /vmware|qemu|innotek|microsoft|parallels|xen/i.test(sysVendor);

  // Audio — parse lspci HDA entries for vendor:device IDs
  const audioDevices: AudioDevice[] = [];
  const audioLines = audioRes.stdout.trim().split('\n').filter(Boolean);
  for (const line of audioLines) {
    const idMatch = line.match(/\[([0-9a-f]{4}):([0-9a-f]{4})\]/i);
    const audioVendorId = idMatch ? idMatch[1].toLowerCase() : null;
    const audioDeviceId = idMatch ? idMatch[2].toLowerCase() : null;
    const nameMatch = line.match(/\]:\s*(.+?)(?:\s*\[[0-9a-f]{4}:[0-9a-f]{4}\])?(?:\s*\(rev|$)/i);
    const audioName = nameMatch ? nameMatch[1].trim() : 'Unknown Audio Device';
    const codecName = resolveAudioCodec(audioVendorId, audioDeviceId);
    audioDevices.push({
      name: audioName,
      vendorId: audioVendorId,
      deviceId: audioDeviceId,
      codecName,
      confidence: audioVendorId ? 'detected' as const : 'partially-detected' as const,
    });
  }

  // Network — parse lspci Ethernet/Wireless entries
  const networkDevices: NetworkDevice[] = [];
  const networkLines = networkRes.stdout.trim().split('\n').filter(Boolean);
  for (const line of networkLines) {
    const idMatch = line.match(/\[([0-9a-f]{4}):([0-9a-f]{4})\]/i);
    const netVendorId = idMatch ? idMatch[1].toLowerCase() : null;
    const netDeviceId = idMatch ? idMatch[2].toLowerCase() : null;
    const nameMatch = line.match(/\]:\s*(.+?)(?:\s*\[[0-9a-f]{4}:[0-9a-f]{4}\])?(?:\s*\(rev|$)/i);
    const netName = nameMatch ? nameMatch[1].trim() : 'Unknown Network Device';
    const resolved = resolveNetworkAdapter(netVendorId, netDeviceId, netName);
    networkDevices.push({
      name: netName,
      vendorId: netVendorId,
      deviceId: netDeviceId,
      vendorName: resolved.vendorName,
      adapterFamily: resolved.adapterFamily,
      type: resolved.type,
      confidence: netVendorId ? 'detected' as const : 'partially-detected' as const,
    });
  }

  // Input devices — detect HID-over-I2C from /sys/bus/i2c/devices
  // BUG FIX (C6): Only count devices with HID-compatible names, not all I2C bus
  // devices (which include backlight controllers, sensor ICs, VRMs, etc.)
  const inputDevices: InputDevice[] = [];
  const i2cDeviceList = i2cRes.stdout.trim().split('\n').filter(Boolean);
  const I2C_HID_PATTERN = /i2c-hid|hid-over-i2c|ACPI0C50|PNP0C50|ELAN|SYNA|ALPS|ATML|WCOM/i;
  for (const dev of i2cDeviceList) {
    const devName = dev.trim();
    if (!devName) continue;
    // Only flag as I2C input if device name suggests HID input hardware
    const isHidInput = I2C_HID_PATTERN.test(devName);
    if (isHidInput) {
      inputDevices.push({
        name: devName,
        pnpDeviceId: `/sys/bus/i2c/devices/${devName}`,
        isI2C: true,
        confidence: 'detected',
      });
    }
  }

  return {
    cpu: { name: cpuName, vendor, vendorName, confidence: vendor !== 'Unknown' ? 'detected' : 'unverified' },
    gpus,
    primaryGpu: gpus[0],
    motherboardVendor: boardVendorRes.stdout.trim() || 'Unknown',
    motherboardModel: boardModelRes.stdout.trim() || 'Unknown',
    ramBytes,
    coreCount: os.cpus().length,
    isLaptop,
    isVM,
    audioDevices,
    networkDevices,
    inputDevices,
  };
}

// ── macOS ─────────────────────────────────────────────────────────────────────

export async function detectMacHardware(): Promise<DetectedHardware> {
  const run = (cmd: string, fallback = '') =>
    execPromise(cmd, {
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    }).catch(() => ({ stdout: fallback }));

  const [cpuRes, cpuVendorRes, gpuRes, memRes, modelRes, audioRes, networkRes] = await Promise.all([
    run('sysctl -n machdep.cpu.brand_string'),
    run('sysctl -n machdep.cpu.vendor 2>/dev/null'),
    run("system_profiler SPDisplaysDataType 2>/dev/null | grep -E 'Chipset Model|Vendor ID|Device ID'"),
    run('sysctl -n hw.memsize'),
    run('system_profiler SPHardwareDataType 2>/dev/null | grep -E "Model Identifier|Model Name"'),
    run("system_profiler SPAudioDataType 2>/dev/null | grep -E 'Device Name|Manufacturer'"),
    run("system_profiler SPNetworkDataType 2>/dev/null | grep -E 'Type:|Hardware:'"),
  ]);

  const cpuName = cpuRes.stdout.trim() || 'Unknown CPU';
  const cpuVendorRaw = cpuVendorRes.stdout.trim();
  const { vendor, vendorName } = resolveCpuVendor(cpuVendorRaw, cpuName);

  // Parse GPU from system_profiler output
  // Lines like: "      Chipset Model: AMD Radeon RX 6600 XT"
  //             "      Vendor ID: 0x1002"
  //             "      Device ID: 0x73ff"
  const gpuLines = gpuRes.stdout.split('\n').map(l => l.trim());
  const gpus: GpuDevice[] = [];
  let currentName = '', currentVendorId: string | null = null, currentDeviceId: string | null = null;

  for (const line of gpuLines) {
    if (line.startsWith('Chipset Model:')) {
      if (currentName) {
        gpus.push({ name: currentName, vendorId: currentVendorId, deviceId: currentDeviceId, vendorName: resolveGpuVendor(currentVendorId, currentName), confidence: currentVendorId ? 'detected' : 'partially-detected' });
      }
      currentName = line.split(':')[1]?.trim() || 'Unknown GPU';
      currentVendorId = null; currentDeviceId = null;
    } else if (line.startsWith('Vendor ID:')) {
      currentVendorId = line.split(':')[1]?.trim().replace('0x', '').toLowerCase() || null;
    } else if (line.startsWith('Device ID:')) {
      currentDeviceId = line.split(':')[1]?.trim().replace('0x', '').toLowerCase() || null;
    }
  }
  if (currentName) {
    gpus.push({ name: currentName, vendorId: currentVendorId, deviceId: currentDeviceId, vendorName: resolveGpuVendor(currentVendorId, currentName), confidence: currentVendorId ? 'detected' : 'partially-detected' });
  }
  if (gpus.length === 0) gpus.push({ name: 'Unknown GPU', vendorId: null, deviceId: null, vendorName: 'Unknown', confidence: 'unverified' });

  const ramBytes = parseInt(memRes.stdout.trim()) || os.totalmem();
  const modelLines = modelRes.stdout.split('\n').map(l => l.trim());
  const modelId = (modelLines.find(l => l.startsWith('Model Identifier')) ?? '').split(':')[1]?.trim() || '';
  const modelName = (modelLines.find(l => l.startsWith('Model Name')) ?? '').split(':')[1]?.trim() || 'Unknown Mac';
  const isLaptop = modelId.toLowerCase().includes('book') || modelName.toLowerCase().includes('book');

  // Audio — best-effort from system_profiler
  const audioDevices: AudioDevice[] = [];
  const audioLines = audioRes.stdout.split('\n').map(l => l.trim());
  for (const line of audioLines) {
    if (line.startsWith('Device Name:')) {
      const audioName = line.split(':')[1]?.trim() || 'Unknown Audio Device';
      audioDevices.push({
        name: audioName,
        vendorId: null,
        deviceId: null,
        codecName: null,
        confidence: 'partially-detected',
      });
    }
  }

  // Network — best-effort from system_profiler
  const networkDevices: NetworkDevice[] = [];
  const networkLines = networkRes.stdout.split('\n').map(l => l.trim());
  for (const line of networkLines) {
    if (line.startsWith('Hardware:')) {
      const hw = line.split(':')[1]?.trim() || '';
      if (hw && hw !== 'None') {
        networkDevices.push({
          name: hw,
          vendorId: null,
          deviceId: null,
          vendorName: hw.toLowerCase().includes('airport') ? 'Apple' : 'Unknown',
          adapterFamily: null,
          type: hw.toLowerCase().includes('wi-fi') || hw.toLowerCase().includes('airport') ? 'wifi' : 'ethernet',
          confidence: 'partially-detected',
        });
      }
    }
  }

  return {
    cpu: { name: cpuName, vendor, vendorName, confidence: vendor !== 'Unknown' ? 'detected' : 'unverified' },
    gpus,
    primaryGpu: gpus[0],
    motherboardVendor: 'Apple',
    motherboardModel: modelId || modelName,
    ramBytes,
    coreCount: os.cpus().length,
    isLaptop,
    isVM: false,
    audioDevices,
    networkDevices,
    inputDevices: [], // macOS: not applicable (running on target machine, not host)
  };
}

import { sim } from './simulation.js';

/**
 * Build a minimal DetectedHardware from whatever partial data is available.
 * Used when the primary scanner partially completes before an error.
 */
export function buildPartialDetectedHardware(partial: Partial<DetectedHardware>): DetectedHardware {
  const fallbackCpu: CpuInfo = {
    name: pickFallbackCpuName(),
    vendor: 'Unknown',
    vendorName: 'Unknown',
    confidence: 'unverified',
  };
  const fallbackGpu: GpuDevice = {
    name: 'Unknown GPU',
    vendorId: null,
    deviceId: null,
    vendorName: 'Unknown',
    confidence: 'unverified',
  };
  return {
    cpu: partial.cpu ?? fallbackCpu,
    gpus: partial.gpus?.length ? partial.gpus : [fallbackGpu],
    primaryGpu: partial.primaryGpu ?? partial.gpus?.[0] ?? fallbackGpu,
    motherboardVendor: partial.motherboardVendor ?? 'Unknown',
    motherboardModel: partial.motherboardModel ?? 'Unknown',
    ramBytes: partial.ramBytes ?? os.totalmem(),
    coreCount: partial.coreCount ?? os.cpus().length,
    isLaptop: partial.isLaptop ?? false,
    isVM: partial.isVM ?? false,
    audioDevices: partial.audioDevices ?? [],
    networkDevices: partial.networkDevices ?? [],
    inputDevices: partial.inputDevices ?? [],
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function detectHardware(): Promise<DetectedHardware> {
  if (sim.isEnabled('hw:timeout')) {
    await new Promise(r => setTimeout(r, 15000));
  }
  if (sim.isEnabled('hw:invalid-data')) {
    throw new Error('[SIMULATED_FAILURE] Hardware detection returned corrupt descriptors');
  }

  if (process.platform === 'win32') return detectWindowsHardware();
  if (process.platform === 'linux')  return detectLinuxHardware();
  return detectMacHardware();
}

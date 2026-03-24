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
    const name = gpu.name.toLowerCase();
    const isGenericName = name.includes('basic display adapter')
      || name.includes('standard vga')
      || name === 'unknown gpu';

    if (!isGenericName) return gpu;
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

export const WINDOWS_HARDWARE_QUERIES = {
  cpuName: '(Get-CimInstance CIM_Processor).Name',
  cpuVendor: '(Get-CimInstance CIM_Processor).Manufacturer',
  gpuJson: 'Get-CimInstance CIM_VideoController | Select-Object Name, PNPDeviceID | ConvertTo-Json -Compress',
  boardJson: 'Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product | ConvertTo-Json -Compress',
  chassisTypes: '(Get-CimInstance CIM_SystemEnclosure).ChassisTypes',
  manufacturer: '(Get-CimInstance CIM_ComputerSystem).Manufacturer',
  model: '(Get-CimInstance CIM_ComputerSystem).Model',
  batteryJson: 'Get-CimInstance Win32_Battery | Select-Object -First 1 | ConvertTo-Json -Compress',
  coreCount: '(Get-CimInstance CIM_Processor).NumberOfCores',
  audioJson: "Get-CimInstance Win32_PnPEntity -Filter \"PNPClass='MEDIA'\" | Select-Object Name, PNPDeviceID | ConvertTo-Json -Compress",
} as const;

// ── Windows ───────────────────────────────────────────────────────────────────

export async function detectWindowsHardware(): Promise<DetectedHardware> {
  const ps = (cmd: string, fallback = '', timeout = 8_000) =>
    execPromise(`powershell -NoProfile -Command "${cmd}"`, {
      timeout,
      maxBuffer: 1024 * 1024,
    }).catch(() => ({ stdout: fallback }));

  const [cpuRes, cpuVendorRes, gpuRes, boardRes, chassisRes, manufRes, coresRes] = await Promise.all([
    ps(WINDOWS_HARDWARE_QUERIES.cpuName, 'Unknown CPU', 10_000),
    ps(WINDOWS_HARDWARE_QUERIES.cpuVendor, '', 10_000),
    // PNPDeviceID gives "PCI\\VEN_10DE&DEV_2484&..." — extract vendor+device IDs
    ps(WINDOWS_HARDWARE_QUERIES.gpuJson, '', 10_000),
    ps(WINDOWS_HARDWARE_QUERIES.boardJson, '', 8_000),
    ps(WINDOWS_HARDWARE_QUERIES.chassisTypes, '', 6_000),
    ps(WINDOWS_HARDWARE_QUERIES.manufacturer, '', 6_000),
    ps(WINDOWS_HARDWARE_QUERIES.coreCount, '', 8_000),
  ]);
  const [modelRes, batteryRes, audioRes] = await Promise.all([
    ps(WINDOWS_HARDWARE_QUERIES.model, '', 3_500),
    ps(WINDOWS_HARDWARE_QUERIES.batteryJson, '', 3_500),
    ps(WINDOWS_HARDWARE_QUERIES.audioJson, '', 6_000),
  ]);

  const cpuName = cpuRes.stdout.trim().split('\n')[0] || pickFallbackCpuName();
  const cpuVendorRaw = cpuVendorRes.stdout.trim() || '';
  const { vendor, vendorName } = resolveCpuVendor(cpuVendorRaw, cpuName);

  // Parse GPU JSON (may be array or single object)
  let gpus: GpuDevice[] = [];
  try {
    const raw = JSON.parse(gpuRes.stdout.trim());
    const entries = Array.isArray(raw) ? raw : [raw];
    gpus = entries.filter(Boolean).map((e: any) => {
      const pnp: string = e.PNPDeviceID ?? '';
      const venMatch = pnp.match(/VEN_([0-9A-Fa-f]{4})/);
      const devMatch = pnp.match(/DEV_([0-9A-Fa-f]{4})/);
      const vendorId = venMatch ? venMatch[1].toLowerCase() : null;
      const deviceId = devMatch ? devMatch[1].toLowerCase() : null;
      const name: string = e.Name ?? 'Unknown GPU';
      return {
        name,
        vendorId,
        deviceId,
        vendorName: resolveGpuVendor(vendorId, name),
        confidence: vendorId ? 'detected' : 'partially-detected',
      } satisfies GpuDevice;
    });
  } catch {
    const rawName = gpuRes.stdout.trim().split('\n')[0] || 'Unknown GPU';
    gpus = [{ name: rawName, vendorId: null, deviceId: null, vendorName: resolveGpuVendor(null, rawName), confidence: 'partially-detected' }];
  }
  if (gpus.length === 0) {
    gpus = [{ name: 'Unknown GPU', vendorId: null, deviceId: null, vendorName: 'Unknown', confidence: 'unverified' }];
  }
  gpus = normalizeWindowsGpuList(gpus);
  // Enhance generic adapter names (e.g. "Microsoft Basic Display Adapter" with Intel PCI ID)
  gpus = enhanceGenericGpuNames(gpus, cpuName);

  // Audio — parse PnP entity list for HDA audio devices with vendor/device IDs
  const audioDevices: AudioDevice[] = [];
  try {
    const rawAudio = JSON.parse(audioRes.stdout.trim());
    const audioEntries = Array.isArray(rawAudio) ? rawAudio : [rawAudio];
    for (const entry of audioEntries.filter(Boolean)) {
      const pnp: string = entry.PNPDeviceID ?? '';
      const venMatch = pnp.match(/VEN_([0-9A-Fa-f]{4})/);
      const devMatch = pnp.match(/DEV_([0-9A-Fa-f]{4})/);
      const audioVendorId = venMatch ? venMatch[1].toLowerCase() : null;
      const audioDeviceId = devMatch ? devMatch[1].toLowerCase() : null;
      const codecName = resolveAudioCodec(audioVendorId, audioDeviceId);
      audioDevices.push({
        name: entry.Name ?? 'Unknown Audio Device',
        vendorId: audioVendorId,
        deviceId: audioDeviceId,
        codecName,
        confidence: audioVendorId ? 'detected' as const : 'partially-detected' as const,
      });
    }
  } catch { /* audio detection is best-effort */ }

  // Board
  let boardVendor = 'Unknown', boardModel = 'Unknown';
  try {
    const b = JSON.parse(boardRes.stdout.trim());
    const board = Array.isArray(b) ? b[0] : b;
    boardVendor = board?.Manufacturer ?? 'Unknown';
    boardModel = board?.Product ?? 'Unknown';
  } catch {}

  // Chassis / laptop detection
  const chassisNums = (chassisRes.stdout.match(/\d+/g) ?? []).map(Number);
  const isLaptop = inferLaptopFormFactor({
    cpuName,
    chassisTypes: chassisNums,
    modelName: modelRes.stdout.trim(),
    batteryPresent: batteryRes.stdout.trim().length > 0 && batteryRes.stdout.trim() !== 'null',
  });

  // VM detection
  const manuf = manufRes.stdout.trim().toLowerCase();
  const isVM = /vmware|qemu|innotek|microsoft corporation|parallels|xen|hyper-v/i.test(manuf);

  const coreCount = parseInt(coresRes.stdout.trim()) || os.cpus().length;

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
  };
}

// ── Linux ─────────────────────────────────────────────────────────────────────

export async function detectLinuxHardware(): Promise<DetectedHardware> {
  const run = (cmd: string, fallback = '') =>
    execPromise(cmd, {
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    }).catch(() => ({ stdout: fallback }));

  const [cpuRes, gpuRes, boardVendorRes, boardModelRes, chassisRes, sysVendorRes, batteryRes, memRes, audioRes] = await Promise.all([
    run('cat /proc/cpuinfo'),
    run('lspci -nn 2>/dev/null | grep -iE "VGA|3D|Display"'),
    run('cat /sys/class/dmi/id/board_vendor 2>/dev/null'),
    run('cat /sys/class/dmi/id/board_name 2>/dev/null || cat /sys/class/dmi/id/product_name 2>/dev/null'),
    run('cat /sys/class/dmi/id/chassis_type 2>/dev/null'),
    run('cat /sys/class/dmi/id/sys_vendor 2>/dev/null'),
    run('ls /sys/class/power_supply 2>/dev/null | grep -E "^BAT"'),
    run('grep MemTotal /proc/meminfo'),
    run('lspci -nn 2>/dev/null | grep -iE "audio|HDA"'),
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
  const isLaptop = inferLaptopFormFactor({
    cpuName,
    chassisTypes: chassisType ? [chassisType] : [],
    modelName: boardModelRes.stdout.trim(),
    batteryPresent: batteryRes.stdout.trim().length > 0,
  });

  // VM
  const sysVendor = sysVendorRes.stdout.trim().toLowerCase();
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
  };
}

// ── macOS ─────────────────────────────────────────────────────────────────────

export async function detectMacHardware(): Promise<DetectedHardware> {
  const run = (cmd: string, fallback = '') =>
    execPromise(cmd, {
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    }).catch(() => ({ stdout: fallback }));

  const [cpuRes, cpuVendorRes, gpuRes, memRes, modelRes, audioRes] = await Promise.all([
    run('sysctl -n machdep.cpu.brand_string'),
    run('sysctl -n machdep.cpu.vendor 2>/dev/null'),
    run("system_profiler SPDisplaysDataType 2>/dev/null | grep -E 'Chipset Model|Vendor ID|Device ID'"),
    run('sysctl -n hw.memsize'),
    run('system_profiler SPHardwareDataType 2>/dev/null | grep -E "Model Identifier|Model Name"'),
    run("system_profiler SPAudioDataType 2>/dev/null | grep -E 'Device Name|Manufacturer'"),
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
  };
}

import { sim } from './simulation.js';

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

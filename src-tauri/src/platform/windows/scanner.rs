//! Windows hardware detection via PowerShell CIM/WMI queries.
//! Ported from electron/hardwareDetect.ts WINDOWS_TIER1_SCRIPT / WINDOWS_TIER2_SCRIPT.

use std::collections::HashMap;
use std::process::Command;

use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;
use tracing::{debug, warn};

use crate::contracts::*;
use crate::error::AppError;

// ---------------------------------------------------------------------------
// PowerShell scripts (merged CIM queries -- 2 processes instead of 12)
// ---------------------------------------------------------------------------

/// Tier 1: Core identity -- CPU, GPU, board, chassis, system, battery.
const TIER1_SCRIPT: &str = "\
$cpu = Get-CimInstance CIM_Processor | Select-Object -First 1 Name, Manufacturer, NumberOfCores; \
$gpu = Get-CimInstance CIM_VideoController | Select-Object Name, PNPDeviceID, VideoProcessor; \
$board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1 Manufacturer, Product; \
$chassis = (Get-CimInstance CIM_SystemEnclosure).ChassisTypes; \
$sys = Get-CimInstance CIM_ComputerSystem | Select-Object -First 1 Manufacturer, Model; \
$batt = Get-CimInstance Win32_Battery | Select-Object -First 1 Name; \
@{ \
  cpu = $cpu; \
  gpu = if ($gpu -is [array]) { $gpu } else { @($gpu) }; \
  board = $board; \
  chassis = $chassis; \
  sys = $sys; \
  hasBattery = ($null -ne $batt); \
} | ConvertTo-Json -Depth 3 -Compress";

/// Tier 2: PnP enrichment -- audio, network, HID devices.
const TIER2_SCRIPT: &str = "\
$pnp = Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPClass -in 'MEDIA','NET','HIDClass' } \
| Select-Object Name, PNPDeviceID, PNPClass; \
@{ \
  devices = if ($pnp -is [array]) { $pnp } else { @($pnp) }; \
} | ConvertTo-Json -Depth 3 -Compress";

// ---------------------------------------------------------------------------
// PCI vendor/device lookup tables
// ---------------------------------------------------------------------------

static GPU_VENDOR_MAP: Lazy<HashMap<&str, &str>> = Lazy::new(|| {
    HashMap::from([
        ("10de", "NVIDIA"),
        ("1002", "AMD"),
        ("8086", "Intel"),
        ("1414", "Microsoft"),
        ("15ad", "VMware"),
        ("1234", "QEMU"),
    ])
});

const REAL_GPU_VENDORS: &[&str] = &["8086", "10de", "1002"];

static HDA_VENDOR_MAP: Lazy<HashMap<&str, &str>> = Lazy::new(|| {
    HashMap::from([
        ("10ec", "Realtek"),
        ("14f1", "Conexant"),
        ("111d", "IDT"),
        ("8384", "SigmaTel"),
        ("1013", "Cirrus Logic"),
        ("8086", "Intel HDMI"),
    ])
});

static REALTEK_DEVICE_TO_CODEC: Lazy<HashMap<&str, &str>> = Lazy::new(|| {
    HashMap::from([
        ("0215", "ALC215"), ("0221", "ALC221"), ("0222", "ALC222"), ("0225", "ALC225"),
        ("0230", "ALC230"), ("0233", "ALC233"), ("0235", "ALC235"), ("0236", "ALC236"),
        ("0245", "ALC245"), ("0255", "ALC255"), ("0256", "ALC256"), ("0257", "ALC257"),
        ("0260", "ALC260"), ("0262", "ALC262"), ("0268", "ALC268"), ("0269", "ALC269"),
        ("0270", "ALC270"), ("0272", "ALC272"), ("0274", "ALC274"), ("0275", "ALC275"),
        ("0280", "ALC280"), ("0282", "ALC282"), ("0283", "ALC283"), ("0284", "ALC284"),
        ("0285", "ALC285"), ("0286", "ALC286"), ("0288", "ALC288"), ("0289", "ALC289"),
        ("0290", "ALC290"), ("0292", "ALC292"), ("0293", "ALC293"), ("0294", "ALC294"),
        ("0295", "ALC295"), ("0298", "ALC298"), ("0299", "ALC299"),
        ("0662", "ALC662"), ("0663", "ALC663"), ("0668", "ALC668"),
        ("0670", "ALC670"), ("0671", "ALC671"), ("0700", "ALC700"),
        ("0882", "ALC882"), ("0883", "ALC883"), ("0885", "ALC885"), ("0887", "ALC887"),
        ("0888", "ALC888"), ("0889", "ALC889"), ("0891", "ALC891"), ("0892", "ALC892"),
        ("0897", "ALC897"), ("0898", "ALC898"), ("0899", "ALC899"),
        ("0b00", "ALC1200"), ("0b50", "ALC1220"),
    ])
});

static NETWORK_VENDOR_MAP: Lazy<HashMap<&str, &str>> = Lazy::new(|| {
    HashMap::from([
        ("8086", "Intel"), ("10ec", "Realtek"), ("14e4", "Broadcom"),
        ("1969", "Atheros"), ("168c", "Atheros"), ("1b4b", "Marvell"),
        ("1186", "D-Link"), ("15b7", "Killer"),
    ])
});

static INTEL_ETHERNET_DEVICES: Lazy<HashMap<&str, &str>> = Lazy::new(|| {
    HashMap::from([
        ("153a", "Intel I217-LM"), ("153b", "Intel I217-V"),
        ("155a", "Intel I218-LM"), ("1559", "Intel I218-V"),
        ("15a0", "Intel I218-LM"), ("15a1", "Intel I218-V"),
        ("15a2", "Intel I218-LM"), ("15a3", "Intel I218-V"),
        ("156f", "Intel I219-LM"), ("1570", "Intel I219-V"),
        ("15b7", "Intel I219-LM"), ("15b8", "Intel I219-V"),
        ("15bb", "Intel I219-LM"), ("15bc", "Intel I219-V"),
        ("15bd", "Intel I219-LM"), ("15be", "Intel I219-V"),
        ("15d7", "Intel I219-LM"), ("15d8", "Intel I219-V"),
        ("15e3", "Intel I219-LM"), ("15e4", "Intel I219-V"),
        ("0d4e", "Intel I219-LM"), ("0d4f", "Intel I219-V"),
        ("0d4c", "Intel I219-LM"), ("0d4d", "Intel I219-V"),
        ("0d53", "Intel I219-LM"), ("0d55", "Intel I219-V"),
        ("15f9", "Intel I219-LM"), ("15fa", "Intel I219-V"),
        ("15fb", "Intel I219-LM"), ("15fc", "Intel I219-V"),
        ("1539", "Intel I211-AT"),
        ("1533", "Intel I210-AT"), ("1536", "Intel I210-IT"),
        ("15f2", "Intel I225-V"), ("15f3", "Intel I225-LM"),
        ("125b", "Intel I226-V"), ("125c", "Intel I226-LM"),
        ("10d3", "Intel 82574L"), ("10ea", "Intel 82577LM"),
        ("10eb", "Intel 82577LC"), ("10ef", "Intel 82578DC"),
        ("10f0", "Intel 82578DM"), ("1502", "Intel 82579LM"),
        ("1503", "Intel 82579V"),
    ])
});

static REALTEK_ETHERNET_DEVICES: Lazy<HashMap<&str, &str>> = Lazy::new(|| {
    HashMap::from([
        ("8136", "Realtek RTL8101/8102"), ("8168", "Realtek RTL8111"),
        ("8169", "Realtek RTL8169"), ("8125", "Realtek RTL8125"),
        ("8126", "Realtek RTL8126"), ("2502", "Realtek RTL8125"),
        ("2600", "Realtek RTL8125"),
    ])
});

static INTEL_WIFI_DEVICES: Lazy<HashMap<&str, &str>> = Lazy::new(|| {
    HashMap::from([
        ("08b1", "Intel Wireless 7260"), ("08b2", "Intel Wireless 7260"),
        ("095a", "Intel Wireless 7265"), ("095b", "Intel Wireless 7265"),
        ("08b3", "Intel Wireless 3160"), ("08b4", "Intel Wireless 3160"),
        ("3165", "Intel Wireless 3165"), ("3166", "Intel Wireless 3165"),
        ("3168", "Intel Wireless 3168"),
        ("24f3", "Intel Wireless 8260"), ("24f4", "Intel Wireless 8260"),
        ("24fd", "Intel Wireless 8265"),
        ("2526", "Intel Wireless 9260"),
        ("9df0", "Intel Wireless 9560"), ("9df4", "Intel Wireless 9560"),
        ("30dc", "Intel Wireless 9560"), ("31dc", "Intel Wireless 9560"),
        ("9461", "Intel Wireless 9461"), ("9462", "Intel Wireless 9462"),
        ("2723", "Intel Wi-Fi 6 AX200"),
        ("02f0", "Intel Wi-Fi 6 AX201"), ("06f0", "Intel Wi-Fi 6 AX201"),
        ("a0f0", "Intel Wi-Fi 6 AX201"), ("34f0", "Intel Wi-Fi 6 AX201"),
        ("2725", "Intel Wi-Fi 6E AX210"),
        ("7a70", "Intel Wi-Fi 6E AX211"), ("51f0", "Intel Wi-Fi 6E AX211"),
        ("51f1", "Intel Wi-Fi 6E AX211"), ("54f0", "Intel Wi-Fi 6E AX211"),
    ])
});

static BROADCOM_WIFI_DEVICES: Lazy<HashMap<&str, &str>> = Lazy::new(|| {
    HashMap::from([
        ("4331", "Broadcom BCM4331"), ("4353", "Broadcom BCM43224"),
        ("43a0", "Broadcom BCM4360"), ("43a3", "Broadcom BCM4350"),
        ("43b1", "Broadcom BCM4352"), ("43b2", "Broadcom BCM4352"),
        ("43ba", "Broadcom BCM43602"), ("43dc", "Broadcom BCM4355"),
        ("4464", "Broadcom BCM4364"), ("4488", "Broadcom BCM4377"),
    ])
});

static ATHEROS_ETHERNET_DEVICES: Lazy<HashMap<&str, &str>> = Lazy::new(|| {
    HashMap::from([
        ("e091", "Killer E2200"), ("e0a1", "Killer E2400"),
        ("e0b1", "Killer E2500"), ("10a1", "Killer E2600"),
        ("1091", "Atheros AR8161"), ("1083", "Atheros AR8151"),
        ("e062", "Qualcomm Atheros Killer E2200"),
    ])
});

/// I2C HID device signatures in PnP device IDs.
static I2C_PNP_SIGNATURES: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)PNP0C50|INT33C[2-6]|INT343[2-3]|MSFT0001|\\\\.*I2C").expect("regex"));

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/// Run a PowerShell command and return stdout. Blocking -- call from spawn_blocking.
pub fn run_powershell(script: &str) -> Result<String, AppError> {
    debug!("Running PowerShell script");
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|e| AppError::new("PS_EXEC_ERROR", format!("Failed to spawn PowerShell: {e}")))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!(exit_code = ?output.status.code(), %stderr, "PowerShell returned non-zero");
    }
    Ok(stdout)
}

fn parse_pnp_ids(pnp_device_id: &str) -> (Option<String>, Option<String>) {
    static VEN_RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"VEN_([0-9A-Fa-f]{4})").expect("regex"));
    static DEV_RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"DEV_([0-9A-Fa-f]{4})").expect("regex"));

    let vendor_id = VEN_RE.captures(pnp_device_id).map(|c| c[1].to_lowercase());
    let device_id = DEV_RE.captures(pnp_device_id).map(|c| c[1].to_lowercase());
    (vendor_id, device_id)
}

pub fn resolve_gpu_vendor(vendor_id: Option<&str>, raw_name: &str) -> String {
    if let Some(vid) = vendor_id {
        if let Some(&name) = GPU_VENDOR_MAP.get(vid) {
            return name.to_string();
        }
    }
    let n = raw_name.to_lowercase();
    if n.contains("microsoft remote display adapter")
        || n.contains("microsoft basic display adapter")
        || n.contains("remote display adapter")
    {
        return "Microsoft".to_string();
    }
    if n.contains("nvidia") || n.contains("geforce") || n.contains("quadro")
        || n.contains("rtx") || n.contains("gtx")
    {
        return "NVIDIA".to_string();
    }
    if n.contains("amd") || n.contains("radeon") || n.contains("rx ")
        || n.contains("vega") || n.contains("navi")
    {
        return "AMD".to_string();
    }
    if n.contains("intel") || n.contains("iris") || n.contains("uhd")
        || n.contains("hd graphics")
    {
        return "Intel".to_string();
    }
    "Unknown".to_string()
}

fn is_generic_gpu_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("basic display adapter")
        || lower.contains("standard vga")
        || lower.contains("standard display")
        || lower == "unknown gpu"
        || lower.is_empty()
}

fn is_software_display_adapter(vendor_id: Option<&str>, name: &str) -> bool {
    // If PCI vendor ID belongs to a real GPU vendor, this is physical hardware
    // running with a generic/missing driver -- not a software adapter.
    if let Some(vid) = vendor_id {
        if REAL_GPU_VENDORS.contains(&vid) {
            return false;
        }
    }
    let n = name.to_lowercase();
    vendor_id == Some("1414")
        || n.contains("remote display adapter")
        || n.contains("basic display adapter")
        || n.contains("render only")
        || n.contains("indirect display")
}

fn infer_intel_igpu_name(cpu_name: &str) -> Option<String> {
    static CORE_RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(?i)i\d-?\s?(1?\d{4})").expect("regex"));
    static LEGACY_RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(?i)i[357]-?\s*(\d{3,4})([a-z]{0,2})").expect("regex"));
    static G_RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(?i)\bg[147]\b").expect("regex"));

    let model = cpu_name.to_lowercase();

    if let Some(caps) = CORE_RE.captures(&model) {
        let num: u32 = caps[1].parse().ok()?;
        return Some(
            match num {
                12000.. => "Intel UHD Graphics (12th Gen+)",
                11000..=11999 => "Intel UHD Graphics (11th Gen)",
                10000..=10999 if G_RE.is_match(&model) || model.contains("ice lake") => {
                    "Intel Iris Plus Graphics (Ice Lake)"
                }
                10000..=10999 => "Intel UHD Graphics 630",
                8000..=9999 => "Intel UHD Graphics 630",
                7000..=7999 => "Intel HD Graphics 620/630",
                6000..=6999 => "Intel HD Graphics 520/530",
                5000..=5999 => "Intel HD Graphics 5500/6000",
                4000..=4999 => "Intel HD Graphics 4400/4600",
                3000..=3999 => "Intel HD Graphics 4000",
                2000..=2999 => "Intel HD Graphics 2000/3000",
                _ => return None,
            }
            .to_string(),
        );
    }

    if let Some(caps) = LEGACY_RE.captures(&model) {
        let num: u32 = caps[1].parse().ok()?;
        if (400..1000).contains(&num) {
            return Some("Intel HD Graphics (1st Gen)".to_string());
        }
    }

    if model.contains("pentium") || model.contains("celeron") {
        return Some("Intel HD Graphics (budget)".to_string());
    }

    None
}

pub fn resolve_audio_codec(vendor_id: Option<&str>, device_id: Option<&str>) -> Option<String> {
    let vid = vendor_id?;
    let did = device_id?;
    if vid == "10ec" {
        return Some(
            REALTEK_DEVICE_TO_CODEC
                .get(did)
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("Realtek (DEV_{})", did.to_uppercase())),
        );
    }
    HDA_VENDOR_MAP
        .get(vid)
        .map(|name| format!("{} (DEV_{})", name, did.to_uppercase()))
}

pub fn classify_network_type(name: &str) -> NetworkDeviceType {
    let lower = name.to_lowercase();
    if lower.contains("wi-fi") || lower.contains("wifi") || lower.contains("wireless")
        || lower.contains("wlan") || lower.contains("802.11") || lower.contains("centrino")
        || lower.contains("airport") || lower.contains("dual band")
    {
        return NetworkDeviceType::Wifi;
    }
    if lower.contains("ethernet") || lower.contains("gigabit")
        || lower.contains("network connection") || lower.contains("lan")
        || lower.contains("nic") || lower.contains("gbe")
        || lower.contains("i217") || lower.contains("i218") || lower.contains("i219")
        || lower.contains("i211") || lower.contains("i225") || lower.contains("i226")
        || lower.contains("rtl8111") || lower.contains("rtl8168") || lower.contains("rtl8125")
        || lower.contains("killer e") || lower.contains("82579") || lower.contains("82574")
    {
        return NetworkDeviceType::Ethernet;
    }
    NetworkDeviceType::Ethernet
}

pub fn resolve_network_adapter(
    vendor_id: Option<&str>,
    device_id: Option<&str>,
    name: &str,
) -> (String, Option<String>, NetworkDeviceType) {
    let vid = vendor_id.unwrap_or("");
    let did = device_id.unwrap_or("");
    let vendor_name = NETWORK_VENDOR_MAP
        .get(vid)
        .copied()
        .unwrap_or("Unknown")
        .to_string();
    let mut net_type = classify_network_type(name);
    let mut adapter_family: Option<String> = None;

    if vid == "8086" {
        if let Some(&fam) = INTEL_ETHERNET_DEVICES.get(did) {
            adapter_family = Some(fam.to_string());
            net_type = NetworkDeviceType::Ethernet;
        } else if let Some(&fam) = INTEL_WIFI_DEVICES.get(did) {
            adapter_family = Some(fam.to_string());
            net_type = NetworkDeviceType::Wifi;
        } else {
            adapter_family = Some(
                match net_type {
                    NetworkDeviceType::Wifi => "Intel Wi-Fi (unknown model)",
                    _ => "Intel Ethernet (unknown model)",
                }
                .to_string(),
            );
        }
    } else if vid == "10ec" {
        if let Some(&fam) = REALTEK_ETHERNET_DEVICES.get(did) {
            adapter_family = Some(fam.to_string());
            net_type = NetworkDeviceType::Ethernet;
        } else {
            adapter_family = Some("Realtek (unknown model)".to_string());
        }
    } else if vid == "14e4" {
        if let Some(&fam) = BROADCOM_WIFI_DEVICES.get(did) {
            adapter_family = Some(fam.to_string());
            net_type = NetworkDeviceType::Wifi;
        } else {
            adapter_family = Some(
                match net_type {
                    NetworkDeviceType::Wifi => "Broadcom Wi-Fi (unknown model)",
                    NetworkDeviceType::Ethernet => "Broadcom Ethernet (unknown model)",
                    _ => "Broadcom (unknown model)",
                }
                .to_string(),
            );
        }
    } else if vid == "1969" || vid == "168c" || vid == "15b7" {
        if let Some(&fam) = ATHEROS_ETHERNET_DEVICES.get(did) {
            adapter_family = Some(fam.to_string());
            net_type = NetworkDeviceType::Ethernet;
        } else {
            adapter_family = Some(
                match net_type {
                    NetworkDeviceType::Wifi => "Atheros Wi-Fi (unknown model)",
                    _ => "Atheros/Killer (unknown model)",
                }
                .to_string(),
            );
        }
    }

    (vendor_name, adapter_family, net_type)
}

pub fn is_i2c_device_id(pnp_device_id: &str) -> bool {
    I2C_PNP_SIGNATURES.is_match(pnp_device_id)
}

fn resolve_cpu_vendor(vendor_raw: &str, cpu_name: &str) -> (String, String) {
    let v = vendor_raw.to_lowercase();
    if v.contains("genuineintel") || v.contains("intel") {
        return ("GenuineIntel".to_string(), "Intel".to_string());
    }
    if v.contains("authenticamd") || v.contains("amd") {
        return ("AuthenticAMD".to_string(), "AMD".to_string());
    }
    let n = cpu_name.to_lowercase();
    if n.contains("intel") {
        return ("GenuineIntel".to_string(), "Intel".to_string());
    }
    if n.contains("amd") || n.contains("ryzen") || n.contains("threadripper") {
        return ("AuthenticAMD".to_string(), "AMD".to_string());
    }
    (
        if vendor_raw.is_empty() {
            "Unknown".to_string()
        } else {
            vendor_raw.to_string()
        },
        "Unknown".to_string(),
    )
}

// ---------------------------------------------------------------------------
// Public scanner entry points
// ---------------------------------------------------------------------------

/// Run Windows Tier 1 PowerShell script (blocking). Call via spawn_blocking.
pub fn run_tier1() -> Result<String, AppError> {
    run_powershell(TIER1_SCRIPT)
}

/// Run Windows Tier 2 PowerShell script (blocking). Call via spawn_blocking.
pub fn run_tier2() -> Result<String, AppError> {
    run_powershell(TIER2_SCRIPT)
}

/// Intermediate result from Tier 1 parsing.
pub struct Tier1Result {
    pub cpu: CpuInfo,
    pub gpu: Vec<GpuInfo>,
    pub motherboard: MotherboardInfo,
    pub chassis: ChassisInfo,
    pub chassis_nums: Vec<u32>,
    pub system_manufacturer: String,
    pub model_name: String,
}

/// Parse Tier 1 JSON into structured fields.
pub fn parse_tier1(json_str: &str) -> Result<Tier1Result, AppError> {
    let t1: Value = serde_json::from_str(json_str.trim())
        .map_err(|e| AppError::new("TIER1_PARSE", format!("Tier 1 JSON parse failed: {e}")))?;

    // CPU
    let cpu_name = t1["cpu"]["Name"]
        .as_str()
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());
    let cpu_vendor_raw = t1["cpu"]["Manufacturer"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    let core_count = t1["cpu"]["NumberOfCores"].as_u64().unwrap_or(1) as u32;

    let (_vendor_id, vendor_name) = resolve_cpu_vendor(&cpu_vendor_raw, &cpu_name);

    // GPU
    let gpu_entries: Vec<&Value> = match &t1["gpu"] {
        Value::Array(arr) => arr.iter().collect(),
        v if !v.is_null() => vec![v],
        _ => vec![],
    };

    let mut gpus: Vec<GpuInfo> = gpu_entries
        .iter()
        .filter_map(|e| {
            let pnp = e["PNPDeviceID"].as_str().unwrap_or("");
            let (vid, did) = parse_pnp_ids(pnp);
            let mut name = e["Name"]
                .as_str()
                .unwrap_or("Unknown GPU")
                .trim()
                .to_string();
            let chip_type = e["VideoProcessor"]
                .as_str()
                .unwrap_or("")
                .trim()
                .to_string();
            if is_generic_gpu_name(&name) && !chip_type.is_empty() && !is_generic_gpu_name(&chip_type) {
                name = chip_type;
            }
            let vendor_str = resolve_gpu_vendor(vid.as_deref(), &name);
            let is_igpu = vendor_str == "Intel";
            let is_discrete = vendor_str == "NVIDIA" || vendor_str == "AMD";
            Some(GpuInfo {
                name,
                vendor: vendor_str,
                vendor_id: vid,
                device_id: did,
                vram_mb: None,
                is_discrete,
                is_igpu,
            })
        })
        .collect();

    // Filter software display adapters
    let filtered: Vec<GpuInfo> = gpus
        .iter()
        .filter(|g| !is_software_display_adapter(g.vendor_id.as_deref(), &g.name))
        .cloned()
        .collect();
    if !filtered.is_empty() {
        gpus = filtered;
    }

    // Enhance generic GPU names with CPU-inferred Intel iGPU
    gpus = gpus
        .into_iter()
        .map(|mut g| {
            if is_generic_gpu_name(&g.name) && g.vendor_id.as_deref() == Some("8086") {
                if let Some(inferred) = infer_intel_igpu_name(&cpu_name) {
                    g.name = format!("{} (driver not installed)", inferred);
                } else {
                    g.name = "Intel iGPU (driver not installed)".to_string();
                }
                g.is_igpu = true;
            }
            g
        })
        .collect();

    if gpus.is_empty() {
        gpus.push(GpuInfo::default());
    }

    // Board
    let board_manufacturer = t1["board"]["Manufacturer"]
        .as_str()
        .unwrap_or("Unknown")
        .trim()
        .to_string();
    let board_product = t1["board"]["Product"]
        .as_str()
        .unwrap_or("Unknown")
        .trim()
        .to_string();

    // Chassis
    let chassis_nums: Vec<u32> = match &t1["chassis"] {
        Value::Array(arr) => arr
            .iter()
            .filter_map(|v| v.as_u64().map(|n| n as u32))
            .collect(),
        Value::Number(n) => n.as_u64().map(|n| vec![n as u32]).unwrap_or_default(),
        _ => vec![],
    };

    // System
    let manufacturer = t1["sys"]["Manufacturer"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    let model_name = t1["sys"]["Model"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();

    // Battery
    let has_battery = t1["hasBattery"].as_bool().unwrap_or(false);

    let chassis_type_str = chassis_nums.first().map(|n| n.to_string());

    Ok(Tier1Result {
        cpu: CpuInfo {
            name: cpu_name,
            vendor: vendor_name,
            cores: core_count,
            threads: core_count,
            base_clock: None,
            generation: None,
            architecture: None,
            codename: None,
            family: None,
            model: None,
            stepping: None,
        },
        gpu: gpus,
        motherboard: MotherboardInfo {
            manufacturer: Some(board_manufacturer),
            product: Some(board_product),
            chipset: None,
        },
        chassis: ChassisInfo {
            chassis_type: chassis_type_str,
            manufacturer: Some(manufacturer.clone()),
            has_battery,
        },
        chassis_nums,
        system_manufacturer: manufacturer,
        model_name,
    })
}

/// Intermediate result from Tier 2 parsing.
pub struct Tier2Result {
    pub audio: Vec<AudioDevice>,
    pub network: Vec<NetworkDevice>,
    pub input: Vec<InputDevice>,
}

/// Parse Tier 2 JSON into audio/network/input device lists.
pub fn parse_tier2(json_str: &str) -> Result<Tier2Result, AppError> {
    let t2: Value = serde_json::from_str(json_str.trim())
        .map_err(|e| AppError::new("TIER2_PARSE", format!("Tier 2 JSON parse failed: {e}")))?;

    let devices: Vec<&Value> = match &t2["devices"] {
        Value::Array(arr) => arr.iter().collect(),
        _ => vec![],
    };

    let mut audio = Vec::new();
    let mut network = Vec::new();
    let mut input = Vec::new();

    for entry in devices {
        let pnp = entry["PNPDeviceID"].as_str().unwrap_or("");
        let pnp_class = entry["PNPClass"].as_str().unwrap_or("");
        let entry_name = entry["Name"]
            .as_str()
            .unwrap_or("Unknown Device")
            .to_string();
        let (vid, did) = parse_pnp_ids(pnp);

        match pnp_class {
            "MEDIA" => {
                let codec = resolve_audio_codec(vid.as_deref(), did.as_deref());
                audio.push(AudioDevice {
                    name: entry_name,
                    codec,
                    vendor_id: vid,
                    device_id: did,
                });
            }
            "NET" => {
                let (_vendor_name, adapter_family, net_type) =
                    resolve_network_adapter(vid.as_deref(), did.as_deref(), &entry_name);
                network.push(NetworkDevice {
                    name: entry_name,
                    device_type: net_type,
                    vendor_id: vid,
                    device_id: did,
                    chipset: adapter_family,
                });
            }
            "HIDClass" => {
                if !pnp.is_empty() {
                    let is_i2c = is_i2c_device_id(pnp);
                    let device_type = if is_i2c {
                        InputDeviceType::I2c
                    } else {
                        InputDeviceType::Ps2
                    };
                    input.push(InputDevice {
                        name: entry_name,
                        device_type,
                        instance_id: Some(pnp.to_string()),
                    });
                }
            }
            _ => {}
        }
    }

    Ok(Tier2Result {
        audio,
        network,
        input,
    })
}

/// Full Windows hardware scan entry point. Async wrapper around blocking PowerShell calls.
pub async fn scan() -> Result<DetectedHardware, AppError> {
    use crate::domain::form_factor::{infer_laptop_form_factor, FormFactorEvidence};
    use tokio::time::{timeout, Duration};

    tracing::info!("Starting Windows hardware detection (tier 1 + tier 2)");

    // Run both tiers in parallel via spawn_blocking + timeout
    let tier1_handle = tokio::task::spawn_blocking(run_tier1);
    let tier2_handle = tokio::task::spawn_blocking(run_tier2);

    // Tier 1: 25s timeout -- must complete for a usable profile
    let tier1_json = match timeout(Duration::from_secs(25), tier1_handle).await {
        Ok(Ok(Ok(json))) => json,
        Ok(Ok(Err(e))) => {
            warn!("Tier 1 PowerShell error: {}", e);
            "{}".to_string()
        }
        Ok(Err(e)) => {
            warn!("Tier 1 task join error: {}", e);
            "{}".to_string()
        }
        Err(_) => {
            warn!("Tier 1 timed out after 25s");
            "{}".to_string()
        }
    };

    // Tier 2: 20s timeout -- optional enrichment
    let tier2_json = match timeout(Duration::from_secs(20), tier2_handle).await {
        Ok(Ok(Ok(json))) => json,
        Ok(Ok(Err(e))) => {
            warn!("Tier 2 PowerShell error: {}", e);
            "{}".to_string()
        }
        Ok(Err(e)) => {
            warn!("Tier 2 task join error: {}", e);
            "{}".to_string()
        }
        Err(_) => {
            warn!("Tier 2 timed out after 20s");
            "{}".to_string()
        }
    };

    // Parse tier 1
    let t1 = parse_tier1(&tier1_json).unwrap_or_else(|e| {
        warn!("Tier 1 parse failed, using defaults: {}", e);
        Tier1Result {
            cpu: CpuInfo::default(),
            gpu: vec![GpuInfo::default()],
            motherboard: MotherboardInfo::default(),
            chassis: ChassisInfo::default(),
            chassis_nums: vec![],
            system_manufacturer: String::new(),
            model_name: String::new(),
        }
    });

    // Parse tier 2
    let t2 = parse_tier2(&tier2_json).unwrap_or_else(|e| {
        warn!("Tier 2 parse failed, using empty devices: {}", e);
        Tier2Result {
            audio: vec![],
            network: vec![],
            input: vec![],
        }
    });

    // Laptop classification
    let gpu_name_str: String = t1.gpu.iter().map(|g| g.name.as_str()).collect::<Vec<_>>().join(" / ");
    let is_laptop = infer_laptop_form_factor(&FormFactorEvidence {
        cpu_name: &t1.cpu.name,
        chassis_types: &t1.chassis_nums,
        model_name: &t1.model_name,
        battery_present: t1.chassis.has_battery,
        manufacturer: &t1.system_manufacturer,
        gpu_name: &gpu_name_str,
    });

    // Total RAM -- fallback to sysinfo if needed, but for now use 0 (enriched later)
    let total_mb = 0u64; // Will be populated by memory query if added

    tracing::info!(
        cpu = %t1.cpu.name,
        gpu_count = t1.gpu.len(),
        is_laptop,
        "Windows hardware detection complete"
    );

    Ok(DetectedHardware {
        cpu: t1.cpu,
        gpu: t1.gpu,
        audio: t2.audio,
        network: t2.network,
        input: t2.input,
        memory: MemoryInfo {
            total_mb,
            slots: vec![],
        },
        motherboard: t1.motherboard,
        storage: vec![],
        chassis: t1.chassis,
        platform: "windows".to_string(),
        is_laptop,
    })
}

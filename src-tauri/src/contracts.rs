use serde::{Deserialize, Serialize};

// ─── Hardware Detection ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DetectedHardware {
    pub cpu: CpuInfo,
    pub gpu: Vec<GpuInfo>,
    pub audio: Vec<AudioDevice>,
    pub network: Vec<NetworkDevice>,
    pub input: Vec<InputDevice>,
    pub memory: MemoryInfo,
    pub motherboard: MotherboardInfo,
    pub storage: Vec<StorageDevice>,
    pub chassis: ChassisInfo,
    pub platform: String,
    pub is_laptop: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub name: String,
    pub vendor: String,
    pub cores: u32,
    pub threads: u32,
    pub base_clock: Option<f64>,
    pub generation: Option<String>,
    pub architecture: Option<String>,
    pub codename: Option<String>,
    pub family: Option<u32>,
    pub model: Option<u32>,
    pub stepping: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    pub vendor_id: Option<String>,
    pub device_id: Option<String>,
    pub vram_mb: Option<u64>,
    pub is_discrete: bool,
    pub is_igpu: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub name: String,
    pub codec: Option<String>,
    pub vendor_id: Option<String>,
    pub device_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDevice {
    pub name: String,
    pub device_type: NetworkDeviceType,
    pub vendor_id: Option<String>,
    pub device_id: Option<String>,
    pub chipset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum NetworkDeviceType {
    #[default]
    Ethernet,
    Wifi,
    Bluetooth,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InputDevice {
    pub name: String,
    pub device_type: InputDeviceType,
    pub instance_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum InputDeviceType {
    #[default]
    Ps2,
    I2c,
    Usb,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInfo {
    pub total_mb: u64,
    pub slots: Vec<MemorySlot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemorySlot {
    pub size_mb: u64,
    pub speed_mhz: Option<u32>,
    pub memory_type: Option<String>,
    pub manufacturer: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MotherboardInfo {
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub chipset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StorageDevice {
    pub name: String,
    pub size_bytes: u64,
    pub media_type: Option<String>,
    pub interface_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChassisInfo {
    pub chassis_type: Option<String>,
    pub manufacturer: Option<String>,
    pub has_battery: bool,
}

// ─── Hardware Profile (post-interpretation) ─────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareProfile {
    pub cpu: String,
    pub cpu_vendor: String,
    pub generation: String,
    pub architecture: String,
    pub codename: String,
    pub gpu: String,
    pub gpu_vendor: String,
    pub gpu_device_id: Option<String>,
    pub igpu: Option<String>,
    pub igpu_device_id: Option<String>,
    pub audio_codec: Option<String>,
    pub ethernet_chipset: Option<String>,
    pub wifi_chipset: Option<String>,
    pub input_type: String,
    pub motherboard: String,
    pub is_laptop: bool,
    pub has_discrete_gpu: bool,
    pub has_igpu: bool,
    pub ram_gb: u64,
    pub smbios: Option<String>,
    pub target_os: Option<String>,
}

// ─── EFI Build ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildResult {
    pub efi_path: String,
    pub config_plist_path: String,
    pub kexts: Vec<KextResult>,
    pub ssdts: Vec<String>,
    pub opencore_version: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KextResult {
    pub name: String,
    pub version: Option<String>,
    pub source: String,
    pub status: KextStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KextStatus {
    Downloaded,
    Cached,
    Failed,
    Optional,
}

// ─── Validation ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub valid: bool,
    pub issues: Vec<ValidationIssue>,
    pub sections_present: Vec<String>,
    pub sections_missing: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub severity: String,
    pub section: String,
    pub message: String,
    pub path: Option<String>,
}

// ─── Disk / USB ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub device_path: String,
    pub model: Option<String>,
    pub vendor: Option<String>,
    pub serial_number: Option<String>,
    pub size_bytes: u64,
    pub size_display: String,
    pub transport: Option<String>,
    pub removable: bool,
    pub partition_table: Option<String>,
    pub partitions: Vec<PartitionInfo>,
    pub is_system_disk: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartitionInfo {
    pub number: u32,
    pub label: Option<String>,
    pub filesystem: Option<String>,
    pub size_bytes: u64,
    pub mount_point: Option<String>,
}

// ─── Task / Progress ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskUpdate {
    pub task_id: String,
    pub kind: String,
    pub status: TaskStatus,
    pub progress: Option<f64>,
    pub message: Option<String>,
    pub detail: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
}

// ─── Flash Authorization ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashConfirmation {
    pub token: String,
    pub device: String,
    pub expires_at: i64,
    pub disk_display: String,
    pub efi_hash: String,
}

// ─── BIOS / Firmware ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirmwareReport {
    pub uefi_mode: FirmwareCheck,
    pub secure_boot: FirmwareCheck,
    pub vt_x: FirmwareCheck,
    pub vt_d: FirmwareCheck,
    pub above_4g: FirmwareCheck,
    pub bios_vendor: Option<String>,
    pub bios_version: Option<String>,
    pub confidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirmwareCheck {
    pub name: String,
    pub status: String,
    pub evidence: String,
    pub required: bool,
}

// ─── Recovery ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryCacheInfo {
    pub available: bool,
    pub os_version: Option<String>,
    pub dmg_path: Option<String>,
    pub size_bytes: Option<u64>,
}

// ─── App State ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedState {
    pub current_step: Option<String>,
    pub profile: Option<serde_json::Value>,
    pub timestamp: Option<i64>,
    pub efi_path: Option<String>,
    pub recovery_download_offset: Option<u64>,
    pub recovery_dmg_dest: Option<String>,
    pub recovery_target_os: Option<String>,
}

// ─── Compatibility ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityReport {
    pub overall: CompatibilityVerdict,
    pub cpu_supported: bool,
    pub gpu_supported: bool,
    pub audio_supported: bool,
    pub network_supported: bool,
    pub recommended_os: Option<String>,
    pub supported_os_versions: Vec<String>,
    pub issues: Vec<CompatibilityIssue>,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CompatibilityVerdict {
    Supported,
    Partial,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityIssue {
    pub component: String,
    pub severity: String,
    pub message: String,
    pub workaround: Option<String>,
}

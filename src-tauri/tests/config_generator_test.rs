use app_lib::domain::config_generator::generate_config_plist;
use app_lib::domain::config_validator::REQUIRED_SECTIONS;
use app_lib::domain::rules::HardwareGpuDeviceSummary;

struct ConfigFixture<'a> {
    name: &'a str,
    architecture: &'a str,
    generation: &'a str,
    is_laptop: bool,
    motherboard: &'a str,
    target_os: &'a str,
    gpu: &'a str,
    gpu_devices: Vec<HardwareGpuDeviceSummary>,
    smbios: &'a str,
    audio_codec: Option<&'a str>,
    input_stack: Option<&'a str>,
    wifi_chipset: Option<&'a str>,
    core_count: Option<u32>,
}

fn assert_required_sections(plist: &str, fixture_name: &str) {
    for section in REQUIRED_SECTIONS {
        assert!(
            plist.contains(&format!("<key>{}</key>", section)),
            "{} is missing required section {}",
            fixture_name,
            section
        );
    }
}

fn generate_fixture(fixture: ConfigFixture<'_>) {
    let gpu_devices = Some(fixture.gpu_devices);
    let plist = generate_config_plist(
        fixture.architecture,
        fixture.generation,
        fixture.is_laptop,
        false,
        fixture.motherboard,
        fixture.target_os,
        fixture.gpu,
        &gpu_devices,
        fixture.smbios,
        "",
        fixture.audio_codec,
        None,
        fixture.input_stack,
        fixture.wifi_chipset,
        "canonical",
        fixture.core_count,
    )
    .unwrap_or_else(|err| panic!("{} failed to generate: {}", fixture.name, err));

    assert!(plist.starts_with("<?xml"), "{} did not emit XML output", fixture.name);
    assert_required_sections(&plist, fixture.name);
}

#[test]
fn generates_config_for_haswell_laptop() {
    generate_fixture(ConfigFixture {
        name: "Haswell laptop",
        architecture: "Intel",
        generation: "Haswell",
        is_laptop: true,
        motherboard: "Dell Latitude E7440",
        target_os: "Ventura",
        gpu: "Intel HD Graphics 4600",
        gpu_devices: vec![HardwareGpuDeviceSummary {
            name: "Intel HD Graphics 4600".into(),
            vendor_name: Some("Intel".into()),
            vendor_id: Some("8086".into()),
            device_id: Some("0416".into()),
        }],
        smbios: "MacBookPro11,4",
        audio_codec: Some("ALC292"),
        input_stack: Some("ps2"),
        wifi_chipset: Some("Intel AC7260"),
        core_count: None,
    });
}

#[test]
fn generates_config_for_coffee_lake_z390_desktop() {
    generate_fixture(ConfigFixture {
        name: "Coffee Lake Z390 desktop",
        architecture: "Intel",
        generation: "Coffee Lake",
        is_laptop: false,
        motherboard: "Gigabyte Z390 AORUS PRO",
        target_os: "Sonoma",
        gpu: "AMD Radeon RX 580 / Intel UHD 630",
        gpu_devices: vec![
            HardwareGpuDeviceSummary {
                name: "AMD Radeon RX 580".into(),
                vendor_name: Some("AMD".into()),
                vendor_id: Some("1002".into()),
                device_id: Some("67df".into()),
            },
            HardwareGpuDeviceSummary {
                name: "Intel UHD 630".into(),
                vendor_name: Some("Intel".into()),
                vendor_id: Some("8086".into()),
                device_id: Some("3e98".into()),
            },
        ],
        smbios: "iMac19,1",
        audio_codec: Some("ALC1220"),
        input_stack: Some("usb"),
        wifi_chipset: None,
        core_count: None,
    });
}

#[test]
fn generates_config_for_comet_lake_desktop() {
    generate_fixture(ConfigFixture {
        name: "Comet Lake desktop",
        architecture: "Intel",
        generation: "Comet Lake",
        is_laptop: false,
        motherboard: "ASUS ROG STRIX Z490-E GAMING",
        target_os: "Ventura",
        gpu: "AMD Radeon RX 5700 XT / Intel UHD 630",
        gpu_devices: vec![
            HardwareGpuDeviceSummary {
                name: "AMD Radeon RX 5700 XT".into(),
                vendor_name: Some("AMD".into()),
                vendor_id: Some("1002".into()),
                device_id: Some("731f".into()),
            },
            HardwareGpuDeviceSummary {
                name: "Intel UHD 630".into(),
                vendor_name: Some("Intel".into()),
                vendor_id: Some("8086".into()),
                device_id: Some("9bc5".into()),
            },
        ],
        smbios: "iMac20,2",
        audio_codec: Some("ALC1220"),
        input_stack: Some("usb"),
        wifi_chipset: None,
        core_count: None,
    });
}

#[test]
fn generates_config_for_amd_ryzen_5000() {
    generate_fixture(ConfigFixture {
        name: "AMD Ryzen 5000 desktop",
        architecture: "AMD",
        generation: "Ryzen",
        is_laptop: false,
        motherboard: "MSI MAG B550 Tomahawk",
        target_os: "Ventura",
        gpu: "AMD Radeon RX 6800 XT",
        gpu_devices: vec![HardwareGpuDeviceSummary {
            name: "AMD Radeon RX 6800 XT".into(),
            vendor_name: Some("AMD".into()),
            vendor_id: Some("1002".into()),
            device_id: Some("73bf".into()),
        }],
        smbios: "MacPro7,1",
        audio_codec: Some("ALC1200"),
        input_stack: Some("usb"),
        wifi_chipset: None,
        core_count: Some(12),
    });
}

#[test]
fn generates_config_for_ice_lake_laptop() {
    generate_fixture(ConfigFixture {
        name: "Ice Lake laptop",
        architecture: "Intel",
        generation: "Ice Lake",
        is_laptop: true,
        motherboard: "Dell XPS 13 9300",
        target_os: "Ventura",
        gpu: "Intel Iris Plus Graphics",
        gpu_devices: vec![HardwareGpuDeviceSummary {
            name: "Intel Iris Plus Graphics".into(),
            vendor_name: Some("Intel".into()),
            vendor_id: Some("8086".into()),
            device_id: Some("8a52".into()),
        }],
        smbios: "MacBookAir9,1",
        audio_codec: Some("ALC289"),
        input_stack: Some("i2c"),
        wifi_chipset: Some("Intel AX201"),
        core_count: None,
    });
}

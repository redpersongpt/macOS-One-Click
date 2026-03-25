#!/usr/bin/env bash
set -euo pipefail

# Downloads core kexts for embedding into the app as offline fallback.
# Run this script to update the embedded kexts to latest versions.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KEXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/electron/assets/kexts"
CHECKSUM_FILE="$SCRIPT_DIR/kext-checksums.sha256"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

VERIFY_CHECKSUMS=true
if [[ "${1:-}" == "--no-verify" ]]; then
  VERIFY_CHECKSUMS=false
  echo "WARNING: Checksum verification disabled via --no-verify"
fi

mkdir -p "$KEXT_DIR"

# Load expected checksums into an associative array
declare -A EXPECTED_HASHES
if [[ -f "$CHECKSUM_FILE" ]]; then
  while IFS=' ' read -r hash key rest; do
    # Skip comments and blank lines
    [[ -z "$hash" || "$hash" == \#* ]] && continue
    EXPECTED_HASHES["$key"]="$hash"
  done < "$CHECKSUM_FILE"
fi

verify_checksum() {
  local zip_file="$1"
  local repo_key="$2"

  if [[ "$VERIFY_CHECKSUMS" != true ]]; then
    return 0
  fi

  local expected="${EXPECTED_HASHES[$repo_key]:-}"
  if [[ -z "$expected" || "$expected" == "PLACEHOLDER_HASH_UPDATE_ME" ]]; then
    echo "  WARN: No valid checksum for $repo_key — update scripts/kext-checksums.sha256"
    return 0
  fi

  # macOS uses shasum, Linux uses sha256sum
  local actual
  if command -v shasum &>/dev/null; then
    actual=$(shasum -a 256 "$zip_file" | awk '{print $1}')
  elif command -v sha256sum &>/dev/null; then
    actual=$(sha256sum "$zip_file" | awk '{print $1}')
  else
    echo "  WARN: No sha256sum or shasum available — skipping verification"
    return 0
  fi

  if [[ "$actual" != "$expected" ]]; then
    echo "  CHECKSUM MISMATCH for $repo_key!"
    echo "    Expected: $expected"
    echo "    Actual:   $actual"
    echo "  Aborting — possible supply-chain compromise or version drift."
    echo "  If you updated kext versions, regenerate checksums with:"
    echo "    shasum -a 256 <zip> and update scripts/kext-checksums.sha256"
    exit 1
  fi

  echo "  Checksum OK ($repo_key)"
}

# Core kexts to embed — repo, asset filter, kext names to extract
REPOS=(
  "acidanthera/Lilu|RELEASE|Lilu.kext"
  "acidanthera/VirtualSMC|RELEASE|VirtualSMC.kext,SMCBatteryManager.kext,SMCSuperIO.kext,SMCProcessor.kext"
  "acidanthera/WhateverGreen|RELEASE|WhateverGreen.kext"
  "acidanthera/AppleALC|RELEASE|AppleALC.kext"
  "acidanthera/RTCMemoryFixup|RELEASE|RTCMemoryFixup.kext"
  "acidanthera/VoodooPS2|RELEASE|VoodooPS2Controller.kext"
  "acidanthera/RestrictEvents|RELEASE|RestrictEvents.kext"
  "acidanthera/NVMeFix|RELEASE|NVMeFix.kext"
  "acidanthera/CPUTopologyRebuild|RELEASE|CPUTopologyRebuild.kext"
)

fetch_kext() {
  local spec="$1"
  IFS='|' read -r repo filter kext_names <<< "$spec"

  echo "Fetching $repo..."

  # Get latest release asset URL
  local api_url="https://api.github.com/repos/$repo/releases/latest"
  local release_json
  release_json=$(curl -sL -H "User-Agent: OpCore-OneClick/1.0" "$api_url")

  # Find matching zip asset
  local asset_url
  if [[ -n "$filter" ]]; then
    asset_url=$(echo "$release_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for a in data.get('assets', []):
    if a['name'].endswith('.zip') and '${filter}'.upper() in a['name'].upper():
        print(a['browser_download_url']); break
" 2>/dev/null || true)
  fi

  if [[ -z "$asset_url" ]]; then
    asset_url=$(echo "$release_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for a in data.get('assets', []):
    if a['name'].endswith('.zip'):
        print(a['browser_download_url']); break
" 2>/dev/null || true)
  fi

  if [[ -z "$asset_url" ]]; then
    echo "  WARN: No asset found for $repo"
    return
  fi

  local version
  version=$(echo "$release_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tag_name','unknown'))" 2>/dev/null || echo "unknown")

  # Download
  local repo_key
  repo_key=$(echo "$repo" | tr '/' '_')
  local zip_file="$TMP_DIR/${repo_key}.zip"
  curl -sL -o "$zip_file" "$asset_url"

  # Verify integrity
  verify_checksum "$zip_file" "$repo_key"

  # Extract
  local extract_dir="$TMP_DIR/extract_$(echo "$repo" | tr '/' '_')"
  mkdir -p "$extract_dir"
  unzip -qo "$zip_file" -d "$extract_dir"

  # Find and copy each kext
  IFS=',' read -ra KEXTS <<< "$kext_names"
  for kext in "${KEXTS[@]}"; do
    local found
    found=$(find "$extract_dir" -type d -name "$kext" | head -1)
    if [[ -n "$found" ]]; then
      rm -rf "$KEXT_DIR/$kext"
      cp -R "$found" "$KEXT_DIR/$kext"
      # Write version marker outside bundle (avoids macOS codesign issues)
      local base="${kext%.kext}"
      echo "$version" > "$KEXT_DIR/${base}.version"
      echo "  $kext $version"
    else
      echo "  WARN: $kext not found in archive"
    fi
  done
}

echo "Downloading embedded kexts to $KEXT_DIR"
echo "========================================="

for spec in "${REPOS[@]}"; do
  fetch_kext "$spec"
done

echo ""
echo "Done. Embedded kexts:"
ls -1 "$KEXT_DIR"

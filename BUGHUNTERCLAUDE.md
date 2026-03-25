# Bug Hunter Report — macOS One-Click / OpCore OneClick

**Date:** 2026-03-25
**Commit reviewed:** `743ca34` (v3.1.9) — incremental update from `cf5e44c` (v3.1.2)
**Reviewer:** Claude Code (incremental scan — hardwareDetect.ts, diskOps.ts, main.ts, formFactor.ts, hardwareProfileArtifact.ts, App.tsx, UsbStep.tsx; full review baseline from v3.1.2)

---

## CRITICAL — Would crash or corrupt

### C1. AMD laptop always gets desktop EC SSDT
**File:** `electron/configGenerator.ts`, line 863
**Bug:** The AMD SSDT branch unconditionally pushes `SSDT-EC-USBX-DESKTOP.aml` regardless of `profile.isLaptop`. The Intel path on line 796 uses the `ecUsbxSsdt` variable which correctly switches between `SSDT-EC-USBX-LAPTOP.aml` and `SSDT-EC-USBX.aml`.
**Impact:** AMD laptops (Ryzen 5300M/5500M/5600M/5700M) receive the desktop EC SSDT, which can cause EC-related kernel panics or broken battery/power management at boot.
**Fix:** Replace `pushSsdt('SSDT-EC-USBX-DESKTOP.aml')` on line 863 with `pushSsdt(ecUsbxSsdt)` to use the same laptop-aware variable as the Intel path.

---

### C2. Command injection in diskOps.ts via exec() with interpolated shell strings
**File:** `electron/diskOps.ts`, throughout — lines 653, 962, 1603, 1609, 1668, 1676, and many others
**Bug:** The internal `runCmd()` wrapper calls `child_process.exec()`, which spawns a shell. Device paths, disk numbers, mount points, labels, and file paths are interpolated directly into shell command strings with no sanitization or parameterized execution. Examples:
- `` `diskutil list ${device} 2>/dev/null` `` (line 653) — `device` not quoted or validated
- `` `diskutil eraseDisk FAT32 OPENCORE GPTFormat ${device}` `` (line 1603) — no quoting
- `` `parted ${device} --script mklabel gpt...` `` (line 1609) — no quoting
- Label interpolation into PowerShell single-quoted strings (line 480) — a label containing `'` breaks out of the string

On Linux, commands run through `elevateCommand()` execute as root via pkexec/sudo.
**Impact:** If a device name, volume label, or path contains shell metacharacters (`;`, `|`, `$()`, backticks, or `'`), arbitrary commands execute with process privileges. USB device names are user-controlled on all platforms.
**Fix:** Switch from `exec()` to `execFile()` (no shell) wherever possible. For commands that need a shell, validate inputs against strict allowlists (e.g., `/^\/dev\/disk\d+$/` for macOS device nodes, `/^\d+$/` for disk numbers). Escape single quotes in labels passed to PowerShell.

---

### C3. Command injection in getFreeSpaceMB on Windows
**File:** `electron/diskOps.ts`, lines 100–101
**Bug:**
```typescript
const drive = targetPath.split(':')[0];
const { stdout } = await execPromise(`powershell -NoProfile -Command "(Get-PSDrive -Name '${drive}' -ErrorAction SilentlyContinue).Free"`);
```
`targetPath` is split on `:` and the first segment is placed inside PowerShell single quotes. A path like `'; Remove-Item -Recurse C:\;'` breaks out of the string and executes arbitrary PowerShell.
**Impact:** Arbitrary PowerShell execution with process privileges.
**Fix:** Validate that `drive` is exactly one ASCII letter (`/^[A-Za-z]$/`) before interpolation.

---

### C4. No integrity verification of downloaded update before execution
**File:** `electron/main.ts`, lines 878–894
**Bug:** `installDownloadedUpdate` resolves a path from `appUpdateState.downloadedPath` and spawns it directly:
```typescript
const installerPath = path.resolve(appUpdateState.downloadedPath);
const worker = spawn('cmd.exe', ['/c', 'start', '""', installerPath, '/S', '--force-run', '--updated'], { ... });
```
The downloaded `.exe` is never verified against an expected SHA-256 hash from the GitHub release API. A network MITM or local file replacement between download and install would execute the tampered file, which users will accept UAC elevation for.
**Impact:** Arbitrary code execution with elevated privileges via a tampered update.
**Fix:** Fetch the expected hash from the release assets API, compute SHA-256 of the downloaded file, and compare before spawning. Refuse to install if hashes do not match.

---

### C5. Missing pre-Sandy Bridge generations from TAHOE_UNSUPPORTED_GENERATIONS
**File:** `electron/configGenerator.ts`, lines 877–879; `electron/compatibility.ts`
**Bug:**
```typescript
const TAHOE_UNSUPPORTED_GENERATIONS = new Set<HardwareProfile['generation']>([
    'Penryn', 'Sandy Bridge', 'Ivy Bridge', 'Haswell', 'Broadwell',
]);
```
Older generations — `'Wolfdale'`, `'Yorkfield'`, `'Nehalem'`, `'Westmere'`, `'Arrandale'`, `'Clarkdale'` — are absent from this set. They bypass the Tahoe block check and fall through to `getSMBIOSForProfile`, which returns `'iMac20,1'` (a modern Comet Lake SMBIOS). The same set is used in `getSMBIOSForProfile`.
**Impact:** A Nehalem or Westmere CPU targeting macOS Tahoe receives a modern SMBIOS that cannot boot on that hardware. The user gets a non-bootable EFI with no error.
**Fix:** Add `'Wolfdale', 'Yorkfield', 'Nehalem', 'Westmere', 'Arrandale', 'Clarkdale'` to the `TAHOE_UNSUPPORTED_GENERATIONS` set in both locations.

---

### ~~C6. Linux I2C over-detection causes wrong input kext stack~~ — **FIXED in v3.1.5**
**Fixed:** `electron/hardwareDetect.ts` now filters `/sys/bus/i2c/devices` entries through `I2C_HID_PATTERN = /i2c-hid|hid-over-i2c|ACPI0C50|PNP0C50|ELAN|SYNA|ALPS|ATML|WCOM/i` before classifying as HID input. The `ls` command was extended to also `cat */name` so device names are available for pattern matching.

---

## HIGH — Broken functionality

### H1. `open-folder` IPC handler has no path validation
**File:** `electron/main.ts`, line 4335
**Bug:**
```typescript
ipcHandle('open-folder', (_event, folderPath: string) => shell.openPath(folderPath));
```
`shell.openPath` opens executables and scripts in addition to folders. Any string from the renderer is accepted directly. A compromised renderer (dev-mode localhost MITM, or XSS in a loaded URL) can call `window.electron.openFolder('/path/to/malicious.sh')` to execute an arbitrary file.
**Impact:** RCE if the renderer is compromised. The impact is elevated because this is a privileged desktop app.
**Fix:** Validate `folderPath` is a known safe parent directory (e.g., userData, EFI output directory). Use `shell.showItemInFolder` to reveal in Finder instead of `shell.openPath`.

---

### H2. `sandbox: false` on BrowserWindow
**File:** `electron/main.ts`, line 2824
**Bug:** The main window is created with `sandbox: false` in `webPreferences`. While `contextIsolation: true` and `nodeIntegration: false` are correctly set, disabling the Chromium sandbox weakens defense-in-depth against renderer exploits.
**Impact:** A renderer exploit has broader OS-level access than necessary.
**Fix:** Enable `sandbox: true`. If the preload cannot operate sandboxed, document the specific reason this is necessary.

---

### H3. `isSafeExternalTarget` allows `http://` URLs
**File:** `electron/main.ts`, line 2733
**Bug:**
```typescript
function isSafeExternalTarget(targetUrl: string): boolean {
  return targetUrl.startsWith('https://') || targetUrl.startsWith('http://') || targetUrl.startsWith('mailto:');
}
```
Plain `http://` is allowed to pass through `shell.openExternal`. This is an open redirect surface for phishing when combined with `will-navigate` and `setWindowOpenHandler`.
**Impact:** Any crafted `http://` link opens in the user's default browser, enabling phishing or credential theft.
**Fix:** Restrict to `https://` only, with an optional domain allowlist (github.com, apple.com, dortania.github.io).

---

### H4. Resume logic is dead code — temp file always deleted before resume check
**File:** `electron/main.ts`, lines 804, 826
**Bug:**
```typescript
if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true }); // line 804 — always deletes
// ...
if (fs.existsSync(tempPath)) {                                       // line 826 — always false
  startOffset = fs.statSync(tempPath).size;
}
```
Line 804 unconditionally removes the temp file. Line 826 immediately checks if it exists for resume. The resume path is therefore always dead — `startOffset` is always 0.
**Impact:** Interrupted update downloads always restart from scratch. Resume-on-retry does nothing.
**Fix:** Remove the unconditional delete at line 804, or restructure the logic so the temp file is preserved across retry cycles.

---

### H5. `getAllowedApplyModes` and `getDefaultApplyMode` always return `assisted` — `managed` mode unreachable
**File:** `electron/bios/orchestrator.ts`, lines 212–224
**Bug:**
```typescript
// getAllowedApplyModes
if (supportLevel === 'assisted' || (supportLevel === 'managed' && safeMode)) {
    return ['manual', 'assisted', 'skipped'];
}
return ['manual', 'assisted', 'skipped']; // identical — managed never offered

// getDefaultApplyMode
return supportLevel === 'managed' ? 'assisted' : 'assisted'; // both branches return 'assisted'
```
`managed` support level is defined but can never be reached. A BIOS that supports managed automation always falls back to `assisted` mode.
**Impact:** Automated BIOS configuration (the managed path) is silently disabled across the whole product even when the underlying BIOS backend supports it.
**Fix:** In `getAllowedApplyModes`, add `'managed'` to the returned array when `supportLevel === 'managed' && !safeMode`. In `getDefaultApplyMode`, return `'managed'` when `supportLevel === 'managed'`.

---

### H6. Apple recovery download uses plain `http://` — token and image exposed
**File:** `electron/appleRecovery.ts`, lines 6–7
**Bug:**
```typescript
export const APPLE_RECOVERY_ROOT_URL = `http://${APPLE_RECOVERY_HOST}/`;
export const APPLE_RECOVERY_IMAGE_URL = `http://${APPLE_RECOVERY_HOST}/InstallationPayload/RecoveryImage`;
```
Both Apple recovery endpoints use plain HTTP. The session cookie and recovery image download are transmitted in plaintext.
**Impact:** A network-level attacker can intercept the session cookie, redirect the recovery image download to a malicious payload, or strip the HTTPS upgrade. A user silently receives a tampered recovery image.
**Fix:** Use `https://` for both URLs. If Apple's endpoint requires HTTP, download over HTTPS and validate the downloaded image checksum.

---

### H7. Missing HEDT CPU caps in compatibility engine
**File:** `electron/compatibility.ts`, lines 76–88
**Bug:** `capFromCpu` handles consumer Haswell and Broadwell (capped at 12) but not their HEDT variants. `'Haswell-E'` and `'Broadwell-E'` return `null` (no cap), causing the compatibility engine to report these CPUs as supporting macOS Ventura/Sonoma/Sequoia/Tahoe. Per Dortania, Haswell/Broadwell HEDT caps at macOS 12.
**Impact:** Haswell-E/Broadwell-E users are shown modern macOS versions as compatible, resulting in a non-bootable EFI.
**Fix:** Add `'Haswell-E'` and `'Broadwell-E'` to the generation block that returns `12`. Also add `'Ivy Bridge-E'` to the block returning `12`.

---

### H8. Coffee Lake Z390: `SetupVirtualMap` quirk missing
**File:** `electron/configGenerator.ts`, line 454
**Bug:** Coffee Lake sets `SetupVirtualMap = true` unconditionally. Dortania's Z390 guidance states that some Z390 boards (particularly ASUS Z390) need `SetupVirtualMap = false`. The Z390-specific block only adds `ProtectUefiServices = true` and does not address this quirk.
**Impact:** Some ASUS Z390 boards hang or fail to boot with OpenCore's virtual memory map setup.
**Fix:** For Z390 boards, set `SetupVirtualMap = false`, or document this as a known per-board tuning requirement and add guidance in the UI.

---

### H9. Regex character class bug in Pentium/Celeron generation detection
**File:** `electron/hardwareMapper.ts`, line 64
**Bug:**
```typescript
model.match(/g[2|1]\d{2}/)
```
`[2|1]` is a character class that matches the characters `2`, `|`, or `1` — not an alternation of `2` or `1`. The `|` pipe is treated as a literal inside `[]`.
**Impact:** Any CPU model string containing a literal pipe character (e.g., from malformed WMI output on Windows) would produce a false positive Sandy Bridge classification. Low probability but a clear logic error.
**Fix:** Change to `/g[12]\d{2}/`.

---

### H10. Unvalidated renderer-supplied `device` strings reach disk operations
**File:** `electron/main.ts`, lines 3517, 3548, 3560, 3730
**Bug:** IPC handlers (`convert-disk-to-gpt`, `shrink-partition`, `flash-usb`) accept `device` as a raw string from the renderer and pass it directly to `diskOps` functions, which then interpolate it into shell commands (see C2).
**Impact:** Compound with C2 — a compromised renderer can pass a crafted device string that triggers command injection in disk operations.
**Fix:** Validate `device` matches a strict platform-appropriate pattern (`/^\/dev\/disk\d+$/` on macOS, `/^\/dev\/(sd[a-z]|nvme\d+n\d+)$/` on Linux, `/^\\\.\\PhysicalDrive\d+$/` on Windows) before passing to any disk function.

---

## MEDIUM — Wrong behavior or bad UX

### M1. `Math.random()` used for Apple recovery session tokens
**File:** `electron/appleRecovery.ts`, lines 38–45
**Bug:** `randomHex()` uses `Math.random()`, which is not cryptographically secure. The generated `cid`, `k`, and `fg` session values are sent to Apple's recovery servers.
**Fix:** Replace with `crypto.randomBytes(n).toString('hex')`.

---

### M2. Redirect recursion without depth limit in `probeUrl`
**File:** `electron/preventionLayer.ts`, lines 197–199
**Bug:**
```typescript
if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
  res.destroy();
  probeUrl(res.headers.location, timeoutMs).then(resolve);
```
No maximum redirect depth. A redirect loop causes unbounded recursion until stack overflow.
**Fix:** Add a `redirectsLeft` parameter defaulting to 5, decrement on each recursive call, and reject/resolve false when it reaches 0.

---

### M3. Unbounded response body accumulation in appleRecovery transport
**File:** `electron/appleRecovery.ts`, lines 138–148
**Bug:** All response chunks are concatenated with no size limit. A large or malicious response body exhausts memory.
**Fix:** Track cumulative `body.length` and destroy the socket when it exceeds a reasonable cap (e.g., 10 MB for metadata responses).

---

### M4. Platform detection via User-Agent parsing in renderer
**File:** `src/App.tsx`, lines 1487–1489
**Bug:**
```typescript
if (navigator.userAgent.includes('Windows')) setPlatform('win32');
else if (navigator.userAgent.includes('Mac')) setPlatform('darwin');
else setPlatform('linux');
```
The main process already knows `process.platform`. UA strings are not a reliable source of truth in Electron and can change across versions.
**Fix:** Expose `process.platform` from the main process through the preload bridge (e.g., `window.electron.platform`) and read it once in the renderer.

---

### M5. Stale closure risk in `setErrorWithSuggestion` event listener
**File:** `src/App.tsx`, lines 851–863
**Bug:** `setErrorWithSuggestion` is a plain function declared inside the component body, capturing 10+ state variables by closure. It is listed as a `useEffect` dependency but is never memoized with `useCallback`. This means either: (a) the effect re-registers the listener on every render, or (b) a stale closure serves old state to the error handler.
**Fix:** Wrap `setErrorWithSuggestion` in `useCallback` with explicit dependencies, or use a `useRef`-based pattern to always read current state inside the handler.

---

### M6. Recovery resume does not create a build flow snapshot
**File:** `src/App.tsx`, lines 1596–1602
**Bug:** When auto-resuming a recovery download on restart, `window.electron.downloadRecovery(...)` is called without first creating a `buildFlowRef` snapshot. The progress tracking `useEffect` checks `taskBelongsToRun(recovTask, snapshot?.startedAt)`, which will fail because the snapshot is null.
**Impact:** A resumed download's progress is silently ignored — the progress UI does not update and periodic state saves do not trigger.
**Fix:** Create a build flow snapshot for the resumed download before calling `downloadRecovery`.

---

### M7. Ice Lake iGPU misidentified as UHD 630
**File:** `electron/hardwareDetect.ts`, lines 420–424
**Bug:** `inferIntelIgpuName` returns `'Intel UHD Graphics 630'` for model numbers >= 10000. But 10th gen Ice Lake CPUs (model numbers 1030–1068) have Iris Plus G4/G7 graphics, not UHD 630.
**Impact:** Ice Lake iGPU classification feeds into `classifyGpu` and ig-platform-id selection. Misidentification can produce the wrong framebuffer and a non-functional display.
**Fix:** Add an explicit Ice Lake check before the Comet Lake fallback, distinguishing 10xx Ice Lake model numbers from 10xxx Comet Lake numbers.

---

### M8. Broadwell desktop headless uses mobile ig-platform-id fallback
**File:** `electron/configGenerator.ts`, line 1034 (comment acknowledges this)
**Bug:**
```typescript
'Broadwell': 'BgAmFg=='  // 0x16260006 (no Dortania-specified desktop headless; using mobile fallback)
```
Dortania's Broadwell desktop guide specifies `0x16260004` for headless configurations. The current value `0x16260006` is a mobile ID.
**Impact:** Broadwell desktops with a discrete GPU use a mobile ig-platform-id, causing potential framebuffer connector mapping issues.
**Fix:** Use `0x16260004` for Broadwell desktop headless (verify against Dortania guide before changing).

---

### M9. `parseMacOSVersion` silently defaults to version 15 for unrecognized strings
**File:** `electron/hackintoshRules.ts`, line 61
**Bug:** When no version is parsed from the `targetOS` string, the function silently returns `15` (Sequoia). Any typo or unexpected input string silently assumes Sequoia, which could generate incorrect quirks or SMBIOS.
**Fix:** Return `null` for unrecognized strings and have callers handle the null case explicitly.

---

### M10. `saveState` accepts an arbitrary unconstrained object from renderer
**File:** `electron/preload.ts`, line 101
**Bug:** `saveState: (state: object) => ipcRenderer.invoke('save-state', state)` passes an unconstrained object for persistence. If persisted state is later loaded and trusted for path or device resolution, a compromised renderer can inject malicious values that survive app restart.
**Fix:** Validate that the saved state matches the expected `AppState` shape before persisting, or serialize with a schema validator.

---

### M11. `checkGitHubRateLimit` accumulates unbounded response body
**File:** `electron/preventionLayer.ts`, lines 149–150
**Bug:** The `data` variable accumulates all HTTP response chunks with no size cap. A malicious server response could consume all available memory.
**Fix:** Cap at 64 KB and destroy the socket when exceeded.

---

### M12. `formatBytes` returns `NaN undefined` for edge-case inputs
**File:** `electron/main.ts`, lines 258–263
**Bug:**
```typescript
const i = Math.floor(Math.log(bytes) / Math.log(k));
return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
```
For `bytes <= 0`, `Math.log` returns NaN or `-Infinity`, producing a NaN index. For values >= 1 TB, `i = 4` exceeds `sizes.length` (4 entries: B/KB/MB/GB), returning `"X.Y undefined"`.
**Fix:** Clamp `i` to `[0, sizes.length - 1]` and guard against non-positive inputs.

---

### M13. `lscpu` virtualization detection is locale-dependent on Linux
**File:** `electron/main.ts`, line 1319
**Bug:**
```typescript
const vt = await runProbe('lscpu | grep Virtualization');
status.virtualizationEnabled = vt.stdout.includes('VT-x') || vt.stdout.includes('AMD-V');
```
On non-English locale Linux systems, `lscpu` does not output English strings, so this always returns false/unknown.
**Fix:** Use `LANG=C lscpu` or parse `/proc/cpuinfo` flags (`vmx` / `svm`) directly.

---

### M14. `selectOverallSupportLevel` promotes to highest capability, not lowest
**File:** `electron/bios/orchestrator.ts`, lines 227–231
**Bug:** If any single setting claims `managed` support, the overall BIOS support level is reported as `managed`, even if other settings are manual-only. This is backwards — overall capability should be limited by the weakest-supported setting.
**Impact:** The UI may claim full managed automation when most settings still require manual intervention.
**Fix:** Use the minimum support level across all settings, not the maximum.

---

### M15. Windows automount left disabled if Electron crashes during USB flash (v3.1.9 regression)
**File:** `electron/diskOps.ts`, `buildWindowsFlashDiskpartScript` (line 239) and error paths (lines 1459, 1493)
**Bug:** v3.1.9 added `automount disable` at the start of the diskpart Phase-1 script to prevent Explorer from locking the raw partition before format. `automount enable` is only restored in:
1. The Phase-2 format script (if format succeeds)
2. Two `runCmd(...).catch(() => {})` calls before fallback/error paths

There is no `before-quit` / `app.on('quit')` handler that runs `automount enable`. If the Electron process crashes or is force-killed between Phase 1 and Phase 2, Windows automount remains disabled globally — affecting **all** drives, not just the USB being flashed — until the user manually runs `automount enable` in diskpart. The `.catch(() => {})` on the two recovery calls also silently swallows failures, leaving the same permanent state.
**Impact:** After a crash during flash, newly inserted USB drives and HDDs are not auto-mounted by Windows Explorer. Affects the current session and persists across reboots until manually fixed. Users are unlikely to connect the symptom to the installer.
**Fix:** Register a `before-quit` handler in `main.ts` that runs `'automount enable' | diskpart` when `process.platform === 'win32'` and a flash operation was in progress. Alternatively, use a try/finally block around the Phase-1 diskpart invocation so cleanup always runs.

---

## LOW — Cosmetic or minor

### L1. CPUID no-op base64 is 15 bytes instead of 16
**File:** `electron/configGenerator.ts`, lines 952–953
**Bug:**
```typescript
let cpuid1Data = "AAAAAAAAAAAAAAAAAAAA";
let cpuid1Mask = "AAAAAAAAAAAAAAAAAAAA";
```
`AAAAAAAAAAAAAAAAAAAA` (20 base64 chars) decodes to 15 bytes. OpenCore CPUID emulation expects 16 bytes (4 × 32-bit registers). The last byte is potentially unmasked.
**Fix:** Use `AAAAAAAAAAAAAAAAAAAAAA==` (22 chars = 16 bytes, properly padded).

---

### L2. `btoa` layout-id encoding breaks for values > 255
**File:** `electron/configGenerator.ts`, line 1096
**Bug:**
```typescript
const layoutIdBase64 = btoa(String.fromCharCode(audioLayoutId, 0, 0, 0));
```
`btoa` requires Latin1 range (0–255). If `audioLayoutId > 255`, `btoa` throws. Current codec table values are safe (max ~28), but there is no guard.
**Fix:** Use `Buffer.from([audioLayoutId & 0xFF, (audioLayoutId >> 8) & 0xFF, 0, 0]).toString('base64')` for proper 32-bit little-endian encoding.

---

### L3. `(window.electron as any)` casts across 10+ IPC call sites
**File:** `src/App.tsx`, lines 1974, 1987, 2007, 2066, 2072, 2118, 2199, 2207, 2228, 2244
**Bug:** Methods like `runPreflightChecks`, `recordFailure`, `simulateBuild`, `verifyEfiBuildSuccess`, `verifyRecoverySuccess`, `dryRunRecovery` are defined in the preload but missing from the `Window.electron` interface.
**Fix:** Add all missing methods to the `Window.electron` interface declaration in `src/electron.d.ts`.

---

### L4. Empty `catch {}` blocks swallow diagnostic information in diskOps.ts
**File:** `electron/diskOps.ts`, lines 93, 108, 472, 507, 587, 820, 892, 918, 951, 1050 and more
**Bug:** Dozens of silent empty catch blocks make debugging disk operation failures impossible.
**Fix:** At minimum, log errors at DEBUG level: `catch (e) { log.debug('diskOps', e); }`.

---

### L5. `cleanupOrphanedBuilds` blocks the event loop with sync FS calls
**File:** `electron/efiBuildFlow.ts`, lines 56–68
**Bug:** Uses `readdirSync` and `rmSync`, blocking the Node.js event loop. With many orphaned builds, this freezes the UI during startup.
**Fix:** Use async `fs.readdir` / `fs.rm` with `{ recursive: true }`.

---

### L6. `efiBuildFlow.ts` uses `Date.now()` for build directory names
**File:** `electron/efiBuildFlow.ts`, line 76
**Bug:** Two builds started within the same millisecond (possible in automated tests) collide on the directory name.
**Fix:** Append a short random hex suffix: `` `${Date.now()}-${crypto.randomBytes(4).toString('hex')}` ``.

---

### L7. `retryWithBackoff` throws `undefined` when `maxAttempts` is 0
**File:** `electron/main.ts`, line 1211
**Bug:** If `maxAttempts <= 0`, the loop never executes and `throw lastErr` throws `undefined`, producing an unhelpful error.
**Fix:** Guard: `if (maxAttempts <= 0) throw new Error('maxAttempts must be >= 1')`.

---

### L8. `Set-Cookie` header check is dead code (should be `set-cookie`)
**File:** `electron/appleRecovery.ts`, line 182
**Bug:** Node.js `http.IncomingMessage.headers` lowercases all header names. `res.headers['Set-Cookie']` is always `undefined`; only `res.headers['set-cookie']` will ever match.
**Fix:** Remove the `'Set-Cookie'` check and rely solely on `'set-cookie'`.

---

### L9. Duplicate `motherboard` variable declaration
**File:** `electron/configGenerator.ts`, lines 663, 791
**Bug:** `const motherboard = profile.motherboard.toLowerCase()` (line 663) and `const mb = profile.motherboard.toLowerCase()` (line 791) hold the same value. One is dead.
**Fix:** Remove line 791 and use the existing `motherboard` variable.

---

### L10. `biosStatus` and `cachedRecovInfo` typed as `any`
**File:** `src/App.tsx`, lines 244, 259
**Bug:** Two central state atoms are typed `any`, weakening type safety for all consumers.
**Fix:** Define proper interfaces for the BIOS status response and recovery info, and use them.

---

## Code Quality Issues

### Q1. Monolithic 2400-line React component with suppressed lint rules
**File:** `src/App.tsx`
`App()` contains 60+ `useState`, 20+ `useRef`, and 30+ `useEffect` hooks. There are 10+ `// eslint-disable-line react-hooks/exhaustive-deps` suppressions, each representing a real stale-closure risk that was silenced instead of fixed. This makes it nearly impossible to reason about render cycles or side-effect lifetimes.
**Recommendation:** Decompose into sub-components with dedicated state slices (build flow, USB flow, BIOS flow) or use a state manager (Zustand, XState) for the orchestration layer.

---

### Q2. `_setStepRaw` bypasses all step guards with no audit trail
**File:** `src/App.tsx`, multiple call sites
The escape hatch `_setStepRaw` is used throughout without logging the bypass reason, making it impossible to audit guard bypasses in production.
**Recommendation:** Wrap in `setStepForced(target: Step, reason: string)` that logs the reason, enabling audit trails.

---

### Q3. Module-level mutable state shared across concurrent IPC handlers
**File:** `electron/main.ts`, lines 411–431
~15 `let` variables at module scope (`lastHardwareProfile`, `lastBuildProfile`, `failedKexts`, `kextSources`, `lastValidationResult`, etc.) are read/written by multiple async IPC handlers. While Node.js is single-threaded for JS, interleaved async operations can cause logical races where a handler reads state left by a concurrent async chain.
**Recommendation:** Group into a structured state object with clear ownership, or use request-scoped state.

---

## Security Concerns

### S1. No kext integrity verification in `fetch-embedded-kexts.sh`
**File:** `scripts/fetch-embedded-kexts.sh`, lines 69, 74, 83
The script downloads kexts from GitHub releases with `curl -sL` and extracts them with no checksum verification. If the acidanthera GitHub account or any release is compromised, malicious kexts would be silently embedded into the app and distributed to all users.
**Recommendation:** Maintain a `kext-checksums.sha256` file, download kexts into temp, verify with `sha256sum -c`, and fail loudly on mismatch.

---

### S2. `probeUrl` follows redirects to `http://` (TLS downgrade)
**File:** `electron/preventionLayer.ts`, lines 188, 197
The redirect-follow logic uses `require('http')` for non-HTTPS targets, allowing preflight checks for GitHub release URLs to be downgraded to HTTP by a network attacker.
**Recommendation:** Only follow redirects within the same scheme (HTTPS → HTTPS). Never follow HTTPS → HTTP redirects.

---

### S3. Preload IPC surface (~60 channels) has no argument-type validation
**File:** `electron/preload.ts`, throughout
The preload passes all renderer-supplied arguments to IPC channels with no type checking, allowlist validation, or shape enforcement. The preload is the last defense layer before the main process.
**Recommendation:** Add lightweight type guards at the preload boundary for all arguments that reach disk or shell operations. At minimum, assert strings are strings and numbers are numbers before forwarding.

---

## CI/CD Issues

### CI1. No macOS build in release workflow
**File:** `.github/workflows/release.yml`
The workflow builds for Linux and Windows only. There is no `build-macos` job. This is a macOS installer tool, yet macOS users cannot get a native app from CI. The only macOS artifacts would have to be built locally and manually attached.
**Recommendation:** Add a `build-macos` job on `macos-latest` to produce a `.dmg` artifact.

---

### CI2. Unusually high action version pins (`@v6`, `@v7`, `@v8`)
**File:** `.github/workflows/release.yml`, lines 18–19, 37–38, 49, 82
`actions/checkout@v6`, `actions/setup-node@v6`, `actions/upload-artifact@v7`, `actions/download-artifact@v8` use version numbers above the current stable releases (checkout and setup-node are at v4.x as of early 2026). These may be speculative future tags, mistyped, or outdated. If these tags do not exist in the GitHub Actions registry, every release workflow run fails.
**Recommendation:** Verify each action version against the Actions Marketplace and pin to current stable versions with a full SHA for supply-chain safety.

---

### CI3. Release workflow deletes the tag's release before recreating it
**File:** `.github/workflows/release.yml`, line 106
```bash
gh release delete "$tag" --repo "$GITHUB_REPOSITORY" --yes 2>/dev/null || true
```
There is a brief window between deletion and recreation where the release does not exist. If two release workflow runs race (e.g., a tag push and a `workflow_dispatch` for the same tag), both delete the release and only one recreates it correctly.
**Recommendation:** Use `--clobber` on `gh release create` instead of delete-then-create, or add a distributed lock.

---

## Summary Table

| Severity | Count | Notes |
|----------|-------|-------|
| CRITICAL | 5     | C6 fixed in v3.1.5 |
| HIGH     | 10    | |
| MEDIUM   | 15    | M15 added (v3.1.9 automount regression) |
| LOW      | 10    | |
| Code Quality | 3 | |
| Security | 3     | |
| CI/CD    | 3     | |

**Most urgent fixes:**
1. **C1** — AMD laptop SSDT-EC desktop variant (non-bootable EFI)
2. **C2/C3** — Command injection in diskOps.ts (potential RCE as root)
3. **C5** — Missing legacy generations in Tahoe block (non-bootable EFI)
4. **H5** — BIOS managed mode unreachable due to copy-paste bug
5. **H7** — HEDT CPUs incorrectly shown as Tahoe-compatible
6. **M15** — Windows automount left disabled on crash during flash (v3.1.9)

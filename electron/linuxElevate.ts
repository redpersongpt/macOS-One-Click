/**
 * Linux per-command privilege elevation.
 *
 * Instead of running the entire Electron app as root (which breaks
 * Chromium sandbox and X11/Wayland display access), this module
 * wraps individual shell commands with pkexec or sudo as needed.
 *
 * Elevation order:
 *   1. Already root (UID 0) → run directly
 *   2. pkexec available → graphical password prompt
 *   3. sudo -A available (with SUDO_ASKPASS) → GUI askpass
 *   4. sudo -n (non-interactive) → only if user has NOPASSWD
 *   5. Fail with clear guidance
 */

import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

let elevationMethod: 'root' | 'pkexec' | 'sudo' | null = null;

/** Check what elevation method is available on this system. */
export async function detectElevationMethod(): Promise<'root' | 'pkexec' | 'sudo' | 'none'> {
  if (elevationMethod) return elevationMethod;

  // Already root — no elevation needed
  if (process.getuid?.() === 0) {
    elevationMethod = 'root';
    return 'root';
  }

  // Check pkexec (polkit graphical prompt)
  try {
    await execPromise('which pkexec', { timeout: 3000 });
    elevationMethod = 'pkexec';
    return 'pkexec';
  } catch {}

  // Check sudo
  try {
    await execPromise('which sudo', { timeout: 3000 });
    elevationMethod = 'sudo';
    return 'sudo';
  } catch {}

  return 'none';
}

/**
 * Wrap a command string with the appropriate elevation prefix for Linux.
 * On non-Linux platforms, returns the command unchanged.
 */
export function elevateCommand(command: string): string {
  if (process.platform !== 'linux') return command;
  if (process.getuid?.() === 0) return command;

  if (elevationMethod === 'pkexec') {
    // pkexec runs a single command — wrap in sh -c for pipes/redirects
    const needsShell = /[|;&><]/.test(command);
    return needsShell
      ? `pkexec sh -c ${shellQuote(command)}`
      : `pkexec ${command}`;
  }

  if (elevationMethod === 'sudo') {
    return `sudo -n ${command}`;
  }

  // Fallback: try without elevation (will fail on block device access)
  return command;
}

/** Whether the current process can elevate commands for disk operations. */
export function canElevate(): boolean {
  return elevationMethod === 'root' || elevationMethod === 'pkexec' || elevationMethod === 'sudo';
}

/** Human-readable description of how elevation works on this system. */
export function elevationDescription(): string {
  switch (elevationMethod) {
    case 'root': return 'Running as root — direct disk access available.';
    case 'pkexec': return 'Using polkit (pkexec) for per-operation elevation — you will be prompted for your password when disk access is needed.';
    case 'sudo': return 'Using sudo for per-operation elevation.';
    default: return 'No elevation method available. Install polkit (pkexec) for graphical password prompts, or configure sudo.';
  }
}

/** Shell-quote a string for safe inclusion in sh -c '...' */
function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

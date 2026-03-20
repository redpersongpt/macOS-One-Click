import path from 'path';

// The compiled Electron entrypoint lives under dist-electron/electron/.
// The packaged renderer bundle remains at the app root under dist/.
export function getPackagedRendererEntryPath(compiledElectronDir: string): string {
  return path.resolve(compiledElectronDir, '..', '..', 'dist', 'index.html');
}

export function getCompatModeConfigPath(compiledElectronDir: string): string {
  return path.resolve(compiledElectronDir, '..', 'compat.json');
}

export function getPreloadScriptPath(compiledElectronDir: string): string {
  return path.resolve(compiledElectronDir, 'preload.js');
}

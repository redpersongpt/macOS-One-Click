import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, test } from 'vitest';
import {
  getCompatModeConfigPath,
  getPackagedRendererEntryPath,
  getPreloadScriptPath,
} from '../electron/runtimePaths.js';

describe('runtime path helpers', () => {
  test('resolve packaged renderer entry from the compiled Electron directory', () => {
    const compiledDir = path.join('/tmp', 'app', 'dist-electron', 'electron');

    assert.equal(
      getPackagedRendererEntryPath(compiledDir),
      path.join('/tmp', 'app', 'dist', 'index.html'),
    );
  });

  test('resolve compat and preload files from the compiled Electron directory', () => {
    const compiledDir = path.join('/tmp', 'app', 'dist-electron', 'electron');

    assert.equal(
      getCompatModeConfigPath(compiledDir),
      path.join('/tmp', 'app', 'dist-electron', 'compat.json'),
    );
    assert.equal(
      getPreloadScriptPath(compiledDir),
      path.join('/tmp', 'app', 'dist-electron', 'electron', 'preload.js'),
    );
  });
});

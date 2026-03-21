import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { WINDOWS_HARDWARE_QUERIES } from '../electron/hardwareDetect.js';

describe('hardwareDetect Windows queries', () => {
  test('uses Win32 classes for CPU and GPU detection', () => {
    assert.match(WINDOWS_HARDWARE_QUERIES.cpuName, /Win32_Processor/);
    assert.match(WINDOWS_HARDWARE_QUERIES.cpuVendor, /Win32_Processor/);
    assert.match(WINDOWS_HARDWARE_QUERIES.gpuJson, /Win32_VideoController/);
    assert.doesNotMatch(WINDOWS_HARDWARE_QUERIES.cpuName, /CIM_Processor/);
    assert.doesNotMatch(WINDOWS_HARDWARE_QUERIES.gpuJson, /CIM_VideoController/);
  });
});

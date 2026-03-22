import { describe, it, expect } from 'vitest';
import { detectCpuGeneration, detectArchitecture } from '../electron/hardwareMapper.js';

describe('detectCpuGeneration', () => {
  it('Coffee Lake i7-9700K', () => {
    expect(detectCpuGeneration('Intel Core i7-9700K')).toBe('Coffee Lake');
  });

  it('Comet Lake i5-10400', () => {
    expect(detectCpuGeneration('Intel Core i5-10400')).toBe('Comet Lake');
  });

  it('Alder Lake i7-12700K', () => {
    expect(detectCpuGeneration('Intel Core i7-12700K')).toBe('Alder Lake');
  });

  it('Raptor Lake i9-13900K', () => {
    expect(detectCpuGeneration('Intel Core i9-13900K')).toBe('Raptor Lake');
  });

  it('Ryzen 5 5600X', () => {
    expect(detectCpuGeneration('AMD Ryzen 5 5600X')).toBe('Ryzen');
  });

  it('Threadripper 3990X', () => {
    expect(detectCpuGeneration('AMD Ryzen Threadripper 3990X')).toBe('Threadripper');
  });

  it('Apple M1', () => {
    expect(detectCpuGeneration('Apple M1')).toBe('Apple Silicon');
  });

  it('Xeon E5-v3', () => {
    expect(detectCpuGeneration('Intel Xeon E5-v3')).toBe('Broadwell-E');
  });

  it('Xeon with model number falls to Haswell-E default', () => {
    expect(detectCpuGeneration('Intel Xeon E5-2680 v3')).toBe('Haswell-E');
  });

  it('unknown CPU returns Unknown', () => {
    expect(detectCpuGeneration('Some Random CPU')).toBe('Unknown');
  });
});

describe('detectArchitecture', () => {
  it('Intel CPU', () => {
    expect(detectArchitecture('Intel Core i7-9700K')).toBe('Intel');
  });

  it('AMD Ryzen', () => {
    expect(detectArchitecture('AMD Ryzen 5 5600X')).toBe('AMD');
  });

  it('Apple Silicon', () => {
    expect(detectArchitecture('Apple M2 Pro')).toBe('Apple Silicon');
  });

  it('unknown', () => {
    expect(detectArchitecture('ARM Cortex-A72')).toBe('Unknown');
  });
});

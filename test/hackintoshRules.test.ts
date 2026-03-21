import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { classifyGpu } from '../electron/hackintoshRules.js';

describe('hackintoshRules GPU classification', () => {
  test('ignores microsoft software display adapters without emitting unknown-vendor guidance', () => {
    const assessment = classifyGpu({
      name: 'Microsoft Remote Display Adapter',
      vendorName: 'Microsoft',
      vendorId: null,
      deviceId: null,
    });

    assert.equal(assessment.isLikelyDiscrete, false);
    assert.equal(assessment.notes.some((note) => /vendor could not be determined/i.test(note)), false);
    assert.equal(assessment.notes.some((note) => /software or remote display adapter/i.test(note)), true);
  });
});

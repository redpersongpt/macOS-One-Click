import React from 'react';
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import FailureRecoveryPanel from '../src/components/FailureRecoveryPanel';

describe('FailureRecoveryPanel', () => {
  test('keeps the default recovery surface concise and tucks technical detail behind disclosure', () => {
    const html = renderToStaticMarkup(
      <FailureRecoveryPanel
        title="Recovery needed"
        whatFailed="The EFI build did not pass validation."
        likelyCause="A required kext did not land on disk."
        nextActions={['Fix the missing kext, then rebuild once.']}
        technicalDetails={[{ label: 'Path', value: 'EFI/OC/Kexts/Lilu.kext', mono: true }]}
        onDismiss={() => {}}
        actions={[{ label: 'Retry', onClick: () => {}, tone: 'primary' }]}
      />,
    );

    assert.match(html, /What Failed/);
    assert.match(html, /Why It Likely Failed/);
    assert.match(html, /What To Do Next/);
    assert.match(html, /Fix the missing kext, then rebuild once\./);
    assert.match(html, /<details>/);
    assert.match(html, /Concise Technical Detail/);
    assert.equal(html.includes('<details open'), false);
  });
});

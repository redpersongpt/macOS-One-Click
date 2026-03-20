import React from 'react';
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import BiosStep from '../src/components/steps/BiosStep';

describe('BiosStep', () => {
  test('renders separate Recheck BIOS and Continue actions', () => {
    const html = renderToStaticMarkup(
      <BiosStep
        biosConfig={{ enable: [], disable: [] }}
        biosStatus={null}
        firmwareInfo={null}
        orchestratorState={null}
        resumeState={null}
        restartCapability={null}
        onApplySupportedChanges={async () => ({ message: 'ok' })}
        onRecheckBios={async () => ({ advanced: false, message: 'updated' })}
        onContinueWithCurrentBiosState={async () => ({ advanced: false, message: 'blocked' })}
        onRestartToBios={async () => ({ supported: false })}
      />,
    );

    assert.match(html, /Recheck BIOS/);
    assert.match(html, />Continue</);
    assert.doesNotMatch(html, /Recheck BIOS and Continue/);
    assert.match(html, /uses the current checklist without rerunning the BIOS probe/i);
  });
});

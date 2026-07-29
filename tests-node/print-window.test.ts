import assert from 'node:assert/strict';
import test from 'node:test';
import { openPrintWindow } from '../src/utils/print-window.ts';

test('opens a same-origin print popup without noopener features and clears opener immediately', () => {
  let features = '';
  const popup = { opener: { unsafe: true } } as unknown as Window;
  const result = openPrintWindow('width=900,height=800', (_url, _target, receivedFeatures) => {
    features = receivedFeatures ?? '';
    return popup;
  });

  assert.equal(result, popup);
  assert.doesNotMatch(features, /noopener|noreferrer/i);
  assert.equal(popup.opener, null);
});

test('uses a translatable error code when the browser blocks the popup', () => {
  assert.throws(() => openPrintWindow('width=900', () => null), /error\.popupBlocked/);
});

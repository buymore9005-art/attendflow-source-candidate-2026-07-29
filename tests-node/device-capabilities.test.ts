import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deviceActionCapability as browserActionCapability,
  getSupportedBiometricAssetTypes as getBrowserSupportedBiometricAssetTypes,
  isDeviceActionSupported as isBrowserActionSupported
} from '../src/utils/device-capabilities.ts';
import {
  deviceActionCapability as edgeActionCapability,
  getSupportedBiometricAssetTypes as getEdgeSupportedBiometricAssetTypes,
  isDeviceActionSupported as isEdgeActionSupported
} from '../supabase/functions/_shared/device-capabilities.ts';

const baseDevice = {
  protocol: 'adms',
  capabilities_verified: false,
  supports_log_pull: false,
  supports_user_push: false,
  supports_fingerprint_push: false,
  supports_face_push: false,
  supports_card_push: false
} as const;

test('browser and Edge Function use the same device capability contract', () => {
  assert.deepEqual(edgeActionCapability, browserActionCapability);
});

test('does not expose an unverified biometric command', () => {
  assert.equal(isBrowserActionSupported(baseDevice, 'push_fingers'), false);
  assert.equal(isEdgeActionSupported(baseDevice, 'push_fingers'), false);
});

test('allows only the explicitly verified capability on a command-capable protocol', () => {
  const device = { ...baseDevice, capabilities_verified: true, supports_user_push: true };
  assert.equal(isBrowserActionSupported(device, 'push_users'), true);
  assert.equal(isBrowserActionSupported(device, 'push_cards'), false);
});

test('rejects remote commands for protocols without a bundled command worker', () => {
  const capable = { ...baseDevice, capabilities_verified: true, supports_user_push: true };
  assert.equal(isBrowserActionSupported({ ...capable, protocol: 'manual' }, 'push_users'), false);
  assert.equal(isBrowserActionSupported({ ...capable, protocol: 'deli_cloud' }, 'push_users'), false);
  assert.equal(isBrowserActionSupported({ ...capable, protocol: 'lan_bridge' }, 'push_users'), false);
  assert.equal(isEdgeActionSupported({ ...capable, protocol: 'lan_bridge' }, 'test_connection'), false);
});


test('sync_biometrics selects only explicitly verified biometric asset types', () => {
  const device = {
    ...baseDevice,
    capabilities_verified: true,
    supports_fingerprint_push: true,
    supports_face_push: false,
    supports_card_push: false
  };
  assert.deepEqual(getBrowserSupportedBiometricAssetTypes(device), ['finger']);
  assert.deepEqual(getEdgeSupportedBiometricAssetTypes(device), ['finger']);
});

test('device-command queues cards during sync_biometrics only when card push is verified', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../supabase/functions/device-command/index.ts', import.meta.url), 'utf8');
  assert.match(source, /const assetTypes = action === 'sync_biometrics'\s*\? getSupportedBiometricAssetTypes\(device\)/s);
  assert.match(source, /if \(action === 'sync_biometrics' && device\.supports_card_push\)/);
});

test('device-command Edge Function enforces verified capabilities server-side', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../supabase/functions/device-command/index.ts', import.meta.url), 'utf8');
  assert.match(source, /import \{[^}]*isDeviceActionSupported[^}]*\} from '\.\.\/_shared\/device-capabilities\.ts';/s);
  assert.match(source, /select\('[^']*capabilities_verified[^']*supports_log_pull[^']*supports_user_push[^']*supports_fingerprint_push[^']*supports_face_push[^']*supports_card_push[^']*'\)/s);
  assert.match(source, /if \(!isDeviceActionSupported\(device, (?:action|commandAction)\)\)/);
  assert.match(source, /throw new HttpError\(\s*409,/s);
});

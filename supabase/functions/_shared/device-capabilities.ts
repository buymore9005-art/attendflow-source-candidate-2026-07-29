export type DeviceCommandAction =
  | 'test_connection'
  | 'sync'
  | 'pull_logs'
  | 'push_users'
  | 'push_cards'
  | 'push_fingers'
  | 'push_faces'
  | 'sync_biometrics';

export type DeviceCapabilityKey =
  | 'supports_log_pull'
  | 'supports_user_push'
  | 'supports_card_push'
  | 'supports_fingerprint_push'
  | 'supports_face_push';

export interface DeviceCapabilityState {
  protocol: string;
  capabilities_verified: boolean;
  supports_log_pull: boolean;
  supports_user_push: boolean;
  supports_card_push: boolean;
  supports_fingerprint_push: boolean;
  supports_face_push: boolean;
}

export const deviceActionCapability: Readonly<Record<DeviceCommandAction, DeviceCapabilityKey | null>> = {
  test_connection: null,
  sync: 'supports_log_pull',
  pull_logs: 'supports_log_pull',
  push_users: 'supports_user_push',
  push_cards: 'supports_card_push',
  push_fingers: 'supports_fingerprint_push',
  push_faces: 'supports_face_push',
  sync_biometrics: null
};

const remoteCommandProtocols = new Set(['adms', 'push']);

export function getSupportedBiometricAssetTypes(device: DeviceCapabilityState): Array<'finger' | 'face'> {
  if (!device.capabilities_verified) return [];
  const assetTypes: Array<'finger' | 'face'> = [];
  if (device.supports_fingerprint_push) assetTypes.push('finger');
  if (device.supports_face_push) assetTypes.push('face');
  return assetTypes;
}

export function isDeviceActionSupported(device: DeviceCapabilityState, action: DeviceCommandAction): boolean {
  if (!remoteCommandProtocols.has(device.protocol)) return false;
  if (action === 'test_connection') return true;
  if (!device.capabilities_verified) return false;
  if (action === 'sync_biometrics') {
    return device.supports_fingerprint_push || device.supports_face_push || device.supports_card_push;
  }
  const capability = deviceActionCapability[action];
  return capability === null || device[capability] === true;
}

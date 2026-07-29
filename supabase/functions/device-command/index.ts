import { getSupportedBiometricAssetTypes, isDeviceActionSupported, type DeviceCommandAction } from '../_shared/device-capabilities.ts';
import { auditEvent, adminClient, requirePermission } from '../_shared/supabase.ts';
import { correlationId, errorResponse, HttpError, jsonResponse, optionsResponse, readJsonObject, requiredString } from '../_shared/http.ts';

interface DeviceRow {
  id: string;
  organization_id: string;
  protocol: string;
  serial_number: string;
  status: string;
  last_seen_at: string | null;
  capabilities_verified: boolean;
  supports_log_pull: boolean;
  supports_user_push: boolean;
  supports_fingerprint_push: boolean;
  supports_face_push: boolean;
  supports_card_push: boolean;
}

interface CommandInsert {
  organization_id: string;
  device_id: string;
  command_type: string;
  payload: Record<string, unknown>;
  created_by: string;
  correlation_id: string;
}

const actionPermission: Record<string, string> = {
  rotate_device_token: 'devices.update',
  test_connection: 'devices.sync',
  sync: 'devices.sync',
  pull_logs: 'devices.sync',
  push_users: 'devices.sync',
  push_cards: 'devices.sync',
  push_fingers: 'devices.sync',
  push_faces: 'devices.sync',
  sync_biometrics: 'devices.sync'
};

function cleanCommandText(value: unknown, max = 100): string {
  return String(value ?? '').replace(/[\t\r\n]/g, ' ').trim().slice(0, max);
}

async function loadDevice(organizationId: string, deviceId: string): Promise<DeviceRow> {
  const { data, error } = await adminClient.from('attendance_devices').select('id,organization_id,protocol,serial_number,status,last_seen_at,capabilities_verified,supports_log_pull,supports_user_push,supports_fingerprint_push,supports_face_push,supports_card_push').eq('organization_id', organizationId).eq('id', deviceId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Attendance device was not found.', 'device_not_found');
  return data as DeviceRow;
}

async function insertCommands(commands: CommandInsert[]): Promise<number> {
  if (commands.length === 0) throw new HttpError(409, 'No eligible records were found for this command.', 'nothing_to_sync');
  if (commands.length > 1000) throw new HttpError(413, 'The command batch is too large; narrow the employee scope.', 'batch_too_large');
  const { error } = await adminClient.from('device_commands').insert(commands);
  if (error) throw error;
  return commands.length;
}

Deno.serve(async (request) => {
  const requestCorrelationId = correlationId(request);
  if (request.method === 'OPTIONS') return optionsResponse();
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Only POST is supported.', 'method_not_allowed');
    const body = await readJsonObject(request);
    const organizationId = requiredString(body.organization_id, 'organization_id', 36);
    const action = requiredString(body.action, 'action', 64);
    const permission = actionPermission[action];
    if (!permission) throw new HttpError(400, 'Unsupported device action.', 'unsupported_action');
    const user = await requirePermission(request, organizationId, permission);

    if (action === 'rotate_device_token') {
      const requestedDeviceId = typeof body.device_id === 'string' ? body.device_id : null;
      const query = adminClient.from('attendance_devices').select('id,name,serial_number').eq('organization_id', organizationId).in('protocol', ['adms', 'push']).is('deleted_at', null);
      const { data: devices, error } = requestedDeviceId ? await query.eq('id', requestedDeviceId) : await query;
      if (error) throw error;
      if (!devices?.length) throw new HttpError(404, 'No ADMS/Push devices were found.', 'device_not_found');
      const tokens: Array<{ device_id: string; name: string; serial_number: string; token: string }> = [];
      for (const device of devices) {
        const { data: token, error: rotateError } = await adminClient.rpc('rotate_device_token', { p_device_id: device.id });
        if (rotateError) throw rotateError;
        tokens.push({ device_id: device.id, name: device.name, serial_number: device.serial_number, token: String(token) });
      }
      await auditEvent({ organizationId, userId: user.id, eventType: 'device', entityType: 'attendance_devices', action, newData: { device_count: tokens.length }, request, correlationId: requestCorrelationId });
      return jsonResponse({ tokens, correlation_id: requestCorrelationId });
    }

    const deviceId = requiredString(body.device_id, 'device_id', 36);
    const device = await loadDevice(organizationId, deviceId);
    const commandAction = action as DeviceCommandAction;
    if (!isDeviceActionSupported(device, commandAction)) {
      throw new HttpError(
        409,
        'This command is unavailable until the device capability is verified for its exact model and firmware.',
        'device_capability_not_verified'
      );
    }
    const base = { organization_id: organizationId, device_id: deviceId, created_by: user.id, correlation_id: requestCorrelationId };
    const employeeId = typeof body.employee_id === 'string' ? body.employee_id : null;
    let commands: CommandInsert[] = [];

    if (action === 'test_connection') {
      const seenAt = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
      const online = seenAt > Date.now() - 5 * 60 * 1000;
      const { error } = await adminClient.from('attendance_devices').update({ status: online ? 'online' : 'offline', updated_at: new Date().toISOString() }).eq('id', deviceId).eq('organization_id', organizationId);
      if (error) throw error;
      commands = [{ ...base, command_type: 'check', payload: { requested_at: new Date().toISOString() } }];
    } else if (action === 'sync' || action === 'pull_logs') {
      const from = typeof body.from === 'string' ? body.from : new Date(Date.now() - 31 * 86400000).toISOString();
      const to = typeof body.to === 'string' ? body.to : new Date().toISOString();
      commands = [{ ...base, command_type: 'query_attlog', payload: { from, to } }];
    } else if (action === 'push_users' || action === 'push_cards') {
      let query = adminClient.from('employees').select('id,employee_no,full_name,fingerprint_pin,is_active').eq('organization_id', organizationId).eq('is_active', true).is('deleted_at', null).limit(1000);
      if (employeeId) query = query.eq('id', employeeId);
      const { data: employees, error } = await query;
      if (error) throw error;
      const employeeIds = (employees ?? []).map((employee) => employee.id);
      const cardMap = new Map<string, string>();
      if (employeeIds.length) {
        const { data: enrollments, error: enrollmentError } = await adminClient.from('biometric_enrollments').select('employee_id,card_number,pin').eq('organization_id', organizationId).in('employee_id', employeeIds).or(`device_id.eq.${deviceId},device_id.is.null`);
        if (enrollmentError) throw enrollmentError;
        for (const row of enrollments ?? []) if (row.card_number) cardMap.set(row.employee_id, row.card_number);
      }
      commands = (employees ?? []).filter((employee) => employee.fingerprint_pin || employee.employee_no).map((employee) => ({
        ...base,
        command_type: action === 'push_cards' ? 'push_card' : 'push_user',
        payload: {
          employee_id: employee.id,
          pin: cleanCommandText(employee.fingerprint_pin || employee.employee_no, 24),
          name: cleanCommandText(employee.full_name, 40),
          card_number: cleanCommandText(cardMap.get(employee.id), 32)
        }
      }));
    } else if (action === 'push_fingers' || action === 'push_faces' || action === 'sync_biometrics') {
      const assetTypes = action === 'sync_biometrics'
        ? getSupportedBiometricAssetTypes(device)
        : action === 'push_fingers' ? ['finger'] : ['face'];
      let assets: Array<{ id: string; employee_id: string; asset_type: string; slot: number; template_format: string; storage_path: string; checksum_sha256: string }> = [];
      if (assetTypes.length > 0) {
        let query = adminClient.from('biometric_assets').select('id,employee_id,asset_type,slot,template_format,storage_path,checksum_sha256').eq('organization_id', organizationId).in('asset_type', assetTypes).or(`device_id.eq.${deviceId},device_id.is.null`).limit(1000);
        if (employeeId) query = query.eq('employee_id', employeeId);
        const { data, error } = await query;
        if (error) throw error;
        assets = data ?? [];
      }
      const employeeIds = [...new Set(assets.map((asset) => asset.employee_id))];
      const pins = new Map<string, string>();
      if (employeeIds.length) {
        const { data: employees, error: employeeError } = await adminClient.from('employees').select('id,employee_no,fingerprint_pin').eq('organization_id', organizationId).in('id', employeeIds);
        if (employeeError) throw employeeError;
        for (const employee of employees ?? []) pins.set(employee.id, employee.fingerprint_pin || employee.employee_no);
      }
      commands = assets.map((asset) => ({
        ...base,
        command_type: asset.asset_type === 'finger' ? 'push_finger' : 'push_face',
        payload: { asset_id: asset.id, employee_id: asset.employee_id, pin: cleanCommandText(pins.get(asset.employee_id), 24), slot: asset.slot, template_format: asset.template_format, storage_path: asset.storage_path, checksum_sha256: asset.checksum_sha256 }
      }));
      if (action === 'sync_biometrics' && device.supports_card_push) {
        let enrollmentQuery = adminClient.from('biometric_enrollments').select('employee_id,card_number,pin').eq('organization_id', organizationId).or(`device_id.eq.${deviceId},device_id.is.null`).limit(1000);
        if (employeeId) enrollmentQuery = enrollmentQuery.eq('employee_id', employeeId);
        const { data: enrollments, error: enrollmentError } = await enrollmentQuery;
        if (enrollmentError) throw enrollmentError;
        commands.push(...(enrollments ?? []).filter((row) => row.card_number).map((row) => ({ ...base, command_type: 'push_card', payload: { employee_id: row.employee_id, pin: cleanCommandText(row.pin || pins.get(row.employee_id), 24), card_number: cleanCommandText(row.card_number, 32) } })));
      }
    }

    const queued = await insertCommands(commands);
    await auditEvent({ organizationId, userId: user.id, eventType: 'device', entityType: 'attendance_devices', entityId: deviceId, action, newData: { queued }, request, correlationId: requestCorrelationId });
    return jsonResponse({ queued, device_id: deviceId, correlation_id: requestCorrelationId }, 202);
  } catch (error) {
    return errorResponse(error, requestCorrelationId);
  }
});

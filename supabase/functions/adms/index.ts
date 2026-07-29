import { createAdmsIdempotencyKey, parseAdmsAttLog } from '../_shared/adms-parser.ts';
import { classifyAdmsPath } from '../_shared/adms-route.ts';
import { adminClient } from '../_shared/supabase.ts';
import { correlationId, errorResponse, getClientIp, HttpError, optionsResponse, readTextBody, textResponse } from '../_shared/http.ts';

interface DeviceContext {
  id: string;
  organization_id: string;
  serial_number: string;
  name: string;
  metadata: Record<string, unknown>;
  time_zone: string;
}

interface DeviceCommand {
  id: string;
  command_no: number;
  command_type: string;
  payload: Record<string, unknown>;
}

function safeField(value: unknown, max = 120): string {
  return String(value ?? '').replace(/[\t\r\n]/g, ' ').trim().slice(0, max);
}

function parseKeyValueLine(line: string): { kind: string; fields: Record<string, string> } {
  const firstTab = line.indexOf('\t');
  const firstSpace = line.indexOf(' ');
  const separator = [firstTab, firstSpace].filter((value) => value >= 0).sort((a, b) => a - b)[0] ?? line.length;
  const kind = line.slice(0, separator).trim().toUpperCase();
  const fields: Record<string, string> = {};
  const rest = line.slice(separator + 1);
  const matcher = /(?:^|\t)([A-Za-z0-9_]+)=([^\t]*)/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(rest))) fields[match[1]!.toUpperCase()] = match[2] ?? '';
  return { kind, fields };
}

function formatInZone(value: unknown, timeZone: string): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('Invalid command timestamp.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

async function authenticateDevice(request: Request, url: URL): Promise<DeviceContext> {
  const serialNumber = safeField(url.searchParams.get('SN'), 120);
  const token = url.searchParams.get('token') ?? request.headers.get('x-device-token') ?? '';
  if (!serialNumber || !token) throw new HttpError(401, 'Device serial number and token are required.', 'device_unauthorized');
  const ip = getClientIp(request) ?? 'unknown';
  const { data: allowed, error: rateError } = await adminClient.rpc('check_rate_limit', { p_bucket_key: `adms:${serialNumber}:${ip}`, p_limit: 600, p_window_seconds: 60 });
  if (rateError) throw rateError;
  if (!allowed) throw new HttpError(429, 'Device request limit exceeded.', 'rate_limited');
  const { data: deviceId, error: tokenError } = await adminClient.rpc('verify_device_token', { p_serial_number: serialNumber, p_token: token });
  if (tokenError) throw tokenError;
  if (!deviceId) throw new HttpError(401, 'Invalid device token.', 'device_unauthorized');
  const { data, error } = await adminClient.from('attendance_devices').select('id,organization_id,serial_number,name,metadata,organization:organizations(time_zone)').eq('id', deviceId).single();
  if (error) throw error;
  const organization = data.organization as unknown as { time_zone?: string } | null;
  const { error: seenError } = await adminClient.rpc('mark_device_seen', { p_device_id: data.id, p_metadata: { last_ip: ip, user_agent: request.headers.get('user-agent') } });
  if (seenError) throw seenError;
  return { id: data.id, organization_id: data.organization_id, serial_number: data.serial_number, name: data.name, metadata: (data.metadata ?? {}) as Record<string, unknown>, time_zone: organization?.time_zone ?? 'Asia/Jakarta' };
}

async function formatCommand(command: DeviceCommand, device: DeviceContext): Promise<string> {
  const prefix = `C:${command.command_no}:`;
  const payload = command.payload ?? {};
  switch (command.command_type) {
    case 'check':
      return `${prefix}INFO`;
    case 'query_attlog':
      return `${prefix}DATA QUERY ATTLOG StartTime=${formatInZone(payload.from, device.time_zone)}\tEndTime=${formatInZone(payload.to, device.time_zone)}`;
    case 'push_user':
    case 'push_card':
      return `${prefix}DATA UPDATE USERINFO PIN=${safeField(payload.pin, 24)}\tName=${safeField(payload.name, 40)}\tPri=0\tPasswd=\tCard=${safeField(payload.card_number, 32)}\tGrp=1\tTZ=0000000100000000\tVerify=0\tViceCard=`;
    case 'push_finger':
    case 'push_face': {
      const path = safeField(payload.storage_path, 500);
      const { data, error } = await adminClient.storage.from('biometrics').download(path);
      if (error || !data) throw error ?? new Error('Biometric template was not found.');
      const bytes = new Uint8Array(await data.arrayBuffer());
      const binaryDigest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      if (payload.checksum_sha256 && binaryDigest !== payload.checksum_sha256) throw new Error('Biometric template checksum mismatch.');
      const format = safeField(payload.template_format, 64).toLowerCase();
      const template = format.startsWith('zk-text') ? new TextDecoder().decode(bytes).trim() : bytesToBase64(bytes);
      const pin = safeField(payload.pin, 24);
      const slot = Number(payload.slot ?? 0);
      if (command.command_type === 'push_finger') return `${prefix}DATA UPDATE FINGERTMP PIN=${pin}\tFID=${slot}\tSize=${template.length}\tValid=1\tTMP=${template}`;
      return `${prefix}DATA UPDATE FACE PIN=${pin}\tFID=${slot}\tSize=${template.length}\tValid=1\tTMP=${template}`;
    }
    default:
      throw new Error(`Unsupported device command: ${command.command_type}`);
  }
}

async function handleAttendance(request: Request, device: DeviceContext, body: string): Promise<Response> {
  if (body.length > 2_000_000) throw new HttpError(413, 'ADMS attendance payload is too large.', 'payload_too_large');
  const rows = parseAdmsAttLog(body);
  const prepared = await Promise.all(rows.map(async (row) => ({
    device_user_id: row.deviceUserId,
    punched_at: row.punchedAt,
    status_code: row.statusCode,
    verification_mode: row.verificationMode,
    work_code: row.workCode,
    idempotency_key: await createAdmsIdempotencyKey(device.serial_number, row.deviceUserId, row.punchedAt, row.statusCode),
    raw_payload: [row.deviceUserId, row.punchedAt, row.statusCode, row.verificationMode, row.workCode, row.reserved].join('\t')
  })));
  const { data: inserted, error } = await adminClient.rpc('ingest_adms_logs', {
    p_device_id: device.id,
    p_rows: prepared,
    p_source_ip: getClientIp(request),
    p_user_agent: request.headers.get('user-agent')
  });
  if (error) throw error;
  return textResponse(`OK: ${inserted ?? 0}`);
}

async function employeeForPin(device: DeviceContext, pin: string) {
  const byFingerprint = await adminClient.from('employees').select('id,employee_no,full_name').eq('organization_id', device.organization_id).eq('fingerprint_pin', pin).is('deleted_at', null).maybeSingle();
  if (byFingerprint.error) throw byFingerprint.error;
  if (byFingerprint.data) return byFingerprint.data;
  const byEmployeeNo = await adminClient.from('employees').select('id,employee_no,full_name').eq('organization_id', device.organization_id).eq('employee_no', pin).is('deleted_at', null).maybeSingle();
  if (byEmployeeNo.error) throw byEmployeeNo.error;
  return byEmployeeNo.data;
}

async function upsertEnrollment(device: DeviceContext, employeeId: string, fields: Record<string, unknown>) {
  const { data, error } = await adminClient.from('biometric_enrollments').upsert({ organization_id: device.organization_id, employee_id: employeeId, device_id: device.id, ...fields, status: 'synced', last_synced_at: new Date().toISOString(), error_message: null }, { onConflict: 'organization_id,employee_id,device_id' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

async function handleOperationLog(device: DeviceContext, body: string): Promise<Response> {
  if (body.length > 2_000_000) throw new HttpError(413, 'ADMS operation payload is too large.', 'payload_too_large');
  let processed = 0;
  for (const sourceLine of body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
    const { kind, fields } = parseKeyValueLine(sourceLine);
    const pin = safeField(fields.PIN ?? fields.USERID, 24);
    if (!pin) continue;
    const employee = await employeeForPin(device, pin);
    if (!employee) continue;
    if (kind.includes('USER')) {
      await upsertEnrollment(device, employee.id, { device_user_id: pin, pin, card_number: fields.CARD || null, has_card: Boolean(fields.CARD) });
      processed += 1;
      continue;
    }
    if (kind.includes('FP') || kind.includes('FINGER') || kind.includes('FACE')) {
      const template = fields.TMP ?? fields.TEMPLATE ?? '';
      if (!template) continue;
      const assetType = kind.includes('FACE') ? 'face' : 'finger';
      const slot = Number.parseInt(fields.FID ?? fields.ID ?? '0', 10) || 0;
      const bytes = new TextEncoder().encode(template);
      const checksum = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const enrollmentId = await upsertEnrollment(device, employee.id, {
        device_user_id: pin,
        pin,
        has_face: assetType === 'face' ? true : undefined,
        fingerprint_templates: assetType === 'finger' ? Math.max(1, slot + 1) : undefined
      });
      const storagePath = `${device.organization_id}/${employee.id}/${device.id}/${assetType}-${slot}-${checksum.slice(0, 12)}.txt`;
      const { error: uploadError } = await adminClient.storage.from('biometrics').upload(storagePath, bytes, { contentType: 'text/plain', upsert: true, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const { error: assetError } = await adminClient.from('biometric_assets').upsert({ organization_id: device.organization_id, enrollment_id: enrollmentId, employee_id: employee.id, device_id: device.id, asset_type: assetType, slot, template_format: 'zk-text-v1', storage_path: storagePath, checksum_sha256: checksum, byte_size: bytes.byteLength, status: 'synced' }, { onConflict: 'organization_id,enrollment_id,asset_type,slot' });
      if (assetError) throw assetError;
      processed += 1;
    }
  }
  return textResponse(`OK: ${processed}`);
}

async function handleCommandResult(request: Request, device: DeviceContext): Promise<Response> {
  const body = await readTextBody(request, 64_000);
  const idMatch = body.match(/(?:^|[&\s])ID=(\d+)/i);
  const returnMatch = body.match(/(?:^|[&\s])Return=(-?\d+)/i);
  if (!idMatch) throw new HttpError(400, 'Command result is missing ID.', 'invalid_command_result');
  const commandNo = Number(idMatch[1]);
  const returnCode = Number(returnMatch?.[1] ?? -1);
  const { error } = await adminClient.rpc('complete_device_command_by_no', {
    p_device_id: device.id,
    p_command_no: commandNo,
    p_succeeded: returnCode === 0,
    p_result: { return_code: returnCode, raw: body.slice(0, 10000) },
    p_error_message: returnCode === 0 ? null : `Device returned ${returnCode}`
  });
  if (error) throw error;
  return textResponse('OK');
}

function optionResponse(device: DeviceContext): Response {
  const stamp = Math.floor(Date.now() / 1000);
  return textResponse([
    `GET OPTION FROM: ${device.serial_number}`,
    `Stamp=${stamp}`,
    `OpStamp=${stamp}`,
    'ErrorDelay=60',
    'Delay=10',
    'TransTimes=00:00;06:00;12:00;18:00',
    'TransInterval=1',
    'TransFlag=TransData AttLog OpLog EnrollUser ChgUser EnrollFP ChgFP UserPic',
    'Realtime=1',
    'Encrypt=0'
  ].join('\n'));
}

Deno.serve(async (request) => {
  const requestCorrelationId = correlationId(request);
  if (request.method === 'OPTIONS') return optionsResponse();
  try {
    const url = new URL(request.url);
    const device = await authenticateDevice(request, url);
    const route = classifyAdmsPath(url.pathname);
    if (route === 'getrequest') {
      const { data, error } = await adminClient.rpc('claim_device_command', { p_device_id: device.id });
      if (error) throw error;
      if (!data) return textResponse('OK');
      const command = data as DeviceCommand;
      try { return textResponse(await formatCommand(command, device)); }
      catch (formatError) {
        await adminClient.rpc('complete_device_command', { p_command_id: command.id, p_succeeded: false, p_result: {}, p_error_message: formatError instanceof Error ? formatError.message : 'Command formatting failed' });
        throw formatError;
      }
    }
    if (route === 'devicecmd') return handleCommandResult(request, device);
    if (route === 'registry') return optionResponse(device);
    if (route === 'cdata') {
      if (request.method === 'GET') return optionResponse(device);
      if (request.method !== 'POST') throw new HttpError(405, 'Only GET and POST are supported.', 'method_not_allowed');
      const table = (url.searchParams.get('table') ?? 'ATTLOG').toUpperCase();
      const body = await readTextBody(request, 2_000_000);
      if (table === 'ATTLOG') return handleAttendance(request, device, body);
      if (['OPERLOG', 'USER', 'FINGERTMP', 'FACE'].includes(table)) return handleOperationLog(device, body);
      return textResponse('OK');
    }
    if (route === 'health') return textResponse('OK');
    throw new HttpError(404, 'ADMS route was not found.', 'not_found');
  } catch (error) {
    const response = errorResponse(error, requestCorrelationId);
    const body = await response.json().catch(() => ({ message: 'ERROR' })) as { message?: string };
    return textResponse(`ERROR: ${body.message ?? 'Request failed'}`, response.status);
  }
});

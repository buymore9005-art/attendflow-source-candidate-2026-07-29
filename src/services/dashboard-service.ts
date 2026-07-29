import { getSupabase } from '@/lib/supabase';

export interface DashboardKpis {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  fingerprintConnected: number;
  fingerprintUnconnected: number;
  presentToday: number;
  lateToday: number;
  earlyLeaveToday: number;
  absentToday: number;
  permitToday: number;
  sickToday: number;
  leaveToday: number;
  overtimeToday: number;
  workMinutesToday: number;
  payrollToday: number;
  payrollMonth: number;
  devicesOnline: number;
  devicesOffline: number;
}

export interface SeriesPoint { label: string; value: number; secondary?: number }
export interface StatusPoint { name: string; value: number }
export interface DashboardActivity { id: string; action: string; entity_type: string | null; created_at: string; actor: string | null }
export interface DashboardNotification { id: string; title_key: string; message_key: string; params: Record<string, string | number>; severity: string; created_at: string; read_at: string | null }
export interface DashboardData {
  kpis: DashboardKpis;
  dailyAttendance: SeriesPoint[];
  monthlyAttendance: SeriesPoint[];
  lateness: SeriesPoint[];
  overtime: SeriesPoint[];
  payroll: SeriesPoint[];
  status: StatusPoint[];
  recentActivity: DashboardActivity[];
  notifications: DashboardNotification[];
}

const emptyKpis: DashboardKpis = {
  totalEmployees: 0, activeEmployees: 0, inactiveEmployees: 0,
  fingerprintConnected: 0, fingerprintUnconnected: 0,
  presentToday: 0, lateToday: 0, earlyLeaveToday: 0, absentToday: 0,
  permitToday: 0, sickToday: 0, leaveToday: 0, overtimeToday: 0,
  workMinutesToday: 0, payrollToday: 0, payrollMonth: 0,
  devicesOnline: 0, devicesOffline: 0
};

function asNumber(value: unknown): number { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function points(value: unknown): SeriesPoint[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    label: String((item as Record<string, unknown>).label ?? ''),
    value: asNumber((item as Record<string, unknown>).value),
    secondary: (item as Record<string, unknown>).secondary === undefined ? undefined : asNumber((item as Record<string, unknown>).secondary)
  }));
}
function statusPoints(value: unknown): StatusPoint[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({ name: String((item as Record<string, unknown>).name ?? ''), value: asNumber((item as Record<string, unknown>).value) }));
}

export async function getDashboardData(organizationId: string, date: string): Promise<DashboardData> {
  const { data, error } = await getSupabase().rpc('get_dashboard_summary', { p_organization_id: organizationId, p_date: date });
  if (error) throw error;
  const raw = (data ?? {}) as Record<string, unknown>;
  const rawKpis = (raw.kpis ?? {}) as Record<string, unknown>;
  const kpis = Object.fromEntries(Object.keys(emptyKpis).map((key) => [key, asNumber(rawKpis[key])])) as unknown as DashboardKpis;
  return {
    kpis,
    dailyAttendance: points(raw.dailyAttendance),
    monthlyAttendance: points(raw.monthlyAttendance),
    lateness: points(raw.lateness),
    overtime: points(raw.overtime),
    payroll: points(raw.payroll),
    status: statusPoints(raw.status),
    recentActivity: Array.isArray(raw.recentActivity) ? raw.recentActivity as DashboardActivity[] : [],
    notifications: Array.isArray(raw.notifications) ? raw.notifications as DashboardNotification[] : []
  };
}

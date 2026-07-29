import { useQuery } from '@tanstack/react-query';
import { Activity, Banknote, BriefcaseBusiness, CalendarCheck, CircleOff, ClockAlert, ClockArrowDown, Fingerprint, HeartPulse, Laptop, LoaderCircle, Palmtree, ShieldAlert, Timer, UserCheck, UserMinus, Users } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/data-table/DataStates';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from '@/context/LocaleContext';
import type { TranslationParams } from '@/i18n/translator';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { getDashboardData, type SeriesPoint } from '@/services/dashboard-service';

interface KpiCardProps { title: string; value: string; icon: ReactNode; hint?: string }
function KpiCard({ title, value, icon, hint }: KpiCardProps) {
  return <Card className="overflow-hidden"><CardContent className="flex items-start gap-3 p-4"><div className="rounded-xl bg-primary/10 p-2.5 text-primary">{icon}</div><div className="min-w-0"><p className="truncate text-xs font-medium text-muted-foreground">{title}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div></CardContent></Card>;
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="h-72">{children}</CardContent></Card>;
}

function EmptyChart({ label }: { label: string }) { return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{label}</div>; }
function axisTick(value: number): string { return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value); }

function localizeSeries(points: SeriesPoint[], locale: string): SeriesPoint[] {
  return points.map((point) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(point.label)) {
      return { ...point, label: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(new Date(`${point.label}T00:00:00`)) };
    }
    if (/^\d{4}-\d{2}$/.test(point.label)) {
      return { ...point, label: new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(new Date(`${point.label}-01T00:00:00`)) };
    }
    return point;
  });
}

function translateAuditAction(action: string, t: (key: string, params?: TranslationParams) => string): string {
  const keyByAction: Record<string, string> = {
    insert: 'common.add', create: 'common.add', update: 'common.edit', edit: 'common.edit', delete: 'common.delete',
    login: 'auth.login', logout: 'auth.logout', import: 'common.importExcel', export: 'common.exportExcel',
    print: 'common.print', sync: 'common.sync', backup: 'settings.backup', restore: 'settings.restore'
  };
  return t(keyByAction[action.toLowerCase()] ?? action);
}

function translateEntity(entity: string | null, t: (key: string, params?: TranslationParams) => string): string {
  if (!entity) return t('common.system');
  const keyByEntity: Record<string, string> = { employees: 'menu.employeeData', attendance_records: 'menu.attendance', attendance_devices: 'menu.devices', biometric_enrollments: 'menu.biometricSync', payroll_runs: 'menu.payrollRuns', payroll_items: 'payroll.payslip', leave_requests: 'menu.leave', organization_members: 'menu.users', role_permissions: 'menu.roles', organization_settings: 'menu.settings', integrations: 'menu.integrations' };
  return t(keyByEntity[entity] ?? entity);
}
function ChartFrame({ data, type = 'bar' }: { data: SeriesPoint[]; type?: 'bar' | 'line' | 'area' }) {
  if (data.length === 0) return <EmptyChart label="—" />;
  const common = <><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={axisTick} /><ChartTooltip /></>;
  if (type === 'line') return <ResponsiveContainer width="100%" height="100%"><LineChart data={data}>{common}<Line type="monotone" dataKey="value" stroke="currentColor" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>;
  if (type === 'area') return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data}>{common}<Area type="monotone" dataKey="value" stroke="currentColor" fill="currentColor" fillOpacity={0.15} /></AreaChart></ResponsiveContainer>;
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={data}>{common}<Bar dataKey="value" fill="currentColor" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>;
}

export default function DashboardPage() {
  const { t, locale } = useLocale();
  const { activeMembership } = useAuth();
  const organizationId = activeMembership?.organization_id ?? '';
  const timeZone = activeMembership?.organization?.time_zone ?? 'Asia/Jakarta';
  const today = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()), [timeZone]);
  const queryKey = useMemo(() => ['dashboard', organizationId, today] as const, [organizationId, today]);
  const query = useQuery({ queryKey, queryFn: () => getDashboardData(organizationId, today), enabled: Boolean(organizationId), refetchInterval: 60_000 });

  if (query.isPending) return <div className="space-y-6"><div><h1 className="text-3xl font-semibold">{t('dashboard.title')}</h1><p className="text-muted-foreground">{t('dashboard.subtitle')}</p></div><TableSkeleton columns={6} rows={4} /></div>;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  const data = query.data;
  if (!data) return <EmptyState />;
  const k = data.kpis;
  const kpis: KpiCardProps[] = [
    { title: t('dashboard.totalEmployees'), value: String(k.totalEmployees), icon: <Users /> },
    { title: t('dashboard.activeEmployees'), value: String(k.activeEmployees), icon: <UserCheck /> },
    { title: t('dashboard.inactiveEmployees'), value: String(k.inactiveEmployees), icon: <UserMinus /> },
    { title: t('dashboard.fingerprintConnected'), value: String(k.fingerprintConnected), icon: <Fingerprint /> },
    { title: t('dashboard.fingerprintUnconnected'), value: String(k.fingerprintUnconnected), icon: <CircleOff /> },
    { title: t('dashboard.presentToday'), value: String(k.presentToday), icon: <CalendarCheck /> },
    { title: t('dashboard.lateToday'), value: String(k.lateToday), icon: <ClockAlert /> },
    { title: t('dashboard.earlyLeaveToday'), value: String(k.earlyLeaveToday), icon: <ClockArrowDown /> },
    { title: t('dashboard.absentToday'), value: String(k.absentToday), icon: <ShieldAlert /> },
    { title: t('dashboard.permitToday'), value: String(k.permitToday), icon: <BriefcaseBusiness /> },
    { title: t('dashboard.sickToday'), value: String(k.sickToday), icon: <HeartPulse /> },
    { title: t('dashboard.leaveToday'), value: String(k.leaveToday), icon: <Palmtree /> },
    { title: t('dashboard.overtimeToday'), value: String(k.overtimeToday), icon: <Timer /> },
    { title: t('dashboard.workHoursToday'), value: `${(k.workMinutesToday / 60).toFixed(1)} ${t('common.hoursShort')}`, icon: <Activity /> },
    { title: t('dashboard.payrollToday'), value: formatCurrency(k.payrollToday, locale, 'IDR'), icon: <Banknote /> },
    { title: t('dashboard.payrollMonth'), value: formatCurrency(k.payrollMonth, locale, 'IDR'), icon: <Banknote /> },
    { title: t('dashboard.devicesOnline'), value: String(k.devicesOnline), icon: <Laptop /> },
    { title: t('dashboard.devicesOffline'), value: String(k.devicesOffline), icon: <CircleOff /> }
  ];
  const localizedDailyAttendance = localizeSeries(data.dailyAttendance, locale);
  const localizedMonthlyAttendance = localizeSeries(data.monthlyAttendance, locale);
  const localizedLateness = localizeSeries(data.lateness, locale);
  const localizedOvertime = localizeSeries(data.overtime, locale);
  const localizedPayroll = localizeSeries(data.payroll, locale);
  const localizedStatus = data.status.map((item) => ({ ...item, name: t(`attendance.${item.name}`) }));
  const severityKey = (severity: string) => ['success', 'warning', 'info', 'error'].includes(severity) ? `common.${severity}` : severity;
  return <div className="space-y-6"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('dashboard.title')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('dashboard.subtitle')}</p></div>{query.isFetching && <LoaderCircle className="size-5 animate-spin text-muted-foreground" />}</div>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{kpis.map((item) => <KpiCard key={item.title} {...item} />)}</section>
    <section className="grid gap-4 xl:grid-cols-2"><ChartCard title={t('dashboard.dailyAttendance')}><ChartFrame data={localizedDailyAttendance} type="area" /></ChartCard><ChartCard title={t('dashboard.monthlyAttendance')}><ChartFrame data={localizedMonthlyAttendance} /></ChartCard><ChartCard title={t('dashboard.latenessChart')}><ChartFrame data={localizedLateness} type="line" /></ChartCard><ChartCard title={t('dashboard.overtimeChart')}><ChartFrame data={localizedOvertime} /></ChartCard><ChartCard title={t('dashboard.payrollChart')}><ChartFrame data={localizedPayroll} type="area" /></ChartCard><ChartCard title={t('dashboard.statusChart')}>{localizedStatus.length === 0 ? <EmptyChart label="—" /> : <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={localizedStatus} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} label>{localizedStatus.map((entry) => <Cell key={entry.name} fill="currentColor" fillOpacity={0.25 + (entry.value % 5) * 0.12} />)}</Pie><ChartTooltip /></PieChart></ResponsiveContainer>}</ChartCard></section>
    <section className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>{t('dashboard.recentActivity')}</CardTitle></CardHeader><CardContent className="space-y-3">{data.recentActivity.length === 0 ? <EmptyState /> : data.recentActivity.map((activity) => <div key={activity.id} className="flex items-start gap-3 border-b pb-3 last:border-0"><div className="mt-1 rounded-full bg-muted p-2"><Activity className="size-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium">{translateAuditAction(activity.action, t)}</p><p className="truncate text-xs text-muted-foreground">{activity.actor ?? t('audit.systemActor')} · {translateEntity(activity.entity_type, t)}</p></div><time className="text-xs text-muted-foreground">{formatDateTime(activity.created_at, locale)}</time></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>{t('dashboard.systemNotifications')}</CardTitle><CardDescription>{t('common.today')}</CardDescription></CardHeader><CardContent className="space-y-3">{data.notifications.length === 0 ? <EmptyState /> : data.notifications.map((notification) => <div key={notification.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-2"><p className="font-medium">{t(notification.title_key, notification.params)}</p><Badge variant={notification.severity === 'error' ? 'destructive' : notification.severity === 'warning' ? 'secondary' : 'outline'}>{t(severityKey(notification.severity))}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{t(notification.message_key, notification.params)}</p><p className="mt-2 text-xs text-muted-foreground">{formatDateTime(notification.created_at, locale)}</p></div>)}</CardContent></Card></section>
  </div>;
}

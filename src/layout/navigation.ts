import {
  Activity, Building2, CalendarClock, CalendarDays, CalendarRange, ClipboardCheck, Clock3, ContactRound,
  DatabaseZap, Fingerprint, History, KeyRound, LayoutDashboard, ListChecks, Network,
  ScrollText, Settings, ShieldCheck, SlidersHorizontal, UserPlus, Users, WalletCards
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavigationItem {
  labelKey: string;
  path: string;
  icon: LucideIcon;
  permission?: string;
}
export interface NavigationGroup { labelKey?: string; items: NavigationItem[] }

export const navigationGroups: NavigationGroup[] = [
  { items: [{ labelKey: 'menu.dashboard', path: '/', icon: LayoutDashboard, permission: 'dashboard.read' }] },
  { labelKey: 'menu.employees', items: [
    { labelKey: 'menu.employeeData', path: '/employees', icon: Users, permission: 'employees.read' },
    { labelKey: 'menu.employeeRegistration', path: '/employees/register', icon: UserPlus, permission: 'employees.create' },
    { labelKey: 'menu.departments', path: '/departments', icon: Building2, permission: 'organization.read' },
    { labelKey: 'menu.positions', path: '/positions', icon: ContactRound, permission: 'organization.read' }
  ] },
  { labelKey: 'menu.devices', items: [
    { labelKey: 'menu.devices', path: '/devices', icon: Fingerprint, permission: 'devices.read' },
    { labelKey: 'menu.biometricSync', path: '/biometrics', icon: DatabaseZap, permission: 'devices.read' }
  ] },
  { labelKey: 'menu.attendance', items: [
    { labelKey: 'menu.attendanceDaily', path: '/attendance/daily', icon: ClipboardCheck, permission: 'attendance.read' },
    { labelKey: 'menu.attendanceMonthly', path: '/attendance/monthly', icon: CalendarDays, permission: 'attendance.read' },
    { labelKey: 'menu.attendanceHistory', path: '/attendance/history', icon: History, permission: 'attendance.read' },
    { labelKey: 'menu.attendanceRecap', path: '/attendance/recap', icon: ListChecks, permission: 'attendance.read' },
    { labelKey: 'menu.shifts', path: '/shifts', icon: Clock3, permission: 'shifts.read' },
    { labelKey: 'menu.holidays', path: '/holidays', icon: CalendarRange, permission: 'settings.read' },
    { labelKey: 'menu.leave', path: '/leave', icon: CalendarClock, permission: 'leave.read' }
  ] },
  { labelKey: 'menu.payroll', items: [
    { labelKey: 'menu.payrollRuns', path: '/payroll/runs', icon: WalletCards, permission: 'payroll.read' },
    { labelKey: 'menu.payrollSettings', path: '/payroll/settings', icon: SlidersHorizontal, permission: 'payroll.settings' }
  ] },
  { labelKey: 'menu.integrations', items: [
    { labelKey: 'menu.deli', path: '/integrations/deli', icon: Network, permission: 'integrations.read' },
    { labelKey: 'menu.integrationLogs', path: '/integrations/logs', icon: Activity, permission: 'integrations.read' }
  ] },
  { labelKey: 'menu.organization', items: [
    { labelKey: 'menu.users', path: '/users', icon: KeyRound, permission: 'users.read' },
    { labelKey: 'menu.roles', path: '/roles', icon: ShieldCheck, permission: 'roles.read' },
    { labelKey: 'menu.audit', path: '/audit', icon: ScrollText, permission: 'audit.read' },
    { labelKey: 'menu.settings', path: '/settings', icon: Settings, permission: 'settings.read' }
  ] }
];

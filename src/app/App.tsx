import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppProviders } from '@/context/AppProviders';
import { AppShell } from '@/layout/AppShell';
import { PermissionRoute } from '@/middleware/PermissionRoute';
import { ProtectedRoute } from '@/middleware/ProtectedRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { OnboardingPage } from '@/pages/auth/OnboardingPage';
import { ConfigurationPage } from '@/pages/settings/ConfigurationPage';
import { env } from '@/lib/env';
import { useLocale } from '@/context/LocaleContext';

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'));
const EmployeesPage = lazy(() => import('@/pages/employees/EmployeesPage'));
const EmployeeRegistrationPage = lazy(() => import('@/pages/employees/EmployeeRegistrationPage'));
const DepartmentsPage = lazy(() => import('@/pages/organization/MasterDataPages').then((module) => ({ default: module.DepartmentsPage })));
const PositionsPage = lazy(() => import('@/pages/organization/MasterDataPages').then((module) => ({ default: module.PositionsPage })));
const ShiftsPage = lazy(() => import('@/pages/organization/MasterDataPages').then((module) => ({ default: module.ShiftsPage })));
const HolidaysPage = lazy(() => import('@/pages/organization/MasterDataPages').then((module) => ({ default: module.HolidaysPage })));
const DevicesPage = lazy(() => import('@/pages/devices/DevicesPage'));
const BiometricsPage = lazy(() => import('@/pages/devices/BiometricsPage'));
const AttendanceDailyPage = lazy(() => import('@/pages/attendance/AttendancePages').then((module) => ({ default: module.AttendanceDailyPage })));
const AttendanceMonthlyPage = lazy(() => import('@/pages/attendance/AttendancePages').then((module) => ({ default: module.AttendanceMonthlyPage })));
const AttendanceHistoryPage = lazy(() => import('@/pages/attendance/AttendancePages').then((module) => ({ default: module.AttendanceHistoryPage })));
const AttendanceRecapPage = lazy(() => import('@/pages/attendance/AttendancePages').then((module) => ({ default: module.AttendanceRecapPage })));
const LeavePage = lazy(() => import('@/pages/attendance/LeavePage'));
const PayrollRunsPage = lazy(() => import('@/pages/payroll/PayrollRunsPage'));
const PayrollSettingsPage = lazy(() => import('@/pages/payroll/PayrollSettingsPage'));
const DeliIntegrationPage = lazy(() => import('@/pages/integrations/IntegrationPages').then((module) => ({ default: module.DeliIntegrationPage })));
const IntegrationLogsPage = lazy(() => import('@/pages/integrations/IntegrationPages').then((module) => ({ default: module.IntegrationLogsPage })));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'));
const RolesPage = lazy(() => import('@/pages/admin/RolesPage'));
const AuditPage = lazy(() => import('@/pages/admin/AuditPage'));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'));
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'));
const NotFoundPage = lazy(() => import('@/pages/errors/NotFoundPage'));

function LoadingScreen() { const { t } = useLocale(); return <div className="flex min-h-[60vh] items-center justify-center"><div className="size-9 animate-spin rounded-full border-4 border-muted border-t-primary" role="status" aria-label={t('common.loading')} /></div>; }
function Guard({ permission, children }: { permission: string; children: ReactNode }) { return <PermissionRoute permission={permission}>{children}</PermissionRoute>; }

function ApplicationRoutes() {
  return <BrowserRouter><Suspense fallback={<LoadingScreen />}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/onboarding" element={<OnboardingPage />} />
    <Route element={<ProtectedRoute />}><Route element={<AppShell />}>
      <Route index element={<Guard permission="dashboard.read"><DashboardPage /></Guard>} />
      <Route path="employees" element={<Guard permission="employees.read"><EmployeesPage /></Guard>} />
      <Route path="employees/register" element={<Guard permission="employees.create"><EmployeeRegistrationPage /></Guard>} />
      <Route path="departments" element={<Guard permission="organization.read"><DepartmentsPage /></Guard>} />
      <Route path="positions" element={<Guard permission="organization.read"><PositionsPage /></Guard>} />
      <Route path="devices" element={<Guard permission="devices.read"><DevicesPage /></Guard>} />
      <Route path="biometrics" element={<Guard permission="devices.read"><BiometricsPage /></Guard>} />
      <Route path="attendance/daily" element={<Guard permission="attendance.read"><AttendanceDailyPage /></Guard>} />
      <Route path="attendance/monthly" element={<Guard permission="attendance.read"><AttendanceMonthlyPage /></Guard>} />
      <Route path="attendance/history" element={<Guard permission="attendance.read"><AttendanceHistoryPage /></Guard>} />
      <Route path="attendance/recap" element={<Guard permission="attendance.read"><AttendanceRecapPage /></Guard>} />
      <Route path="shifts" element={<Guard permission="shifts.read"><ShiftsPage /></Guard>} />
      <Route path="holidays" element={<Guard permission="settings.read"><HolidaysPage /></Guard>} />
      <Route path="leave" element={<Guard permission="leave.read"><LeavePage /></Guard>} />
      <Route path="payroll/runs" element={<Guard permission="payroll.read"><PayrollRunsPage /></Guard>} />
      <Route path="payroll/settings" element={<Guard permission="payroll.settings"><PayrollSettingsPage /></Guard>} />
      <Route path="integrations/deli" element={<Guard permission="integrations.read"><DeliIntegrationPage /></Guard>} />
      <Route path="integrations/logs" element={<Guard permission="integrations.read"><IntegrationLogsPage /></Guard>} />
      <Route path="users" element={<Guard permission="users.read"><UsersPage /></Guard>} />
      <Route path="roles" element={<Guard permission="roles.read"><RolesPage /></Guard>} />
      <Route path="audit" element={<Guard permission="audit.read"><AuditPage /></Guard>} />
      <Route path="settings" element={<Guard permission="settings.read"><SettingsPage /></Guard>} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route></Route>
  </Routes></Suspense></BrowserRouter>;
}

export function App() {
  return <AppProviders><ErrorBoundary>{env.configured ? <ApplicationRoutes /> : <ConfigurationPage />}</ErrorBoundary></AppProviders>;
}

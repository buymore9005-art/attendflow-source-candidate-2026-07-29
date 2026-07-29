# Attendance & Payroll Management System — Design Specification

## 1. Product Boundary

The product is a multilingual, multi-tenant attendance and payroll single-page application for Indonesian companies. React runs on Vercel. Supabase provides PostgreSQL, Auth, Storage, Realtime, and Edge Functions. No Firebase or self-hosted application server is used.

The browser never receives service-role credentials, Deli E+ secrets, SMTP credentials, or device shared secrets. Those remain in Supabase Edge Function secrets. Browser access uses the Supabase publishable/anon key and complete Row Level Security.

## 2. Deployment Topology

- **Vercel:** static Vite build with SPA rewrites.
- **Supabase Auth:** email/password authentication and session management.
- **Supabase PostgreSQL:** all transactional data, permissions, audit logs, payroll calculations, integration jobs, and application settings.
- **Supabase Storage:** company logos and employee/documents buckets protected by storage policies.
- **Supabase Realtime:** change feeds for attendance events, device state, notifications, and integration jobs.
- **Supabase Edge Functions:** privileged operations, vendor API calls, ADMS/PUSH endpoints, Deli E+ signing, webhook ingestion, scheduled sync entry points, export generation when server-side processing is needed, and application-level rate limiting.
- **Optional LAN bridge:** only for devices that cannot initiate cloud HTTP/HTTPS requests and expose a LAN-only vendor SDK/TCP protocol. The main repository includes its protocol contract and setup guide but the web app remains usable without it.

## 3. Tenancy and Authorization

Every business row carries `organization_id`. Membership is stored in `organization_members`; roles are `admin`, `hr`, `supervisor`, `finance`, `manager`, `leader`, and `viewer`. Fine-grained grants are stored in `role_permissions`, with database helper functions checking membership and permission. RLS isolates organizations and prevents direct privilege escalation.

Privileged user administration is performed through the `admin-users` Edge Function because creating Auth users requires a secret key. Normal profile updates use RLS-protected tables.

## 4. Frontend Architecture

The application uses feature-first modules inside the required top-level folders:

- `components/`: reusable visual and data components.
- `pages/`: route-level pages.
- `layout/`: application shell and responsive sidebar.
- `hooks/`: query, table, debounce, online-state, and permission hooks.
- `context/`: auth, locale, and organization providers.
- `services/`: typed Supabase repositories, imports/exports, integrations, and storage.
- `utils/`: pure calculations, date/time, validation, sanitization, and formatting.
- `types/`: domain, database, table, and integration types.
- `middleware/`: route and permission guards.
- `sql/`: complete bootstrap SQL and initial backup.
- `docs/`: installation, operations, integration, API, ERD, testing, and troubleshooting.
- `assets/`: static product assets.

TanStack Query owns server state. Zustand owns durable UI state such as sidebar, theme, locale, and table density. React Hook Form and Zod own forms and localized validation. TanStack Table drives common grid behavior. Optional persisted query storage provides a bounded offline read cache; business mutations are never reported as successful until Supabase accepts them.

## 5. Universal Data Page Contract

All list pages render through a reusable `DataPage`/`DataTable` contract supporting:

- debounced search, advanced filters, reset, multi-column sort, pagination, refresh;
- single/multiple/all selection, bulk delete, and bulk update;
- Excel/CSV/PDF export, print, and Excel import where the entity is importable;
- loading overlay, skeleton, empty state, and error state;
- responsive columns and accessible keyboard controls;
- virtualization for large loaded result sets.

Actions are permission-aware and destructive mutations require confirmation.

## 6. Core Domains

### Employees

Employees include generated employee number, NIK, identity/contact/bank/emergency data, employment state, department, position, shift, BPJS/NPWP, photos/documents, and notes. Registration is a validated wizard with preview and uploads.

### Devices and Biometrics

Devices track vendor, model, IP/port, serial, firmware, location, heartbeat, online state, sync policy, retry state, and credentials by secret reference. Biometric links record PIN, card, face/fingerprint availability, template counts, and last sync. Integration jobs are durable and idempotent.

### Attendance and Shifts

Raw punches are immutable ingestion records. Attendance records are derived/maintained with clock-in/out, breaks, overtime, lateness, early departure, location, device, shift, notes, and status. Shift calculations support fixed/rotating/night/off shifts, grace periods, cross-midnight windows, and automatic overtime.

### Payroll

Payroll profiles define daily/monthly pay, overtime, late/absence/early-leave deductions, bonuses, tax, BPJS, workday policy, and holidays. Payroll runs freeze a period and create line items and employee payslips. Approval state and history are immutable after finalization except through an auditable reversal.

### Audit and Settings

Mutation triggers write row-level audit entries. Edge Functions add request metadata (IP, browser/user agent, device, correlation ID). Settings include company identity, locale/time zone, work calendar, numbering, payroll, SMTP references, fingerprint/ADMS, backup metadata, and feature flags.

## 7. Integrations

### ZKTeco / ADMS / Solution Time

The `adms` Edge Function accepts device-initiated HTTP requests, validates configured serial/shared secret or allow-list, stores raw payloads, parses known attendance/user operations, and enqueues normalized jobs. Responses use plain text where required. Since protocol variants are firmware-specific and official specifications are normally supplied to integrators, parsing is conservative and raw payloads are retained.

Outbound push-user/push-finger/push-face/push-card commands are represented as device command jobs. Cloud-capable devices poll/receive them according to their firmware. LAN-only SDK devices need the optional bridge contract described in the guide.

### Deli E+

The `deli-sync` Edge Function implements the documented `App-Key`, millisecond timestamp, and MD5 signature based on path + timestamp + key + secret. It supports employee, device, attendance, and payroll-sync job types, retries with exponential backoff, logs every call, and never exposes secrets to the browser. Vendor-issued credentials and permitted modules/endpoints are prerequisites.

## 8. Security

- RLS on every exposed table and storage bucket.
- Database constraints and guarded SQL functions for backend validation.
- Zod validation and text normalization on the client.
- React rendering avoids unsafe HTML; exported text is spreadsheet-formula escaped.
- Browser uses publishable/anon key only; privileged keys remain in Edge Functions.
- CSRF-resistant bearer-token API access, strict CORS allow-list, request origin checks, replay-resistant vendor signatures where supported, and request rate-limit records.
- Audit triggers, immutable raw punches, soft deletion for business records, and restricted hard deletion.
- Error boundary, structured errors, correlation IDs, and sanitized user-facing messages.

## 9. Internationalization and Accessibility

All product copy is keyed and supplied in Indonesian, English, and Simplified Chinese. Locale changes update menus, buttons, dialogs, validation, notifications, tables, filters, calendar labels, and errors without a reload. Dates/numbers/currency use `Intl`. The UI supports keyboard navigation, focus management, semantic labels, contrast-aware light/dark themes, and reduced-motion preferences.

## 10. Testing and Acceptance

Automated checks include TypeScript, ESLint, Vitest unit/component tests, SQL lint/smoke scripts, and a production Vite build. The repository contains manual test matrices for every module and integration. Hardware/API integration cannot be truthfully certified without vendor credentials, compatible firmware, and physical devices; the repository therefore includes deterministic parsers, mock fixtures, and runbooks for on-site acceptance.

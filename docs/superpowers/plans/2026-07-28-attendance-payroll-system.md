# Attendance & Payroll Management System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a deployable React 19 + Vite + Supabase attendance and payroll repository with multilingual UI, secure multi-tenant SQL, core operational modules, integration Edge Functions, tests, and complete setup documentation.

**Architecture:** A Vercel-hosted React SPA communicates with Supabase through the publishable key under RLS. Supabase PostgreSQL, Auth, Storage, Realtime, and Edge Functions provide all persistence and privileged integration behavior; a documented optional local bridge is used only for LAN-only fingerprint devices.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS, shadcn-style Radix components, React Router, React Hook Form, Zod, TanStack Table, TanStack Query, Zustand, Supabase JS, Recharts, SheetJS, jsPDF, and Vitest.

## Global Constraints

- No Firebase and no self-hosted backend server.
- All business data is stored in Supabase.
- Deployment flow is GitHub → import SQL → environment variables → Vercel.
- Languages are Indonesian, English, and Simplified Chinese, changed at runtime.
- Browser code must never contain service-role, Deli, SMTP, or device secrets.
- All exposed tables and storage objects must be protected by RLS.
- All data pages use the shared search/filter/sort/pagination/import/export/select/bulk/refresh/state contract.
- No source-code placeholders or fake production credentials.

---

### Task 1: Repository and quality foundation

**Files:** `package.json`, Vite/TypeScript/Tailwind/ESLint/Vitest configs, `src/main.tsx`, `src/app/App.tsx`, `vercel.json`, `.env.example`, GitHub Actions.

**Produces:** A React 19 application that type-checks, tests, and builds with deterministic scripts.

- [ ] Create dependency and tooling configuration with exact scripts for `dev`, `build`, `typecheck`, `lint`, `test`, `test:coverage`, and `check`.
- [ ] Add a failing smoke test that imports `App` and expects the application shell.
- [ ] Implement the root providers and shell until the smoke test passes.
- [ ] Run `npm run check` and commit the foundation.

### Task 2: Domain types, localization, theme, and auth state

**Files:** `src/types/*`, `src/context/*`, `src/stores/*`, `src/lib/supabase.ts`, `src/middleware/*`, locale dictionaries and tests.

**Produces:** Typed domain contracts, three-language runtime translation, persistent theme/sidebar locale state, and protected routes.

- [ ] Test locale fallback, interpolation, and immediate language switching.
- [ ] Implement complete dictionaries for shared UI and every route/module label.
- [ ] Test auth/permission guard behavior with mocked sessions.
- [ ] Implement AuthProvider, organization membership loading, and permission helpers.

### Task 3: Reusable UI and universal data page

**Files:** `src/components/ui/*`, `src/components/data-table/*`, `src/hooks/use-data-table.ts`, `src/services/export-service.ts`, `src/services/import-service.ts` and tests.

**Produces:** Accessible shadcn-style components and a generic list page with all required table actions and states.

- [ ] Test filters, selection, reset, paging, and bulk-action enablement.
- [ ] Implement server-ready TanStack Table state and virtual rows.
- [ ] Test CSV formula escaping and import normalization.
- [ ] Implement CSV/XLSX/PDF/print export and XLSX import.

### Task 4: Supabase schema, RLS, storage, realtime, seed, and backup

**Files:** `sql/000_full_schema.sql`, `sql/001_seed.sql`, `sql/initial_backup.sql`, `supabase/config.toml`, SQL smoke script.

**Produces:** Idempotent schema with extensions, enums, tables, constraints, indexes, views, functions, triggers, policies, buckets, publications, and demo seed routine.

- [ ] Define organization, IAM, HR, device, attendance, leave, payroll, integration, audit, notification, settings, and rate-limit tables.
- [ ] Add generated numbering, attendance/payroll calculation procedures, audit triggers, dashboard views, and maintenance procedures.
- [ ] Enable RLS and write explicit per-operation policies using organization membership and permission functions.
- [ ] Create storage buckets/policies and add selected tables to Realtime publication.

### Task 5: Dashboard and application navigation

**Files:** `src/layout/*`, `src/pages/dashboard/*`, navigation definitions, dashboard repository and tests.

**Produces:** Responsive persistent auto-collapsing sidebar and dashboard KPIs/charts/activity/notifications backed by a dashboard RPC/view.

- [ ] Test sidebar persistence and mobile closure behavior.
- [ ] Implement nested navigation with role/permission filtering.
- [ ] Test KPI mapping for empty and populated dashboard results.
- [ ] Implement responsive KPI cards, Recharts charts, recent activity, and notification panels.

### Task 6: Employees and registration wizard

**Files:** employee pages/components/schemas/repository, document upload service, tests.

**Produces:** Employee CRUD/list, advanced filters/import/export/bulk actions, photo preview, and validated multi-step registration with storage uploads.

- [ ] Test localized employee schema and generated ID flow.
- [ ] Implement list/detail/edit pages through the universal data page.
- [ ] Test wizard step validation, review data, and upload path generation.
- [ ] Implement transactional registration RPC call and protected storage uploads.

### Task 7: Devices, biometric synchronization, and integration jobs

**Files:** device/biometric pages and services, Edge Function shared code, `adms`, `device-command`, tests/fixtures.

**Produces:** Device CRUD/status/test/sync UI, employee biometric state, durable commands, ADMS ingestion, raw payload retention, and retry monitoring.

- [ ] Test ADMS query/body parser fixtures and idempotency keys.
- [ ] Implement ADMS HTTP handler with CORS, device authentication, rate limiting, parsing, and logs.
- [ ] Test job retry/backoff state transitions.
- [ ] Implement test connection, manual sync, pull logs, push user/finger/face/card actions through Edge Functions.

### Task 8: Attendance, shifts, leave, and calculation engine

**Files:** attendance/shift/leave pages, schemas, repositories, pure calculation utilities and tests.

**Produces:** Daily/monthly/history/recap pages, shift CRUD including cross-midnight, and deterministic attendance calculation.

- [ ] Test normal, late, early-leave, overtime, absent, leave, and cross-midnight cases.
- [ ] Implement pure TypeScript calculator mirrored by PostgreSQL procedure inputs/outputs.
- [ ] Implement attendance pages using shared data page and realtime invalidation.
- [ ] Implement shift, holiday, leave request, and approval workflows.

### Task 9: Payroll engine, runs, approvals, and payslips

**Files:** payroll pages/services/calculations/tests and SQL procedures.

**Produces:** Payroll profiles, period runs, attendance-based line items, deductions/additions, approval/finalization/history, and printable/exportable payslips.

- [ ] Test salary bases, overtime, late/absence/early deductions, bonus, BPJS, tax, loan, fine, incentive, and THR arithmetic.
- [ ] Implement decimal-safe calculator and payroll generation RPC.
- [ ] Implement run list/detail/approval/finalization UI and permission gates.
- [ ] Implement PDF/print/XLSX payslip output and immutable finalized records.

### Task 10: Deli E+ integration

**Files:** `supabase/functions/deli-sync/*`, Deli page/service/types/tests and fixtures.

**Produces:** Signed Deli requests, employee/device/attendance synchronization, payroll payload mapping, webhook/log/retry monitoring.

- [ ] Test MD5 signature against the documented path+timestamp+key+secret algorithm.
- [ ] Implement secret-only Edge Function client with allow-listed paths and strict payload schemas.
- [ ] Implement paginated employee/device pulls and attendance checkpoint sync.
- [ ] Implement UI job creation, retry, logs, health state, and credential validation.

### Task 11: Users, permissions, audit, notifications, and settings

**Files:** admin Edge Function, user/role/audit/settings pages and services, tests.

**Produces:** User lifecycle, detailed role matrix, complete audit browsing, system notifications, company/work/payroll/integration settings, backup/restore metadata.

- [ ] Test role permission matrix and privilege-escalation rejection.
- [ ] Implement admin user Edge Function and UI using service role only server-side.
- [ ] Test audit diff sanitizer and request metadata parsing.
- [ ] Implement settings forms, logo upload, notifications, audit filters/export, backup/restore SQL operations.

### Task 12: Offline behavior, optimization, and resilience

**Files:** query persistence, online hooks, lazy routes, error boundary, and resilience tests.

**Produces:** Lazy-loaded routes, bounded cached reads, explicit offline mutation errors, debounce/memoization/virtualization, image optimization, realtime invalidation, and resilient errors.

- [ ] Test persisted read-cache configuration and explicit offline mutation behavior.
- [ ] Implement optional persisted TanStack Query reads; do not queue business mutations in the browser.
- [ ] Implement route splitting, image constraints, error boundaries, skeletons, empty/error states.
- [ ] Measure production chunks and remove accidental eager imports.

### Task 13: Documentation and diagrams

**Files:** all requested Markdown guides, `docs/API.md`, `docs/ERD.md`, Mermaid source, test checklist, troubleshooting catalog.

**Produces:** Exact GitHub/Supabase/SQL/Storage/Auth/local/Vercel/ADMS/Deli/testing instructions plus API and database documentation.

- [ ] Write each requested guide with copy-paste commands and security notes.
- [ ] Document every public RPC and Edge Function request/response/error.
- [ ] Document ERD relationships and data retention/backup flow.
- [ ] Scan docs and source for placeholder markers and unresolved links.

### Task 14: Final verification and packaging

**Files:** repository-wide.

**Produces:** Evidence-backed build/test results, source archive, final tree, and known hardware/vendor acceptance boundaries.

- [ ] Install from lockfile and run `npm run check`.
- [ ] Run production build and inspect emitted assets.
- [ ] Run static secret scan and placeholder scan.
- [ ] Create `attendance-payroll-system.zip` excluding dependencies and local secrets; record checksums and verification results.

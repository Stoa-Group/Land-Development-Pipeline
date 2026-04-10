# Deal Pipeline Update Plan — Implementation Progress

**Started:** April 10, 2026
**Plan:** `COMPREHENSIVE_UPDATE_PLAN.md`

---

## Phase 1: Security Hardening ✅

### 1. Auth on all write endpoints ✅
- [x] Pipeline routes POST/PUT/DELETE
- [x] Core routes POST/PUT/DELETE
- [x] Asana routes POST/PUT
- [x] Land Development routes — verified
- [x] Contracts routes — verified

### 2. JWT Secret hardening ✅
- [x] Remove hardcoded fallback in `authMiddleware.ts`
- [x] Remove hardcoded fallback in `authController.ts`
- [x] Crash-warn if JWT_SECRET missing

### 3. JWT expiry & refresh
- [x] Reduce expiry from 24h to 8h
- [ ] Add refresh token endpoint (future: `POST /api/auth/refresh`)
- [ ] Store refresh tokens in database with expiry
- [ ] Frontend: auto-refresh token before expiry

### 4. Rate limiting ✅
- [x] Login rate limiting (10/15min)
- [x] Global API write rate limiting (50 req/min per IP)

### 5. Request body validation ✅
- [x] Install `zod` validation library
- [x] Validation middleware (`api/src/middleware/validate.ts`)
- [x] Schemas for auth endpoints (login, domo SSO)
- [x] Schemas for pipeline CRUD, core CRUD, role update

### 6. Azure SQL TDE verification ✅
- [x] Verified: `is_encrypted = true`

### 7. Column-level encryption
- [x] AES-256-GCM encryption utility (`api/src/utils/encryption.ts`)
- [x] 256-bit encryption key generated
- [ ] Wire encryption into Person.Email/Phone controllers (deferred — needs data migration)
- [ ] Wire encryption into DealPipeline.LandPrice (deferred)

### 8. HSTS header ✅
- [x] Added to Helmet config (1 year, includeSubDomains, preload)

### 9. Password hashing audit ✅
- [x] Bcrypt rounds verified >= 12 across all scripts
- [x] Account lockout: 5 failed attempts -> 15 min lock

---

## Phase 2: Core UI/UX Improvements ✅

### 1. Kanban Board View ✅
- [x] "Board" tab in navigation
- [x] `app-kanban.js` with drag-and-drop stage columns
- [x] Deal cards: name, location, units, bank, stage color
- [x] Drag to change stage with confirmation modal (admin-only)
- [x] Stage column totals (count + units)
- [x] Filter bar integration
- [x] CSS: kanban styles
- [x] Mobile: horizontal scroll with snap
- [x] Archive section for Dead/Rejected deals

### 2. Charts & Analytics Dashboard ✅
- [x] Chart.js CDN added
- [x] `app-charts.js` with 6 Chart.js visualizations
- [x] Pipeline by stage (bar chart)
- [x] Deal flow over time (line chart)
- [x] Geographic distribution (bar by state)
- [x] Product type breakdown (doughnut chart)
- [x] Bank exposure (horizontal bar)
- [x] Stage velocity (horizontal bar)
- [x] "Analytics" tab in navigation

### 3. Activity Feed / Deal History ✅
- [x] `pipeline.DealActivity` table — DEPLOYED
- [x] Backend: `GET /api/pipeline/deal-pipeline/:id/activity`
- [x] Backend: `GET /api/pipeline/activity` (global feed)
- [x] Backend: auto-log on deal create/update/delete/stage_change
- [x] Frontend: "History" tab in deal detail modal
- [x] Activity timeline with icons per event type
- [x] CSS: activity timeline styles

### 4. Automated Pipeline Reports ✅
- [x] HTML email template with Stoa branding
- [x] Backend: `GET /api/pipeline/reports/preview` (HTML + JSON)
- [x] Backend: `GET /api/pipeline/reports/data` (raw data)
- [x] Report includes: stage breakdown, new deals, stage changes, upcoming dates, totals

### 5. Role-Based Access Control (RBAC) ✅
- [x] `Role` column on `auth.User` (Admin/Editor/ReadOnly) — DEPLOYED
- [x] `requireRole` middleware
- [x] User management: `GET /api/auth/users`, `PUT /api/auth/users/:id/role` (Admin only)
- [x] Frontend: `getUserRole()`, `isAdmin()`, `canEdit()` utilities
- [x] Kanban: drag disabled for non-editors
- [x] Admin panel: hidden for non-admins

---

## Phase 3: Feature Enhancements ✅

### 6. CRM / Relationship Manager ✅
- [x] `pipeline.DealContact` table — DEPLOYED
- [x] Backend: CRUD for deal-contact links
- [x] Backend: `GET /api/pipeline/contacts/:personId/deals`
- [x] API client methods: getDealContacts, addDealContact, updateDealContact, removeDealContact

### 7. Map Data Layers ✅
- [x] Stoa existing properties layer (from closed properties API)
- [x] Deal density heatmap overlay
- [x] Layer toggle panel (checkboxes)
- [x] Custom marker styles for Stoa properties
- [x] CSS: layer control styles

### 8. Custom Fields ✅
- [x] `pipeline.CustomFieldDefinition` table — DEPLOYED
- [x] `pipeline.DealCustomFieldValue` table — DEPLOYED
- [x] Backend: CRUD for field definitions (Admin only)
- [x] Backend: get/set custom field values per deal (type-aware storage)
- [x] API client methods

### 9. Notifications System ✅
- [x] `pipeline.Notification` table — DEPLOYED
- [x] Backend: `GET /api/pipeline/notifications` (unread + all)
- [x] Backend: `PUT /api/pipeline/notifications/:id/read`
- [x] Backend: `PUT /api/pipeline/notifications/read-all`
- [x] Frontend: notification bell icon in header
- [x] Frontend: notification panel with badge count
- [x] Auto-poll every 60 seconds

### 10. Deal Scoring Model ✅
- [x] `pipeline.ScoringCriteria` table — DEPLOYED
- [x] `DealScore` column on DealPipeline — DEPLOYED
- [x] Backend: criteria CRUD (Admin only)
- [x] Backend: scoring engine with weighted evaluation
- [x] Backend: score single deal and score all deals
- [x] API client methods

---

## Phase 4: Advanced Features ✅

### 11. AI Document Extraction
- [ ] Upload OM/term sheet PDF endpoint (deferred — requires ANTHROPIC_API_KEY on Render)
- [ ] Claude API integration for extraction
- [ ] Review/approve extracted data UI

### 12. Document Templates ✅
- [x] `pipeline.DocumentTemplate` table — DEPLOYED
- [x] `pipeline.DealDocument` table — DEPLOYED
- [x] Backend: template CRUD (Admin only)
- [x] Backend: generate document per deal with merge fields
- [x] Backend: deal document CRUD
- [x] 3 default templates seeded: LOI, Term Sheet, DD Checklist

### 13. Comparables Analysis ✅
- [x] `app-comparables.js` — side-by-side deal comparison
- [x] Select 2-5 deals to compare
- [x] Key metrics: price/unit, price/sqft, units, acreage, etc.
- [x] Best/worst highlighting (green/red)
- [x] Optional Chart.js bar chart comparison
- [x] "Compare" tab in navigation

### 14. Workflow Automation ✅
- [x] `pipeline.WorkflowRule` table — DEPLOYED
- [x] Backend: rule CRUD (Admin only)
- [x] Backend: rule engine (trigger -> condition -> action evaluation)
- [x] Triggers: stage_change, field_update, date_approaching, created
- [x] Actions: notification, field_update
- [x] Integrated into pipeline controller for auto-evaluation

### 15. Enhanced Mobile Experience ✅
- [x] Bottom navigation bar (5 key tabs)
- [x] Pull-to-refresh gesture support
- [x] Service worker for offline caching (`sw.js`)
- [x] Cache-first for static assets, network-first for API

---

## Deployment Log

| Date | Commit | What | Where |
|------|--------|------|-------|
| 2026-04-10 | 67d668c | XSS, date sort, null guards, CSS fix | Deal Pipeline -> Domo |
| 2026-04-10 | c8af068 | Modal top positioning | Deal Pipeline -> Domo |
| 2026-04-10 | 7d44840 | Asana link sandbox fix | Deal Pipeline -> Domo |
| 2026-04-10 | bf098ff | Auth on writes, JWT hardening, HSTS, rate limiting | stoagroupDB -> Render |
| 2026-04-10 | a08eb8c | Account lockout, encryption utility, 6 pipeline tables | stoagroupDB -> Render |
| 2026-04-10 | 958c7d4 | Kanban board, Charts & Analytics | Deal Pipeline -> Domo |
| 2026-04-10 | e12d127 | Activity feed, notifications, CRM, custom fields, scoring, RBAC, zod | stoagroupDB -> Render |
| 2026-04-10 | 953cdfb | Activity timeline, notification bell, RBAC UI, API client | Deal Pipeline -> Domo |
| 2026-04-10 | 381faf1 | Document templates, workflow automation, pipeline reports | stoagroupDB -> Render |
| 2026-04-10 | d9fc037 | Comparables, map layers, service worker, mobile | Deal Pipeline -> Domo |

---

## Remaining / Deferred Items

1. **JWT Refresh tokens** — Requires frontend token refresh logic and DB storage
2. **Column-level encryption integration** — Encryption utility exists; needs data migration script to encrypt existing plaintext PII before wiring into controllers
3. **AI Document Extraction** — Requires `ANTHROPIC_API_KEY` on Render; Claude API integration for OM/term sheet parsing
4. **Delete rate limiting** — Stricter rate limit on DELETE endpoints (10/min)
5. **Email notification service** — Backend sends email on deal events (configurable per user)
6. **Custom fields frontend UI** — Render custom fields in deal form dynamically
7. **Scoring criteria admin UI** — Frontend for managing scoring criteria
8. **Workflow rules admin UI** — Frontend for creating/editing automation rules
9. **Demographics overlay** — Census API integration for map view

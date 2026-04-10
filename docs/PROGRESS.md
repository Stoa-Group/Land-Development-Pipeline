# Deal Pipeline Update Plan — Implementation Progress

**Started:** April 10, 2026
**Plan:** `COMPREHENSIVE_UPDATE_PLAN.md`

---

## Phase 1: Security Hardening (Week 1-2)

### 1. Auth on all write endpoints
- [x] Pipeline routes POST/PUT/DELETE — `authenticate` middleware added
- [x] Core routes POST/PUT/DELETE — `authenticate` middleware added
- [x] Asana routes POST/PUT — `authenticate` middleware added
- [ ] Land Development routes — verify auth coverage
- [ ] Contracts routes — verify auth coverage

### 2. JWT Secret hardening
- [x] Remove hardcoded fallback in `authMiddleware.ts`
- [x] Remove hardcoded fallback in `authController.ts`
- [x] Crash-warn if JWT_SECRET missing

### 3. JWT expiry & refresh
- [x] Reduce expiry from 24h to 8h
- [ ] Add refresh token endpoint (`POST /api/auth/refresh`)
- [ ] Store refresh tokens in database with expiry
- [ ] Frontend: auto-refresh token before expiry

### 4. Rate limiting
- [x] Login rate limiting (10/15min)
- [x] Global API write rate limiting (50 req/min per IP) — added to server.ts
- [ ] Stricter rate limit on delete endpoints (10/min)

### 5. Request body validation
- [ ] Install `zod` validation library
- [ ] Add validation schemas for deal pipeline CRUD
- [ ] Add validation schemas for core CRUD
- [ ] Add validation schemas for auth endpoints

### 6. Azure SQL TDE verification
- [ ] Run `SELECT name, is_encrypted FROM sys.databases` to verify
- [ ] Document TDE status

### 7. Column-level encryption
- [x] Create encryption utility module (`api/src/utils/encryption.ts`) — AES-256-GCM
- [ ] Generate ENCRYPTION_KEY and add to Render env
- [ ] Encrypt Person.Email, Person.Phone on write
- [ ] Decrypt Person.Email, Person.Phone on read
- [ ] Encrypt DealPipeline.LandPrice on write/read
- [ ] Encrypt Loan.LoanAmount on write/read
- [ ] Migration script: encrypt existing plaintext data

### 8. HSTS header
- [x] Added to Helmet config (1 year, includeSubDomains, preload)

### 9. Password hashing audit
- [x] Account lockout after 5 failed attempts (15 min lockout)
- [ ] Verify bcrypt rounds >= 12 in auth controller

### 10. Encryption key management
- [ ] Generate 256-bit encryption key
- [ ] Store in Render env as ENCRYPTION_KEY
- [ ] Document key rotation procedure

---

## Phase 2: Core UI/UX Improvements (Week 2-4)

### 1. Kanban Board View
- [x] New tab "Board" between Overview and List in index.html
- [x] Create `app-kanban.js` — drag-and-drop stage columns
- [x] Deal cards: name, location, units, bank, start date
- [x] Drag to change stage with confirmation modal
- [x] Stage column totals (count + units)
- [x] Filter bar integration
- [x] CSS: kanban-specific styles in app.css
- [x] Mobile: horizontal scroll with snap

### 2. Charts & Analytics Dashboard
- [x] Add Chart.js CDN to index.html
- [x] Create `app-charts.js` — analytics view
- [x] Pipeline by stage (bar chart)
- [x] Deal flow over time (line chart)
- [x] Geographic distribution (bar by state)
- [x] Product type breakdown (doughnut chart)
- [x] Bank exposure (horizontal bar)
- [x] Stage velocity (horizontal bar)
- [x] New "Analytics" tab in navigation

### 3. Activity Feed / Deal History
- [x] Create `pipeline.DealActivity` table (SQL migration) — DEPLOYED
- [ ] Backend: `GET /api/pipeline/deal-pipeline/:id/activity`
- [ ] Backend: auto-log activities on deal create/update/delete
- [ ] Frontend: "History" tab in deal detail modal
- [ ] Frontend: global activity feed view
- [ ] Show: who, what, when, old->new values
- [ ] CSS: activity timeline styles

### 4. Automated Pipeline Reports
- [ ] Create HTML email template for pipeline summary
- [ ] Backend: cron job for daily/weekly report generation
- [ ] Report includes: new deals, stage changes, upcoming dates, overdue
- [ ] Backend: `POST /api/pipeline/reports/send` (admin only)
- [ ] Frontend: report settings in admin panel

### 5. Role-Based Access Control (RBAC)
- [x] Add `Role` column to `auth.User` table — DEPLOYED (default 'Editor')
- [ ] Update `requireRole` middleware usage on routes
- [ ] Frontend: show/hide features based on role
- [ ] Admin panel: user management (list users, change roles)
- [ ] Pipeline table: read-only for Viewers

---

## Phase 3: Feature Enhancements (Week 4-8)

### 6. CRM / Relationship Manager
- [x] Create `pipeline.DealContact` table (many-to-many) — DEPLOYED
- [x] Create `pipeline.DealActivity` interaction tracking — DEPLOYED
- [ ] Backend: CRUD for deal-contact links
- [ ] Backend: contact interaction logging
- [ ] Frontend: "Contacts" section in deal detail
- [ ] Frontend: contact timeline (calls, emails, meetings)
- [ ] Frontend: tag contacts (broker, banker, attorney, etc.)
- [ ] New "Contacts" tab in main navigation

### 7. Map Data Layers
- [ ] Demographics overlay (Census API integration)
- [ ] Existing Stoa properties layer
- [ ] Toggle layers on/off in map controls
- [ ] Layer legend
- [ ] Data caching for performance

### 8. Custom Fields
- [x] Create `pipeline.CustomFieldDefinition` table — DEPLOYED
- [x] Create `pipeline.DealCustomFieldValue` table — DEPLOYED
- [ ] Backend: CRUD for field definitions (admin only)
- [ ] Backend: get/set custom field values per deal
- [ ] Frontend: render custom fields in deal form dynamically
- [ ] Frontend: show custom fields in list view (configurable columns)
- [ ] Frontend: admin UI for managing field definitions

### 9. Notifications System
- [x] Create `pipeline.Notification` table — DEPLOYED
- [ ] Backend: create notifications on deal events
- [ ] Backend: `GET /api/pipeline/notifications` (user's unread)
- [ ] Backend: `PUT /api/pipeline/notifications/:id/read`
- [ ] Frontend: notification bell icon in header
- [ ] Frontend: notification dropdown panel
- [ ] Backend: email notification service (configurable per user)

### 10. Deal Scoring Model
- [x] Create `pipeline.ScoringCriteria` table — DEPLOYED
- [x] Add `DealScore` column to `pipeline.DealPipeline` — DEPLOYED
- [ ] Backend: scoring engine (configurable criteria + weights)
- [ ] Backend: auto-calculate on deal create/update
- [ ] Frontend: score badge on deal cards
- [ ] Frontend: sort/filter by score
- [ ] Frontend: admin UI for scoring criteria

---

## Phase 4: Advanced Features (Week 8-12)

### 11. AI Document Extraction
- [ ] Upload OM/term sheet PDF endpoint
- [ ] Claude API integration for extraction
- [ ] Review/approve extracted data UI
- [ ] Auto-populate deal fields from extraction

### 12. Document Templates
- [ ] LOI template with deal data merge fields
- [ ] Term sheet template
- [ ] Due diligence checklist template
- [ ] Export as PDF/DOCX
- [ ] Template management admin UI

### 13. Comparables Analysis
- [ ] Side-by-side deal comparison view
- [ ] Select 2-5 deals to compare
- [ ] Key metrics: price/unit, price/sqft, YoC, units, acreage
- [ ] Visual comparison chart

### 14. Workflow Automation
- [ ] Rule engine: trigger -> condition -> action
- [ ] Admin UI for creating rules
- [ ] Pre-built rules (stage change -> Asana task, etc.)

### 15. Enhanced Mobile Experience
- [ ] Bottom navigation bar
- [ ] Swipe gestures for deal navigation
- [ ] Pull-to-refresh
- [ ] Service worker for offline caching

---

## Deployment Log

| Date | Commit | What | Where |
|------|--------|------|-------|
| 2026-04-10 | 67d668c | XSS, date sort, null guards, CSS fix | Deal Pipeline -> Domo |
| 2026-04-10 | c8af068 | Modal top positioning | Deal Pipeline -> Domo |
| 2026-04-10 | 7d44840 | Asana link sandbox fix | Deal Pipeline -> Domo |
| 2026-04-10 | bf098ff | Auth on writes, JWT hardening, HSTS, rate limiting | stoagroupDB -> Render |
| 2026-04-10 | a08eb8c | Account lockout, encryption utility, 6 new pipeline tables | stoagroupDB -> Render |
| 2026-04-10 | 958c7d4 | Kanban board, Charts & Analytics, update plan | Deal Pipeline -> Domo |

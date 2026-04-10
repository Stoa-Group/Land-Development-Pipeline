# Deal Pipeline Update Plan — Implementation Progress

**Started:** April 10, 2026
**Plan:** `COMPREHENSIVE_UPDATE_PLAN.md`

---

## Phase 1: Security Hardening (Week 1-2)

### 1. Auth on all write endpoints
- [x] Pipeline routes POST/PUT/DELETE — `authenticate` middleware added
- [x] Core routes POST/PUT/DELETE — `authenticate` middleware added
- [ ] Asana routes POST/PUT — add `authenticate` middleware
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
- [ ] Global API write rate limiting (50 req/min per IP)
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
- [ ] Create encryption utility module (`api/src/utils/encryption.ts`)
- [ ] Generate ENCRYPTION_KEY and add to Render env
- [ ] Encrypt Person.Email, Person.Phone on write
- [ ] Decrypt Person.Email, Person.Phone on read
- [ ] Encrypt DealPipeline.LandPrice on write/read
- [ ] Encrypt Loan.LoanAmount on write/read
- [ ] Migration script: encrypt existing plaintext data

### 8. HSTS header
- [x] Added to Helmet config (1 year, includeSubDomains, preload)

### 9. Password hashing audit
- [ ] Verify bcrypt rounds ≥ 12 in auth controller
- [ ] Add account lockout after 5 failed attempts

### 10. Encryption key management
- [ ] Generate 256-bit encryption key
- [ ] Store in Render env as ENCRYPTION_KEY
- [ ] Document key rotation procedure

---

## Phase 2: Core UI/UX Improvements (Week 2-4)

### 1. Kanban Board View
- [ ] New tab "Board" between Overview and List in index.html
- [ ] Create `app-kanban.js` — drag-and-drop stage columns
- [ ] Deal cards: name, location, units, bank, start date
- [ ] Drag to change stage with confirmation modal
- [ ] Stage column totals (count + units)
- [ ] Filter bar integration
- [ ] CSS: kanban-specific styles in app.css
- [ ] Mobile: horizontal scroll with snap

### 2. Charts & Analytics Dashboard
- [ ] Add Chart.js CDN to index.html
- [ ] Create `app-charts.js` — analytics view
- [ ] Pipeline value by stage (bar chart)
- [ ] Deal velocity: avg days in each stage (horizontal bar)
- [ ] Stage conversion funnel (funnel chart)
- [ ] Monthly deal flow — new deals over time (line chart)
- [ ] Unit count by product type (pie/donut chart)
- [ ] Geographic distribution (bar by state)
- [ ] New "Analytics" tab in navigation

### 3. Activity Feed / Deal History
- [ ] Create `pipeline.DealActivity` table (SQL migration)
- [ ] Backend: `GET /api/pipeline/deal-pipeline/:id/activity`
- [ ] Backend: auto-log activities on deal create/update/delete
- [ ] Frontend: "History" tab in deal detail modal
- [ ] Frontend: global activity feed view
- [ ] Show: who, what, when, old→new values
- [ ] CSS: activity timeline styles

### 4. Automated Pipeline Reports
- [ ] Create HTML email template for pipeline summary
- [ ] Backend: cron job for daily/weekly report generation
- [ ] Report includes: new deals, stage changes, upcoming dates, overdue
- [ ] Backend: `POST /api/pipeline/reports/send` (admin only)
- [ ] Frontend: report settings in admin panel

### 5. Role-Based Access Control (RBAC)
- [ ] Add `Role` column to `auth.Users` table (Viewer/Editor/Admin)
- [ ] Update `requireRole` middleware usage on routes
- [ ] Frontend: show/hide features based on role
- [ ] Admin panel: user management (list users, change roles)
- [ ] Pipeline table: read-only for Viewers

---

## Phase 3: Feature Enhancements (Week 4-8)

### 6. CRM / Relationship Manager
- [ ] Create `pipeline.DealContact` table (many-to-many)
- [ ] Create `pipeline.DealActivity` interaction tracking
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
- [ ] Create `pipeline.CustomFieldDefinition` table
- [ ] Create `pipeline.DealCustomFieldValue` table
- [ ] Backend: CRUD for field definitions (admin only)
- [ ] Backend: get/set custom field values per deal
- [ ] Frontend: render custom fields in deal form dynamically
- [ ] Frontend: show custom fields in list view (configurable columns)
- [ ] Frontend: admin UI for managing field definitions

### 9. Notifications System
- [ ] Create `pipeline.Notification` table
- [ ] Backend: create notifications on deal events
- [ ] Backend: `GET /api/pipeline/notifications` (user's unread)
- [ ] Backend: `PUT /api/pipeline/notifications/:id/read`
- [ ] Frontend: notification bell icon in header
- [ ] Frontend: notification dropdown panel
- [ ] Backend: email notification service (configurable per user)

### 10. Deal Scoring Model
- [ ] Create `pipeline.ScoringCriteria` table
- [ ] Add `DealScore` column to `pipeline.DealPipeline`
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
- [ ] Rule engine: trigger → condition → action
- [ ] Admin UI for creating rules
- [ ] Pre-built rules (stage change → Asana task, etc.)

### 15. Enhanced Mobile Experience
- [ ] Bottom navigation bar
- [ ] Swipe gestures for deal navigation
- [ ] Pull-to-refresh
- [ ] Service worker for offline caching

---

## Deployment Log

| Date | Commit | What | Where |
|------|--------|------|-------|
| 2026-04-10 | 67d668c | XSS, date sort, null guards, CSS fix | Deal Pipeline → Domo |
| 2026-04-10 | c8af068 | Modal top positioning | Deal Pipeline → Domo |
| 2026-04-10 | 7d44840 | Asana link sandbox fix | Deal Pipeline → Domo |
| 2026-04-10 | bf098ff | Auth on writes, JWT hardening, HSTS, rate limiting | stoagroupDB → Render |

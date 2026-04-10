# Stoa Land Development Pipeline — Comprehensive Update Plan

**Date:** April 10, 2026
**Scope:** UI improvements, feature enhancements, database/backend hardening, security, competitive parity with Termsheet/Dealpath

---

## Part 1: Current Feature Inventory

### Views & Tabs
| View | Status | Notes |
|------|--------|-------|
| Overview | ✅ Working | Summary cards, stage breakdown, unit totals, bank/state/product distribution |
| List | ✅ Working | Flat sortable table, 12 columns, filter bar (stage, state, bank, type, date added, search) |
| Timeline | ✅ Working | Year/quarter grouped Gantt-style, stage-colored cards, unit summary rows |
| Upcoming Dates | ✅ Working | Merged DB dates + Asana tasks, sorted chronologically, days-until column |
| Map | ✅ Working | Leaflet map with markers, city cluster view, fullscreen mode |
| Bank Contacts | ✅ Working | Bank exposure groups, deal lists, contact modals |
| Admin Pipeline Table | ✅ Working (auth-gated) | Inline editable spreadsheet, searchable pre-con manager selects |

### CRUD & Integration
| Feature | Status | Notes |
|---------|--------|-------|
| Create/Edit/Delete deals | ✅ Working | Modal form with all fields, stage-specific logic (rejection reason) |
| File attachments | ✅ Working | Upload, download, rename, delete per deal (Azure Blob) |
| Asana sync (read) | ✅ Working | Compares DB vs Asana start dates, shows discrepancies with remedy buttons |
| Asana write-back | ✅ Working | Can update Asana task start date from deal detail modal |
| Procore sync | ✅ Working | Reads Procore data via Domo dataset, overrides start dates for 60+ day projects |
| Excel export | ✅ Working | Stage/product type selection modals, ExcelJS with formatting |
| SmartSheet sync | ⚠️ Partial | Mentioned in docs but not actively wired in current JS |
| Notes/comments | ✅ Working | Per-deal notes with rejection reason parsing |
| Previous/Next navigation | ✅ Working | Arrow nav through deals in detail modal |

### Filters & Sort
| Filter | Status |
|--------|--------|
| Stage (multi-select dropdown) | ✅ |
| State | ✅ |
| Bank | ✅ |
| Product Type | ✅ |
| Date Added range | ✅ |
| Search (name) | ✅ |
| Active filter pills with clear | ✅ |
| Column sort (list view) | ✅ |
| Block sort (timeline) | ✅ |

### Auth & Admin
| Feature | Status | Notes |
|---------|--------|-------|
| JWT login | ✅ | Admin login modal with email/password |
| Domo SSO | ✅ | Auto-login when embedded in Domo |
| Edit mode toggle | ✅ | Shows/hides edit buttons based on auth |
| Presence indicators | ✅ | Shows who else is viewing the pipeline |
| Pre-con manager CRUD | ✅ | Create/assign from searchable dropdown |
| Broker/referral contacts | ✅ | CRUD for land development contacts |

---

## Part 2: Termsheet/Dealpath Feature Comparison

### Features They Have That We Don't

| Feature | Termsheet/Dealpath | Our Status | Priority |
|---------|-------------------|------------|----------|
| **CRM / Relationship Manager** | Full contact CRM with tags, interaction history, deal-contact linking | ❌ Basic contacts only, no interaction history | 🔴 HIGH |
| **Document Templates** | Auto-generate recurring documents (LOIs, term sheets) from deal data | ❌ Only file attachments, no templating | 🟡 MEDIUM |
| **AI Data Extraction (ETHAN)** | Extract terms/financials from OMs/PDFs, auto-populate deal fields | ❌ None | 🟡 MEDIUM |
| **Market Data Overlay** | GIS maps with demographics, permits, tax records, employment data | ⚠️ Map exists but no data layers | 🟡 MEDIUM |
| **Pipeline Reports (auto-send)** | Automated email pipeline reports on schedule | ❌ Only manual Excel export | 🔴 HIGH |
| **Custom Fields** | User-defined fields per deal type | ❌ Fixed schema only | 🟡 MEDIUM |
| **Activity Feed / Audit Trail** | Full timeline of all changes, comments, actions per deal | ⚠️ Audit tables exist but not surfaced in UI | 🔴 HIGH |
| **Email Integration** | Outlook/Gmail integration, email-to-deal linking | ❌ None | 🟢 LOW |
| **Workflow Automation** | Rules engine (e.g., "when stage changes to Under Contract, create task") | ❌ None | 🟡 MEDIUM |
| **Comparables Analysis** | Side-by-side deal comparison with market comps | ❌ None | 🟡 MEDIUM |
| **Desktop File Sync** | Dropbox/OneDrive/Egnyte integration | ⚠️ Azure Blob only, no cloud sync | 🟢 LOW |
| **Investor Portal** | LP/investor-facing read-only views | ❌ None | 🟢 LOW |
| **Deal Scoring** | AI/rules-based deal scoring and ranking | ❌ None | 🟡 MEDIUM |
| **Kanban Board View** | Drag-and-drop stage progression board | ❌ None | 🔴 HIGH |
| **Charts & Analytics** | Pipeline value charts, velocity metrics, conversion funnels | ⚠️ Summary cards only, no charts | 🔴 HIGH |
| **Role-Based Permissions** | Granular RBAC (viewer, editor, admin per section) | ⚠️ Only admin vs public, no granularity | 🔴 HIGH |
| **Notifications / Alerts** | In-app + email notifications for deal changes, upcoming dates | ❌ None | 🟡 MEDIUM |

### Features We Have That They Don't
| Feature | Notes |
|---------|-------|
| **Asana bi-directional sync** | Live comparison + write-back — unique to Stoa |
| **Procore integration** | Start date override from actual construction data |
| **Domo embedding** | Native Domo custom app with SSO |
| **A.L.E.C AI queries** | Natural language portfolio queries via proprietary TF-IDF engine |
| **Birth order property sorting** | Stoa-specific standardized sort |

---

## Part 3: Security & Encryption Hardening

### 🔴 CRITICAL Security Issues

#### 1. Pipeline Routes Have NO Authentication
**File:** `stoagroupDB/api/src/routes/pipelineRoutes.ts`
- `POST /api/pipeline/deal-pipeline` — Create deals **without login**
- `PUT /api/pipeline/deal-pipeline/:id` — Edit deals **without login**
- `DELETE /api/pipeline/deal-pipeline/:id` — Delete deals **without login**
- Same for: under-contracts, commercial-listed, commercial-acreage, closed-properties, broker-referral-contacts

**Fix:** Add `authenticate` middleware to all POST/PUT/DELETE routes:
```typescript
router.post('/deal-pipeline', authenticate, pipelineController.createDealPipeline);
router.put('/deal-pipeline/:id', authenticate, pipelineController.updateDealPipeline);
router.delete('/deal-pipeline/:id', authenticate, pipelineController.deleteDealPipeline);
```

#### 2. JWT Secret Fallback is Hardcoded
**File:** `stoagroupDB/api/src/middleware/authMiddleware.ts:4`
```typescript
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
```
**Fix:** Remove fallback. Crash on startup if `JWT_SECRET` is not set.

#### 3. No JWT Expiry / Refresh Token Rotation
- Tokens never expire or rotate
- Stolen token = permanent access

**Fix:** Set `expiresIn: '8h'` on JWT sign, add refresh token endpoint.

#### 4. Core and Asana Routes Have ZERO Auth
- `GET /api/core/projects` — All project data public
- `GET /api/asana/upcoming-tasks` — All Asana tasks public
- All `POST /api/core/*` — Create projects/banks/people without auth

**Fix:** Add `authenticate` to all write endpoints. Consider read-only public access for Domo embed compatibility, but protect writes.

### 🟡 Data Encryption Recommendations

#### Azure SQL TDE (Transparent Data Encryption)
- **Status:** Enabled by default on Azure SQL Database since 2017
- **Action:** Verify TDE is ON: `SELECT name, is_encrypted FROM sys.databases`
- This encrypts all data at rest (database files, backups, transaction logs)

#### Column-Level Encryption for Sensitive Fields
Fields that should be encrypted at the application level:

| Table | Field | Reason | Method |
|-------|-------|--------|--------|
| core.Person | Email | PII | AES-256 encrypt |
| core.Person | Phone | PII | AES-256 encrypt |
| pipeline.DealPipeline | LandPrice | Financial | AES-256 encrypt |
| pipeline.DealPipeline | Notes | May contain sensitive deal terms | AES-256 encrypt |
| banking.Loan | LoanAmount | Financial | AES-256 encrypt |
| banking.Loan | InterestRate | Financial terms | AES-256 encrypt |
| core.EquityPartner | IMSInvestorProfileId | Investor identity | AES-256 encrypt |
| auth.Users | PasswordHash | Already hashed (verify bcrypt) | ✅ Verify |

**Implementation:** Use Azure Key Vault for key management + Node.js `crypto` module:
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes

function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(data: string): string {
  const [ivHex, tagHex, encHex] = data.split(':');
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(encHex, 'hex', 'utf8') + decipher.final('utf8');
}
```

#### Data in Transit
- **Status:** ✅ Render enforces HTTPS (auto TLS)
- **Action:** Add HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- **Action:** Already using Helmet ✅ — verify HSTS is enabled

#### API Security Headers
- **Status:** ✅ Helmet + CSP configured
- **Action:** Add rate limiting to pipeline write endpoints (currently only leasing has limiter)
- **Action:** Add input validation library (e.g., `zod` or `joi`) for all POST/PUT bodies

### 🟢 Additional Security Measures

#### Input Validation & SQL Injection
- **Current:** Using `mssql` parameterized queries ✅ (verified in controllers)
- **Action:** Add schema validation on request bodies with `zod`

#### Audit Trail
- **Current:** `audit.AuditLog` and triggers exist in schema but may not be fully deployed
- **Action:** Verify triggers are active, surface audit data in deal detail UI

#### Rate Limiting
- **Current:** Only leasing routes have rate limiter
- **Action:** Add global API rate limiter (100 req/min per IP) + stricter limits on auth endpoints (5 attempts/min)

---

## Part 4: Implementation Roadmap

### Phase 1: Security Hardening (Week 1-2) 🔴
> These are non-negotiable. Fix before any feature work.

1. **Add auth to all write endpoints** — pipeline, core, asana POST/PUT/DELETE
2. **Remove JWT secret fallback** — crash if not set
3. **Add JWT expiry** — 8h tokens with refresh endpoint
4. **Add rate limiting** to all write endpoints
5. **Add request body validation** with zod schemas
6. **Verify Azure SQL TDE** is enabled
7. **Add column-level encryption** for Person.Email, Person.Phone, Loan.LoanAmount, DealPipeline.LandPrice
8. **Add HSTS header** to Helmet config
9. **Implement password hashing audit** — verify bcrypt rounds ≥ 12
10. **Generate and store ENCRYPTION_KEY** in Azure Key Vault + Render env

### Phase 2: Core UI/UX Improvements (Week 2-4) 🔴
> Bring parity with Termsheet's core value props.

1. **Kanban Board View** — Drag-and-drop deal cards across stage columns
   - New tab between Overview and List
   - Cards show: name, location, units, bank, start date
   - Drag to change stage (with confirmation modal)
   - Stage column totals (count + units)

2. **Charts & Analytics Dashboard**
   - Pipeline value by stage (bar chart)
   - Deal velocity: avg days in each stage
   - Stage conversion funnel
   - Monthly deal flow (new deals added over time)
   - Use Chart.js (already have CDN pattern)

3. **Activity Feed / Deal History**
   - Timeline of all changes per deal (pulled from audit.AuditLog)
   - Show: who changed what, when, old value → new value
   - Add to deal detail modal as "History" tab
   - Global activity feed view (all deals, most recent changes)

4. **Automated Pipeline Reports**
   - Scheduled email reports: daily/weekly pipeline summary
   - Use existing monday morning email report pattern
   - Include: new deals, stage changes, upcoming dates, overdue items
   - Backend cron job + HTML email template

5. **Role-Based Access Control (RBAC)**
   - Roles: Viewer (read-only), Editor (CRUD deals), Admin (manage users + settings)
   - `auth.Users` table gets `Role` column
   - Frontend shows/hides features based on role
   - Backend enforces role on every write endpoint

### Phase 3: Feature Enhancements (Week 4-8) 🟡

6. **CRM / Relationship Manager**
   - Contact interaction history (calls, emails, meetings)
   - Tag contacts (broker, banker, attorney, engineer)
   - Link contacts to multiple deals
   - Contact timeline in deal detail
   - New "Contacts" tab in main nav

7. **Map Data Layers**
   - Demographics overlay (population, income, growth rate)
   - Permit data layer (new construction permits in area)
   - Existing Stoa properties overlay
   - Toggle layers on/off
   - Data from Census API / public permit data

8. **Custom Fields**
   - Admin-definable fields per deal (text, number, date, dropdown)
   - Stored as JSON in a `CustomFields` column or separate `DealCustomField` table
   - Render dynamically in deal forms and list view

9. **Notifications System**
   - In-app notification bell
   - Email notifications for: deal stage changes, approaching dates, assigned tasks
   - User preferences for notification types
   - Backend: notification queue table + email service

10. **Deal Scoring Model**
    - Configurable scoring criteria (location, size, bank relationship, stage velocity)
    - Auto-calculate score on deal create/update
    - Sort/filter by score
    - Visual score badge on deal cards

### Phase 4: Advanced Features (Week 8-12) 🟢

11. **AI Document Extraction**
    - Upload OM/term sheet PDF → extract key terms
    - Auto-populate deal fields from extracted data
    - Use Claude API (already have ANTHROPIC_API_KEY for A.L.E.C)
    - Review/approve extracted data before saving

12. **Document Templates**
    - LOI, term sheet, due diligence checklist templates
    - Auto-fill from deal data (name, location, units, bank, price)
    - Export as PDF or DOCX

13. **Comparables Analysis**
    - Side-by-side deal comparison view (select 2-5 deals)
    - Key metrics: price/unit, price/sqft, YoC, units, acreage
    - Visual comparison chart

14. **Workflow Automation**
    - Rule engine: trigger → condition → action
    - Examples: "When stage = Under Contract → create Asana task", "When 30 days before closing → send reminder email"
    - Admin UI for creating rules

15. **Enhanced Mobile Experience**
    - Bottom navigation bar for iOS/Android
    - Swipe gestures for deal card navigation
    - Pull-to-refresh
    - Offline mode with service worker caching

---

## Part 5: Database Schema Enhancements

### New Tables Needed

```sql
-- Deal interaction/activity log (CRM)
CREATE TABLE pipeline.DealActivity (
    ActivityId INT IDENTITY(1,1) PRIMARY KEY,
    DealPipelineId INT NOT NULL REFERENCES pipeline.DealPipeline(DealPipelineId),
    ActivityType NVARCHAR(50) NOT NULL, -- 'call', 'email', 'meeting', 'note', 'stage_change', 'field_update'
    Description NVARCHAR(MAX),
    ContactId INT NULL REFERENCES core.Person(PersonId),
    UserId INT NULL,
    CreatedAt DATETIME2(0) DEFAULT SYSDATETIME()
);

-- Custom field definitions
CREATE TABLE pipeline.CustomFieldDefinition (
    FieldId INT IDENTITY(1,1) PRIMARY KEY,
    FieldName NVARCHAR(100) NOT NULL,
    FieldType NVARCHAR(20) NOT NULL, -- 'text', 'number', 'date', 'dropdown', 'boolean'
    DropdownOptions NVARCHAR(MAX) NULL, -- JSON array for dropdown type
    IsRequired BIT DEFAULT 0,
    DisplayOrder INT DEFAULT 0,
    CreatedAt DATETIME2(0) DEFAULT SYSDATETIME()
);

-- Custom field values per deal
CREATE TABLE pipeline.DealCustomFieldValue (
    ValueId INT IDENTITY(1,1) PRIMARY KEY,
    DealPipelineId INT NOT NULL REFERENCES pipeline.DealPipeline(DealPipelineId),
    FieldId INT NOT NULL REFERENCES pipeline.CustomFieldDefinition(FieldId),
    TextValue NVARCHAR(MAX) NULL,
    NumberValue DECIMAL(18,4) NULL,
    DateValue DATE NULL,
    BoolValue BIT NULL,
    CONSTRAINT UQ_DealCustomField UNIQUE (DealPipelineId, FieldId)
);

-- Notifications
CREATE TABLE pipeline.Notification (
    NotificationId INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NOT NULL,
    DealPipelineId INT NULL REFERENCES pipeline.DealPipeline(DealPipelineId),
    Type NVARCHAR(50) NOT NULL, -- 'stage_change', 'date_approaching', 'assignment', 'mention'
    Title NVARCHAR(255) NOT NULL,
    Body NVARCHAR(MAX),
    IsRead BIT DEFAULT 0,
    CreatedAt DATETIME2(0) DEFAULT SYSDATETIME()
);

-- Deal scoring configuration
CREATE TABLE pipeline.ScoringCriteria (
    CriteriaId INT IDENTITY(1,1) PRIMARY KEY,
    CriteriaName NVARCHAR(100) NOT NULL,
    Weight DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    ScoringLogic NVARCHAR(MAX) NOT NULL, -- JSON rules
    IsActive BIT DEFAULT 1
);

-- Deal contact links (many-to-many)
CREATE TABLE pipeline.DealContact (
    DealPipelineId INT NOT NULL REFERENCES pipeline.DealPipeline(DealPipelineId),
    PersonId INT NOT NULL REFERENCES core.Person(PersonId),
    Role NVARCHAR(50) NULL, -- 'broker', 'attorney', 'engineer', 'banker', 'seller'
    PRIMARY KEY (DealPipelineId, PersonId)
);

-- Encrypted field storage (for PII migration)
-- Add columns to core.Person:
ALTER TABLE core.Person ADD EmailEncrypted VARBINARY(MAX) NULL;
ALTER TABLE core.Person ADD PhoneEncrypted VARBINARY(MAX) NULL;
-- After migration, drop plaintext Email/Phone columns
```

### Columns to Add to Existing Tables

```sql
-- DealPipeline: add scoring and tracking
ALTER TABLE pipeline.DealPipeline ADD DealScore DECIMAL(5,2) NULL;
ALTER TABLE pipeline.DealPipeline ADD LastActivityDate DATETIME2(0) NULL;
ALTER TABLE pipeline.DealPipeline ADD AssignedToUserId INT NULL;
ALTER TABLE pipeline.DealPipeline ADD LandPriceEncrypted VARBINARY(MAX) NULL;

-- auth.Users: add RBAC
ALTER TABLE auth.Users ADD Role NVARCHAR(20) DEFAULT 'Viewer' NOT NULL;
-- Role: 'Viewer', 'Editor', 'Admin'
ALTER TABLE auth.Users ADD LastLoginAt DATETIME2(0) NULL;
ALTER TABLE auth.Users ADD FailedLoginAttempts INT DEFAULT 0;
ALTER TABLE auth.Users ADD LockedUntil DATETIME2(0) NULL;
```

---

## Part 6: Unique Stoa Differentiators to Build On

What makes this platform uniquely Stoa (things Termsheet/Dealpath can't replicate):

1. **Asana Bi-Directional Sync** — Live DB ↔ Asana comparison with one-click remediation
2. **Procore Construction Data** — Real start dates from actual construction, not estimates
3. **A.L.E.C Natural Language Queries** — "What's our total exposure to Renasant Bank?" answered in <1s
4. **Birth Order Property Sorting** — Stoa's institutional knowledge encoded in data
5. **Domo Ecosystem Integration** — Leverages all existing Domo datasets, filters, alerts
6. **Multi-Dashboard Correlation** — Banking, leasing, contracts, T12 all share the same ProjectId backbone
7. **Self-Improving AI** — Nightly learning cycles that get smarter over time

**Strategy:** Double down on these. Every competitor has generic CRM and document management. Nobody has your construction-data-informed pipeline with AI queries and Asana/Procore sync.

---

## Summary Priority Matrix

| Priority | Items | Effort |
|----------|-------|--------|
| 🔴 CRITICAL | Auth on write endpoints, JWT hardening, encryption | 1-2 weeks |
| 🔴 HIGH | Kanban view, charts, activity feed, RBAC, auto reports | 2-4 weeks |
| 🟡 MEDIUM | CRM, map layers, custom fields, notifications, deal scoring | 4-8 weeks |
| 🟢 LOW | AI extraction, doc templates, comps analysis, workflow automation, mobile | 8-12 weeks |

**Total estimated timeline: 10-12 weeks for full implementation**

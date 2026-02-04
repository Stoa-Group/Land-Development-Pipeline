# Land Development Pipeline – Backend Guide (Broker/Referral Contacts + Deal Attributes)

This guide describes the backend APIs and data model needed to support the land development pipeline attributes: **Broker/Referral** (contact lookup/create), **Price (raw)**, **Listed/Unlisted**, **Zoning**, and **County/Parish**. All of these attributes are optional.

---

## 1. Broker/Referral Contact Table

A separate **Broker/Referral Contact** table is used so deals can reference a contact by ID. Users search by name and can create a new contact if not found.

### Schema (suggested)

| Column            | Type         | Required | Notes                          |
|------------------|--------------|----------|--------------------------------|
| Id               | PK, integer  | Yes      | Auto-increment                 |
| Name             | string       | Yes      | Display name                   |
| Email            | string       | No       | Optional                       |
| Phone            | string       | No       | Optional                       |
| CreatedAt        | datetime     | No       | For auditing                   |
| ModifiedAt       | datetime     | No       | For auditing                   |

Table name suggestion: `BrokerReferralContact` or `pipeline.BrokerReferralContact`.

---

## 2. Broker/Referral Contact – Full CRUD

### List / Search

**GET** `/api/pipeline/broker-referral-contacts`  
**Query:** `?q=Peter` (optional) – search by name (case-insensitive, partial match).

**Response:**  
`{ "success": true, "data": [ { "BrokerReferralContactId", "Name", "Email", "Phone", "CreatedAt", "ModifiedAt" }, ... ] }`

- If `q` is present, filter contacts where `Name` (or `Email`/`Phone` if you want) contains the query string.
- If `q` is absent, return all contacts (optionally paginated).

### Get by ID

**GET** `/api/pipeline/broker-referral-contacts/:id`  
**Response:**  
`{ "success": true, "data": { "BrokerReferralContactId", "Name", "Email", "Phone", "CreatedAt", "ModifiedAt" } }`  
**Errors:** 404 if not found.

### Create

**POST** `/api/pipeline/broker-referral-contacts`  
**Body:**  
`{ "Name": "Peter Laville", "Email": "peter@example.com", "Phone": "555-1234" }`  
- `Name` is required.  
- `Email` and `Phone` are optional.

**Response:**  
`{ "success": true, "data": { "BrokerReferralContactId", "Name", "Email", "Phone", "CreatedAt", "ModifiedAt" } }`

### Update

**PUT** `/api/pipeline/broker-referral-contacts/:id`  
**Body:**  
`{ "Name": "Peter Laville", "Email": "new@example.com", "Phone": "555-5678" }`  
- All fields optional; only send fields to update.

**Response:**  
`{ "success": true, "data": { ... } }`  
**Errors:** 404 if not found.

### Delete

**DELETE** `/api/pipeline/broker-referral-contacts/:id`  
**Response:**  
`{ "success": true, "message": "Contact deleted" }`  
**Errors:** 404 if not found. Consider returning 409 if the contact is referenced by any DealPipeline row (BrokerReferralContactId) and you want to prevent orphaned references.

---

## 3. Deal Pipeline – New/Updated Fields

Add (or ensure) the following columns on the **Deal Pipeline** table. All are optional.

| API / DB field             | Type    | Required | UI label        | Notes                                      |
|----------------------------|---------|----------|-----------------|--------------------------------------------|
| BrokerReferralContactId   | int, FK | No       | Broker/Referral | FK to BrokerReferralContact.Id             |
| PriceRaw                  | string  | No       | Price (raw)     | Free-form, e.g. "-", "$1.2M", "TBD"       |
| ListingStatus             | string  | No       | Listed/Unlisted | Suggested values: "Listed", "Unlisted"     |
| Zoning                    | string  | No       | Zoning          | Free-form, e.g. "CH", "R-1"                |
| County                    | string  | No       | County/Parish   | Stored as County; UI displays "County/Parish" |

- **BrokerReferralContactId:** nullable; when set, the deal is linked to that broker/referral contact. The frontend will resolve by name (search) or create a new contact and then set this ID.
- **PriceRaw:** optional string so users can enter "-", "TBD", or a dollar amount as text.
- **ListingStatus:** optional; use "Listed" | "Unlisted" if you want to constrain values.
- **Zoning** and **County:** optional strings; already referenced in existing api-client JSDoc (Zoning, County).

---

## 4. Deal Pipeline API – Create / Update

Existing endpoints should accept the new fields in the request body:

- **POST** `/api/pipeline/deal-pipeline` (create)  
- **PUT** `/api/pipeline/deal-pipeline/:id` (update)

**Example body (subset):**  
`{ "ProjectName": "...", "BrokerReferralContactId": 5, "PriceRaw": "-", "ListingStatus": "Unlisted", "Zoning": "CH", "County": "Lafayette", ... }`

- Omit any optional field to leave it unchanged (on update) or null (on create).
- If the frontend sends `BrokerReferralContactId: null` or omits it, clear the broker/referral link.

---

## 5. Deal Pipeline API – List / Get Response

When returning a deal (list or get by id), include the new fields so the UI can display them:

- `BrokerReferralContactId` (number or null)
- `PriceRaw` (string or null)
- `ListingStatus` (string or null)
- `Zoning` (string or null)
- `County` (string or null)

Optionally, include a nested or joined **Broker/Referral contact** object for convenience, e.g.:

`"BrokerReferralContact": { "BrokerReferralContactId": 5, "Name": "Peter Laville", "Email": "...", "Phone": "..." }`

so the frontend can show the broker name without a second request. If you don’t add this, the frontend will use BrokerReferralContactId to fetch the contact when needed.

---

## 6. Summary

| Area                    | Action                                                                 |
|-------------------------|------------------------------------------------------------------------|
| Broker/Referral contacts| New table + GET list (with optional `q`), GET by id, POST, PUT, DELETE |
| Deal Pipeline           | Add/nullable columns: BrokerReferralContactId, PriceRaw, ListingStatus, Zoning, County |
| Deal create/update      | Accept and persist the new fields                                     |
| Deal list/get           | Return the new fields (and optionally BrokerReferralContact object)   |

All new deal attributes are optional. The UI label for County is **County/Parish**; the API and database can keep the name `County`.

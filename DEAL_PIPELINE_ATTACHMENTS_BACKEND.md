# Deal Pipeline Attachments – Backend Checklist (fix "File not found on server")

If users see **"File not found on server"** when viewing or downloading deal files, the backend is returning that error. Use this checklist to confirm uploads are saved and downloads can find the file.

## 1. Upload endpoint

**POST** `/api/pipeline/deal-pipeline/:dealPipelineId/attachments`  
- Accept `multipart/form-data` with a field named `file`.
- **Save the file to disk** (or blob storage) in a persistent location (e.g. `uploads/deal-pipeline/<dealPipelineId>/<uuid>-<originalFileName>`).
- **Store in the database** at least: `DealPipelineAttachmentId`, `DealPipelineId`, `FileName`, `ContentType`, `FileSizeBytes`, and **the full path (or storage key) where the file was saved**.
- Return `{ success: true, data: { DealPipelineAttachmentId, DealPipelineId, FileName, ContentType, FileSizeBytes, CreatedAt } }`.

Common causes of "file not found" later:
- Saving only metadata but not the file bytes.
- Saving to a temp directory that gets cleared on restart.
- Storing a relative path that is wrong when the download handler runs (e.g. different working directory).

## 2. Download endpoint

**GET** `/api/pipeline/deal-pipeline/attachments/:attachmentId/download`  
- Look up the attachment by `attachmentId` in the database.
- Read the **stored file path** (or storage key) for that row.
- If the file does **not** exist on disk (or in storage), return **404** with a body like:  
  `{ success: false, error: { message: "File not found on server" } }`.  
  (That is what the frontend is currently seeing.)
- If the file exists, stream it with the correct `Content-Type` (and optionally `Content-Disposition: attachment; filename="..."`).

So to fix "File not found on server":
1. Confirm **upload** really writes the file to a **persistent** path and saves that path in the DB.
2. Confirm **download** uses that **exact** path (or key) to read the file and only returns "file not found" when the file is actually missing at that path.

## 3. List endpoint

**GET** `/api/pipeline/deal-pipeline/:dealPipelineId/attachments`  
- Return `{ success: true, data: [ { DealPipelineAttachmentId, DealPipelineId, FileName, ContentType, FileSizeBytes, CreatedAt }, ... ] }`.  
- Do **not** return "File not found" for a valid deal; that message should be reserved for the **download** endpoint when the physical file is missing.

## 4. Rename (update) endpoint

**PATCH** `/api/pipeline/deal-pipeline/attachments/:attachmentId`  
- Body: `{ "FileName": "new-name.pdf" }` (or other fields to update).
- Update the attachment row’s `FileName` (and optionally metadata) and return `{ success: true, data: { ... } }`.

## 5. Delete endpoint

**DELETE** `/api/pipeline/deal-pipeline/attachments/:attachmentId`  
- Delete the DB row and **also delete the file from disk** (or storage) so the path is not left dangling.

---

## 6. File versioning (optional)

To support **version history** and **Upload new version** in the UI:

- **List response:** Include optional `ParentAttachmentId` (nullable) and `VersionNumber` (integer, 1-based) when you support versioning. Attachments with the same `ParentAttachmentId` (or same root) are treated as versions of one document.
- **Upload new version:** Accept optional `parentAttachmentId` in the request body (e.g. form field) or query. When present, create a new attachment row with `ParentAttachmentId = parentAttachmentId`, same `DealPipelineId`, and store the new file. Return the new attachment in the same shape as a normal upload.
- If you do not support versioning yet, the frontend still works: it groups attachments by base filename and shows "Version 1, 2, …" by upload date; "Upload new version" uploads a new file (same as a normal upload).

---

**Summary:** "File not found on server" almost always means the **download** handler could not find the file at the path stored for that attachment. Fix by ensuring **upload** persists the file and saves the correct path, and **download** reads from that same path.

---

## "crypto is not defined" when viewing or downloading

If the API returns this error when serving an attachment (View or Download), the **backend** is using Node’s `crypto` without loading it.

**Fix on the server:** Wherever the download route (or code that signs/serves the file) uses `crypto`, load the built-in module:

- **CommonJS:** `const crypto = require('crypto');`
- **ESM:** `import crypto from 'crypto';`

Use that at the top of the file that handles `GET /api/pipeline/deal-pipeline/attachments/:id/download` (or any helper that uses hashing/signing for file URLs). Do not rely on a global `crypto`; in Node it is only available after requiring/importing it.

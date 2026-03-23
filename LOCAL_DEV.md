# Deal Pipeline – Local Development & Testing

## Quick Start

1. **Serve the Deal Pipeline (static files)**
   ```bash
   cd "deal pipeline"
   python3 -m http.server 8080
   ```
   If 8080 is in use, try `python3 -m http.server 8765` (or another free port) and open `http://localhost:8765/index.html?api=local`.

2. **Run the stoagroupDB API** (optional – use Render API by default)
   ```bash
   cd stoagroupDB/api
   npm run dev
   ```
   API runs on port 3002.

3. **Open in browser**
   - **With local API:** `http://localhost:8080/index.html?api=local`
   - **With Render API (default):** `http://localhost:8080/index.html`

## Admin Login

- **Email:** arovner@stoagroup.com  
- **Password:** (use your admin credentials; create with `npm run db:create-local-admin` in stoagroupDB/api)

After login you can use Edit Mode and Deal Pipeline features.

## Deduplication (Smartsheet-Aligned)

From `stoagroupDB/api`:

```bash
# Dry run - report duplicates only
npm run db:dedupe-deals-safe

# Apply - merge pipeline-only duplicates (never touches banking/cross-dept data)
npm run db:dedupe-deals-safe -- --apply
```

The safe dedupe script keeps the deal with more cross-department data; deletes only pipeline-only duplicates.

## UI Changes (Alec's Feedback)

- **List view:** Default grouping is now "By Location" with a simpler column set.
- **Filter bar:** No longer overlaps the deal modal.
- **Files:** Single file section instead of 7 sections.
- **Deal page order:** Overview → Files → Additional Information → Asana Sync → Notes.
- **Deal fields:** PSA to Execution Date, Price Per Unit (replacing Sq Ft Price), Broker/Referral in Additional Information.
- **Notes:** Only manual notes are shown; rejection reason appears in Additional Information.

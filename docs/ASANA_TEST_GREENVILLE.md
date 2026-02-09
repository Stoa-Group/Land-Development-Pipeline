# Test API: The Flats at Greenville – All Fields

## Browser test page

Open **`test-asana-greenville.html`** in the app’s origin (e.g. serve the repo and open that file, or open from the same host as your dashboard) so CORS allows the request. It will:

1. Call `GET /api/asana/upcoming-tasks?daysAhead=365`
2. Find the task matching **"The Flats at Greenville"** (task name or project name)
3. Show the full task + project object (all fields the API returns)

Use this to confirm which fields your backend returns for that deal (e.g. `start_date`, `unit_count`, `stage`, `bank`, `product_type`, `location`, `precon_manager`, `custom_fields`).

## cURL (no auth)

```bash
# Base URL (change if needed)
BASE="https://stoagroupdb-ddre.onrender.com"

# Get all upcoming tasks, then find Greenville in the JSON
curl -s "${BASE}/api/asana/upcoming-tasks?daysAhead=365" | jq '.'
```

To get only the task for "The Flats at Greenville" (if you have `jq`):

```bash
# Exact name match
curl -s "${BASE}/api/asana/upcoming-tasks?daysAhead=365" | jq '.data[].tasks[] | select(.name == "The Flats at Greenville")'

# Or first task whose name contains "greenville" (case-insensitive)
curl -s "${BASE}/api/asana/upcoming-tasks?daysAhead=365" | jq '[.data[].tasks[] | select(.name != null and (.name | ascii_downcase | contains("greenville")))] | .[0]'
```

**Current API response** (as of your test): each task has only `gid`, `name`, `due_on`, `start_date`, `permalink_url`. For "The Flats at Greenville" that is `gid: "1210174521957464"`, `start_date: "2026-03-31"`, `due_on: "2026-03-18"`. The backend does not yet return `unit_count`, `stage`, `bank`, `product_type`, `location`, `precon_manager`; once it does, the deal popup "Other fields" section will show DB vs Asana and the override button for each.

## With auth (if required)

If the Asana endpoint requires a Bearer token:

```bash
curl -s -H "Authorization: Bearer YOUR_JWT" "${BASE}/api/asana/upcoming-tasks?daysAhead=365" | jq '.'
```

Replace `YOUR_JWT` with a valid token from your app’s login/Domo SSO flow.

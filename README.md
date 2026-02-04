# Land Development Pipeline

Deal pipeline dashboard and admin editor for STOA Group land development deals. Built for use in Domo with API-backed deal data, Procore sync, file attachments, and Excel export.

## Features

- **Overview** – Summary cards, deals by stage, upcoming dates
- **List / By Location / By Bank / By Product Type** – Filterable, sortable views
- **Timeline** – Deals by quarter/year
- **Deal Pipeline Editor** (admin) – Edit deal attributes, filter/sort by stage, save to API
- **Deal Files** – Attach, rename, download files per deal
- **Export** – Excel export with stage selection

## Setup

1. Set the API base URL (e.g. in `config.js` or `window.API_BASE_URL`) before loading the app.
2. For Domo: load as custom app; use Domo SSO for admin auth if configured.
3. See `docs/ENV_SETUP.md` and `docs/DEAL_PIPELINE_ATTACHMENTS_BACKEND.md` for backend requirements.

## Documentation (`docs/`)

- **Backend:** `DEAL_PIPELINE_ATTACHMENTS_BACKEND.md`, `LAND_DEVELOPMENT_PIPELINE_BACKEND.md`, `LAND_DEVELOPMENT_CONTACTS_BACKEND.md`, `DOMO_SSO_BACKEND.md`
- **Frontend:** `DEAL_PIPELINE_FRONTEND_IMPLEMENTATION.md`, `DEAL_PIPELINE_FRONTEND_SUGGESTIONS.md`
- **Other:** `ENV_SETUP.md`, `EXCEL_EXPORT_STYLING_GUIDE.md`

## Repo

Part of [Stoa-Group](https://github.com/Stoa-Group) on GitHub.

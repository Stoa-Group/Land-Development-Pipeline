# Configuration Setup

## Overview

This is a static HTML/JavaScript application. Configuration is managed through `config.js`, which loads before the API client.

## Setup Instructions

1. Open `config.js`
2. Update `API_BASE_URL` to point to your backend API server:

```javascript
window.API_BASE_URL = 'https://your-api-server.com';
```

## Important Notes

⚠️ **Security**: `config.js` is loaded in the browser, so **never** put sensitive credentials in it:
- ✅ Safe: Public API URLs, feature flags, non-sensitive config
- ❌ Never: Database credentials, JWT secrets, passwords

For authentication, use the login system built into the app.

## Running Locally

To test locally, use Python's HTTP server:

```bash
python3 -m http.server 8000
```

Then open: `http://localhost:8000`

# Get Asana custom field GIDs (e.g. Stage, Product Type)

Use the Asana API to list custom fields for the **Deal Pipeline** project. You need a [Personal Access Token](https://app.asana.com/0/developer-console) (PAT).

**Deal Pipeline project GID:** `1207455912614114`

## 1. List all custom fields (name + GID)

```bash
# Set your token first
export ASANA_PAT="your_personal_access_token"

curl -s "https://app.asana.com/api/1.0/projects/1207455912614114/custom_field_settings" \
  -H "Authorization: Bearer $ASANA_PAT" | jq '.data[] | { name: .custom_field.name, gid: .custom_field.gid, type: .custom_field.resource_subtype }'
```

## 2. Filter for Stage and Product Type only

```bash
curl -s "https://app.asana.com/api/1.0/projects/1207455912614114/custom_field_settings" \
  -H "Authorization: Bearer $ASANA_PAT" | jq '.data[] | select(.custom_field.name | test("Stage|Product Type"; "i")) | { name: .custom_field.name, gid: .custom_field.gid }'
```

## 3. One-liner to see only GIDs for "Stage" and "Product Type"

```bash
# Stage
curl -s "https://app.asana.com/api/1.0/projects/1207455912614114/custom_field_settings" \
  -H "Authorization: Bearer $ASANA_PAT" | jq -r '.data[] | select(.custom_field.name == "Stage") | .custom_field.gid'

# Product Type
curl -s "https://app.asana.com/api/1.0/projects/1207455912614114/custom_field_settings" \
  -H "Authorization: Bearer $ASANA_PAT" | jq -r '.data[] | select(.custom_field.name == "Product Type") | .custom_field.gid'
```

Copy the printed GIDs into your backend env (e.g. `ASANA_CUSTOM_FIELD_GID_STAGE`, `ASANA_CUSTOM_FIELD_GID_PRODUCT_TYPE`) or into **api-client.js** `ASANA_CUSTOM_FIELD_GIDS` (e.g. `STAGE`, `PRODUCT_TYPE`).

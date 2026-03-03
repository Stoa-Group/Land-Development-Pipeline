# Deal Pipeline – Manual Testing Checklist

Use this checklist before releasing or after significant changes.

## 1. Navigation

- [ ] **Overview** – Tab renders, stage cards, deal counts
- [ ] **List** – Tab renders, deal rows
- [ ] **Map** – Tab renders, deal pins
- [ ] **Timeline** – Tab renders, year/quarter columns, cards
- [ ] **Upcoming Dates** – Tab renders, date rows with Date Type, Days from today
- [ ] **Unit Summary** – Tab renders, units by stage
- [ ] **Contacts** – Tab renders, contact list

## 2. Filters

- [ ] **Stage** – Apply stage filter, clear, verify filtered results
- [ ] **State** – Filter by state
- [ ] **Bank** – Filter by bank
- [ ] **Product Type** – Filter by product type
- [ ] **Date Added** – Filter by date range
- [ ] **Search** – Type in search box, verify deals filter

## 3. List Modes

- [ ] **By Stage** – List groups by stage
- [ ] **By Product Type** – List groups by product type
- [ ] **By Bank** – List groups by bank

## 4. Map

- [ ] **Deals map** – Pins render for deals with locations
- [ ] **Contacts map** – Pins render for contacts with address data
- [ ] **Split / Map / List** – Toggle views in Map tab
- [ ] **Geocoding** – Locations resolve to correct coordinates (or "Map unavailable" if service blocked)

## 5. Deal Detail

- [ ] Open deal from list
- [ ] Open deal from map pin
- [ ] Open deal from timeline card
- [ ] Open deal from Upcoming Dates row
- [ ] **Tabs:** Core, Dates, Land, Team, Asana, Files, Bank
- [ ] Previous/Next navigation
- [ ] Escape closes detail

## 6. Edit Mode / Deal Pipeline (Admin)

- [ ] **Edit Mode** – Toggle on (requires login)
- [ ] **Deal Pipeline** – Open admin table view
- [ ] Add deal, edit deal, save deal
- [ ] Stage changes persist
- [ ] Delete deal (with confirmation)

## 7. Files

- [ ] Upload file
- [ ] Rename file
- [ ] Download file
- [ ] Delete file

## 8. Export

- [ ] **Excel Internal** – Export with stage selection
- [ ] **Excel Investor** – Export (excludes sensitive columns)
- [ ] Stage selection affects output

## 9. Contacts

- [ ] **List** – Contacts render
- [ ] **Map** – Contact pins (if addresses present)
- [ ] **Add** – Create new contact
- [ ] **Edit** – Update contact, save
- [ ] **Delete** – Delete contact (with confirmation)
- [ ] **Send reminder** – Reminder goes to ReminderToEmail recipient, NOT to contact
  - Set "Send reminder to (who should be reminded)" in Edit contact
  - Verify email includes "You need to reach out to [Contact Name]"
  - Verify Notes, Office Address, City/State, Phone in email when present
  - Contacts without ReminderToEmail show clear error
- [ ] **Bulk send** – Multiple contacts, each to their ReminderToEmail

## 10. Auth

- [ ] **Login** – Login flow works
- [ ] **Domo SSO** – (if available) auto-login in Domo
- [ ] **ADMIN badge** – Shows when logged in
- [ ] **Other admins** – Presence indicator (if enabled)

## 11. Procore Sync

- [ ] When authenticated, verify Procore sync behavior (or note N/A if no Procore)

## 12. Error and Empty States

- [ ] **Load failure** – "Unable to load pipeline" with Retry button when API fails
- [ ] **Map unavailable** – "Map unavailable" in contacts map when geocoding blocked
- [ ] **Asana unavailable** – "Asana tasks unavailable" note in Upcoming Dates when fetch fails
- [ ] **Empty states** – No deals, no contacts, no files, no upcoming dates – friendly messages

## 13. Toasts

- [ ] Success toasts (green) – e.g. save, reminder sent
- [ ] Error toasts (red) – e.g. validation, API failure
- [ ] Info toasts (dark) – e.g. login required
- [ ] No `alert()` popups for normal feedback

## 14. Mobile

- [ ] Responsive layout
- [ ] Touch targets adequate
- [ ] Filters usable on small screens

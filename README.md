# MABUMBA TECH — Marketing & Customer Acquisition Module

This archive contains **only the new/changed files** for this feature, in
the same folder layout as the project root. Drop them into your existing
`MABUMBATECH/` folder, overwriting the matching paths.

**Unlike the previous fix patch, this one DOES require a database step —
see Step 1 below before deploying the code.**

## 1. Run the migration (required)

Run `database/migration_023_marketing_customer_acquisition.sql` in
phpMyAdmin (SQL tab) against your existing database. It is purely
additive:

- Adds a new **Marketing Officer** job role, alongside the existing
  Marketing Manager role.
- Adds a new **`marketing.acquisition.manage`** permission (granted to
  Marketing Manager by default) for reviewing/forwarding requests.
- Extends `service_requests` with the fields needed to capture a
  request made *on behalf of* a customer: `request_type`,
  `product_type_id`, `product_name`, `quantity`, `guest_location`,
  `additional_notes`, `source`, `created_by_staff_id`,
  `acquisition_status`. `service_id` becomes nullable (a pure product
  request has no service).
- Adds a small `acquisition_history` audit table (who did what, when).
- Also grants read-only `marketing.view` to Sales Officer, General/
  Operations Manager, and Accountant, per the visibility requirement.

Nothing existing is dropped, renamed, or made stricter — every current
request, lead, campaign, and permission keeps working exactly as before.

## 2. What this module does

**Marketing Officers** (new job role — assign it to a staff/admin
account via the existing Admin Accounts screen) can:

- Search for potential customers (checks both registered customer
  accounts and people who've submitted a guest request before).
- Register a request **on behalf of** a customer they found — full
  name, phone, email, location, service **or product**, quantity,
  requirements, budget, preferred date, additional notes.
- A tracking code is generated automatically on submission, exactly
  like a request submitted by a customer directly.

**Marketing Managers** can do everything an Officer can, plus:

- See every acquisition request company-wide (an Officer only sees
  their own).
- Mark a request reviewed, forward it to a staff member/department,
  or cancel it.
- View each request's full audit history.

**Customers** track these requests exactly the way they always have —
the existing Track Request page, by tracking code or phone number —
no new page, no new flow for them. (The Track Request backend and its
public JS were given a small backward-compatible fix so a product-only
request, which has no `service_id`, still displays correctly there.)

**Integration, not duplication:** a Marketing Officer's request becomes
a real row in the same `service_requests` table used everywhere else in
the system — the same table the admin Requests screen, staff task
assignment, notifications, and the Track Request page already work
with. It just carries `source = 'marketing_officer'` so it's clearly
identifiable as created on a customer's behalf, and a lightweight
`acquisition_history` table tracks the marketing-specific review/
forward/cancel actions on top of that.

## 3. New/changed files in this archive

**New:**
- `database/migration_023_marketing_customer_acquisition.sql`
- `backend/includes/marketing_acquisition.php` — core logic (create,
  review, forward, cancel, history, customer search).
- `backend/api/admin/marketing-acquisition.php` — the API endpoint.
- `frontend/html/admin/marketing-acquisition.html` — the admin page.
- `frontend/js/pages/admin-marketing-acquisition.js` — its script.

**Changed (small, targeted edits only):**
- `backend/includes/notify.php` — added `notify_job_role()` so Marketing
  Managers specifically get notified of new requests needing review.
- `backend/includes/api.php` — wires in the new include file.
- `backend/api/admin/requests.php` — `JOIN` → `LEFT JOIN` on `services`
  (twice) so a product-only acquisition request (no `service_id`) still
  shows up and can be assigned in the normal Requests screen; staff
  list falls back to "all active staff" when there's no service
  category to filter by.
- `backend/api/public/track-request.php` — same `LEFT JOIN` fix, plus
  joins `product_types` so a tracked product request shows its product
  name.
- `frontend/js/pages/public-track-request.js` — the tracking result
  card now falls back to the product name/type when there's no service
  (previously it assumed a service always existed).
- `frontend/js/layout-dash.js` — adds the "Customer Acquisition" sidebar
  link, shown to Marketing Officers, Marketing Managers, and full
  Administrators.

## 4. Testing notes

- After running the migration, create a test admin account with job
  role **Marketing Officer** (Admin Accounts screen → assign job role).
- Log in as that account: confirm the sidebar shows **Customer
  Acquisition** under "Sales & Marketing", and that other restricted
  pages (Staff Accounts, Admin Accounts, etc.) are still hidden.
- Submit a **service** request and a **product** request on behalf of a
  test customer; confirm a tracking code is returned both times.
- Log in as (or promote someone to) **Marketing Manager**: confirm they
  see *all* acquisition requests (not just their own), can mark one
  reviewed, forward it to a staff member, and cancel one.
- Open `frontend/html/public/track-request.html`, search by the
  tracking code just generated, and by the test customer's phone
  number — both the service and the product request should display
  correctly.
- Confirm the forwarded staff member sees the request appear in their
  normal task list (`staff/tasks.html`) and gets notified.
- Confirm existing, unrelated requests (customer-submitted, guest-
  submitted) still list, view, assign, and track exactly as before —
  the `LEFT JOIN` changes are additive and shouldn't affect them.

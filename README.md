# Aurelia wellness marketplace demo

A local wellness marketplace built with React and Express. Visitors can browse, search, create an account, add experiences to a bag, and complete a simulated checkout. Marketplace activity and the existing team enquiry form are saved locally before being sent to Venlix CRM.

## Requirements

- Node.js 22 or later
- npm

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Vite forwards `/api` requests to the backend on port 3001.

To run the built site from Express:

```bash
npm run build
npm start
```

Open `http://localhost:3001`.

For local delivery to Venlix CRM, start the CRM in a second terminal from its own project folder:

```bash
cd ../venlix_crm
pnpm dev
```

Keep both servers running: this website uses port 3001, and the CRM uses port 3000. The visitor stays on Aurelia. Marketplace journeys appear at `http://localhost:3000/leads` under **Marketplace intent**; team enquiries still appear under **Incoming website leads**. If the CRM is stopped, Aurelia saves events locally and retries delivery when it is reachable again.

## Webhook configuration

Copy `.env.example` to `.env` in the project root. By default, the backend sends lead events to Venlix CRM at `http://localhost:3000/api/lead-events`. Both servers must run on the same computer for `localhost` to work. If the CRM runs on another computer, use an address reachable **from this backend** and restart it. No deployment is needed for same-computer use.

```dotenv
PORT=3001
CRM_WEBHOOK_URL=http://localhost:3000/api/lead-events
CRM_MARKETPLACE_WEBHOOK_URL=http://localhost:3000/api/marketplace-events
LEAD_WEBHOOK_API_KEY=
```

If the CRM enables `LEAD_WEBHOOK_API_KEY`, set the **same value** here. The sender then includes `X-Webhook-Key` with each request. Leave it empty when the CRM does not require a key.

## Marketplace events

The catalog is defined in `backend/catalog.js`. Accounts use a salted scrypt password hash and an HTTP-only local session cookie. Account data and activity are kept in `backend/data/marketplace/` (ignored by Git). Cart contents and unsent browser actions use browser local storage. The browser sends activity to Aurelia's `/api/marketplace/events`; the Express server validates catalog items and prices, saves each event, and sends it to the CRM. It retries network errors and non-2xx responses with the same event ID and timestamp. CRM inserts are idempotent by event ID.

Events include `account_created`, `login_attempted`, `login_succeeded`, `search_performed`, `listing_viewed`, `added_to_cart`, `checkout_started`, and `demo_order_completed`. Anonymous activity uses a stable visitor ID. Registration or sign-in links that earlier activity to the account in the CRM. Search text and login credentials are not sent; the CRM receives search category and result count. Checkout is a **simulation**: it does not collect payment details or charge anything. The CRM owns identity grouping, scoring, stage, and next-action suggestions. This is a local demo, not a production commerce or authentication system.

`POST /api/leads` accepts `name`, `email`, and `phone`, plus optional `company`, `industry`, `interest`, and `message`. A successful request returns HTTP 201 with `saved: true` and `crmSync: "sent"` or `"pending"`. Any 2xx CRM response marks a lead sent. Network errors and non-2xx responses leave it pending; the backend retries automatically with increasing delays (starting at 10 seconds, capped at 5 minutes), including after a backend restart. The form shows a pending delivery message and checks for eventual delivery while open. Each lead is stored as a JSON file in `backend/data/leads/` (ignored by Git), including its original timestamp, source, and sync status. Retries reuse the original `time` value. The API logs delivery status without logging the lead's personal information.

`GET /api/leads/:id/status` returns only the delivery status for a saved lead. Local storage and the retry worker are designed for one backend process; use a shared database and coordinated worker before running multiple instances.

Webhook event shape:

```json
{
  "source": "dummy_website",
  "event": "new_lead",
  "lead": { "name": "Rahul Sharma", "email": "rahul@example.com", "phone": "9876543210", "company": "ABC Healthcare", "industry": "Healthcare", "interest": "Expert consultations", "message": "Please contact me" },
  "time": "2026-09-30T00:00:00.000Z"
}
```

The demo business copy is in `frontend/src/content.js`; the form's select options are in `frontend/src/components/LeadForm.jsx`. The webhook connection is isolated in `backend/config/integrationConfig.js` and `backend/integrations/crmWebhook.js`.

Local storage suits this MVP. The webhook's receiving address can later point at an Intelligence Engine without changing the form or event payload.

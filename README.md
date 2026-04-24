# GiftFlow Studio

A local prototype for automating Amazon gift campaigns for prospect outreach.

## What It Does

- Opens to a public product intro page before asking users to sign in.
- Moves users through a protected sign-in and a short onboarding flow before showing the campaign process workspace.
- Builds a multi-step gift sequence with send dates, ASINs or Amazon URLs, quantities, gift messages, and follow-up email copy.
- Stores prospect names, shipping addresses, company data, owners, and readiness flags in the browser.
- Requires a sequence confirmation before automation runs so gift/message edits are intentional.
- Processes due gifts through `POST /api/orders/process`, creates deduped order records, and keeps existing sends from being queued twice.
- Exports order history to CSV for review or handoff.

## Run It

```bash
ruby server.rb
```

Then open:

```text
http://127.0.0.1:4174
```

Set a custom port with `PORT=4180 ruby server.rb` if needed.

## Temporary Login Setup

The app is protected by a temporary email/password login while the production identity provider is being decided. For local testing, the default credentials are:

```text
Email: team@giftflow.local
Password: giftflow-demo
```

For anything shared with your team, set your own credentials before starting the server:

```bash
AUTH_EMAIL="you@company.com" \
AUTH_PASSWORD="use-a-strong-password" \
AUTH_NAME="Your Name" \
SESSION_SECRET="use-a-long-random-secret" \
ruby server.rb
```

The server verifies those credentials before setting a signed, HttpOnly session cookie. The order-processing API rejects unauthenticated requests.

## Amazon Automation Boundary

The current app supports queue-only and sandbox-style processing. The `amazon-business-api` mode creates records marked `ready_for_live_connector` when credential fields are present, but it does not place live Amazon orders yet.

To complete live ordering, connect the processing endpoint to the approved Amazon Business buying workflow for your account, then map each generated `amazonPayload` to that API's order creation request. Keeping this boundary explicit prevents accidental gift sends while campaign setup is still being tested.

## CSV Import Format

Paste one prospect per line:

```csv
name,email,company,street,city,state,zip,assignedTo
```

The first seven columns are required for a recipient to be marked ready.

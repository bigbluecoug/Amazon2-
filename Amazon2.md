# GiftFlow Studio

A local prototype for automating Amazon gift campaigns for prospect outreach.

## What It Does

- Opens to a public product intro page before asking users to sign in.
- Moves users through a protected sign-in and a short onboarding flow before showing the campaign process workspace.
- Builds a multi-step gift sequence with send dates, ASINs or Amazon URLs, quantities, gift messages, and follow-up email copy.
- Includes a connected Amazon Associates ideas page where you can add your Associates tag and generate affiliate-ready Amazon gift idea links.
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

## Run It With Laravel Herd

Herd serves PHP apps through local `.test` domains. This repo includes a small PHP front controller (`index.php`, `public/index.php`, and `herd-router.php`) that mirrors the Ruby API, so you can run the same UI and automation queue through Herd without starting `server.rb`.

From the project root, link the site with a clean local name:

```bash
herd link giftflow
herd open giftflow
```

Then use:

```text
http://giftflow.test
```

If you prefer the Herd UI, add this project as a linked directory and use `giftflow` as the site name. Linking the project root or the `public/` folder both work.

For custom login credentials in Herd, copy the example env file and edit the values:

```bash
cp .env.example .env
```

Use a long random `SESSION_SECRET`; for example:

```bash
openssl rand -hex 32
```

## Temporary Login Setup

The app is protected by a temporary email/password login while the production identity provider is being decided. For local testing, the default credentials are:

```text
Email: team@giftflow.local
Password: giftflow-demo
```

When the app is running with those local defaults, the sign-in screen also shows an **Open demo workspace** button that signs in and opens the flow page directly.

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

The current app supports review-queue and test-run processing. Connected Amazon queue mode creates records marked `ready_for_live_connector` when the workspace has an Amazon Business connection, but it does not place live Amazon orders yet.

The Amazon Business app values should be set once by a workspace admin on Forge. After that, the Amazon Business admin can use `/automation.html` to connect Amazon, and regular team members can run GiftFlow without seeing app IDs, tokens, endpoints, or OAuth codes.

To complete live ordering, connect the processing endpoint to the approved Amazon Business buying workflow for your account, then map each generated `amazonPayload` to that API's order creation request. Keeping this boundary explicit prevents accidental gift sends while campaign setup is still being tested.

## Amazon Associates Links

The gift sequence links to a connected `/ideas.html` page for Amazon Associates links. Add your Associates tag, review the generated Amazon URLs, and keep the on-screen disclosure visible anywhere those links are shown.

For product images, use URLs from Amazon's approved Associates or Product Advertising API tools. Do not copy, download, or re-host product images from Amazon product pages.

## CSV Import Format

Paste one prospect per line:

```csv
name,email,company,street,city,state,zip,assignedTo
```

The first seven columns are required for a recipient to be marked ready.

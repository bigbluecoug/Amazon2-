# GiftFlow Studio

A Laravel app for automating Amazon gift campaigns for prospect outreach.

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
composer install
php artisan serve --host=127.0.0.1 --port=4174
```

Then open:

```text
http://127.0.0.1:4174
```

The older Ruby development server is still available as a fallback with `ruby server.rb`, but Laravel is now the primary runtime.

## Run It With Laravel Herd

Herd serves PHP apps through local `.test` domains. This repo is now a Laravel app, with the existing GiftFlow API routed through Laravel while the remaining legacy endpoints are migrated into native controllers.

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

## Account Login Setup

GiftFlow supports registered accounts with hashed passwords. The first created account becomes an admin. For a live workspace, set a long session secret and decide whether account registration should stay open:

```bash
SESSION_SECRET="use-a-long-random-secret"
ALLOW_ACCOUNT_REGISTRATION=true
```

The server verifies account credentials before setting a signed, HttpOnly session cookie. The order-processing API rejects unauthenticated requests.

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

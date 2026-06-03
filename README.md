# GiftFlow Studio

A local prototype for automating Amazon gift campaigns for prospect outreach.

## What It Does

- Opens to a public product intro page before asking users to sign in.
- Moves users through a protected sign-in and a short onboarding flow before showing the campaign process workspace.
- Builds a multi-step gift sequence with send dates, ASINs or Amazon URLs, quantities, gift messages, and follow-up email copy.
- Includes a connected Amazon Associates ideas page and backend-editable gift catalog for affiliate-ready gift links.
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

For live or shared access in Herd, copy the example env file and set private values:

```bash
cp .env.example .env
```

Use a long random value for `SESSION_SECRET`; for example:

```bash
openssl rand -hex 32
```

## Account Login Setup

The app supports account creation with email and password. Accounts are stored server-side in `data/users.json`, and passwords are stored as salted hashes. The first created account is marked as an admin for editing gift ideas.

For a live workspace, set a long session secret before starting the server:

```bash
SESSION_SECRET="use-a-long-random-secret" \
ALLOW_ACCOUNT_REGISTRATION=true \
ruby server.rb
```

After you create the accounts you want, set this on Forge if you want to stop public sign-ups:

```bash
ALLOW_ACCOUNT_REGISTRATION=false
```

You can still keep a private fallback login by setting these values:

```bash
AUTH_EMAIL="you@company.com" \
AUTH_PASSWORD="use-a-strong-password" \
AUTH_NAME="Your Name" \
ruby server.rb
```

The server verifies credentials before setting a signed, HttpOnly session cookie. The order-processing API rejects unauthenticated requests. Demo login is disabled unless `ALLOW_DEMO_LOGIN=true` is explicitly set. Do not enable demo login for a shared or live site.

Password reset is available from the sign-in screen for registered accounts. Reset links expire after 30 minutes and are stored server-side as hashes. On local `localhost` or `127.0.0.1`, the reset request can show the link in the browser for testing. On Forge, the app writes the reset link to the server log so a workspace admin can send it to the account owner; set `SHOW_PASSWORD_RESET_LINKS=true` only for a private, trusted testing environment.

## Amazon Automation Boundary

The current app supports review-queue and test-run processing. Connected Amazon queue mode creates records marked `ready_for_live_connector` when the workspace has an Amazon Business connection, but it does not place live Amazon orders yet.

GiftFlow keeps the technical setup out of the normal team workflow. One workspace admin sets these private values on Forge after Amazon Business API approval:

```bash
AMAZON_BUSINESS_APPLICATION_ID="amzn1.sp.solution.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
AMAZON_BUSINESS_CLIENT_ID="your-lwa-client-id"
AMAZON_BUSINESS_CLIENT_SECRET="your-lwa-client-secret"
AMAZON_BUSINESS_REDIRECT_URI="https://amazon2-momyzfei.on-forge.com/api/amazon/oauth/callback"
AMAZON_BUSINESS_MARKETPLACE_URL="https://www.amazon.com"
AMAZON_BUSINESS_MARKETPLACE_ID="ATVPDKIKX0DER"
AMAZON_BUSINESS_API_ENDPOINT="https://na.business-api.amazon.com"
```

Add this exact redirect URI to the Amazon Business Solution Provider Portal app registration:

```text
https://amazon2-momyzfei.on-forge.com/api/amazon/oauth/callback
```

Then the Amazon Business admin signs in to GiftFlow and opens the dedicated automation console:

```text
https://amazon2-momyzfei.on-forge.com/automation.html
```

Choose **Connect Amazon Business** and approve access. GiftFlow saves the private Amazon connection in the workspace so regular team members can use the send queue without seeing app IDs, tokens, endpoints, or OAuth codes. If Amazon shows a callback URL instead of returning cleanly, use the troubleshooting section on `/automation.html` to paste the full callback URL before the temporary code expires.

To complete live ordering, connect the processing endpoint to the approved Amazon Business buying workflow for your account, then map each generated `amazonPayload` to that API's order creation request. Keeping this boundary explicit prevents accidental gift sends while campaign setup is still being tested.

## Amazon Associates Links

The gift sequence links to a connected `/ideas.html` page for Amazon Associates links. Add your Associates tag, review the generated Amazon URLs, and keep the on-screen disclosure visible anywhere those links are shown.

Gift suggestions are loaded from `data/gift-ideas.json`. Signed-in users can edit the backend catalog at `/admin-gifts.html`, which saves through `POST /api/gift-ideas`.

Catalog edits are restricted to admin accounts and approved admin emails. The first created account is an admin. To allow more people by email, set a comma-separated list:

```bash
GIFT_IDEA_ADMIN_EMAILS="you@company.com,teammate@company.com"
```

For product images, use URLs from Amazon's approved Associates or Product Advertising API tools. Do not copy, download, or re-host product images from Amazon product pages.

## CSV Import Format

Paste one prospect per line:

```csv
name,email,company,street,city,state,zip,assignedTo
```

The first seven columns are required for a recipient to be marked ready.

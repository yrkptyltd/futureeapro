# Future EA Pro (futureeapro)

MVP hosting platform for mentor robots with:
- Mentor sign up and sign in
- Client app landing page requesting Mentor ID + client email
- Client subscription plans:
  - 1 month: R599
  - 3 months: R1499
  - 1 year: R4599
- Superhost-only controls via one configured email
- Mentor robot profile creation and key stats tracking
- Mentor sidebar dashboard with totals (Total Keys, Total Generated, Active Subscribers)
- Mentor sidebar includes **My Profile** (portal-only details + image)
- Mentor business tracking with price-per-key, monthly key target, keys sold, and revenue
- Client subscription page shows robot picture from mentor robot profile
- Client app includes switchable robot card faces (Square default, Rounded, Capsule, Neon Frame)
- Client app robot interface uses section-based layouts with a side menu (Home, Trade, Metrader, Details)
- Metrader broker connect supports MT4/MT5 brokers including Razor Markets and custom broker servers
- Sequential license keys starting from 100 and increasing (100, 101, 102, ...)
- One-click robot conversion for mobile delivery (Android + iOS status)
- Superhost neon theme/custom color controls for the full portal (Dope Red default + other presets)
- Clean landing page with detailed modules moved to `/platform`
- Superhost approval, subscription reactivation/bypass, and license key limit control

## Stack
- Node.js
- Express + EJS
- Session auth
- Local JSON database (`src/data/db.json`)

## Run
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env file and customize:
   ```bash
   cp .env.example .env
   ```
3. Start the app:
   ```bash
   npm start
   ```
4. Open:
   - `http://localhost:3000`
   - Android entry link: `http://localhost:3000/download/android`

## Auto-create Render Web Service
You can create the Render web service from your repo automatically via API:

```bash
RENDER_API_KEY=your_render_api_key \
RENDER_REPO_URL=https://github.com/<you>/<repo> \
RENDER_SERVICE_NAME=futureeapro-web \
RENDER_CUSTOM_DOMAINS=futureeapro.com,www.futureeapro.com \
bash scripts/create-render-web-service.sh
```

Optional environment variables:
- `RENDER_OWNER_ID` (or use `RENDER_WORKSPACE_NAME` / `RENDER_WORKSPACE_EMAIL`)
- `RENDER_BRANCH` (default: `main`)
- `RENDER_PLAN` (default: `starter`)
- `RENDER_REGION` (default: `oregon`)
- `RENDER_BUILD_COMMAND` (default: `npm install`)
- `RENDER_START_COMMAND` (default: `npm start`)
- `SESSION_SECRET`, `SUPERHOST_EMAIL`, `SUPERHOST_PASSWORD`, `CLIENT_BYPASS_EMAILS`

## Full Auto Bootstrap (GitHub + Render)
Create GitHub repo, push this project, create Render web service, and attach domains:

```bash
GITHUB_TOKEN=your_github_pat \
RENDER_API_KEY=your_render_api_key \
GITHUB_REPO=futureeapro \
RENDER_SERVICE_NAME=futureeapro-web \
RENDER_CUSTOM_DOMAINS=futureeapro.com,www.futureeapro.com \
bash scripts/bootstrap-github-and-render.sh
```

Optional:
- `GITHUB_OWNER` (auto-detected from token if omitted)
- `GITHUB_BRANCH` (default: `main`)
- `GITHUB_PRIVATE` (default: `false`)

## Generate Client App Previews
Run all iOS and Android client previews automatically:
```bash
npm run preview:client-mobile
```
Outputs are saved in `previews/mobile/`.

## Superhost behavior
- The email in `SUPERHOST_EMAIL` is treated as superhost (default: `superhost@futureeapro.com`).
- On first boot, if that account does not exist, it is auto-created with `SUPERHOST_PASSWORD`.
- Superhost can:
  - Approve/revoke mentors
  - Reactivate/deactivate mentor subscription access
  - Set each mentor's license key limit
  - View full mentor details

## Client bypass email
- Default bypass emails: `nhlanhlamashapa11@gmail`, `nhlanhlamashapa11@gmail.com`
- Bypass means the client skips paid plan selection and goes straight to license unlock.
- You can extend or override bypass emails with:
  - `CLIENT_BYPASS_EMAILS=email1@example.com,email2@example.com`

## Mentor behavior
- Mentors register and wait for superhost approval.
- After approval, mentors can sign in.
- Creating robots and generating license keys requires active subscription access.

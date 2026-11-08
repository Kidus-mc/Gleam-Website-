# Gleam

On-demand car detailing marketplace. Customers enter a ZIP, see nearby detailers and their own prices, and send a booking request. Detailers apply with their prices, service area and custom add-ons.

Plain static site (HTML, CSS, JS), no build step. Data, member login and booking requests run on Wix Headless (client ID in the pages; it is public by design).

| Page | What it is |
| --- | --- |
| `index.html` | Home: packages, ZIP search, booking request |
| `detailers.html` | Detailer application: prices, address, radius, add-ons |
| `login.html` | Log in / create account (customers and detailers) |
| `account.html` | My account: booking requests, application status |
| `privacy.html`, `terms.html`, `404.html` | Legal and not-found pages |

## Deploy

- **Netlify:** connect this repo, leave the build command empty, publish directory `.` (already set in `netlify.toml`).
- **Wix:** the same files are published to the Wix Headless site.

## Server (Netlify)

- `netlify/edge-functions/login-wall.js`: checks the member's login before the homepage, detailers page and account page are sent.
- `netlify/functions/book.mjs`: saves booking requests and works out the price from the detailer's listing.
- `netlify/functions/my-bookings.mjs`: returns only the logged-in member's own requests.
- `netlify/functions/upload-url.mjs`: one-time photo upload links for logged-in detailers.
- `netlify/functions/health.mjs`: says whether the server is set up.

Needs one Netlify environment variable: `WIX_CLIENT_SECRET` (Wix → Settings → Headless Settings → client → Generate Client Secret). Never put it in the code.

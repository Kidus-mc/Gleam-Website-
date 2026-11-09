# Gleam

On-demand car detailing marketplace. Members log in, see the detailers who serve their saved ZIP (mobile detailers who come to them, or shops they drive to) with each detailer's own prices, and send a booking request. Detailers apply with their prices, service area or shop address, custom add-ons and photos of their work.

Plain static site (HTML, CSS, JS) with no build step, plus a few Netlify functions. Data, member login and media live in Wix Headless (the client ID in the pages is public by design).

| Page | What it is |
| --- | --- |
| `index.html` | Home: packages, detailer list, booking request, saved address |
| `detailers.html` | Detailer application: mobile and/or shop, prices, area, add-ons, work photos |
| `login.html` | Log in / create account (customers and detailers) |
| `account.html` | My account: booking requests (with shop directions), application status |
| `privacy.html`, `terms.html`, `404.html` | Legal and not-found pages |

## Deploy

- **Netlify:** connect this repo, leave the build command empty, publish directory `.` (already set in `netlify.toml`).
- **Wix address:** only forwards visitors to the Netlify site; nothing is published there anymore.

## Code

- `js/gleam-auth.js`: member login, sign-up, logout and the login cookie (readable source, edit directly).
- `assets/`: shared styles for the simpler pages, light mode, and the cookie-choices + Appearance menu script.

## Server (Netlify)

- `netlify/edge-functions/login-wall.js`: checks the member's login before the homepage, detailers page and account page are sent.
- `netlify/functions/book.mjs`: saves booking requests and works out the price from the detailer's listing.
- `netlify/functions/my-bookings.mjs`: returns only the logged-in member's own requests.
- `netlify/functions/upload-url.mjs`: one-time photo upload links for logged-in detailers.
- `netlify/functions/health.mjs`: says whether the server is set up.

Needs one Netlify environment variable: `WIX_CLIENT_SECRET` (Wix → Settings → Headless Settings → client → Generate Client Secret). Never put it in the code.

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

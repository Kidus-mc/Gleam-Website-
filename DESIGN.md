# Gleam design notes

What the site looks like and why, so every change stays consistent.

## Feel
Dark, quiet and confident, like a clean car at night. One accent colour, big condensed headlines, plain words.

## Colour
- Background `#08080a`, surface a step lighter, text off-white.
- One accent: Gleam orange-red (`--accent`), for buttons, numbers and small markers only.
- No purple, no rainbow gradients. The only gradients are fades to the background and the hero wordmark.
- A light theme exists; the white logo is inverted there automatically.

## Type
- Headlines: **Anton**, uppercase, tight line height.
- Everything else: **Onest** (400/500/600).
- Small labels: uppercase with wide letter spacing.

## Logo and icons
- `assets/logo.png`: white on transparent (header and footer).
- `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`: full logo on black (home screen, Google).
- `favicon-32.png`, `assets/icon-64.png`: the sparkle only (browser tab).

## Photos
- Real photos only, no AI images. Each package uses a different car, all dark and moody to match.
- When Gleam has its own detailers' before-and-after photos, use those instead of stock.

## Words
- Say what Gleam really does: compare local detailers, see their price, book, pay the detailer when it's done.
- Never claim features that don't exist (live tracking, in-app payment, ratings) until they do.
- No fake numbers, stats or testimonials. Add reviews only when they're from real customers.
- No placeholder text on the live site.

## Motion
- The hero plays once: the GLEAM letters rise and the car outline draws in.
- No fade-ins on scroll; content is just there.
- Hover and tap feedback is fine. Respect "reduce motion".

## Layout
- Sections are rows and lists, not rows of identical cards.
- Same content on phone and desktop; the phone only changes the layout.

## Checking changes
Screenshot the home page on desktop (1440 wide) and phone (390 wide) after every visual change, in dark and light mode.

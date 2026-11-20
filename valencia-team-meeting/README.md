# Valencia 2026 | Team Hub

An image-free, mobile-first, English-language guide for the JinkoSolar Europe team visit to Valencia, 22–27 November 2026.

Live site: https://fufufuono.github.io/valencia-team-meeting/

## Two-page structure

- **Home**: upcoming confirmed dinner/team activity, Valencia-time countdown, hotel address, Google Maps navigation, copy address, check-in guidance, and the 25 November Treasure Hunt.
- **Dining**: six dinners (22–27 November), direct provided Google Maps restaurant links, copy address, and pre-selected meal lookup with first name / full name matching.

The site intentionally contains **no meeting-session agenda**, no schedule tab, and no meeting-related Coming Soon placeholders. The former Info page has been integrated into Home.

Information lives in `data.js`: dates, hotel, dinner restaurants, links and Treasure Hunt. There is no build dependency or external framework. Times are for Valencia (Europe/Madrid); 22–27 November 2026 falls in CET (UTC+1). If you edit dinner times, the homepage's next-event indicator updates automatically.

## Encrypted dinner selections (23–26 November)

The source workbook contained 116 participant/date entries representing 44 people. No personal selection sheets were provided for 22 or 27 November.

`meals.enc.json` contains browser-side AES-256-GCM ciphertext, with PBKDF2-SHA256 key derivation. The passcode is not stored in the repository. `app.js` decrypts the payload in memory and searches the selected day's names using given name or full name; when multiple colleagues share a given name, it requires the full name.

**Important:** A shared passcode on a public site is not account authentication. Anyone who knows or guesses the passcode can potentially access all of the records, including notes. Avoid sharing the passcode in public, and use a company-authenticated service if access needs to be per person. Do not commit employee names, meal orders, raw Excel source data, or passcodes in plaintext.

## Publishing

Only `/valencia-team-meeting/` is modified inside the existing `fufufuono/fufufuono.github.io` GitHub Pages repository. The root site/blog is unchanged. Changes committed to `main` publish through the existing Pages workflow.

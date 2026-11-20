# Valencia 2026 | Team Hub

An image-free, mobile-first, English-language guide for the JinkoSolar Europe team visit to Valencia, 22–27 November 2026.

Live site: https://fufufuono.github.io/valencia-team-meeting/

## Two-page structure

- **Home**: upcoming confirmed dinner/team activity, Valencia-time countdown, hotel address, Google Maps navigation, copy address, check-in guidance, and the 25 November Treasure Hunt.
- **Dining**: six dinners (22–27 November), direct provided Google Maps restaurant links, copy address, and pre-selected meal lookup with first name / full name matching.

The site intentionally contains **no meeting-session agenda**, no schedule tab, and no meeting-related Coming Soon placeholders. The former Info page has been integrated into Home.

Information lives in `data.js`: dates, hotel, dinner restaurants, links and Treasure Hunt. There is no build dependency or external framework. Times are for Valencia (Europe/Madrid); 22–27 November 2026 falls in CET (UTC+1). If you edit dinner times, the homepage's next-event indicator updates automatically.

## Public dinner selection lookup (23–26 November)

The user requested that team members no longer enter an access code. The Dining page automatically decrypts the existing `meals.enc.json` file in the browser, then supports first-name or full-name search. The source workbook contains 116 participant/date entries representing 44 people. No personal selection sheets were supplied for 22 or 27 November.

**Privacy and security:** The browser decryption key is now included in publicly served `app.js`. The meal dataset is therefore **publicly recoverable**, including names, dish selections and dietary notes. The AES-encrypted file must *not* be mistaken for effective access control. The search interface limits the display, but anyone can inspect the downloaded data. Do not assume individual privacy. For private access without manual passcodes, use a company identity provider and a permission-protected backend.

The original Excel workbook is not committed into this repository.

## Publishing

Only `/valencia-team-meeting/` is modified inside the existing `fufufuono/fufufuono.github.io` GitHub Pages repository. The root site/blog is unchanged. Changes committed to `main` publish through the existing Pages workflow.

# Valencia Team Meeting 2026

A mobile-first, image-free, English-language event hub for JinkoSolar Europe teammates visiting Valencia, 22–27 November 2026.

Live URL (assuming GitHub Pages is serving the default branch):
https://fufufuono.github.io/valencia-team-meeting/

## Content and updates

Edit **data.js** to update the hotel's location, restaurant addresses, dinner times, detailed meeting sessions, and the Treasure Hunt. No build tools, API tokens, backend, images, or packages are needed.

- **Home**: next confirmed event and countdown
- **Schedule**: date switching, meeting-agenda placeholder, dinner and activity timeline
- **Dining**: all six dinners, direct Google Maps links, reserved meal-search area
- **Info**: hotel check-in guidance, Treasure Hunt and FAQ

### Add confirmed meeting sessions

In data.js, under meetingAgenda:

    meetingAgenda: {
      "2026-11-25": [
        {
          start: "09:00", end: "10:00",
          title: "Your confirmed session",
          presenter: "Presenter name",
          room: "Meeting room",
          notes: "Optional notes"
        }
      ]
    },

Meeting times are Valencia local time (Europe/Madrid). The 2026-11-22 to 2026-11-27 dates fall in CET, UTC+1. The site intentionally avoids inventing unknown agenda items and durations.

### Encrypted dinner selections (23–26 November)

The source workbook contains 116 participant/date records, representing 44 distinct employees. The supplied workbook did not include dinner selections for 22 or 27 November.

The public repository contains only **meals.enc.json**, a client-side AES-256-GCM encrypted payload with a random salt and nonce and PBKDF2-SHA256 (220,000 iterations). The access code is **not** stored in the repository. The browser decrypts records only after a team access code has been entered; it keeps the decrypted rows in memory and supports first-name or full-name searches. Duplicate first names require a full name.

**Security limitation:** This is a shared-team passcode, not authentication or per-user access control. Anyone with the passcode can potentially inspect every decrypted employee name, order, and note. Share it only via an appropriate internal channel; never publish the access code on GitHub. For stricter privacy, replace the lookup with a company-authenticated backend. Keep data in source files out of public repos, including plaintext logs.

To replace the dataset, parse the updated source locally and generate a new randomized, authenticated ciphertext. Never check a plaintext staff order list or the access code into the repository.

## Publishing

Files are in the /valencia-team-meeting/ folder of the existing GitHub Pages repo. They do not change the root blog design or Jekyll configuration. Updating and committing these files on main updates the published page when Pages is enabled and configured to deploy from main.

No dependency installation or login is needed for visitors.

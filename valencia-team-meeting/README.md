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

### Meal selection privacy

The site is publicly accessible on GitHub Pages. Do **not** place an employee-name/order list into data.js unless you have an appropriate basis to publish it publicly. Hiding records in the UI or search results does not protect static source data. A separate access-controlled service, or consented anonymous lookup codes without identity linkage, would be better for private meal selections.

The current mealSelections array is empty. The lookup is visually reserved but does not imply that any personal orders have already been uploaded.

## Publishing

Files are in the /valencia-team-meeting/ folder of the existing GitHub Pages repo. They do not change the root blog design or Jekyll configuration. Updating and committing these files on main updates the published page when Pages is enabled and configured to deploy from main.

No dependency installation or login is needed for visitors.

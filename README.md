# FaceIT simplified

Version 0.2.2 adds a seven-day Elo calendar after the skill-rating panel. Every other widget in that row (missions, campaigns, league registration, season passes, and any promotion FACEIT adds later) is hidden automatically, as is the entire Ladders section. The extension popup has one switch to restore the original page.

## Elo calendar

- **Elo gain** heading, with the displayed week’s net Elo immediately after its date range, followed by the number of matches played that week. The current week shows its totals so far. Incomplete weeks show `… Elo` and `… matches`.
- One Monday–Sunday row, with previous/next week controls and a **This week** shortcut.
- Daily net Elo equals the sum of `eloDelta` for matches **started on that date in your browser's local timezone**. 
- Gains use **#05ff00** and losses use **#ef0000**. Larger absolute changes use a stronger color on a fixed scale shared by all weeks.
- Days without matches show a neutral dash. Matches with a net zero show `0`.
- Select a day to see its match count and total Elo gained/lost. Hover or keyboard focus also provides a descriptive day label.
- Future dates are inactive. Missing Elo and incomplete history show `…`, never a misleading zero or partial daily total.
- The refresh button reloads history. Visible calendars also refresh after five minutes.

For the supplied September 26, 2026 example in Europe/Berlin: **9 matches, +138 gained, −97 lost, net +41**. Using match start dates is necessary to match this result; one match crossed midnight.

## Loading earlier history

The calendar begins with the most recent 30 matches. It requests larger recent-history windows (`limit=60`, `90`, and so on) only when the visible week requires more data. Overlapping matches are deduplicated, and previously loaded weeks are reused in memory.

The oldest fetched day is considered incomplete until a strictly earlier day has been retrieved or FACEIT reports the end of history. This handles both 30 matches in one day and 30 matches spread over several weeks.

Each action makes at most four history requests. If more are needed, use **Load more matches**. If FACEIT caps the results, blocks a request, or returns an unexpected response, the widget reports the problem and keeps uncovered days marked incomplete. The larger-limit behavior still needs verification in a signed-in Chrome session.

## Install or update in Chrome

1. Download [`faceit-simplified.zip`](https://github.com/markprudnikov/faceit-simplify/releases/latest/download/faceit-simplified.zip) from the [latest release](https://github.com/markprudnikov/faceit-simplify/releases/latest) and extract it.
2. Open `chrome://extensions` in Chrome.
3. For a first installation, enable **Developer mode**, select **Load unpacked**, and choose the `faceit-simplified` folder containing `manifest.json`.
4. For an update, replace the files in the previously loaded folder and click **Reload** on the extension's card.
5. Refresh your open FACEIT tab.

Chrome 120 or later is required. This is a local development extension, not a Chrome Web Store release.

## Releasing

GitHub Actions (`.github/workflows/build.yml`) checks and packages the extension on every push and pull request; the packaged folder is attached to each run as a build artifact. When `master` contains a `manifest.json` version that has no release yet, the workflow publishes release `v<version>` with `faceit-simplified.zip` attached. To ship an update, bump `version` in `manifest.json` and push to `master`.

## Scope and data

Changes apply to `/matchmaking` and localized versions such as `/en/matchmaking`, including query strings. Match rooms, queue match lists, league pages, and other platform pages are outside this version's scope.

The content script is available on `faceit.com` and `www.faceit.com` so it also works when FACEIT navigates without a full reload. It activates only on the matchmaking home route. Existing Elo, party, readiness, and queue controls retain their original behavior.

The calendar makes authenticated, same-origin GET requests to:

- `/api/users/v1/sessions/me` to obtain the current player's ID.
- `/api/statistics/v1/cs2/players/{id}/match-rounds?limit={count}` to obtain match dates and Elo changes.

It uses the existing FACEIT session; no password or API key is needed. The player ID is discovered dynamically, never hardcoded. The extension neither saves nor displays the session response's personal profile fields. Match data stays in memory and is cleared when the extension is switched off or you leave matchmaking. The only persistent extension preference is the on/off switch. There is no telemetry, external backend, or additional permission beyond local storage.

## Validation and maintenance

Seventeen focused data checks passed, covering the supplied +41 example, start-date/timezone grouping, losses, neutral days, overlapping histories, missing Elo, color intensity, DST/calendar boundaries, progressive loading, partial days, capped responses, empty histories, cancellation, and malformed responses. JavaScript syntax and manifest resources were checked.

The hiding selectors were checked against the signed-in page. The skill-rating row is hidden by allowlist: only the slot containing the Elo widget and the calendar stay visible, so new banners need no selector changes. The actual Chrome network response was inspected: the HTTP API returns snake_case fields, whereas the supplied sample used camelCase. Version 0.2.1 accepts both formats, with regression checks for the +41 example, continuation tokens, and zero Elo. The updated version still needs an end-to-end check after installation in Chrome.

FACEIT can change its private API or rename page components. If that happens, update the endpoints/response handling in `elo-calendar.js` and `elo-core.js`, or the component selectors in `matchmaking.css` and `elo-calendar.js`.

This project is independent and is not affiliated with FACEIT.

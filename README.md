# FaceIT simplified

Version 0.3.0 adds compact party rows with Anti-Cheat indicators and fixes loading earlier weeks in the seven-day Elo calendar. The redundant invite tooltip and run-Anti-Cheat banner are hidden in simplified mode. Every other widget in the skill-rating row (missions, campaigns, league registration, season passes, and any promotion FACEIT adds later) is hidden automatically, as is the entire Ladders section. A **Simplified** switch next to the anti-cheat icon in the Play header, and the same switch in the extension popup, restore the original page. Both share one locally stored setting.

## Compact party

Simplified mode turns matchmaking's tall party cards into compact horizontal
member rows with a small avatar, nickname, country, skill level, and Elo. Each row
is 56 pixels high, with three members across on wide screens, two at medium
widths, and one on narrow screens. Repeated empty invite slots collapse to one
square **Invite** control; **Find Parties** is a matching square search button.
Both retain accessible names. Empty party
controls no longer reserve a blank row, while populated controls and member
header badges remain visible.

The layout restyles FACEIT's existing elements, preserving their event handlers
and popovers. It does not fetch party data, clone members, or implement queue
eligibility. A shield immediately after the country flag mirrors FACEIT’s Anti-Cheat status: orange when on, gray when off. The signed-in player is matched by the session nickname; other members use recognizable native card indicators, with unknown status shown gray and labelled unavailable. Only the exact English “Please run Anti-Cheat” panel with the native download action is hidden. Cooldowns and other errors remain visible, and FACEIT still controls whether Find Match is enabled. The header’s original Anti-Cheat control remains available for download/launch actions. Turning Simplified off restores
the original party layout.

The implementation targets the observed player-card component names and known
empty-slot markup. Multi-member parties, pending invitations, leader controls,
and active cooldowns still need validation in those live states. A local fixture
using captured markup and computed styles verified 56-pixel member/action heights
and the three-plus-two arrangement with five sample members; this does not verify
FACEIT's multi-member interactions.

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

The calendar begins with the most recent 30 matches from FACEIT’s Track/History endpoint. When an earlier week needs more data, it requests another page of 30 using the response’s `nextOffsetToken` as the next request’s `offsetToken`. The page size stays fixed. Overlapping matches are deduplicated, and previously loaded weeks are reused in memory. Empty competition, game-mode, and map filters preserve the calendar’s existing scope of all CS2 match Elo.

The oldest fetched day is considered incomplete until a strictly earlier day has been retrieved or FACEIT reports the end of history. This handles both 30 matches in one day and 30 matches spread over several weeks.

Each action makes at most four history requests. If more are needed, use **Load more matches**. Failed requests retry the same cursor. Repeated cursors, empty pages with a continuation token, and pages that make no progress are rejected without advancing coverage. Errors keep uncovered days marked incomplete.

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

The calendar makes authenticated, same-origin requests to:

- `GET /api/users/v1/sessions/me` to obtain the current player's ID.
- `POST /api/statistics/v1/cs2/player-profile-history` to read match dates and Elo changes. Its JSON body contains the player ID, `limit: 30`, empty CS2 filter arrays, and an `offsetToken` on subsequent pages. This POST is a history query; it does not change matches or the account.

It uses the existing FACEIT session; no password or API key is needed. The player ID is discovered dynamically, never hardcoded. The extension neither saves nor displays the session response's personal profile fields. Match data stays in memory and is cleared when the extension is switched off or you leave matchmaking. The party indicator also reads the session endpoint to identify the signed-in nickname. It retains only that nickname in memory while enabled and makes no Anti-Cheat service requests. The only persistent extension preference is the on/off switch. There is no telemetry, external backend, or additional permission beyond local storage.

## Validation and maintenance

On October 11, 2026, browser inspection reproduced HTTP 403 for the old `match-rounds?limit=60` call. FACEIT’s own Track/History page successfully used `POST player-profile-history` with a fixed limit of 30 and `offsetToken` pagination. Its date filter uses `cs2.from`; the calendar currently keeps a continuous cached history rather than applying that filter. Eight regression checks in `.github/scripts/elo-core.test.mjs` cover cursor progression, split days, deduplication, retries, repeated tokens, bounded loading, exhaustion, cancellation, response formats, and local dates. Run them with `node --test .github/scripts/elo-core.test.mjs`. After reloading the extension, the live calendar loaded September 28–October 4 completely (20 matches, +31 Elo), September 21–27 (16 matches, −25 Elo), and September 14–20 (11 matches, +84 Elo). September 26 retained the known 9-match, +41 Elo result.

Seventeen focused data checks passed, covering the supplied +41 example, start-date/timezone grouping, losses, neutral days, overlapping histories, missing Elo, color intensity, DST/calendar boundaries, progressive loading, partial days, capped responses, empty histories, cancellation, and malformed responses. JavaScript syntax and manifest resources were checked.

The hiding selectors were checked against the signed-in page. The skill-rating row is hidden by allowlist: only the slot containing the Elo widget and the calendar stay visible, so new banners need no selector changes. The actual Chrome network response was inspected: the HTTP API returns snake_case fields, whereas the supplied sample used camelCase. Version 0.2.1 accepts both formats, with regression checks for the +41 example, continuation tokens, and zero Elo. The cursor-pagination update was subsequently verified in signed-in Chrome as described above.

FACEIT can change its private API or rename page components. If that happens, update the endpoints/response handling in `elo-calendar.js` and `elo-core.js`, or the component selectors in `matchmaking.css` and `elo-calendar.js`.

This project is independent and is not affiliated with FACEIT.

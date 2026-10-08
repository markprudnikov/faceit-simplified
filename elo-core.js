(() => {
  "use strict";

  const formatters = new Map();
  function dayKey(value, timeZone) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error("Match date is unavailable.");
    if (!formatters.has(timeZone)) {
      formatters.set(timeZone, new Intl.DateTimeFormat("en", {
        timeZone, year: "numeric", month: "2-digit", day: "2-digit"
      }));
    }
    const parts = Object.fromEntries(formatters.get(timeZone).formatToParts(date).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  // Calendar arithmetic uses civil dates, so DST never creates six/eight-day weeks.
  function shiftDay(key, days) {
    const date = new Date(`${key}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function weekStart(key) {
    const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
    return shiftDay(key, -((weekday + 6) % 7));
  }

  function readPage(body, playerId) {
    const payload = body?.payload;
    // The HTTP API uses snake_case; FACEIT's client/sample data can use camelCase.
    const matchRounds = payload?.cs2?.matchRounds ?? payload?.cs2?.match_rounds;
    if (!payload || payload.id !== playerId || !Array.isArray(matchRounds)) {
      throw new Error("FACEIT returned an unexpected match history response.");
    }
    const rows = matchRounds.map(row => {
      const matchId = row.matchId ?? row.match_id;
      const round = row.matchRoundNumber ?? row.match_round_number ?? 1;
      const started = Date.parse(row.startTime ?? row.start_time);
      const delta = row.eloDelta ?? row.elo_delta;
      if (typeof matchId !== "string" || !matchId || !Number.isFinite(started)) {
        // Dropping a malformed row could silently produce an incorrect daily total.
        throw new Error("A match is missing its ID or start date.");
      }
      return {
        key: `${matchId}:${round}`,
        matchId,
        started,
        delta: typeof delta === "number" && Number.isFinite(delta) ? delta : null
      };
    });
    const token = payload.nextOffsetToken ?? payload.next_offset_token;
    if (token != null && typeof token !== "string") {
      throw new Error("FACEIT returned an unexpected history cursor.");
    }
    return { rows, nextToken: token || null };
  }

  function summarize(rows, timeZone) {
    const days = new Map();
    const seen = new Set();
    for (const row of rows) {
      if (seen.has(row.key)) continue;
      seen.add(row.key);
      const key = dayKey(row.started, timeZone);
      if (!days.has(key)) days.set(key, { net: 0, gained: 0, lost: 0, matches: new Set(), missing: 0 });
      const day = days.get(key);
      day.matches.add(row.matchId);
      if (row.delta === null) day.missing += 1;
      else {
        day.net += row.delta;
        day.gained += Math.max(0, row.delta);
        day.lost += Math.max(0, -row.delta);
      }
    }
    return new Map([...days].map(([key, day]) => [key, { ...day, matches: day.matches.size }]));
  }

  // A fixed continuous scale keeps +41 the same shade in every week.
  function heat(net) {
    if (!net) return null;
    const strength = Math.abs(net) / (Math.abs(net) + 75);
    return { sign: net > 0 ? "gain" : "loss", alpha: 0.12 + 0.72 * strength };
  }

  class History {
    constructor(loadPage, timeZone) {
      this.loadPage = loadPage;
      this.timeZone = timeZone;
      this.rows = new Map();
      this.nextLimit = 30;
      this.started = false;
      this.exhausted = false;
      this.oldestDay = null;
    }

    covers(day) {
      // The oldest retrieved day can be split across pages. It is incomplete
      // until a strictly earlier day arrives, or the API reaches its end.
      return this.started && (this.exhausted || (this.oldestDay !== null && day > this.oldestDay));
    }

    async ensure(day, signal, maxPages = 4) {
      let pages = 0;
      while (!this.covers(day) && !this.exhausted && pages < maxPages) {
        signal?.throwIfAborted();
        // The supplied API contract supports limit. Grow the recent-history
        // window only when needed; do not guess an undocumented cursor parameter.
        const page = await this.loadPage(this.nextLimit, signal);
        signal?.throwIfAborted();
        const oldSize = this.rows.size;
        const newRows = new Map(this.rows);
        for (const row of page.rows) newRows.set(row.key, row);
        if (this.started && page.nextToken && newRows.size === oldSize) {
          throw new Error("FACEIT did not return older matches. This day is still incomplete.");
        }
        this.rows = newRows;
        this.started = true;
        this.nextLimit += 30;
        this.exhausted = !page.nextToken;
        for (const row of page.rows) {
          const key = dayKey(row.started, this.timeZone);
          if (this.oldestDay === null || key < this.oldestDay) this.oldestDay = key;
        }
        pages += 1;
      }
      return this.covers(day);
    }

    summary() { return summarize(this.rows.values(), this.timeZone); }
  }

  globalThis.FaceitSimplifiedElo = Object.freeze({ dayKey, shiftDay, weekStart, readPage, summarize, heat, History });
})();

(() => {
  "use strict";
  const Core = globalThis.FaceitSimplifiedElo;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateLabel = (key, options) => new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", ...options
  }).format(new Date(`${key}T12:00:00Z`));
  const signed = value => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";

  const css = `
    :host{--elo-gain:#05ff00;--elo-loss:#ef0000;display:block;color-scheme:dark;font:12px/1.4 system-ui,sans-serif;color:#eee;text-align:left}
    *{box-sizing:border-box}button{font:inherit;color:inherit;cursor:pointer}
    .calendar{background:#181818;border:1px solid #333;border-radius:8px;padding:12px;min-width:0}
    .top{display:flex;align-items:center;gap:7px;margin-bottom:10px;flex-wrap:wrap}
    h2{font-size:12px;font-weight:650;margin:0;white-space:nowrap}
    .period{display:flex;align-items:center;gap:7px;flex:1;flex-wrap:wrap}
    .range{color:#bcbcbc;font-size:11px;white-space:nowrap}
    .weekly{font-size:11px;font-weight:650;white-space:nowrap;font-variant-numeric:tabular-nums}
    .weekly[data-sign="gain"]{color:var(--elo-gain)}.weekly[data-sign="loss"]{color:var(--elo-loss)}
    .count{color:#bcbcbc;font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums}
    .count::before{content:"·";color:#6f6f6f;margin-right:7px}
    .actions{display:flex;gap:3px;margin-left:auto}
    .nav{border:1px solid #383838;background:#222;border-radius:5px;min-width:25px;height:26px;padding:0 5px;font-size:17px}
    .nav:disabled{opacity:.35;cursor:default}.nav:hover:not(:disabled){background:#383838}
    button:focus-visible{outline:2px solid #ff8b56;outline-offset:2px}
    .days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
    .day{min-width:0;border:1px solid transparent;border-radius:5px;background:#242424;padding:7px 1px 8px;display:flex;flex-direction:column;align-items:center;gap:3px;font-variant-numeric:tabular-nums}
    .day[aria-pressed="true"]{border-color:#b7b7b7}
    .day[aria-current="date"] .date{color:#ffa474}
    .day:disabled{cursor:default;opacity:.45}
    .weekday{font-size:10px;color:#c6c6c6}.date{font-size:12px;color:#e1e1e1}
    .value{font-size:14px;font-weight:650;letter-spacing:-.4px;white-space:nowrap}
    .day[data-sign="gain"] .value{color:var(--elo-gain)}.day[data-sign="loss"] .value{color:var(--elo-loss)}
    .day[data-empty="true"] .value{color:#8e8e8e;font-weight:400}
    .details{margin:10px 0 0;font-size:11px;color:#c3c3c3;min-height:16px;overflow-wrap:anywhere}
    .gain{color:var(--elo-gain)}.loss{color:var(--elo-loss)}
    .bottom{display:flex;align-items:center;justify-content:flex-end;margin-top:5px}
    .text-button{background:none;border:0;padding:2px 0;font-size:11px;color:#ff9c6e}
    .status{margin:8px 0 0;color:#cfcfcf;font-size:11px}
    .status[data-error="true"]{color:#ffba8d}
    [hidden]{display:none!important}
    @media(pointer:coarse){.nav{min-width:36px;height:36px}.text-button{min-height:36px}}
  `;

  async function requestJSON(path, signal) {
    let response;
    try {
      response = await fetch(new URL(path, location.origin), {
        credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { Accept: "application/json" },
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error("Could not reach FACEIT. Try refreshing the calendar.");
    }
    if (response.status === 401) throw new Error("Sign in to FACEIT to see your Elo.");
    if (response.status === 403) throw new Error("FACEIT blocked the history request. Try again later.");
    if (response.status === 429) throw new Error("FACEIT is limiting requests. Try again shortly.");
    if (!response.ok) throw new Error("FACEIT could not load match history. Try again later.");
    try { return await response.json(); }
    catch { throw new Error("FACEIT did not return match data. Try refreshing the page."); }
  }

  function createCalendar() {
    const host = document.createElement("div");
    host.id = "fsi-elo-calendar";
    host.setAttribute("aria-label", "Daily Elo calendar");
    const shadow = host.attachShadow({ mode: "open" });
    // Only static extension-owned markup is used here. API values use textContent.
    shadow.innerHTML = `<style>${css}</style><section class="calendar">
      <div class="top"><h2>Elo gain</h2><div class="period"><span class="range"></span><span class="weekly" aria-live="polite"></span><span class="count" aria-live="polite"></span></div><div class="actions">
        <button class="nav previous" type="button" aria-label="Previous week" title="Previous week">‹</button>
        <button class="nav next" type="button" aria-label="Next week" title="Next week">›</button>
        <button class="nav refresh" type="button" aria-label="Refresh Elo history" title="Refresh Elo history">↻</button>
      </div></div>
      <div class="days" role="group" aria-label="Daily Elo changes"></div>
      <p class="details" aria-live="polite"></p>
      <div class="bottom" hidden><button class="text-button current" type="button" hidden>This week</button></div>
      <p class="status" role="status" hidden></p>
      <button class="text-button more" type="button" hidden>Load more matches</button>
    </section>`;
    const get = selector => shadow.querySelector(selector);
    const ui = Object.fromEntries(["range", "weekly", "count", "previous", "next", "refresh", "days", "details", "bottom", "current", "status", "more"].map(key => [key, get(`.${key}`)]));
    let today = Core.dayKey(Date.now(), timeZone);
    let week = Core.weekStart(today);
    let selected = null;
    let history = null;
    let busy = false;
    let error = "";
    let alive = true;
    let lastRefresh = 0;
    let controller = null;

    function mount() {
      if (host.isConnected) return true;
      const elo = document.querySelector('div[class*="EloWidget-"][class*="__widgetContainer"]');
      const anchor = elo?.closest('[class*="Header__ComponentContainer-"]');
      if (!anchor?.parentElement?.matches('[class*="Header__Container-"]')) return false;
      const leagueSlot = anchor.parentElement.querySelector('[class*="Header__ComponentContainer-"]:has(> a[class*="LeagueRegistrationWidgetView-"])');
      // Reuse the site's responsive slot sizing, while keeping its nodes intact.
      host.className = leagueSlot?.className || "";
      anchor.after(host);
      return true;
    }

    function render() {
      const end = Core.shiftDay(week, 6);
      const summaries = history?.summary() || new Map();
      const days = Array.from({ length: 7 }, (_, i) => Core.shiftDay(week, i));
      if (!selected || !days.includes(selected)) {
        selected = days.filter(day => day <= today && summaries.has(day)).at(-1)
          || days.filter(day => day <= today).at(-1) || week;
      }
      const focusedDay = shadow.activeElement?.dataset.day;
      ui.range.textContent = `${dateLabel(week, { day: "numeric", month: "short" })} – ${dateLabel(end, { day: "numeric", month: "short" })}`;
      ui.range.title = `${week} – ${end}`;
      const elapsedDays = days.filter(day => day <= today);
      const weekCovered = elapsedDays.every(day => history?.covers(day));
      const weekKnown = weekCovered && elapsedDays.every(day => !summaries.get(day)?.missing);
      const weekNet = elapsedDays.reduce((total, day) => total + (summaries.get(day)?.net || 0), 0);
      // Sum of the daily counts, so the weekly total always matches the day cells.
      const weekMatches = elapsedDays.reduce((total, day) => total + (summaries.get(day)?.matches || 0), 0);
      ui.weekly.textContent = weekKnown ? `${signed(weekNet)} Elo` : "… Elo";
      ui.weekly.dataset.sign = weekKnown && weekNet !== 0 ? (weekNet > 0 ? "gain" : "loss") : "neutral";
      ui.weekly.setAttribute("aria-label", weekKnown ? `Net Elo for this week: ${signed(weekNet)}` : "Weekly Elo total: history incomplete");
      ui.count.textContent = weekCovered ? `${weekMatches} ${weekMatches === 1 ? "match" : "matches"}` : "… matches";
      ui.count.setAttribute("aria-label", weekCovered ? `Matches this week: ${weekMatches}` : "Weekly match count: history incomplete");
      ui.previous.disabled = busy;
      ui.next.disabled = busy || week >= Core.weekStart(today);
      ui.refresh.disabled = busy;
      ui.current.hidden = week === Core.weekStart(today);
      ui.bottom.hidden = ui.current.hidden;
      ui.current.disabled = busy;
      ui.days.replaceChildren();
      for (const day of days) {
        const stats = summaries.get(day) || { net: 0, gained: 0, lost: 0, matches: 0, missing: 0 };
        const future = day > today;
        const complete = history?.covers(day) === true;
        const known = complete && stats.missing === 0;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "day";
        button.dataset.day = day;
        button.disabled = future;
        button.setAttribute("aria-pressed", String(day === selected));
        if (day === today) button.setAttribute("aria-current", "date");
        const label = dateLabel(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        const description = future ? "Upcoming" : !complete ? "History not fully loaded" : stats.missing ? "Elo data unavailable for some matches" : stats.matches ? `${signed(stats.net)} Elo, ${stats.matches} matches, ${stats.gained} gained, ${stats.lost} lost` : "No matches";
        button.setAttribute("aria-label", `${label}: ${description}`);
        button.title = `${label}: ${description}`;
        for (const [className, text] of [
          ["weekday", dateLabel(day, { weekday: "short" })],
          ["date", dateLabel(day, { day: "numeric" })],
          ["value", future ? "—" : !known ? "…" : stats.matches ? signed(stats.net) : "—"]
        ]) {
          const span = document.createElement("span");
          span.className = className;
          span.textContent = text;
          button.append(span);
        }
        if (known && !future) {
          const color = Core.heat(stats.net);
          if (color) {
            button.dataset.sign = color.sign;
            button.style.backgroundColor = `rgba(${color.sign === "gain" ? "5, 255, 0" : "239, 0, 0"}, ${color.alpha})`;
          } else button.dataset.empty = String(stats.matches === 0);
        }
        button.addEventListener("click", () => { selected = day; render(); });
        ui.days.append(button);
      }
      if (focusedDay) ui.days.querySelector(`[data-day="${focusedDay}"]`)?.focus({ preventScroll: true });
      const stats = summaries.get(selected);
      const label = dateLabel(selected, { day: "numeric", month: "short" });
      ui.details.replaceChildren();
      if (!history?.covers(selected)) ui.details.textContent = `${label} · ${busy ? "Loading history…" : "History incomplete"}`;
      else if (stats?.missing) ui.details.textContent = `${label} · ${stats.matches} matches · Some Elo data unavailable`;
      else if (!stats?.matches) ui.details.textContent = `${label} · No matches`;
      else {
        ui.details.append(`${label} · ${stats.matches} ${stats.matches === 1 ? "match" : "matches"} · `);
        const gained = document.createElement("span");
        gained.className = "gain";
        gained.textContent = `+${stats.gained}`;
        const lost = document.createElement("span");
        lost.className = "loss";
        lost.textContent = `−${stats.lost}`;
        ui.details.append(gained, " / ", lost, " Elo");
      }
      const needsMore = history && !history.covers(week);
      ui.status.textContent = busy ? "Loading matches…" : error || (needsMore ? "More history is needed for this week." : "");
      ui.status.hidden = !ui.status.textContent;
      ui.status.dataset.error = String(Boolean(error));
      ui.more.hidden = busy || !needsMore;
    }

    async function load(reset = false) {
      if (busy || !alive) return;
      controller = new AbortController();
      const signal = controller.signal;
      busy = true;
      error = "";
      if (reset) { history = null; selected = null; }
      lastRefresh = Date.now();
      render();
      try {
        if (!history) {
          const session = await requestJSON("/api/users/v1/sessions/me", signal);
          const id = session?.payload?.id;
          if (session.result !== "OK" || typeof id !== "string" || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) {
            throw new Error("Sign in to FACEIT to see your Elo.");
          }
          // Keep only the ID; no profile details are saved or displayed.
          history = new Core.History(async (limit, pageSignal) => {
            const path = `/api/statistics/v1/cs2/players/${encodeURIComponent(id)}/match-rounds?limit=${limit}`;
            return Core.readPage(await requestJSON(path, pageSignal), id);
          }, timeZone);
        }
        await history.ensure(week, signal);
        if (selected && !history.summary().has(selected)) selected = null;
      } catch (reason) {
        if (!signal.aborted) error = reason instanceof Error ? reason.message : "Could not load Elo history.";
      } finally {
        busy = false;
        if (alive && !signal.aborted) render();
      }
    }

    async function move(days) {
      if (busy) return;
      week = days === 0 ? Core.weekStart(today) : Core.shiftDay(week, days);
      selected = null;
      error = "";
      render();
      if (!history?.covers(week)) await load();
    }
    ui.previous.addEventListener("click", () => move(-7));
    ui.next.addEventListener("click", () => move(7));
    ui.current.addEventListener("click", () => move(0));
    ui.refresh.addEventListener("click", () => load(true));
    ui.more.addEventListener("click", () => load());
    render();

    return {
      update() {
        if (!mount()) return;
        const nextToday = Core.dayKey(Date.now(), timeZone);
        if (nextToday !== today) {
          const followingCurrentWeek = week === Core.weekStart(today);
          today = nextToday;
          if (followingCurrentWeek) week = Core.weekStart(today);
          render();
        }
        if (!busy && document.visibilityState !== "hidden" && Date.now() - lastRefresh > 300000) load(true);
      },
      destroy() {
        alive = false;
        controller?.abort();
        history = null;
        host.remove();
      }
    };
  }

  let calendar = null;
  globalThis.FaceitSimplifiedCalendar = Object.freeze({
    update(active) {
      if (!active) {
        calendar?.destroy();
        calendar = null;
        return;
      }
      calendar ||= createCalendar();
      calendar.update();
    }
  });
})();

(() => {
  "use strict";

  const shield = "M14.172 8 12 5.828 9.828 8h-4.21l2.114 7.751L12 18.596l4.267-2.845L18.382 8zM21 6l-3 11-6 4-6-4L3 6h6l3-3 3 3z";
  const shieldInner = "m8.237 10 1.228 4.503L12 16.193l2.535-1.69L15.763 10h-2.42L12 8.657 10.657 10z";
  const offShield = "M5.637 2.807 4.223 4.222";
  const badgeClass = "fsi-anticheat-status";
  let nickname = null;
  let controller = null;
  let requested = false;

  function stateFrom(root) {
    const paths = [...(root?.querySelectorAll(`svg:not(.${badgeClass}) path`) || [])];
    if (paths.some(path => path.getAttribute("d")?.startsWith(offShield))) return "off";
    if (paths.some(path => path.getAttribute("d") === shield)) return "on";
    return "unknown";
  }

  function clear() {
    controller?.abort();
    controller = null;
    requested = false;
    nickname = null;
    document.querySelectorAll(`.${badgeClass}`).forEach(el => el.remove());
    document.querySelectorAll("[data-fsi-ac-banner]").forEach(el => el.removeAttribute("data-fsi-ac-banner"));
  }

  function update(active) {
    if (!active) { clear(); return; }
    // Resolve only the signed-in nickname, so the global Anti-Cheat indicator is
    // never applied to another party member. No profile response is retained.
    if (!requested) {
      requested = true;
      const request = new AbortController();
      controller = request;
      fetch(new URL("/api/users/v1/sessions/me", location.origin), {
        credentials: "same-origin", headers: { Accept: "application/json" },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)])
      }).then(response => response.ok ? response.json() : null).then(body => {
        if (!request.signal.aborted && typeof body?.payload?.nickname === "string") nickname = body.payload.nickname;
      }).catch(() => { /* An unknown status stays gray. */ });
    }
    const localState = stateFrom(document.querySelector('button[class*="AntiCheatButton__"]'));
    const cards = document.querySelectorAll('section [class*="Party__StyledPlayerCard-"] [data-playercard]');
    for (const card of cards) {
      const name = card.querySelector('[class*="styles__Nickname-"]');
      const icons = card.querySelector('[class*="styles__IconsContainer-"]');
      if (!name || !icons) continue;
      const nativeState = stateFrom(card.closest('[class*="Party__StyledPlayerCard-"]'));
      const state = name.textContent.trim() === nickname ? localState : nativeState;
      let badge = icons.querySelector(`.${badgeClass}`);
      if (!badge) {
        badge = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        badge.setAttribute("class", badgeClass);
        badge.setAttribute("viewBox", "0 0 24 24");
        badge.setAttribute("fill", "none");
        badge.setAttribute("role", "img");
        const title = document.createElementNS(badge.namespaceURI, "title");
        badge.append(title);
        for (const d of [shield, shieldInner]) {
          const path = document.createElementNS(badge.namespaceURI, "path");
          path.setAttribute("d", d);
          path.setAttribute("fill", "currentColor");
          path.setAttribute("fill-rule", "evenodd");
          path.setAttribute("clip-rule", "evenodd");
          badge.append(path);
        }
        // Country flags are native titled images. Insert directly after the flag.
        const flag = [...icons.children].find(el => /^[a-z]{2}$/i.test(el.getAttribute("title") || ""));
        if (flag) flag.after(badge); else icons.append(badge);
      }
      const label = state === "on" ? "Anti-Cheat on" : state === "off" ? "Anti-Cheat off" : "Anti-Cheat status unavailable";
      if (badge.dataset.state !== state) {
        badge.dataset.state = state;
        badge.setAttribute("aria-label", label);
        badge.querySelector("title").textContent = label;
      }
    }

    // Suppress only the observed run-Anti-Cheat message. Recheck reused panels
    // each update so a later cooldown or different error becomes visible again.
    const panels = document.querySelectorAll('[data-testid="error-panel-container"], [data-fsi-ac-banner]');
    for (const panel of panels) {
      const content = panel.querySelector('[class*="ErrorPanel__Content-"]')?.textContent.trim();
      const hide = panel.closest('[class*="Matchmaking__PlayBarContainer-"]') &&
        content === "Please run Anti-Cheat" &&
        panel.querySelector('a[href^="https://anticheat-client.faceit-cdn.net/"]');
      if (hide) {
        if (!panel.hasAttribute("data-fsi-ac-banner")) panel.setAttribute("data-fsi-ac-banner", "");
      } else panel.removeAttribute("data-fsi-ac-banner");
    }
  }

  globalThis.FaceitSimplifiedPartyStatus = Object.freeze({ update });
})();

(() => {
  "use strict";

  const attribute = "data-faceit-simplified";
  let enabled = false;
  let settingsRevision = 0;

  function updatePage() {
    // FACEIT navigates without full reloads. Keep these styles on this page only.
    const matchmaking = /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/matchmaking\/?$/i.test(location.pathname);
    const active = enabled && matchmaking;
    const root = document.documentElement;
    if (!root) return;

    if (active && root.getAttribute(attribute) !== "on") {
      root.setAttribute(attribute, "on");
    } else if (!active && root.hasAttribute(attribute)) {
      root.removeAttribute(attribute);
    }
    globalThis.FaceitSimplifiedCalendar.update(active);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !Object.hasOwn(changes, "enabled")) return;
    settingsRevision += 1;
    enabled = changes.enabled.newValue !== false;
    updatePage();
  });

  const initialRevision = settingsRevision;
  chrome.storage.local.get({ enabled: true }).then(settings => {
    if (settingsRevision !== initialRevision) return;
    enabled = settings.enabled !== false;
    updatePage();
  }).catch(() => {
    // Leave the original page visible when preferences cannot be read.
  });

  document.addEventListener("DOMContentLoaded", updatePage, { once: true });
  window.addEventListener("popstate", updatePage);
  window.addEventListener("pageshow", updatePage);
  if (window.navigation) {
    window.navigation.addEventListener("currententrychange", updatePage);
  }

  // A pathname-only fallback covers SPA routers without observing the whole DOM.
  window.setInterval(updatePage, 500);
})();

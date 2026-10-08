(() => {
  "use strict";

  const css = `
    :host{display:inline-flex;align-items:center;color-scheme:dark;font:12px/1 system-ui,sans-serif;color:#d6d6d6}
    button{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 8px;border:0;border-radius:6px;background:none;font:inherit;color:inherit;cursor:pointer;white-space:nowrap}
    button:hover{background:rgba(255,255,255,.08)}
    button:focus-visible{outline:2px solid #ffac86;outline-offset:2px}
    .track{position:relative;flex:0 0 auto;width:30px;height:18px;border:1px solid #707070;border-radius:18px;background:#4a4a4a}
    .track::before{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#f5f5f5;transition:left .15s}
    [aria-checked="true"] .track{background:#db480a;border-color:#f5763f}
    [aria-checked="true"] .track::before{left:14px}
    @media(prefers-reduced-motion:reduce){.track::before{transition:none}}
  `;

  const host = document.createElement("div");
  host.id = "fsi-simplify-toggle";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${css}</style><button type="button" role="switch" aria-checked="false" title="Switch FaceIT simplified on or off"><span class="track"></span><span>Simplified</span></button>`;
  const button = shadow.querySelector("button");
  let enabled = false;
  let saving = false;

  // Shares the popup's preference. content.js applies the change through
  // storage.onChanged, which also re-renders this switch.
  button.addEventListener("click", async () => {
    if (saving) return;
    saving = true;
    try { await chrome.storage.local.set({ enabled: !enabled }); }
    catch { /* The previous setting stays active; the switch already shows it. */ }
    finally { saving = false; }
  });

  globalThis.FaceitSimplifiedToggle = Object.freeze({
    // The switch stays visible while simplification is off, so it can be turned back on.
    update(visible, value) {
      enabled = value;
      button.setAttribute("aria-checked", String(enabled));
      if (!visible) {
        host.remove();
        return;
      }
      if (host.isConnected) return;
      // Sits left of the anti-cheat status button's slot in the Play header.
      document.querySelector('button[class*="AntiCheatButton__"]')?.parentElement?.before(host);
    }
  });
})();

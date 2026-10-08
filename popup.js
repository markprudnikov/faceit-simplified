"use strict";

const toggle = document.getElementById("enabled");
const status = document.getElementById("status");

function render(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled
    ? "On. Your matchmaking page is simplified."
    : "Off. FACEIT’s original layout is visible.";
}

chrome.storage.local.get({ enabled: true }).then(settings => {
  render(settings.enabled !== false);
  toggle.disabled = false;
}).catch(() => {
  status.textContent = "Could not load your preference. Reopen this popup to try again.";
});

toggle.addEventListener("change", async () => {
  const enabled = toggle.checked;
  toggle.disabled = true;
  try {
    await chrome.storage.local.set({ enabled });
    render(enabled);
  } catch {
    toggle.checked = !enabled;
    status.textContent = "Could not save. Your previous setting is still active.";
  } finally {
    toggle.disabled = false;
  }
});

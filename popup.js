const statusEl = document.getElementById("status");

async function refresh() {
  const { autoFollowRunning = false, autoFollowCount = 0 } =
    await chrome.storage.local.get(["autoFollowRunning", "autoFollowCount"]);

  statusEl.classList.toggle("running", autoFollowRunning);
  statusEl.classList.toggle("stopped", !autoFollowRunning);
  statusEl.innerHTML = autoFollowRunning
    ? `Running… <span class="count">(${autoFollowCount} followed)</span>`
    : `Stopped <span class="count">(${autoFollowCount} followed)</span>`;
}

document.getElementById("start").addEventListener("click", async () => {
  await chrome.storage.local.set({ autoFollowRunning: true });
  refresh();
});

document.getElementById("stop").addEventListener("click", async () => {
  await chrome.storage.local.set({ autoFollowRunning: false });
  refresh();
});

document.getElementById("reset").addEventListener("click", async () => {
  await chrome.storage.local.set({ autoFollowCount: 0 });
  refresh();
});

// Keep the popup's numbers live while it's open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.autoFollowRunning || changes.autoFollowCount)) {
    refresh();
  }
});

refresh();

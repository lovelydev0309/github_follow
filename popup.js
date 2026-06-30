const statusEl = document.getElementById("status");
const FOLLOW_LIMIT = 7000; // keep in sync with content.js

async function refresh() {
  const {
    autoFollowRunning = false,
    autoFollowCount = 0,
    autoFollowFailed = 0,
    autoFollowStatus = "",
  } = await chrome.storage.local.get([
    "autoFollowRunning",
    "autoFollowCount",
    "autoFollowFailed",
    "autoFollowStatus",
  ]);

  statusEl.classList.toggle("running", autoFollowRunning);
  statusEl.classList.toggle("stopped", !autoFollowRunning);

  const head = autoFollowRunning ? "Running…" : "Stopped";
  const counts =
    `${autoFollowCount} / ${FOLLOW_LIMIT} followed` +
    (autoFollowFailed ? `, ${autoFollowFailed} failed` : "");
  const detail = autoFollowStatus
    ? `<div class="detail">${autoFollowStatus}</div>`
    : "";
  statusEl.innerHTML = `${head} <span class="count">(${counts})</span>${detail}`;
}

document.getElementById("start").addEventListener("click", async () => {
  await chrome.storage.local.set({
    autoFollowRunning: true,
    autoFollowStatus: "Starting…",
  });
  refresh();
});

document.getElementById("stop").addEventListener("click", async () => {
  await chrome.storage.local.set({
    autoFollowRunning: false,
    autoFollowStatus: "Stopped by you.",
  });
  refresh();
});

document.getElementById("reset").addEventListener("click", async () => {
  await chrome.storage.local.set({
    autoFollowCount: 0,
    autoFollowFailed: 0,
    autoFollowStatus: "",
  });
  refresh();
});

// Keep the popup's numbers live while it's open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") refresh();
});

refresh();

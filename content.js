// GitHub Auto Follow — content script
// Runs on every github.com page. When the user starts it from the popup
// (autoFollowRunning = true in storage), it:
//   1. Clicks every "Follow" button on the current following/followers list.
//   2. Waits, then navigates to the next page (?page=N+1&tab=...).
//   3. Repeats until a page has no users left, then stops.
//
// NOTE: Automated mass-following is against GitHub's Terms of Service and may
// get your account rate-limited or suspended. Delays are randomized to be
// gentler, but use at your own risk.

(() => {
  // ---- Tunables --------------------------------------------------------------
  const MIN_DELAY = 350;       // min ms between individual follows
  const MAX_DELAY = 800;       // max ms between individual follows
  const PAGE_SETTLE = 500;     // ms to wait after a page loads before acting
  const NEXT_PAGE_DELAY = 1000;// ms to wait after finishing a page
  const HARD_PAGE_CAP = 1000;  // safety: never go beyond this page number
  const MAX_CLICKS_PER_PAGE = 300; // safety against runaway loops
  // ---------------------------------------------------------------------------

  let active = false; // guards against two run() loops overlapping

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));

  function isVisible(el) {
    return !!(el && el.offsetParent !== null);
  }

  // Owner of the profile we're viewing, e.g. "/nholuongut?tab=following" -> "nholuongut"
  function getOwner() {
    return decodeURIComponent(location.pathname.split("/")[1] || "").toLowerCase();
  }

  // Extract the target username a follow/unfollow form points at.
  function getTargetFromForm(form) {
    const action = form.getAttribute("action") || "";
    let m = action.match(/[?&]target=([^&]+)/);
    if (m) return decodeURIComponent(m[1]).toLowerCase();
    m = action.match(/^\/([^/?#]+)\/(?:un)?follow/);
    if (m) return decodeURIComponent(m[1]).toLowerCase();
    return "";
  }

  function buttonLabel(btn) {
    return (btn.textContent || btn.value || "").trim().toLowerCase();
  }

  // All clickable "Follow" buttons in the list (excludes the profile owner's
  // sidebar Follow button, and any already-toggled "Unfollow"/"Following").
  function getFollowButtons() {
    const owner = getOwner();
    const seen = new Set();
    const out = [];
    document.querySelectorAll("form").forEach((form) => {
      const btn = form.querySelector(
        'button[type="submit"], input[type="submit"], button'
      );
      if (!btn || !isVisible(btn)) return;
      if (buttonLabel(btn) !== "follow") return;
      const target = getTargetFromForm(form);
      if (owner && target === owner) return;      // skip "follow this profile" button
      if (target && seen.has(target)) return;     // de-dupe
      if (target) seen.add(target);
      out.push({ btn, target });
    });
    return out;
  }

  // How many distinct users (followed or not) are listed on this page.
  // 0 means we've paged past the end -> time to stop.
  function countUsersOnPage() {
    const owner = getOwner();
    const seen = new Set();
    document.querySelectorAll("form").forEach((form) => {
      const btn = form.querySelector("button, input[type=submit]");
      if (!btn) return;
      const label = buttonLabel(btn);
      if (label !== "follow" && label !== "unfollow" && label !== "following") return;
      const t = getTargetFromForm(form);
      if (t && t !== owner) seen.add(t);
    });
    return seen.size;
  }

  function nextPageUrl() {
    const url = new URL(location.href);
    const cur = parseInt(url.searchParams.get("page") || "1", 10);
    if (cur >= HARD_PAGE_CAP) return null;
    url.searchParams.set("page", String(cur + 1));
    const tab = url.searchParams.get("tab") || "following";
    url.searchParams.set("tab", tab);
    return url.toString();
  }

  async function isRunning() {
    const { autoFollowRunning } = await chrome.storage.local.get("autoFollowRunning");
    return !!autoFollowRunning;
  }

  async function stop(reason) {
    await chrome.storage.local.set({ autoFollowRunning: false });
    console.log("[GH AutoFollow] Stopped:", reason);
  }

  async function bumpCount(n) {
    const { autoFollowCount = 0 } = await chrome.storage.local.get("autoFollowCount");
    await chrome.storage.local.set({ autoFollowCount: autoFollowCount + n });
  }

  async function run() {
    if (active) return;
    if (!(await isRunning())) return;

    // Only operate on a following/followers list.
    const tab = new URLSearchParams(location.search).get("tab");
    if (tab !== "following" && tab !== "followers") {
      console.log('[GH AutoFollow] Not on a ?tab=following/followers page — idle.');
      return;
    }

    active = true;
    try {
      await sleep(PAGE_SETTLE);
      if (!(await isRunning())) return;

      if (countUsersOnPage() === 0) {
        await stop("no users on this page — reached the end of the list");
        return;
      }

      const clicked = new Set();
      let followed = 0;
      let safety = 0;
      while (safety++ < MAX_CLICKS_PER_PAGE) {
        if (!(await isRunning())) return; // user pressed Stop mid-page
        const candidates = getFollowButtons().filter(
          (c) => !c.target || !clicked.has(c.target)
        );
        if (candidates.length === 0) break;

        const { btn, target } = candidates[0];
        btn.click();
        if (target) clicked.add(target);
        followed++;
        await bumpCount(1);
        await sleep(rnd(MIN_DELAY, MAX_DELAY));
      }
      console.log(`[GH AutoFollow] Followed ${followed} user(s) on this page.`);

      await sleep(NEXT_PAGE_DELAY);
      if (!(await isRunning())) return;

      const next = nextPageUrl();
      if (!next) {
        await stop("reached the safety page cap");
        return;
      }
      location.href = next; // navigate; content script re-runs on the new page
    } finally {
      active = false;
    }
  }

  // Kick off on page load (handles the auto-advance after navigation).
  run();

  // Let the popup's Start button trigger a run on the current page without
  // requiring a manual reload.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === "local" &&
      changes.autoFollowRunning &&
      changes.autoFollowRunning.newValue
    ) {
      run();
    }
  });
})();

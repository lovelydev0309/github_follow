// GitHub Auto Follow — content script
// Runs on every github.com page. When the user starts it from the popup
// (autoFollowRunning = true in storage), it:
//   1. Clicks every "Follow" button on the current following/followers list,
//      verifying each one actually registered and retrying/backing off if not.
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
  const FOLLOW_LIMIT = 7000;   // stop after this many total follows (GitHub caps
                               // accounts at ~7,500; staying under avoids the wall)

  // Verify each follow actually registered (GitHub silently drops follows when
  // it rate-limits you). If it didn't, retry; if failures pile up, back off.
  const CONFIRM_TIMEOUT = 4000;   // ms to wait for a click to turn into "Following"
  const CONFIRM_POLL = 120;       // ms between confirmation checks
  const MAX_RETRIES = 3;          // re-click attempts for a single user
  const RETRY_BACKOFF_MIN = 1500; // ms base backoff between retries
  const RETRY_BACKOFF_MAX = 3000;
  const RATE_LIMIT_STREAK = 4;    // consecutive failed users => assume rate-limited
  const RATE_LIMIT_PAUSE = 60000; // ms to pause when rate-limited
  const MAX_RATE_LIMIT_ROUNDS = 3;// give up after this many fruitless long pauses
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

  // Is `target` currently followed? Looks at whichever follow/unfollow button
  // is visible for that user. Returns 'followed' | 'not-followed' | 'unknown'.
  function followStateOf(target) {
    let sawFollow = false;
    let sawUnfollow = false;
    document.querySelectorAll("form").forEach((form) => {
      if (getTargetFromForm(form) !== target) return;
      const btn = form.querySelector(
        'button[type="submit"], input[type="submit"], button'
      );
      if (!btn || !isVisible(btn)) return;
      const label = buttonLabel(btn);
      if (label === "follow") sawFollow = true;
      else if (label === "unfollow" || label === "following") sawUnfollow = true;
    });
    if (sawUnfollow && !sawFollow) return "followed";
    if (sawFollow && !sawUnfollow) return "not-followed";
    return "unknown";
  }

  // The currently-visible "Follow" button for a given target (or null).
  function liveFollowButton(target) {
    let found = null;
    document.querySelectorAll("form").forEach((form) => {
      if (found) return;
      if (getTargetFromForm(form) !== target) return;
      const btn = form.querySelector(
        'button[type="submit"], input[type="submit"], button'
      );
      if (btn && isVisible(btn) && buttonLabel(btn) === "follow") found = btn;
    });
    return found;
  }

  // Poll until the click is confirmed as an actual follow, or time out.
  async function waitForFollowed(target, btn) {
    const deadline = performance.now() + CONFIRM_TIMEOUT;
    while (performance.now() < deadline) {
      if (target) {
        if (followStateOf(target) === "followed") return true;
      } else if (btn) {
        // No parseable username: a detached or relabeled button means success.
        if (!btn.isConnected) return true;
        if (buttonLabel(btn) !== "follow") return true;
      }
      await sleep(CONFIRM_POLL);
    }
    return false;
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
    await chrome.storage.local.set({
      autoFollowRunning: false,
      autoFollowStatus: "Stopped: " + reason,
    });
    console.log("[GH AutoFollow] Stopped:", reason);
  }

  async function setStatus(msg) {
    await chrome.storage.local.set({ autoFollowStatus: msg });
  }

  async function getCount() {
    const { autoFollowCount = 0 } = await chrome.storage.local.get("autoFollowCount");
    return autoFollowCount;
  }

  async function bumpCount(n) {
    const { autoFollowCount = 0 } = await chrome.storage.local.get("autoFollowCount");
    await chrome.storage.local.set({ autoFollowCount: autoFollowCount + n });
  }

  async function bumpFailed(n) {
    const { autoFollowFailed = 0 } =
      await chrome.storage.local.get("autoFollowFailed");
    await chrome.storage.local.set({ autoFollowFailed: autoFollowFailed + n });
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

      // Stop immediately if we've already hit the overall follow limit.
      if ((await getCount()) >= FOLLOW_LIMIT) {
        await stop(`reached the follow limit of ${FOLLOW_LIMIT}`);
        return;
      }

      const done = new Set();         // targets finished with (followed or skipped)
      const doneBtns = new WeakSet(); // same, for users whose name we couldn't parse
      let followed = 0;
      let consecutiveFails = 0;       // failed users in a row => rate-limit signal
      let rateLimitRounds = 0;        // long pauses taken without recovering
      let safety = 0;

      await setStatus("Following…");

      while (safety++ < MAX_CLICKS_PER_PAGE) {
        if (!(await isRunning())) return; // user pressed Stop mid-page

        // Honor the overall follow limit (cumulative across pages/sessions).
        if ((await getCount()) >= FOLLOW_LIMIT) {
          await stop(`reached the follow limit of ${FOLLOW_LIMIT}`);
          return;
        }

        const candidates = getFollowButtons().filter((c) =>
          c.target ? !done.has(c.target) : !doneBtns.has(c.btn)
        );
        if (candidates.length === 0) break;

        const { btn, target } = candidates[0];

        // Click, then RETRY until GitHub confirms the follow actually took.
        let ok = false;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          if (!(await isRunning())) return;
          const live = attempt === 0 ? btn : liveFollowButton(target);
          if (!live) {
            // Button vanished — maybe it already flipped to "Following".
            ok = target ? followStateOf(target) === "followed" : false;
            break;
          }
          live.click();
          ok = await waitForFollowed(target, live);
          if (ok) break;
          // Not confirmed: escalating backoff before re-clicking the same user.
          await sleep(rnd(RETRY_BACKOFF_MIN, RETRY_BACKOFF_MAX) * (attempt + 1));
        }

        if (ok) {
          followed++;
          consecutiveFails = 0;
          rateLimitRounds = 0;
          await bumpCount(1);
          if (target) done.add(target);
          else doneBtns.add(btn);
          await sleep(rnd(MIN_DELAY, MAX_DELAY));
          continue;
        }

        // Still not followed after every retry — a real failure, not a silent skip.
        consecutiveFails++;
        await bumpFailed(1);
        console.warn(
          `[GH AutoFollow] Could not follow ${target || "(unknown user)"} ` +
            `after ${MAX_RETRIES + 1} tries (fail streak ${consecutiveFails}).`
        );

        if (consecutiveFails < RATE_LIMIT_STREAK) {
          // Isolated failure: record it and move on to the next user.
          if (target) done.add(target);
          else doneBtns.add(btn);
          continue;
        }

        // A streak of failures = GitHub is rate-limiting (or you've hit the
        // follow cap). Pause and see whether it recovers; don't skip anyone.
        rateLimitRounds++;
        if (rateLimitRounds > MAX_RATE_LIMIT_ROUNDS) {
          await stop(
            "GitHub keeps rejecting follows — you're rate-limited or at the " +
              "follow cap. Try again later."
          );
          return;
        }

        const waitSec = Math.round((RATE_LIMIT_PAUSE * rateLimitRounds) / 1000);
        console.warn(`[GH AutoFollow] Rate-limited. Pausing ${waitSec}s…`);
        await setStatus(`Rate-limited — pausing ${waitSec}s (round ${rateLimitRounds})`);
        await sleep(RATE_LIMIT_PAUSE * rateLimitRounds);
        if (!(await isRunning())) return;
        await setStatus("Following…");
        consecutiveFails = 0; // fresh chance after the pause; retry the same user
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

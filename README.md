# GitHub Auto Follow (Chrome extension)

Automatically clicks every **Follow** button on a GitHub *following* (or
*followers*) list, then advances to the next page and repeats until the list
ends.

> ⚠️ **Warning:** Automated mass-following violates [GitHub's Terms of
> Service](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies)
> and may get your account rate-limited, flagged, or suspended. Use on your own
> account at your own risk. Delays are randomized to reduce load, but there is
> no way to make this "safe" from GitHub's perspective.

## Install (unpacked)

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder.
4. Pin the extension if you like.

## Use

1. Open a profile's following list, e.g.
   `https://github.com/nholuongut?page=1&tab=following`
2. Click the extension icon → **Start**.
3. It follows everyone on the page (skipping people you already follow and the
   profile owner's own Follow button), waits, then loads the next page and
   continues.
4. Press **Stop** any time. It also stops automatically when it:
   - reaches a page with no users (end of the list),
   - hits the **7,000-follow limit** (GitHub caps accounts at ~7,500), or
   - keeps getting follows rejected (rate-limited / at the cap).

The popup shows progress as `X / 7000 followed`, plus a `failed` count and a live
status line (e.g. "Rate-limited — pausing 60s"). **Reset counter** clears it.

## How failures are handled

GitHub silently drops follow requests when it rate-limits you — the button
clicks but nothing happens. To avoid a fake counter and skipped users, the
extension now:

- **Verifies** every follow actually flipped to "Following" before counting it.
- **Retries** a user up to 4 times if the follow didn't register.
- **Backs off** (pauses 60s, then longer) when several follows fail in a row,
  then resumes — and gives up gracefully if GitHub keeps rejecting.
- **Stops at 7,000** total follows so you don't slam into GitHub's hard cap.

## Files

| File           | Purpose                                            |
| -------------- | -------------------------------------------------- |
| `manifest.json`| Extension manifest (MV3)                           |
| `content.js`   | Does the following + page advancing                |
| `popup.html/js`| Start / Stop / counter UI                          |

## Tuning

Open `content.js` and adjust the constants at the top:

- `MIN_DELAY` / `MAX_DELAY` — pause between each follow (raise these to look less
  bot-like and ease up on rate limits).
- `NEXT_PAGE_DELAY` — pause before loading the next page.
- `HARD_PAGE_CAP` — safety limit on how far it will page.
- `FOLLOW_LIMIT` — stop after this many total follows (default `7000`).
- `MAX_RETRIES` — re-click attempts per user before recording a failure.
- `RATE_LIMIT_STREAK` / `RATE_LIMIT_PAUSE` — how many failures in a row count as
  rate-limiting, and how long to pause when it happens.

> The follow counter is what the extension itself has confirmed, not your
> account's existing following count. If you already follow people, your real
> headroom to GitHub's ~7,500 cap is smaller than `7000 − counter`.

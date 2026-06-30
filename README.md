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
4. Press **Stop** any time. It also stops automatically when it reaches a page
   with no users.

The popup shows a running total of how many users it has followed; **Reset
counter** clears it.

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

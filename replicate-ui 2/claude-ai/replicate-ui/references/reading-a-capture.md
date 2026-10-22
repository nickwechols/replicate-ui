# Reading a capture

## Setup

Requirements: Node 18 or later and Playwright with Chromium. ffmpeg is optional; it makes the contact sheets and video poster frames.

```bash
npm i -g playwright && npx playwright install chromium
# or, without global installs:
mkdir -p ~/.replicate-ui && cd ~/.replicate-ui && npm init -y && npm i playwright && npx playwright install chromium
NODE_PATH=~/.replicate-ui/node_modules node "SKILL_DIR/scripts/capture-site.cjs" <url>
```

The script finds Playwright locally, then globally, then through `NODE_PATH`.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `Host system is missing dependencies to run browsers` and no sudo | Chromium has already downloaded; one shared library is missing. Fetch the `.deb` for your architecture (for example `libxdamage1` from ports.ubuntu.com for arm64), unpack it with `dpkg-deb -x pkg.deb ./libs`, and run with `LD_LIBRARY_PATH=$PWD/libs/usr/lib/<arch>-linux-gnu`. |
| The crawl dies partway and the log just stops | Your shell kills processes when each call ends, or it has a time limit. Run `--list`, then batches of `--only /a,/b --budget 170 --out cap-1`. |
| Connection reset, or the page never loads | The sandbox network allowlist blocks the site. Run the script on the user's own machine, or use the browser path in the skill. |
| Hero or card areas are blank | They are `<video>` elements (MP4/H.264), which headless Chromium cannot decode. Use the poster frames in `shots/*-video-*.jpg`. Without ffmpeg there are none, so note the gap in the spec. |
| A cookie or newsletter modal covers everything | The crawler hides common consent and popup containers with CSS. For a custom one, run one targeted script that hides its selector. |

## Output

```
site-capture/
  summary.md          read this first: pages, tokens, hovers, reveals, taps, CSS rules, motion
  data.json           everything in summary.md, unrounded; input for compare-captures.cjs
  shots/              <page>-desktop-fold|full.png, <page>-mobile-fold|full.png,
                      <page>-hover-N-off|on.png, <page>-tap-N-mid|open.png, <page>-video-N.jpg
  video/              <page>.webm, <page>-entrance.jpg (first 3 s at 8 fps), <page>-tiles.jpg (2 fps)
  html/               <page>.html, rendered markup with scripts stripped; grep it, do not read it whole
```

## What to look at

Read `summary.md` fully. Then look at images in this order, and stop when the spec has no open questions:

1. Every `*-desktop-fold.png` and `*-mobile-fold.png`. They are cheap and show each template's first impression.
2. Every `*-video-*.jpg` poster frame, because video heroes are blank in the screenshots.
3. The `-full.png` of the start page and of the one or two templates with the most distinct sections. A tall page can be sliced into strips with Pillow and read one strip at a time.
4. The `-entrance.jpg` and `-tiles.jpg` of pages whose summary shows reveals, keyframes, scrub or a motion library.
5. Hover `-off`/`-on` and tap `-mid`/`-open` pairs, only where the diff text does not explain itself (a moving underline, an image zoom, a mask wipe).
6. `html/<page>.html`, by grep, for exact structure: section order, nesting, and class names that reveal the framework.

If a contact sheet shows something the numbers did not capture (a preloader, a split-text cascade, a marquee), cut that passage out of the `.webm` and re-tile it at a higher fps:

```bash
ffmpeg -ss 2 -t 3 -i video/home.webm -vf "fps=8,scale=480:-1,tile=6x4" -frames:v 1 hero-8fps.jpg
```

## Reading the numbers

- Colour tallies are weighted: text by characters, backgrounds by area. The first two or three entries are the palette.
- Spacing tallies mix padding, gap and margin. Look for the repeating set (for example 15, 30, 50, 100, 150), not the single most common value.
- A transition of `all` with no duration means instant state changes. That is a real design choice; do not add easing the reference does not have.
- Hover diffs list exact before and after values. Colours are in hex, with `@alpha` when translucent.
- "Stays put while page scrolls" on an element inside a fixed or sticky ancestor is filtered out. What remains is usually a JavaScript pin or a full-viewport iframe.

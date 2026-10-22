---
name: replicate
description: Study a reference UI (live site, screenshots, screen recording or Figma) and rebuild in that exact style, covering fonts, colours, shapes, layout, copy, components, hover and tap states, and motion across every page template. Use when someone shares a site or screen and asks to copy, replicate, match or "make it look like" its design.
argument-hint: <url | screenshot | recording> [what to build]
---

# Replicate UI

Study a reference interface the way a senior UI designer would, write down its full design system across **every page template and every interaction state**, then rebuild in that exact style. The goal is a result someone could put next to the reference and not be able to tell which designer made which, on any page, in any state, on desktop and phone.

The efficiency rule: **machines measure, eyes judge.** One scripted crawl pulls every number in a single pass: tokens, type scale, hover diffs, reveals, taps and keyframes. Spend your looking on a small set of images chosen from the summary, never on raw dumps or one screenshot per element.

Reference: $ARGUMENTS

## 0. Set the quality bar

If a frontend-taste skill is installed (for example `design-taste-frontend`), load it first and use it for everything the reference does not show: states, empty and error screens, responsive behaviour, accessibility and pre-flight checks. **The reference outranks the taste skill's defaults.** If the reference uses something the taste skill discourages (a serif display face, an eyebrow above every section, centred heroes), replicate it. Fidelity wins.

If the reference has visible motion and a motion-study skill is installed (for example `awwwards-motion-study`), follow it for the build and re-record steps. The crawl below already does its capture step, so do not record twice.

## 1. Gather the reference

Note the source type in the spec, because it decides which values are measured and which are inferred.

### Live URL: run the whole-site crawl (default)

1. Run the crawler once:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/capture-site.cjs" https://example.com --out site-capture
   ```
   Options:
   - `--max 14`: page cap.
   - `--per-template 1`: pages captured per repeated template.
   - `--pages /about,/work/a`: force-include pages.
   - `--list`: print the plan and exit.
   - `--only /a,/b`: capture a subset of the plan.
   - `--budget 170`: stop starting pages after N seconds.
   - `--no-video`, `--concurrency 3`.

   Setup and troubleshooting live in [reading-a-capture.md](${CLAUDE_PLUGIN_ROOT}/references/reading-a-capture.md#setup).
2. **If your shell stops processes after each call, or each call has a time limit,** plan first with `--list`. Then run the pages in batches with `--only ... --budget 170` and a separate `--out` per batch. Read each batch's `summary.md`.
3. What the crawl does, in one browser session:
   - **Finds every page.** Reads robots.txt and the sitemaps, plus every same-origin link on the start page, with nav, header and footer links first.
   - **Groups pages into templates.** `/products/a` and `/products/b` count as one. It captures one page per template and skips cart, checkout, account, login and search pages.
   - **Desktop pass, 1440×900, per page:**
     - Video of the entrance and a slow stepped scroll, with contact sheets made from it.
     - Fold and full-page screenshots, plus the rendered HTML.
     - Frequency-ranked tokens from computed styles: colours, type styles, radii, borders, shadows, spacing, transitions, animations, blur and blend modes, sticky and fixed elements.
     - One poster frame per `<video>`. Headless Chromium cannot play MP4, so video areas otherwise look blank.
   - **Hover.** It really hovers each new component type, deduplicated site-wide. It waits out the transition, then diffs the computed styles of the element, its children and its `::before` and `::after`.
   - **Scroll motion.** It records what revealed and with which transition, transforms that change with scroll position (scrub and parallax), and elements that stay put while the page scrolls (JavaScript pins).
   - **Tap, phone 390×844 with touch.** It taps each new toggle (menus, accordions, tabs, `aria-expanded` controls). It captures a frame mid-transition, the open state, and whether the page stops scrolling.
   - **Stylesheets, parsed once per site:** every `:hover`, `:focus` and `:active` rule, `@keyframes`, breakpoints, `@font-face` files and `:root` variables. It also notes whether hover is guarded by `(hover: hover)` and whether reduced motion is handled.
   - **Stack fingerprint:** GSAP, Lenis, Three.js and WebGL, Framer, Webflow, Shopify, Swiper, Barba and Swup, Lottie, Spline, Next and Nuxt, Tailwind. Plus custom-cursor detection and a page-transition probe.
4. Read `summary.md` first and fully. Then look at images in the order given in [reading-a-capture.md](${CLAUDE_PLUGIN_ROOT}/references/reading-a-capture.md#what-to-look-at), and stop when the spec has no open questions.
5. Gaps worth one targeted follow-up, not a re-crawl:
   - a page behind a click the crawler could not reach (a filtered view, a modal, a drawer);
   - a state that needs input (a filled form, an error);
   - exact values for one signature component.

   Run one small Playwright script that reads computed styles for just those selectors and screenshots just that region. Do not repeat the crawl.

### Live URL without a shell: browser path

Use the browser tools and keep the same economy. Run the crawler's extractors in one JavaScript call per page; copy `EXTRACT`, `HOVER_CANDS` and `STYLE_OF` from `capture-site.cjs`. Hover with real mouse moves only for component types you have not seen yet. Resize to 390 wide for the phone pass, and record a GIF of the scroll on pages with motion. Visit one page per template, exactly as the script does.

### Other sources

- **Screenshots**: get the highest resolution available, and measure them with section 2. Ask for more screens only if one cannot show the system.
- **Recordings or GIFs**: make an overview with `ffmpeg -i ref.mp4 -vf "fps=2,scale=480:-1,tile=6x5" -frames:v 1 tiles.jpg`, then use a higher fps on the passages that matter.
- **Figma links**: read variables, text styles and node properties directly. Check prototype interactions and component variants for states.

## 2. Measure, do not eyeball

For live sites the crawl already measured. This section is for screenshots, and for checking anything the crawl flagged as odd. Work from pixels with Python and Pillow:

```python
from PIL import Image
im = Image.open("ref.png").convert("RGB")
for name, (x, y) in {"bg": (20, 20), "headline": (210, 340)}.items():
    print(name, "#%02x%02x%02x" % im.getpixel((x, y)))
q = im.quantize(colors=12); pal = q.getpalette()
for count, idx in sorted(q.getcolors(), reverse=True):
    print(count, "#%02x%02x%02x" % tuple(pal[idx*3:idx*3+3]))
im.crop((x0, y0, x1, y1)).resize(((x1-x0)*4, (y1-y0)*4), Image.NEAREST).save("zoom.png")
```

Establish the scale factor first; a 2x retina screenshot doubles every value. Then measure:
- cap height and x-height for font size;
- gaps between repeated elements for the spacing unit;
- where curves meet straight edges for radii;
- border width, shadow offset, blur and tint.

Reading crawl numbers well:
- **Frequency is signal.** The top three to five values in each tally are the system. Long tails are one-offs, third-party widgets or bugs. Snap near-duplicates (15.98px becomes 16px) and say so.
- **Prefer `:root` custom properties for token names** when the site has them. They are the designer's own names.
- **A type style on every page is the system; one on a single page is a page-specific moment.** Label both.
- **CSS `:hover` rules the crawl did not trigger are still real states.** Include them.

## 3. Write the Design DNA

Write the spec before building anything, using [design-dna.md](${CLAUDE_PLUGIN_ROOT}/references/design-dna.md). Mark every value **measured** (crawl, computed style or pixel sample) or **inferred**. Save it as `design-dna.md` next to the capture.

## 4. Build in the style

1. Turn the DNA into tokens first: CSS variables or a Tailwind theme (reusing the reference's own `:root` names where they exist), or Figma variables and text styles. Include motion tokens: durations and easing curves.
2. Build the components next, with every state from the inventory, then compose the templates.
3. Replicate the reference templates first to prove the system, unless the user only wants new screens in the style. One page per template is enough.
4. Apply it to the user's content or product. Keep the reference's rules even when the content differs: the same hierarchy logic, density, information patterns and interaction physics.
5. Every animation and hover in the build must trace to an inventory row. Ship a `prefers-reduced-motion` fallback, and guard hover with `(hover: hover)` when the reference does.

Targets:
- **Web**: use the stack the fingerprint shows (a GSAP and Lenis site gets GSAP and Lenis). Otherwise use plain HTML and CSS, or the project's existing stack.
- **Figma**: build with variables, text styles and component variants for states.
- **An existing codebase**: map the tokens onto its existing token layer instead of hardcoding values.

## 5. Compare and fix

Serve the build locally and crawl it with the same options. Then diff the two runs:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/capture-site.cjs" http://localhost:5173 --out build-capture
node "${CLAUDE_PLUGIN_ROOT}/scripts/compare-captures.cjs" site-capture build-capture
```

`compare.md` lists every top reference value the build is missing: colours, type styles, radii, shadows, spacing, transitions and hover behaviour. Then put the fold screenshots side by side per template, at desktop and phone. Check each item on the nuances list.

Fix the biggest differences first. Repeat once or twice, until a second look finds nothing meaningful. Report what still differs and why; for example, a proprietary font replaced by its closest free match.

## Boundaries

- **Replicate the style and interaction design, not the brand.**
  - Do not copy logos, wordmarks, mascots, illustrations, product photography, videos or proprietary icon sets.
  - Use placeholders or original assets made in the same style.
  - Do not use the reference company's name in the result.
- **Do not build pages that could pass as the reference company's real product, login or checkout.** The crawler skips those routes on purpose.
- **Keep captures local.** Screenshots, video and HTML are study material; do not publish or redistribute them.
- **Crawl politely.** Capture one page per template, keep the page cap and low concurrency, and never crawl behind a sign-in.
- **Use licensed fonts.** If the reference uses a paid font, say so and use the closest free match, unless the user owns a license.

## Deliverable

End with:
- the Design DNA file;
- the build;
- side-by-side fold comparisons per template, at desktop and phone;
- the `compare.md` score;
- a short list of anything that could not be matched exactly.

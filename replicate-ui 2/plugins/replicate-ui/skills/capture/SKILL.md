---
name: capture
description: Crawl a live website in one pass and report its design system and interactions (tokens, type scale, hover and tap diffs, scroll reveals, keyframes, stack) without building anything. Use when someone wants a site studied, audited or measured.
argument-hint: <url> [--max N] [--pages /a,/b]
---

# Capture a site

Target: $ARGUMENTS

1. Run the crawler. Pass through any options the user gave; full flags and setup are in [reading-a-capture.md](${CLAUDE_PLUGIN_ROOT}/references/reading-a-capture.md).
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/capture-site.cjs" <url> --out site-capture
   ```
   If your shell stops processes when a call ends, or each call has a time limit: run `--list` first, then batches of `--only ... --budget 170`, each with its own `--out`.
2. Read `site-capture/summary.md` fully. Then look only at the images the [reading order](${CLAUDE_PLUGIN_ROOT}/references/reading-a-capture.md#what-to-look-at) calls for.
3. Reply with a short read of the system:
   - **Direction:** one line.
   - **Templates found**, and what was skipped as a duplicate template.
   - **Type:** families and the scale.
   - **Colour tokens**, with the neutral-to-accent ratio.
   - **Radius and spacing scales.**
   - **Hover and tap behaviour.**
   - **Motion:** curves, durations and the stack.
   - **Five standout nuances.**
   - **Capture gaps:** videos, pages behind clicks, sign-ins.

   Point to the capture folder for the rest. Do not paste the summary back.
4. Offer the next step in one line: `/replicate-ui:dna` for the full spec, or `/replicate-ui:replicate` to build.

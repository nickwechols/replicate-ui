---
name: compare
description: Crawl a local build with the same settings as a reference capture, diff the two (colours, type, radii, spacing, transitions, hover behaviour, motion) and fix the biggest gaps. Use after building something in a reference site's style.
argument-hint: <build url, e.g. http://localhost:5173> [reference capture folder]
---

# Compare a build with its reference

Arguments: $ARGUMENTS. The reference capture defaults to `site-capture/`.

1. Make sure the build is being served. If you started a server yourself and your shell stops processes when a call ends, start the server and run the crawl in the same call.
2. Crawl the build with the same options used for the reference:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/capture-site.cjs" <build-url> --out build-capture
   node "${CLAUDE_PLUGIN_ROOT}/scripts/compare-captures.cjs" site-capture build-capture
   ```
3. Read `build-capture/compare.md`. Every ✗ is a top reference value the build does not use. Then view the reference and build fold screenshots side by side for each template, at desktop and phone.
4. Fix the ✗ items and visual differences, biggest first, then re-run step 2 once. Stop after two rounds.
5. Report the before and after scores, what still differs, and why (font licensing, video assets, WebGL effects approximated in CSS).

---
name: dna
description: Write a complete Design DNA spec for a website or screen (templates, type, colour, shape, space, components with every state, the motion inventory and nuances) from a crawl or screenshots, without building. Use when someone wants a design system documented from a reference.
argument-hint: <url | capture folder | screenshots>
---

# Design DNA

Source: $ARGUMENTS

1. If there is no capture yet and the source is a URL, run `/replicate-ui:capture` steps 1 and 2 first. If it is screenshots or a recording, measure them as described in the `replicate` skill, section 2.
2. Fill every section of [design-dna.md](${CLAUDE_PLUGIN_ROOT}/references/design-dna.md), and mark each value measured or inferred. Use the site's own `:root` token names wherever they exist.
3. For any value the summary leaves open on a signature component, run one targeted follow-up: a small Playwright script that reads computed styles for just those selectors. Do not re-crawl.
4. Save the spec as `design-dna.md` next to the capture. Reply with the direction line, the twelve nuances and the file path.

# Design DNA template

Fill every section. Mark each value **M** (measured: crawl, computed style, CSS or pixel sample) or **I** (inferred). Note the source type at the top, and any capture gaps (for example "hero is MP4, poster frame only").

## 1. Direction read
One line: what kind of product, for whom, what feeling, which aesthetic family. Then three to five mood words.

## 2. Site map and templates
A table with these columns: template, page count, section order (from "Section rhythm" in the summary), and what the template is for. Then the shared chrome: header, footer and drawers, and whether any page or section inverts the colours.

## 3. Typography
- Family identification with reasoning, confirmed against the loaded faces and `@font-face` files. Give the likely font and the closest free alternative if it is proprietary.
- The type scale as a table: role, desktop size, phone size, weight, line height, tracking, case, colour.
- How emphasis works: weight, italic, colour, a size jump, or a second family.
- Leading tricks (negative margins, cap-height trims), numerals, punctuation and quote marks.

## 4. Colour
- Tokens with measured hex, using the site's own `:root` names when it has them.
- The ratio of neutral to accent, from the weighted tallies, and where the accent is allowed to appear.
- Light or dark; how depth is shown (tints, borders or shadows); any per-page or per-section accents.

## 5. Shape and material
The radius scale and which elements get each radius; stroke weights; the shadow recipe; blur or glass; texture or grain.

## 6. Space and layout
- The grid, column widths, margins, the spacing scale and density.
- Alignment habits, and where the eye lands first.
- Breakpoints, and how each template reflows on a phone.

## 7. How information is presented
The patterns the UI uses, per template: cards versus lists versus plain type, how numbers and facts are shown, labels and metadata, dividers or none, icons, imagery and charts. This is often the biggest part of a style.

## 8. Copy voice
Sentence length, casing, tone, punctuation habits, how buttons and labels are worded, and how much text there is.

## 9. Components inventory
A table with these columns: component, anatomy and measured values, and states. States are default, hover (the measured diff), focus (from the CSS), active or pressed, tap on phone, disabled, loading, empty and error. Mark which states the site showed and which you inferred in its language.

## 10. Iconography and imagery
The icon library or its closest match, stroke width, size and fill. Photo or film treatment, crops, aspect ratios, lazy-load behaviour and image hover behaviour.

## 11. Interaction and motion inventory

| Element | Trigger (load, scroll-enter, scrub, pin, hover, focus, tap, route change) | What changes | Duration | Easing | Stagger or overlap | Phone behaviour | Source |
|---|---|---|---|---|---|---|---|

Then the system-level rules:
- the site's two or three duration tiers and easing curves (the transition tallies usually show them plainly);
- the motion stack, from the fingerprint;
- page transitions, smooth scroll and custom cursor;
- whether hover is disabled on touch;
- reduced-motion and focus handling.

## 12. The nuances
Five to twelve small, specific and measured decisions that make the design feel like itself. These are what generic copies miss. Examples:
- "two text sizes and one weight run the whole UI";
- "links are grey until hovered";
- "every reveal is 30px up over 0.8s with no easing curve".

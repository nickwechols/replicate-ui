# Site capture: http://localhost:8765

Captured 4 pages (one per template) out of 7 discovered. Skipped 3 pages that share a template with a captured one.

## Pages
Rendered markup (scripts stripped) for every page is in html/<slug>.html — grep it for structure instead of guessing.

| page | template (siblings) | desktop | mobile | video | hovers | reveals | taps |
|---|---|---|---|---|---|---|---|
| / | / (1) | shots/home-desktop-fold.png, -full | shots/home-mobile-fold.png, -full | video/home.webm (+ -entrance.jpg, -tiles.jpg) | 3 | 1 | 1 |
| /about/ | /about (1) | shots/about-desktop-fold.png, -full | shots/about-mobile-fold.png, -full | video/about.webm (+ -entrance.jpg, -tiles.jpg) | 0 | 1 | 0 |
| /products/ | /products (1) | shots/products-desktop-fold.png, -full | shots/products-mobile-fold.png, -full | video/products.webm (+ -entrance.jpg, -tiles.jpg) | 0 | 1 | 0 |
| /products/a.html | /products/* (4) | shots/products-a-html-desktop-fold.png, -full | shots/products-a-html-mobile-fold.png, -full | video/products-a-html.webm (+ -entrance.jpg, -tiles.jpg) | 0 | 1 | 0 |

## Stack fingerprint
nothing detected (plain CSS / vanilla JS)
Page transition: full document load, 67 ms to /products/ (watch the home video end).

## Fonts
Loaded faces: none reported
@font-face files: -

## Type styles (desktop, all pages, by frequency)
| family | size | weight | line-height | tracking | case | style | uses | tags | colors | sample |
|---|---|---|---|---|---|---|---|---|---|---|
| Georgia | 17px | 400 | 25.5px | normal | none | normal | 24 (4p) | a,div | #f2efe9 #000000 | Home |
| Georgia | 88px | 700 | 83.6px | -3.52px | none | normal | 4 (4p) | h1 | #f2efe9 | Home |

## Mobile type (tag size/line-height weight tracking: uses)
a 17px/25.5px 400 normal: 20 · button 13.3333px/normal 400 normal: 4 · h1 48px/45.6px 700 -1.92px: 4

## Text colors (weighted by text length)
#f2efe9 (138) · #000000 (32)

## Background colors (weighted by area)
#1a1a1a (855) · #0e0e0e @0.8 (381) · #d4ff3a (30)

## Gradients
-

## Radii
14px (8) · 999px (4)

## Borders
-

## Shadows
-

## Backdrop / filter / blend
blur(12px) (4)

## Filters
-

## Blend modes
-

## Spacing values (padding, gap, margin)
24px (20) · 20px (4) · 32px (4) · 58.96px (4) · 14px (4) · 26px (4)

## Transitions in use
color 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.25s (12) · opacity 0.8s, transform 0.8s (8) · transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s (4)

## Animations running
rise (4)

## Cursors
pointer (16)

## Sticky / fixed elements
nav. (sticky) (4)

## CSS custom properties on :root
--bg: #0e0e0e · --fg: #f2efe9 · --accent: #d4ff3a · --r: 14px

## Breakpoints / media queries
(max-width:768px)
Hover styles guarded by (hover: hover): no · prefers-reduced-motion handled: no

## Hover interactions (measured: real mouse hover, computed-style diff, one per component type)
- **a.@nav** "Home" on home — transition `color 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.25s` — color: #f2efe9 → #d4ff3a — shots/home-hover-0-off.png / -on.png
- **a.btn** "Shop now" on home — transition `transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s` — boxShadow: none → #d4ff3a@0.35 0px 12px 30px 0px; transform: none → matrix(1.03, 0, 0, 1.03, 0, -3) — shots/home-hover-1-off.png / -on.png
- **div.card.in.reveal** "Card one" on home — transition `opacity 0.8s, transform 0.8s` — backgroundColor: #1a1a1a → #242424 — shots/home-hover-2-off.png / -on.png

## Scroll reveals (hidden below the fold before scrolling, changed after)
- **div.card.reveal** (every page): opacity 0→1, transform matrix(1, 0, 0, 1, 0, 30)→none · `opacity 0.8s, transform 0.8s`

## Scroll-linked motion (scrub / parallax / JS pin candidates)

## Tap interactions (mobile, touch emulation)
- home **button.burger[Menu]** target 49x21: aria-expanded=true, body overflow=visible, +2 visible elements — shots/home-tap-0-mid.png (250ms) / -open.png

## @keyframes (1)
- rise: from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}

## CSS :hover rules (3, from stylesheets — includes states the crawl could not trigger)
- `nav a:hover { color:var(--accent) }`
- `.btn:hover { transform:translateY(-3px) scale(1.03);box-shadow:0 12px 30px rgba(212,255,58,.35) }`
- `.card:hover { background:#242424 }`

## CSS :focus rules (1)
- `.btn:focus-visible { outline:2px solid var(--fg);outline-offset:3px }`

## CSS :active rules (0)

## Section rhythm (per page: tag.class height bg)
- home (1668px): div 1200
- about (1668px): div 1200
- products (1668px): div 1200
- products-a-html (1668px): div 1200
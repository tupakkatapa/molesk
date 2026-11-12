# Plan: mobile usability pass

> Superseded by [2026-11-09-hardening-and-polish.md](2026-11-09-hardening-and-polish.md).

## Goal

Make molesk feel native on phones: full-width readable content, a predictable navigation drawer, no horizontal overflow, and touch-sized controls. Desktop must not regress.

## Success criteria

- At 320, 360, 390 and 768px wide, no page has `document.documentElement.scrollWidth > innerWidth`, including the markdown test page with wide tables and code.
- Wide tables and code blocks scroll horizontally inside their own box. Nothing is clipped (tables are currently clipped by `overflow: hidden`).
- On mobile the content uses the full width (no permanent 45px sliver). A visible menu button opens the drawer.
- The drawer is never wider than the viewport. It closes on: backdrop tap, Escape, swipe left, and navigating to a note.
- Horizontal swipes inside a code block or table never toggle the drawer. The open swipe only starts near the left edge.
- Every interactive control is ≥44×44 CSS px on `pointer: coarse` (WCAG 2.5.5).
- Body text is ≥16px on mobile and metadata is ≥12px (it is currently 8px).
- The document scrolls, not `.main`: the mobile URL bar collapses, scroll position is restored on back, and `Home`/`End` still work.
- Rotating or resizing across the breakpoint leaves a consistent drawer/backdrop/scroll-lock state.
- AJAX navigation updates `document.title`, scrolls to top and doesn't leak listeners or lightbox overlays.
- Folder open/closed state survives the tree changing (keyed by folder path, not DOM index).
- Desktop: the existing desktop/tablet tests pass unchanged; collapse/expand behaves as before.

## Non-goals

- Visual redesign, new colour palette, typography family changes.
- PWA, offline mode, install prompts.
- Pinch-zoom inside the lightbox beyond the browser default.
- Self-hosting Font Awesome or Google Fonts (worth doing, separate change).

## Approach

### Scope

Fix root causes in the existing files. No new dependencies, no new JS modules. CSS consolidation removes conflicting overrides; it doesn't add another layer on top of them.

### Layout (root causes)

- **Scroll container.**
  - Today `.container { height: 100vh }` plus `.main { overflow: auto }` makes `.main` the scroller. That breaks URL-bar collapse, scroll restoration and overscroll on mobile.
  - Change: `.container { min-height: 100dvh }`, `.main` gets no `overflow` and no fixed height, so the document scrolls. The sidebar stays `position: fixed`.
  - `Home`/`End` move to `window.scrollTo`. The single-file overrides that undid this become redundant; delete them.
- **`100vh` to `100dvh`** wherever a height is tied to the viewport: sidebar content height, container.
- **Mobile drawer (≤768px).**
  - Sidebar `width: min(400px, 85vw)`, `transform: translateX(-100%)` when collapsed, `overscroll-behavior: contain`.
  - `.main` is full-width with no margin-left.
  - A new mobile-only `<button id="menuToggle" class="menu-btn" aria-controls aria-expanded>` sits fixed top-left, outside the nav so the transform doesn't trap it. It respects `env(safe-area-inset-*)`.
  - `.sidebar-toggle-zone` and its JS become dead and are deleted.
- **Desktop collapse is unchanged** (the 45px sliver and arrow button stay).
- **`viewport-fit=cover`** in the viewport meta, plus safe-area padding on fixed elements.
- **`<meta name="theme-color">`**: one tag, updated by `initializeTheme` and the theme toggle. The site theme is user-chosen and defaults to dark, so a pair of `media`-query tags would follow the OS theme instead of the site. Set `color-scheme` on `body` and `.dark-theme`.

### Content

- **Tables.** Server-side markdown-it `table_open`/`table_close` rule wraps tables in `<div class="table-wrapper">` (`overflow-x: auto`). It's server-side so the markup is right without JS and both the full-page and AJAX paths get it. Border radius moves to the wrapper; the table keeps `overflow: visible`.
- **Code blocks.** `pre` already has `overflow-x: auto`. Make sure `.code-wrapper` doesn't clip it and that `-webkit-overflow-scrolling` isn't needed (modern browsers don't need it).
- **`.markdown-body min-width: 400px`.** Delete it everywhere. It's the main overflow source, and the mobile override chain (`calc(100vw - 150px)` then `unset`) exists only to undo it.
- **Typography consolidation.** One mobile block:
  - `.markdown-body` 16px / 1.6;
  - h1 24px, h2 20px, h3 18px;
  - code 13px;
  - metadata 12px.
    Delete the conflicting `body 14px`, the `p, li 14px` rules and the duplicate h1/h2 rules.
- **Long words and URLs.** `overflow-wrap: anywhere` on `.markdown-body` paragraphs and list items.

### Interaction

- **Single drawer state function.** `setSidebarOpen(open)` in `sidebar.js` is the only writer of:
  - `.collapsed`, `.sidebar-collapsed` and `.rotate`;
  - the backdrop and `body.no-scroll`;
  - `aria-expanded`.
    The collapse button, menu button, backdrop, Escape, swipe and link-navigate all call it. This fixes the current bug where swipe-open skips the backdrop and scroll lock.
- **Breakpoint via `matchMedia("(max-width: 768px)")`** shared by CSS and JS (`CONFIG.MOBILE_BREAKPOINT` stays the single number). On `change`, reset to the default state for the new mode (mobile collapsed, desktop open). Remove `isMobile()`'s `innerWidth` read.
- **Swipe gestures.** Use `touchstart`/`touchend` with `passive: true`. Track X and Y; act only when `|dx| > threshold` and `|dx| > 2·|dy|`.
  - Ignore when the start target is inside `pre`, `.table-wrapper` or the lightbox.
  - Open only if the swipe starts within 24px of the left edge; close from anywhere.
  - Mobile only.
- **Navigate closes drawer.** `navigateTo()` calls `setSidebarOpen(false)` on mobile. It then sets `document.title` from the response (`X-Page-Title` header set by the AJAX branch in `app.js`) and calls `window.scrollTo(0, 0)`, unless it's a popstate (the browser restores scroll).
  - The server sends the header value through `encodeURIComponent` and the client decodes it. Header values must be latin1: a raw "Äiti" or emoji title throws `ERR_INVALID_CHAR`.
  - If the fetch fails (network error or abort), fall back to `location.href = href`.
- **Listener and overlay leak.** Create the lightbox overlay and its Escape listener once. Use one delegated click listener on `document` for images, in-page anchors and `/content/` links. It must be `document`, not `#file-content`, because sidebar links need interception too. This means so re-initialising after navigation only re-runs `addCopyButtons` and `setupLazyImages`.
- **Folder state key.** `folderState:<a/b/c>`, built from ancestor folder labels in the DOM. Ignore old index-based keys (they're harmless leftovers).
- **Touch targets** under `@media (pointer: coarse)`: `.copy-button`, `.social-link`, `.download-icon`, theme toggle, menu/arrow buttons, and sidebar links/folders (`min-height: 44px`, block-level) all get ≥44px. These targets depend on the pointer type, not the viewport width.
- **Hover styles** wrapped in `@media (hover: hover)` where a background persists after tap (sidebar links, buttons), to avoid "sticky hover" on touch.

### Accessibility (rides along)

- `#menuToggle` and `#collapseSidebar` get an accurate `aria-expanded`.
- Copy buttons get an `aria-label`.
- Remove `role="button"` on the deleted toggle zone.
- The lightbox overlay gets `role="dialog"` and `aria-modal` while open.

### Testing

- The `mobile-chromium` (Pixel 5) project already exists. Add `tests/mobile.spec.js`, plus overflow checks that run per viewport on every content page.
- Use `page.touchscreen` / dispatched `TouchEvent`s for the swipe specs.

### Docs

- README: under Keyboard Shortcuts, add "Touch: swipe from left edge to open navigation, swipe left to close". The responsive claim in the feature list stays.

## Steps

TDD: write the failing spec, then the fix.

1. **Specs first** (`tests/mobile.spec.js`):
   - no horizontal overflow at 320/360/390/768 on all three content pages;
   - table scrolls inside its wrapper (`scrollWidth > clientWidth` on `.table-wrapper`, document not overflowing);
   - drawer ≤ viewport width;
   - menu button opens, link click closes, backdrop closes;
   - swipe inside `pre` does nothing, edge swipe opens, swipe-open activates the backdrop;
   - coarse-pointer controls ≥44px. The spec first asserts `matchMedia('(pointer: coarse)').matches`, so a gap in emulation fails loudly instead of passing vacuously;
   - mobile body text ≥16px, metadata ≥12px;
   - AJAX nav updates the title (including a non-ASCII note name) and scrolls to top. A network failure falls back to full navigation;
   - lightbox overlay count stays 1 after 3 navigations;
   - folder state persists by path;
   - resize desktop→mobile→desktop gives a consistent state;
   - the window (not `.main`) scrolls.
2. **Markdown table wrapper** (`lib/markdown.js`) + CSS.
3. **Layout:** document scrolling, `dvh`, delete `min-width`, consolidate `mobile.css` typography, safe-area, `theme-color`.
4. **Drawer:**
   - `views/index.ejs`: add `#menuToggle`, delete the toggle zone.
   - `sidebar.js`: `setSidebarOpen`, `matchMedia`, swipe rewrite, folder keys.
   - `mobile.css`: drawer styles.
5. **`content.js`:** delegated listeners, single lightbox, nav closes drawer + title + scroll. **`app.js`:** `X-Page-Title` header on the AJAX branch. **`main.js`:** `Home`/`End` use `window`.
6. **Touch targets and hover-gating** CSS. Accessibility attributes.
7. **Update existing specs** that hard-code the mobile open path (`responsive.spec.js` "navigation is accessible on mobile" clicks `#collapseSidebar`; it must click `#menuToggle`). This is the only intended test change. Flag it in the PR.
8. **Finish:** run `nix fmt`, oxlint pedantic and the full Playwright suite (both projects). Take manual screenshots at 360px light/dark via Playwright for the PR.

## Test strategy

- Positive: every success criterion has a spec.
- Negative: swipe inside a scrollable area, a vertical scroll with slight horizontal drift (`dy`-dominant) must not toggle, and resizing must not leave the backdrop stuck.
- Characterisation: the desktop/tablet specs in `responsive.spec.js`, `theme.spec.js` and `accessibility.spec.js` run unchanged and act as the desktop regression guard.

## Risks & trade-offs

- **Mobile nav pattern change (sliver → menu button).** A deliberate UX change: the sliver costs about 12% of a 360px screen and is an undiscoverable target. Not a public API break, but one existing spec changes; called out in the PR.
- **Document scrolling instead of `.main`.** Touches desktop too. It's correct on both, but has wide blast radius. Covered by the existing desktop specs plus a new "window scrolls" spec.
- **`dvh` support.** Universal in evergreen browsers since 2023. Use `100vh` as a preceding fallback declaration.
- **Merge order with the edit-mode plan.** Merge this branch first. The edit branch then rebases onto `index.ejs`/`app.js`/`content.js` changes. The `X-Page-Title` header and `contentActions` helper don't overlap semantically.

## Rollout

No flags. Ship as a patch/minor release with a changelog entry ("Mobile: full-width reading, menu button, scrollable tables, larger touch targets").

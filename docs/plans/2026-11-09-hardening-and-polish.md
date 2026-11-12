# Plan: hardening, size and polish — whole-project review follow-up

## Goal

Ship `next` as a finished product: no known data-loss or security bugs, a package about 5× smaller with zero third-party requests at runtime, and a sidebar, note view and editor that feel deliberate on desktop and phone.

## Success criteria

- Every Phase 1 bug has a repro spec that failed for the stated reason before the fix, and passes after.
- `nix build` package ≤ 10 MB, closure ≤ 235 MiB (from 41 MB / 279 MiB), measured with `du -sh` and `nix path-info -Sh`.
- No request leaves the origin at runtime: CSP is `default-src 'self'` with no external hosts. A spec asserts no non-origin requests while loading a note, the editor and an index.
- `--link fab:…` icons keep working (brands font vendored, FontAwesome pinned to `^6`).
- **Golden snapshot.** Before Phase 1, commit `tests/golden/` holding the rendered HTML of every `contents/` page plus `/rss.xml` in read-only mode. At the end, the diff contains only the changes on the allow-list under Risks.
- **UI checklist.** Every item in the UI checklist below is visibly fixed in screenshots at 390px, 1024px and 1400px, light and dark. The screenshot scripts move into `tests/shots/`; they run on demand and are not part of the suite.
- **Size.** A flake check fails if the package exceeds 10 MB or the closure contains full `nodejs`.
- Full suite green, oxlint pedantic/complexity at 0, `nix fmt` clean, `nix flake check` green.

## Non-goals

- Monospace editor font, or hiding a legacy `# Title` that duplicates the filename. Both are kept as they are.
- Replacing ejs or express. Changing `--title` multi-word parsing. Switching to `util.parseArgs`. PJAX removal.
- Deleting `scripts/run-local.sh` (it is the owner's script) or `docs/plans/*` (removed after merge).

## Approach

### Phase 1: correctness, data safety, security (behavioural; repro-first)

| #   | Bug                                                                                                                                                                                                              | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `markdown-it-expandable` leaks state between renders: tight lists render loose, and the task-box bullet shows. Also O(n²): 1 MB blocks the server for minutes.                                                   | Delete the plugin and keep `markdown-it-collapsible` for `+++`. Keep today's open `<details>` default if the plugin allows it; otherwise list closed-by-default in the changelog. The `lvl-*` classes go. Spec: a tight list rendered after a loose one has no `<p>` inside `li`. A preview of just under 1 MB of `+++` completes in < 5 s, and doubling the input takes less than 4× the time.                                                                                                                                                                                                                                                                                                                                    |
| 2   | Self-move (`from === to`) deadlocks the path lock forever. Folder-move racing a save inside it splits the note. `makeDir` takes no lock.                                                                         | One `withWriteLock(fn)` wraps put, trash, move, makeDir, removeDir and the #11 trash copy. Precondition checks run inside it. No nested acquire. Self-move returns 200 as a no-op. `ponytail:` comment noting it is a single-user app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3   | Bad YAML, or two notes with an unquoted `date: 2026-01-01` (parsed as a JS `Date`), returns 500 on every page and in the editor.                                                                                 | One `splitFrontMatter` (CRLF-aware) feeds `parseMetadataOnly`, `parseFileContent`, `describeNote` and rss. Invalid YAML gives `{}`. `date` is normalised to `YYYY-MM-DD` text.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 4   | Value flags swallow the next flag (`--home --edit` starts read-only on 0.0.0.0). Unknown flags are ignored. `--port abc` / `8090x` / `99999` are accepted. Extra positionals and non-markdown files are ignored. | `fail()` on a missing value or one starting with `-`, an unknown `-`-option, a port not `^\d+$` in 1–65535, more than one positional, or a file that isn't `.md`/`.txt`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 5   | `--edit` without a dir edits the bundled `contents/`; an unwritable dir fails only at first save.                                                                                                                | `--edit` requires an explicit directory, plus `fs.accessSync(dir, W_OK)` at startup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 6   | Listen errors and uncaught exceptions are logged and ignored, so the process hangs and systemd never restarts it. The `fs.watch` watcher has no error listener.                                                  | First, `watcher.on("error")` logs and switches off tree caching (repro: emit `error`; the server stays up). Then delete both global handlers. `server.on("error")` → message, exit 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 7   | Single-file mode serves its whole parent directory to the LAN.                                                                                                                                                   | SINGLE_FILE serves only that file plus image files. HOST defaults to 127.0.0.1, since it is a local viewer that auto-opens the browser; migration note: pass `-a 0.0.0.0`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 8   | Read routes serve dot-paths. RSS walks dot-dirs and `.trash`. In edit mode `/content` follows symlinks that `/api/files` refuses.                                                                                | One `resolveReadable(config, rel)` used by `/content`, `/download`, images and rss. It rejects any `.`-segment, and images and downloads go through `res.sendFile` with `dotfiles: "deny"`. Read-only mode follows symlinks: only the operator can place them, and linkFarm or home-manager data dirs depend on it. Edit mode applies `resolveWritable`'s realpath containment.                                                                                                                                                                                                                                                                                                                                                    |
| 9   | `/rss.xml` is served with `--no-rss`. Feed URLs are `http://0.0.0.0:8080`, `image_url` leaks a filesystem path, and dateless items get `new Date()`.                                                             | Route mounted only when `SHOW_RSS`. Cache the item list only; build the XML per request from the escaped request origin, with `app.set("trust proxy", "loopback, uniquelocal")`. Image is `/profile-pic`. Undated items have no date. Replace the `rss` dependency with a small escaped template. Spec: two Host headers give two origins.                                                                                                                                                                                                                                                                                                                                                                                         |
| 10  | The rate limiter rejects autosave without a proxy and never applies behind a local proxy.                                                                                                                        | Delete `express-rate-limit`. The README says rate limiting belongs at the proxy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 11  | Conflict resolution loses data. "Keep mine" (`If-Match: *`) destroys theirs; "Load theirs" relies on the clipboard, which needs a secure context.                                                                | A PUT with `If-Match: *` that replaces different bytes first copies the old bytes into `.trash/`, inside the write lock. "Load theirs" first PUTs mine to a sibling `<name> (conflict).md` (`If-None-Match: *`; on 412, add a counter), then reloads. No clipboard dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 12  | A name over ~237 bytes breaks save and trash (ENAMETOOLONG).                                                                                                                                                     | Short temp name `.molesk-<rand>.tmp`. The 200-byte cap applies to new names only (create, move target); existing paths keep 255. The trash name is truncated to fit. Stale `.molesk-*.tmp` files are deleted by `removeDir`. Spec: an existing 230-byte note saves and trashes.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 13  | A directory fsync failure after the rename returns 500, so the client's ETag drifts.                                                                                                                             | Log a warning and return the ETag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 14  | `pagehide` skips the flush while a save is in flight; sending it anyway would 412 against the stale ETag. Task toggles use stale line numbers.                                                                   | When a save starts, compute its body's ETag client-side (`crypto.subtle` SHA-256, the same format as the server) and store it as `ed.pendingEtag`. `pagehide` sends a keepalive PUT with `If-Match: pendingEtag ?? etag`. The page carries its ETag; task toggles send `If-Match` and update it from each response, and a 412 reloads. Specs: dirty again during a slow save, then leave → the server has the last text. Two toggles in a row → no reload.                                                                                                                                                                                                                                                                         |
| 15  | `openBrowser` uses `exec` with a URL containing user input.                                                                                                                                                      | `execFile(cmd, [url])` (xdg-open/open; win32 is not supported).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 16  | Tests reuse any server on 8080/8081 and can write into real notes.                                                                                                                                               | `reuseExistingServer: false`; default test base port 18080.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 17  | Module: notes world-readable; read-only default `data` dir missing; no single-file+edit assertion; `mkEnableOption` text doubled; top-level `allowedHosts`.                                                      | Edit mode: `UMask=0027`, `StateDirectoryMode=0750`, matching the `group` option. Read-only: `tmpfiles` `d /var/lib/molesk 0755 root root -` when `data` is the default (no `StateDirectory`, no chown). Add the assertion; `mkEnableOption "molesk"`; rename to `edit.allowedHosts` (unreleased). Hardening: `PrivateDevices`, `ProtectKernelTunables/Modules/Logs`, `ProtectControlGroups`, `RestrictAddressFamilies = [ "AF_INET" "AF_INET6" "AF_UNIX" ]`, `CapabilityBoundingSet = ""`, `RestrictNamespaces`, `LockPersonality`, `SystemCallFilter = "@system-service"`, `ProtectProc = "invisible"`. `MemoryDenyWriteExecute` stays unset (V8 JIT). The read-only `script` stays byte-identical to `main` (store path masked). |
| 18b | `--link` with a bad format only logs.                                                                                                                                                                            | `fail()`, consistent with #4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 18  | Four accidental `undefined-*.json` dumps (13.7k lines) are committed.                                                                                                                                            | `git rm` them and add a `.gitignore` entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### Phase 2: size and runtime dependencies

- Remove unused or replaceable deps: `eslint`, `@eslint/js`, `globals`, `prettier`, `serve-favicon`, `mime` (use `res.sendFile` / `express.static.mime`), `rss`, `express-rate-limit`, `markdown-it-expandable`.
- **Package build.**
  - Ship production `node_modules` only: `yarnInstallHook`, or `yarn install --production --offline`.
  - `strictDeps = true`, with `nodejs-slim` in `buildInputs` so patched shebangs and the wrapper point at the slim build.
  - Prune `highlight.js` to `lib/` plus the two theme files. Prune the vendored font and icon packages to the woff2 and CSS actually referenced.
  - Flake check: package ≤ 10 MB, and `nix path-info -r` contains no full `nodejs-2*`.
- **Vendor runtime assets from npm** (pinned in `yarn.lock`), served under `/vendor/`:
  - Literata: our own two `@font-face` rules (roman and italic variable woff2, latin plus latin-ext) from `@fontsource-variable/literata`;
  - `@fortawesome/fontawesome-free@^6`: CSS and woff2 for solid, regular and brands;
  - highlight.js `github` and `github-dark` from the dependency already present (this also fixes the 11.9 vs 11.11 mismatch).
- **CSP** becomes `'self'` only. `'unsafe-inline'` stays for styles (markdown-it table alignment), and its comment is fixed. A spec fails on any request to another origin.
- **`checks.module-eval`** evaluates two fixed configs (read-only defaults, and edit with toggles) and asserts their `script` strings.

### Phase 3a: structure (behaviour-preserving; golden snapshot unchanged)

- Client scripts become `<script type="module">` with explicit imports. This removes the ~40 shared globals and the duplicated active-link code. Folder toggling is rebuilt once, in Phase 4.
- `lib/errors.js` maps the message from `err.status`/`expose`, not from substrings.
- `app.js` holds composition only: download, profile-pic and favicon move into the page router.
- Remove dead code: `IGNORED_FILES`, unused exports, `.meta-title`, `.meta-author`, `.line-number`.

### Phase 3b: naming and order (behaviour change; separate commit, golden diff reviewed)

- One `noteTitle(name)` in helpers, for display only. It is used by the tree, pages, breadcrumbs, folder names and rss. The editor's rename field keeps the raw basename.
  - Rule: strip the extension; `-`/`_` become spaces; uppercase the first letter only if the name has no capitals.
  - Today's outputs differ: the tree shows `My-post`, rss `My Post`, pages `My post`. All of them become `My post`; `iPhone notes` stays as written.
- Numeric-aware sort: `localeCompare(…, { numeric: true, sensitivity: "base" })`, with a raw-name tie-break.

### Phase 4: tokens, sidebar and layout (desktop and phone together)

- **Tokens first.** Finish the move to colour tokens and delete `dark-theme.css`, verified by per-element computed-style diffs. Every later rule is written once.
- **Theme before first paint.** A blocking classic `<script src="/theme.js">` in `<head>` sets `data-theme` on `<html>`; `auto` follows `prefers-color-scheme`. No inline hash, and CSP stays `'self'`.
- **Tree markup** is built once, as `views/tree.ejs` (a recursive partial). `li.folder` carries `data-path`, and client folder state keys on it, not on display text.
- **Header.** One sticky header row:
  - site name on the left, aligned with the tree;
  - on the right: theme toggle; then "+" (edit mode), which opens the inline new row of the current note's folder (root on index pages), where a trailing `/` makes a folder; then collapse on desktop or ✕ on phones.
  - The floating ⟨ arrow and the 75px gap go away. Fix the drawer height so it fits the screen (`box-sizing`, no extra 21px).
- **Rows.**
  - Full-width flex, 32px on desktop and 44px on coarse pointers. No stacked margins.
  - Fixed-width icon column (`fa-fw`) for both files and folders, no literal space in the markup, 16px indent per level. Long titles are ellipsised.
  - Full-width active highlight. Dark mode gets a right border only.
- **Folders** are `<button aria-expanded>`. Children of a closed folder are not focusable. The folders above the current note open on load, and on index pages the current folder is highlighted.
- **"+ New" rows.** Kept under every expanded folder, as the user asked: muted on hover-capable devices until the folder is hovered or focused, always visible on touch. The new-row input scrolls into view along with its hint and error.
- **Filter.** `type="search"`, a "No notes match" row, `/` focuses it, Esc clears.
- **Dates.** Only front-matter dates, formatted like `9 Nov 2026`, muted serif on the same row. No mtime fallback in the tree.
- **Width.** The sidebar is `clamp(240px, 22vw, 320px)`, and card padding is `clamp(24px, 5vw, 75px)`.
- **Note view.**
  - On desktop the Edit and Download actions sit in a sticky top-right bar of the card, so they are reachable on long notes.
  - On phones they move to the top bar as two icons: the pencil, and Download when it is enabled. The duplicates inside the card are removed.
  - The date becomes a small caption without the heavy rule. Short pages fill the screen with one surface, so there is no grey slab.
- **Task lists.** The selector covers `li > p > .task-box` too. Each item has a ≥44px hit area on touch and an `aria-label` naming the item, and its baseline is aligned.

### Phase 5: editor

- **View switch.** One segmented control, Write | Split | Preview. Split is offered when the viewport is ≥ 1000px plus the collapsed-sidebar width; choosing it collapses the sidebar.
- **Split layout.** Grid `minmax(0,1fr) minmax(0,1fr)` with `min-width: 0`.
- **Preview** runs the same code-block enhancement as the reading view (language label, copy button).
- **Editor bar.** Sticky under the top bar on phones. Done and the segmented buttons are 44px.
- **Formatting bar.** While pinned above the keyboard, it reserves its own height (`scroll-margin-bottom`).
- **Small text.** Placeholder "Start writing…". The date moves inline with the breadcrumb.
- **Conflict banner.** The bar status hides while the banner shows. Copy: "This note changed elsewhere. **Keep mine** saves yours (theirs goes to .trash). **Load theirs** opens theirs (yours is saved as "<name> (conflict)")." Warning colour.
- **Folder actions** on index pages: Rename and Delete live only in a ⋯ menu matching the editor's. Rename shows an inline input with explicit Save and Cancel buttons.
- **Phones.** The delete dialog becomes a bottom sheet with full-width stacked buttons.

### Phase 6: visual polish and docs

- **Contrast.** Raise light `--muted` to ≥ 4.5:1, placeholders to ≥ 4.5:1 and input borders to ≥ 3:1.
- **Small fixes.**
  - Icons: one family (outline for files and folders, solid for actions); replace the deprecated `fa-file-alt`.
  - `hr` style. Inline code at `.875em`. Remove `letter-spacing`. The footer rule matches the card width.
  - Error focus ring in the danger colour. 404 page copy plus a link home. Empty-state centred primary button. Align the `+` glyph.
- **Docs.**
  - CHANGELOG: name `--edit`, `edit.allowedHosts`, the security model (loopback, 421, `Sec-Fetch-Site`) and the conditional `address` default. Add a Fixed section (download URLs with spaces, plus Phase 1) and a Changed section for the behaviour changes listed under Risks.
  - README:
    - a two-line quick start per role;
    - `yarn` instead of `npm`;
    - the correct home precedence;
    - help placeholders, and `Usage: molesk`;
    - a rate-limiting note.
  - Mark the old plans superseded.

## Test strategy

- **HTTP specs** through `request` or raw `http`, using per-test servers from `tests/server.js` for CLI and config cases. Table-driven `spawnSync` cases for every CLI failure (exit 1 plus a message).
- **Missing coverage to add:**
  - a 500 during save keeps the text and blocks Done;
  - read-only mode returns 404 for every edit route;
  - symlink and dot-path reads return 404;
  - self-move, and a folder move during a save;
  - bad and unquoted-Date front matter;
  - a 1 MB preview finishes within the time limit.
- **Size** is checked by measuring the build in the handoff. **No external requests** is checked by a spec that fails on any request not to the origin.
- **UI**: e2e on the desktop and Pixel 5 projects. Screenshot QA with the review scripts (`/tmp/molesk-review-desktop/review.spec.js`, `/tmp/molesk-review-mobile/shots.js`), compared before and after.
- **Phase 3**: characterisation first. Snapshot the rendered HTML of every page in `contents/` before refactoring and diff it after; the only allowed differences are the ones named in Phase 3.

## Risks & trade-offs

Behaviour changes. This list is also the golden-diff allow-list, and each item goes in the CHANGELOG.

- **RSS.**
  - The feed is a small escaped template: no CDATA, `generator`, build date or `atom:link`; notes at the root get no `.` category. (Found in implementation.)
  - `--no-rss` now removes `/rss.xml` (404) instead of only hiding the link. The user asked for RSS to be "enabled" or not.
  - Feed GUIDs move from `http://0.0.0.0:8080/…` to the real origin, so subscribers see every item again once. Item titles follow `noteTitle`, and undated items lose their fake date.
- **CLI.**
  - Unknown flags, flags with a missing value, bad ports, extra positionals, non-markdown files and a malformed `--link` now exit 1 instead of being ignored.
  - `--edit` needs an explicit, writable directory (unreleased).
- **Single-file mode** binds to 127.0.0.1 and serves only that file and images. Migration: pass `-a 0.0.0.0`.
- **No built-in rate limiting.** It belongs at the proxy.
- **Dot-paths** 404 on read routes. Symlinks are still followed in read-only mode.
- **Images** go through `res.sendFile`, so they gain `ETag`/`Last-Modified` and `Cache-Control: public, max-age=0`. (Found in implementation.)
- **Task toggles** on a note changed elsewhere reload the page instead of showing a toast (#14).
- **Markdown output.**
  - `+++` details: open-by-default is kept if the plugin supports it, otherwise the change is listed. The `lvl-*` list classes are gone. Tight lists render tight, which fixes a regression.
  - markdown-it-collapsible has no open-by-default option: `+++` now starts closed, `++>` opens; expandable's `>>>` is plain text. (Found in implementation.)
  - Unquoted front-matter dates render as a formatted date instead of `Date.toString()`.
- **Titles, sort and layout.**
  - Titles are unified, and mixed-case names are kept as written.
  - Sorting is numeric-aware.
  - The date caption is restyled.
  - Dates read `9 Nov 2026` in the caption and folder index as well as the tree, with the ISO date in `datetime`. (Found in implementation, for one date style.)
  - Task items are `<label>`s, so the item text names the checkbox and the whole row toggles it.
  - The sidebar and note-action markup is rebuilt; the 404 page gets new copy.
- **Module.**
  - `allowedHosts` moves to `edit.allowedHosts` (unreleased).
  - Read-only mode gets a root-owned default `data` dir through tmpfiles.
  - The extra hardening could block an exotic setup; noted in the changelog.
- **Trade-offs.**
  - The global write mutex serialises all writes. Fine for a single user; `ponytail:` comment.
  - The ES-modules move is the largest diff. It is behaviour-preserving, and the golden snapshot plus the e2e suite guard it.

## UI checklist (screenshot-verified at handoff)

Phone:

1. Drawer rows are compact, full width and aligned, with one icon column and 16px per nesting level.
2. The drawer fits the screen: no 21px overflow, and the inline new-row hint and error stay visible.
3. The header row is site name, theme, "+" and ✕. The floating ⟨ arrow and the 75px gap are gone.
4. The active note is highlighted across the full row. The folders above it are open, and the current folder is marked on index pages.
5. Folders are keyboard-operable buttons, and items inside closed folders can't be tabbed to.
6. Task boxes have no stray bullet, a ≥44px hit area and the item text as their label.
7. Edit (and Download) are reachable on long notes, with one set of actions per viewport.
8. Short pages have no grey slab.
9. The editor bar is sticky on phones, and Done and the segmented control are 44px.

Editor: 10. Split view survives a wide code block. 11. The sidebar is 240–320px, and the text column stays ≥ 560px at 1024px. 12. The filter has a no-match state, `/` focuses it and Esc clears it. 13. Light `--muted`, placeholders and input borders meet WCAG AA. 14. The conflict banner reads clearly, and neither choice loses text.

## Rollout

Branch `next`. Order: golden snapshot, then Phases 1, 2, 3a, 3b, 4, 5 and 6. One or more signed commits per phase, each green. A minor version bump plus the changelog afterwards (`/tt:act:bump`). The user pushes.

## Plan review (2026-11-09)

The independent review found the approach sound. All 25 findings were folded in:

- **RSS:** the cache-poisoning-safe RSS origin.
- **Saves and toggles:** the `pendingEtag` for `pagehide`; the task ETag chain.
- **Server lifetime and paths:** the watcher error listener before the global handlers are removed; symlinks still followed in read-only mode; the 200-byte cap on new names only.
- **Titles and editor:** title unification split out as a behaviour commit; the editor keeps the raw name.
- **Ordering:** tokens and the theme move into Phase 4; the tree is built once.
- **Theme and build:** the theme via a blocking `/theme.js` instead of an inline hash; `strictDeps` and the slim shebang; a 10 MB flake check.
- **Golden snapshot and allow-list:** they replace an untestable criterion.
- **Module:** tmpfiles for read-only; `UMask` 0027.
- **Data safety:** the global lock covers every mutation; a symmetric conflict copy instead of the clipboard.
- **UX and versions:** the split threshold; the "+" targets the current folder, with no duplicate menu; FontAwesome pinned to 6; tie-broken sort; non-flaky timing.

## Deferred follow-ups

- Editor monospace option; collapsing the top bar in landscape; fading in the top-bar title on scroll; PJAX vs full navigation with view transitions; `util.parseArgs`; moving the `contents/tests` fixture; a tree-cache TTL backstop for an inotify failure; a link-based move to avoid an external-create race; a fade on the right edge of overflowing code blocks.

# Plan: more improvements — publishing polish and note-taking essentials

## Goal

Ten user-visible improvements:

- the blog shares well, is findable and reads well;
- the notes app handles images, finds anything and jumps anywhere.

Ship as **one commit** (owner's choice).

## Success criteria

- Each item below has a spec that fails before its change and passes after.
- Full suite green, oxlint pedantic/complexity at 0, `nix fmt` clean, `nix flake check` green.
- Read-only module `script` at default settings stays byte-identical to `main` (masked store path).
- The golden snapshot (`tests/golden/`) diff contains only the changes listed under Risks, and the CHANGELOG names each one.
- No new runtime dependencies. The package stays under the 10 MB flake check.
- Screenshots of every new UI surface: light and dark, 390px and 1400px, on the owner's blog content (copied) in both modes. Each one is looked at and is free of unfinished-looking parts.

## Non-goals

- Tags, `[[wiki links]]`/backlinks, PJAX removal, emoji font (it belongs in nix-config).
- A search index library, fuzzy ranking beyond substring scoring.
- Image resizing or transcoding.
- Uploads of any non-image type.

## Approach

### 1. Link previews (Open Graph / Twitter)

- `<head>` gets:
  - `og:title` (page title);
  - `og:description` (front-matter `description`, else the first paragraph's text, ~160 chars);
  - `og:type` (`article` for pages, `website` for indexes);
  - `og:url` and `og:image` (absolute `/profile-pic` when `--image` is set);
  - `twitter:card=summary`;
  - `<meta name="description">`.
- Absolute URLs come from the request origin, using the same helper as RSS (`trust proxy` is already set).
- All values HTML-escaped. One partial: `views/meta.ejs`.

### 2. `sitemap.xml`

- Read-only mode only (404 with `--edit`). It lists every published page and folder index, with `<lastmod>` from the front-matter date when present.
- Same origin helper and cache as RSS; the cache is invalidated with the tree.
- `robots.txt` is not added; that stays the operator's choice.

### 3. Previous/next links

- At the bottom of each page: the neighbours within the same folder, in the folder index order (date desc, then numeric name).
- Shown only when the folder has ≥ 2 visible pages, styled as two cards with direction labels ("Newer"/"Older" when both have dates, else "Previous"/"Next").
- Not shown for the home page or in single-file mode.

### 4. Reading time

- `N min read` (words / 200, rounded up, minimum 1) appended to the date caption.
- Pages without a date get the caption with reading time only, and only when the page has ≥ 200 words.
- Counted from the markdown body text, excluding code blocks.

### 5. Drafts

- Front matter `draft: true`. In read-only mode a draft is hidden everywhere:
  - absent from the tree, index pages, RSS, the sitemap, prev/next and search;
  - `/content/<draft>` and `/download/<draft>` return 404.
- In edit mode drafts are visible, with a muted "Draft" badge in the tree, on index rows and on the page caption.
- A single predicate `isPublished(meta, config)` lives next to `splitFrontMatter`, so every listing uses it.

### 6. Images: paste and drop into the editor

- **API:** `PUT /api/assets/<page-dir>/<name>`, behind `knownHost` and `guardWrites`.
  - Accepted types: `image/png`, `image/jpeg`, `image/gif`, `image/webp`; anything else is 415.
  - The extension must match the type. The body is raw, up to 10 MB (413 beyond).
  - The magic bytes are checked against the declared type.
  - Writes go through `resolveWritable`, the write lock and `writeAtomic`. `If-None-Match: *` is required, so an upload never overwrites.
- **Placement:** `<page dir>/assets/<page-name>-<YYYYMMDD-HHmmss>[-n].<ext>`.
  - The client picks the name, and retries with `-n` on 412.
  - It inserts `![](assets/<file>)` at the caret, preceded by an "Uploading…" placeholder that is replaced on success or removed on error, with the error shown in the status.
- **Serving:** the image route accepts `gif` and `webp` too. `assets/` folders stay hidden from the tree because they hold no pages.
- **Drag and drop:** dropping onto the textarea shows a drop highlight.

### 7. Full-text search

- **Endpoint:** `GET /api/search?q=` in both modes.
  - Read-only: published pages only. Edit mode: drafts too.
  - `q` is capped at 100 chars; fewer than 2 chars returns `[]`.
  - At most 20 results, each `{path, title, snippet}`. The snippet is about 120 chars around the first hit, with `<mark>` inserted after escaping.
  - Matching is case- and diacritic-insensitive substring (`NFKD`, marks stripped).
  - Ranking: title hit first, then the count of hits.
- **Corpus:** plain text of every page, built lazily and invalidated with the tree cache.
  - `ponytail:` linear scan. Fine for thousands of pages; add an inverted index if it is ever measured slow.
- **UI:** the sidebar search box keeps its instant title filter, and below the filtered tree it shows a "Text matches" section from the endpoint (debounced 200 ms; out-of-order responses are dropped). Esc clears both.

### 8. Quick switcher (Ctrl/Cmd+K)

- A `<dialog>` with an input and a result list, in both modes.
- **Sources:** page titles and paths from the rendered tree (instant), then the search endpoint's text matches.
- **Keys:** ↑/↓ move, Enter opens, Esc closes. In edit mode the last row is "Create “<query>”", which creates the page in the current folder through the existing create flow.
- **Phones:** the top bar gets a search icon that opens the same dialog.
- **Conflicts:** Ctrl+K inside the editor textarea stays "link" (the existing helper); the switcher opens from anywhere else, and from the editor via Ctrl+P.

### 9. One date rule

- Dates come from front matter only, everywhere: tree, index pages, captions, RSS, sitemap and prev/next labels.
- Index pages no longer fall back to file mtime. Undated pages sort after dated ones, by numeric name.

### 10. Root index heading

- The root index page drops its H1 with the site title, since the sidebar shows the name. Folder index pages keep the folder name heading.

### Cross-cutting

- New client code lives in ES modules next to the existing ones:
  - `public/switcher.js`;
  - search results inside `public/search.js`;
  - upload inside `public/editor-upload.js`.
- No inline scripts; CSP is unchanged except `img-src` already allowing `'self'`.
- All copy says "page".
- README:
  - document drafts, image paste, search and Ctrl+K;
  - add `/sitemap.xml` and `/api/search` to the routes list.
- CHANGELOG lists each item and every golden change.

## Steps (single commit; verified per step locally)

1. Front-matter helpers: `isPublished`, word count and reading time, and the description excerpt. Unit-level specs through the HTTP layer.
2. Item 9 (dates), then item 5 (drafts) across tree, index, page, download and RSS.
3. Items 1 (meta), 2 (sitemap), 3 (prev/next) and 4 (reading time) on the read side.
4. Item 7: the search endpoint and corpus, then the sidebar UI.
5. Item 8: the switcher.
6. Item 6: the upload API, then editor paste and drop.
7. Item 10: drop the root heading. Golden update with a reviewed diff.
8. Screenshots plus QA, README, CHANGELOG, then the full verification and one signed commit.

## Test strategy

- **HTTP specs:** per-test servers through `tests/server.js`.
- **Item checks:**
  - **Meta:** escaping, using a title with quotes and `<`.
  - **Sitemap:** read-only only, drafts excluded.
  - **Drafts:** each surface hides them in read-only mode and shows them with the badge in edit mode.
  - **Search:**
    - ranking, snippet escaping (a page containing `<script>`) and diacritics;
    - caps on `q` and on the result count;
    - no drafts in read-only;
    - invalidation after a PUT.
  - **Upload:**
    - each allowed type;
    - a type and extension mismatch gives 415;
    - a magic-bytes mismatch, an oversized body (413), the overwrite guard (412) and traversal (`../`);
    - a dot-path upload is refused;
    - the read-only mode route returns 404.
- **E2E:**
  - paste an image file (Playwright `DataTransfer`), check the markdown is inserted and the image renders in preview;
  - the switcher's keyboard flow and its create flow;
  - the search box text-match section;
  - prev/next navigation;
  - the reading-time caption.

## Risks & trade-offs (golden allow-list + CHANGELOG)

- **Read-only `<head>`** gains meta tags.
- **Pages** gain prev/next cards and reading time.
- **Index pages** lose mtime dates. The root index loses its H1.
- **Draft pages** vanish from the published site. This is new semantics for a front-matter key (`draft`) that is commonly used the same way by Hugo and Jekyll.
- **New routes:** `/sitemap.xml` (read-only), `/api/search` (both modes; it exposes only what is already published) and `PUT /api/assets/*` (edit only).
- **Search scans linearly** (`ponytail:`).
- **Upload size:** the 10 MB cap is a fixed constant, not a flag.

## Plan review amendments (2026-11-11; binding, override the sections above)

### Shared helpers

- `originOf(req)` in `helpers.js` is used by RSS, meta and the sitemap. There is no such helper today; RSS builds the origin inline.
- `excerptOf` moves next to `splitFrontMatter` and is reused for `og:description`.
- One comparator, `byDateThenName` in `helpers.js`: dated pages first (newest first), then undated, ordered by numeric name with a raw-name tie-break. Tree, index pages and prev/next use it.
- Prev/next takes its neighbours from the cached `generateFolderStructure` tree, not from `listFolder`.

### Dates (item 9)

- Delete `describeNote`'s `fs.stat` and its `updated` field.
- `folder.ejs` renders `<time>` only when there is a date.
- README: update the "Not included" line (uploads and full-text search now exist).

### Drafts (item 5)

- `loadMeta` parses `draft`; only YAML boolean `true` counts.
- `isPublished` applies to:
  - `isDirectoryValid`, so a folder holding only drafts is hidden in read-only mode;
  - `findHome`, `findFolderIndex` and `findFirstNote`, so none of them picks a draft;
  - RSS `collectNotes`;
  - the search corpus.
- Each of these gets a test.

### Sitemap (item 2)

- Entries: `/`, then the pages, then folder URLs. Folders appear only when `SHOW_INDEX` is on and the folder has no index page of its own.
- `<lastmod>` only for `YYYY-MM-DD` dates.

### Uploads (item 6)

- **Writes:**
  - `resolveWritable` gains an `{ extensions }` option, defaulting to `MD_EXTENSIONS`. The asset route passes the four image extensions.
  - The server requires the parent segment to be `assets`.
  - The body is read with `express.raw({ type: [4 image types], limit: "10mb" })` on that route only.
  - Magic bytes: PNG, JPEG and GIF signatures; WebP needs `RIFF` at offset 0 and `WEBP` at offset 8.
  - The route stays `PUT`. A `PUT` is never a CORS-simple request, so a cross-origin one is always preflighted and refused; changing it to `POST` would remove that protection. Keep a comment saying so.
- **Naming:**
  - The page-name part is truncated with `fitName`.
  - The client inserts `![](<assets/NAME>)` (angle brackets), so spaces and parentheses work. Test with a page named `My (First) Post`.
- **Editor:**
  - "Uploading…" shows in the editor status only, never in the text.
  - On success the markdown goes in at the remembered caret through `editor-format`'s undo-preserving insert.
  - The handler reads `e.clipboardData.files` and `e.dataTransfer.files`, not `navigator.clipboard`.
- **Preview:** `renderPreview` rewrites each relative `img[src]` against the `/content/` URL of the page. This fixes relative images in preview, which are broken today. Repro test first.
- **Tests:** E2E covers the happy path through a synthetic `ClipboardEvent` / `DragEvent` with a `DataTransfer`. Magic bytes, 415, 413 and 412 are tested at the HTTP layer.

### Search (item 7)

- **Corpus:** same walk and rules as `/content`:
  - no dot segments; `resolveReadable`;
  - `isPublished` in read-only mode;
  - single-file mode covers that file only;
  - the home page is included.
- Invalidated through `invalidateAll`, and it respects `isCaching()`. It shares the walk with RSS `collectNotes`.
- **Snippets:** matching folds character by character with an index map back to the original text. The response is `{path, title, before, match, after}`, and the client builds the DOM with `textContent`. No server-side HTML, no `innerHTML`.
- **Where it shows:** the sidebar keeps the title filter only; full-text results live in the switcher. This drops the plan's "Text matches" sidebar section.
- **`--no-search`:** `/api/search` returns 404, and neither the switcher nor its icon is rendered.

### Switcher (item 8)

- `tree.js` exports `createNote` and `parseName`.
- The global Ctrl+K handler returns early on `e.defaultPrevented`, so the editor's link helper wins inside the textarea.
- Ctrl+P (the switcher inside the editor) is listed in the README keys table.

### Root heading (item 10)

- Keep the root `<h1>` but visually hide it (`.visually-hidden`). That keeps a level-one heading for accessibility, and the visual goal is met.

### CSP

- Unchanged. `img-src 'self' data:` already covers uploads, and there are no `blob:` previews.

### Additional Risks / golden allow-list / CHANGELOG

- The sidebar tree order changes in mixed dated and undated folders: one comparator now.
- Read-only mode serves `.gif` and `.webp`, which used to return 400. This applies to single-file mode too.
- Read-only markup gains the switcher `<dialog>`, a top-bar search icon and a module script.
- Undated pages of 200 words or more gain a reading-time caption.
- `/api/search` exists in read-only mode, where `/api/*` used to be a 404.
- `og:url` reflects the request Host in read-only mode. It is escaped, the same as RSS.
- Known limits:
  - moving a page doesn't move its `assets/` images;
  - images of trashed pages remain;
  - Ctrl+P in the editor overrides print.

## Rollout

`next` gets one signed commit, "feat: more improvements". The version bump stays a separate step.

## Deferred follow-ups

- Tags, wiki links/backlinks, image resizing, an inverted search index, `robots.txt`.
- Move a page's `assets/<name>-*` images along with it in `moveEntry`; trash them when the page is trashed.

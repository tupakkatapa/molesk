# Changelog

## Unreleased

### Changed

- **Renaming a page in the editor edits its front matter:** the old address is added to `aliases:` (as text, the rest of the front matter untouched), so old links redirect. Sync and git tools see the change.
- **`[[…]]` in prose is now a wiki link** (or dimmed text when no page has that name). **Migration:** write `\[[` for literal brackets; code and space-padded `[[ … ]]` are unaffected.
- **`--no-download` turns `/download` off (404)** instead of only hiding the button. A single file has no feed or sitemap.
- **`--image` must be a readable file**; a missing one stops the start instead of serving a broken picture. **Migration:** fix the path or drop the option.
- **The module's `port` is a port (1–65535)**; other values fail evaluation.
- **Feed, sitemap and link previews use `--url`** (`settings.url`) when set, instead of the request's address. Feed items list newest first.
- **Tighter service sandbox:** the unit sees only `data` and `settings.image` under `/home`, restricts real-time scheduling, SUID and foreign architectures, waits for the mount holding `data`, restarts after 5 s, and runs molesk as its main process. Ports below 1024 get `CAP_NET_BIND_SERVICE` so they still bind.
- markdown-it 14.3.3 (link detection was quadratic on long runs of `*`). The CSP also sets `object-src 'none'`, `base-uri 'self'` and `form-action 'self'`.

- **Page addresses are lowercase slugs without spaces or extension.** `/content/posts/My%20First%20Post.md` is now `/content/posts/my-first-post`; folders, downloads and the editor follow (`/download/posts/my-first-post`, `/edit/posts/my-first-post`). Old addresses redirect with 301, so links and bookmarks keep working, but RSS item links and sitemap entries change, so feed readers may show every item once more. Images keep their file names. Files on disk are not renamed. **Migration:** none needed; update hand-written links at your leisure.
- **Mermaid diagrams.** `mermaid` code blocks render as diagrams in pages and the editor preview, following the theme; without JavaScript, or when a diagram has an error, the source shows as code.
- **Code blocks without a language are no longer coloured by guesswork**; label the fence (`js`) to highlight it.
- **Editor:** Code block and Table buttons in the formatting bar.

- **Dates come from front matter only.** Folder pages no longer show a file's modification time for undated pages; dated pages list newest first, then undated ones by name, in the sidebar, folder pages and previous/next links alike (mixed folders in the sidebar reorder).
- **The root index** hides its site-name heading visually (the sidebar shows the name); folder pages keep theirs.
- **Read-only markup.** Every page gains Open Graph/Twitter `<meta>` tags (`og:url` follows the request's host, escaped), a hidden switcher `<dialog>`, a search icon in the phone top bar and inside the sidebar search box (it opens the switcher with what was typed) and the `/switcher.js` module. Pages gain previous/next cards and a reading time in the date caption; undated pages of 200 words or more gain a caption with the reading time only.
- **Read-only mode serves `.gif` and `.webp` images** (also in single-file mode), which used to be 400.
- **`/api/search` exists in read-only mode**, where `/api/*` used to be 404; it returns only what is published.
- **`/` without a home note now shows the index.** A site with no `index.md`, `README.md` or `Home.md` at the top used to redirect `/` to its alphabetically first note; it now lists the notes. Keep the old behaviour with `--no-index` (`settings.index.enable = false`), or pick a note with `--home <file>` (`settings.home`).
- The home note (`index.md`, `README.md` or `Home.md`, else `--home`) opens at `/` and leaves the sidebar; the site title links to it. `Home.md` no longer gets a house icon. Edit mode has no home note unless `--home` names one.
- **The CLI is strict.** Unknown flags, a flag missing its value (`--home --edit`), ports outside 1–65535 (`abc`, `8090x`, `99999`), more than one file or directory, a file that isn't `.md`/`.txt` and a `--link` without `icon:url` now exit 1 with a message instead of being ignored.
- **Single-file mode** (`molesk note.md`) listens on `127.0.0.1` and serves only that note and images. Pass `-a 0.0.0.0` to share it on the network.
- **RSS.** `--no-rss` removes `/rss.xml` (404) instead of only hiding the link. Feed links use the address the feed was fetched from instead of `http://0.0.0.0:8080`, so subscribers see every item once more. Item titles follow the page titles, undated notes carry no date, the image is `/profile-pic`, and the feed is plain escaped XML (no CDATA, generator or build date).
- **No built-in rate limiting.** It rejected autosave without a proxy and never applied behind one; rate limits belong at the proxy.
- **Hidden paths** (any segment starting with `.`, including `.trash`) are 404 on every read route. Read-only mode still follows symlinks; edit mode serves nothing through a symlink out of the notes.
- **Markdown.** `+++ Title` blocks start closed; `++> Title` starts open (the plugin that opened `+++` is gone). Tight lists render tight again, and the `lvl-*` list classes are gone. Unquoted front-matter dates show as the day instead of a JavaScript date string.
- **Titles and order.** One title rule everywhere: no extension, `-`/`_` read as spaces, a capital first letter only for names without capitals (`iPhone notes` stays). Names sort numerically (`Note 2` before `Note 10`). The editor's title field keeps the file name as is.
- **Dates** read `9 Nov 2026` in the sidebar, the note caption and folder pages.
- **Sidebar and note view.** A header row (theme, hide; the site name too with a small or no picture); full-width rows with one icon column; folders are buttons and remember being open per path; the folders above the open note start open. The note's Edit and Download stay at the top right of the card, or in the phone top bar. The date is a caption above the title. Task items are labels, so the whole item toggles. The 404 page has new copy and a link home. Copy says "page" rather than "note". Images get `ETag`/`Last-Modified` caching headers.
- **Editor.** One Write | Split | Preview switch (Split from 1000px wide, remembered, hides the sidebar). Folder rename and delete moved into a ⋯ menu. Confirmations are bottom sheets on phones.
- **Conflicts.** _Keep mine_ keeps the replaced text in `.trash`; _Load theirs_ saves yours as `<name> (conflict).md` instead of copying it to the clipboard. Checkbox clicks on a note changed elsewhere reload the note.
- **Links moved into the sidebar.** The social links, source link and RSS icon sit in a row at the bottom of the sidebar (the drawer on phones); the footer and its divider under the page are gone, also in single-file mode.
- **Sidebar folders** show when they hold a page somewhere below; edit mode also shows empty ones. A folder of only images (`assets/`) no longer shows in edit mode.
- **Hiding the sidebar** uncovers the menu button from under it, in the header row, instead of popping it in at the corner.
- Phones get a slim top bar with the menu, page title and the note's actions instead of the floating menu button; the note card runs edge to edge.
- Module options `settings.{source,rss}.enable` default to `null` (the mode default) instead of `true`; existing `true`/`false` settings keep working.
- **Module hardening.** The service adds `PrivateDevices`, `ProtectKernelTunables/Modules/Logs`, `ProtectControlGroups`, `ProtectProc=invisible`, `RestrictAddressFamilies` (IPv4, IPv6, Unix), an empty `CapabilityBoundingSet`, `RestrictNamespaces`, `LockPersonality` and `SystemCallFilter=@system-service`. An exotic setup (an image on a device node, say) may need an override.
- The package ships production dependencies only, on `nodejs-slim` (about 14 MB with Mermaid's browser bundle, down from 41 MB).

### Added

- **Login:** `--auth-file <path>` (module `authFile`, passed with `LoadCredential`) protects every page with HTTP Basic auth from a file of `user:password` lines; passwords of 15+ characters, failures logged without credentials. Unknown host names still get 421 first.
- **History:** `--git` (module `edit.git.enable`) commits edits to a repository in the data directory and adds _History_ to the editor, restoring any version's text as a new edit.
- **Wiki links and backlinks:** `[[Name]]`, `[[folder/Name]]`, `[[Name|text]]`; pages list the notes linking to them under _Linked from_. `--check` reports broken links and exits non-zero.
- **Aliases:** front-matter `aliases:` redirect old addresses to the page and work as wiki-link names.
- **Tags:** front-matter `tags:` show as chips; `/tags/` and `/tags/<tag>/` list them.
- `--url` / `settings.url`, the module's `package` option, `.avif` images, and `<link rel="alternate">` for feed readers.

- **Link previews.** `og:title`, `og:description` and `<meta name="description">` (front-matter `description`, else the first paragraph), `og:type`, `og:url`, `og:image` (with `--image`) and `twitter:card`.
- **`/sitemap.xml`** in read-only mode: `/`, every published page (with `<lastmod>` from a `YYYY-MM-DD` date) and the folder pages without an index page of their own.
- **Previous/next cards** under each page, linking its neighbours in the folder ("Newer"/"Older" between dated pages).
- **Reading time** (`N min read`, 200 words a minute, code left out) in the date caption.
- **Drafts.** `draft: true` in the front matter hides a page from the tree, index pages, the feed, the sitemap, previous/next and search in read-only mode, and its `/content` and `/download` URLs are 404. Edit mode and single-file mode show it with a _Draft_ badge. A page that already says `draft: true` stops being published.
- **Images in the editor.** Paste or drop a PNG, JPEG, GIF or WebP image (up to 10 MB) to save it as `assets/<page>-<time>.<ext>` beside the page and link it at the caret (`PUT /api/assets/<path>`, edit mode only; never overwrites; the type is checked against the file's first bytes). Moving a page to another folder takes the images it links in `assets/` along, copying any that another page left behind still links.
- **Full-text search** at `/api/search?q=` (both modes, off with `--no-search`): case- and accent-insensitive, title hits first, at most 20 results with a snippet around the first hit.
- **Quick switcher.** `Ctrl+K` (`Ctrl+P` inside the editor, where `Ctrl+K` stays the link helper; the search icon on phones) finds pages by name at once and by text as you type; in edit mode its last row creates the typed page in the current folder.
- **Edit mode** (`--edit`, module `edit.enable`): a private notes app on the same data directory. Inline **+ New** rows in the sidebar, autosave, rename from the title, live preview, Markdown shortcuts and a formatting bar, trash instead of delete, folder rename/delete, clickable checkboxes.
  - `--edit` needs an explicit, writable directory.
  - **Security model:** it listens on `127.0.0.1` unless `--address` says otherwise (the module's `address` default follows `edit.enable`), refuses cross-site writes (`Sec-Fetch-Site`), and answers requests for unknown host names with 421 against DNS rebinding. To reach it from elsewhere, add `--auth-file` or an HTTPS proxy that does the login, and name the proxy's host with `--allowed-host` (module `edit.allowedHosts`).
  - The module keeps edit-mode notes private to the service user and group (`UMask=0027`, state directory `0750`) and refuses `edit.enable` with a single note as `data`.
- **Search** over the sidebar tree in both modes (`--[no-]search`, module `settings.search.enable`, default on); `/` focuses it.
- **`--image-size small|large`** (module `settings.imageSize`, default `large`): `large` shows the profile picture and the full site name centred above the tree, `small` the compact header. Unknown sizes exit 1.
- Every toggle takes both forms: `--[no-]download`, `--[no-]rss`, `--[no-]source`, `--[no-]index`. RSS and source link default off with `--edit`.
- `--home <file>` / `--no-home`, `--theme dark|light|auto`, and module options `settings.home`, `settings.index.enable`, `settings.theme`.
- Folder index pages at `/content/<folder>/`, newest first with dates and excerpts.
- Task lists: `- [ ]` and `- [x]` render as checkboxes.
- Read-only module installs get `/var/lib/molesk` created (root-owned) when `data` is the default.
- Fonts, icons and code themes are served by molesk itself; pages load nothing from other origins and the CSP allows only the site.

### Fixed

- The editor preview shows images: relative ones resolve against the page instead of the editor, and none stay invisible.
- Download links for notes with spaces in their path.
- Concurrent writes can no longer deadlock (moving a note onto itself) or split a note across a folder being renamed; every write takes one lock.
- Leaving the editor during a slow save no longer drops the text typed meanwhile.
- Bad YAML or unquoted dates in front matter no longer break every page; CRLF front matter is read.
- A run of `+++` lines no longer stalls rendering for minutes.
- Notes with names over about 237 bytes can be saved and deleted; new names are capped at 200 bytes.
- A failed folder sync after a successful save no longer reports the save as failed.
- A listen error (port in use) exits instead of hanging. An unreadable folder, or one replaced while running, no longer stops the server or every page: content is re-read within 5 s (at once after an edit), and unreadable entries are skipped with one warning.
- A page that starts with a `---` rule keeps the text before the next rule instead of losing it as front matter.
- Opening the browser no longer goes through a shell.
- The dark theme no longer flashes light on load, and light muted text, placeholders and input borders meet WCAG AA.

### Known limits

- Renaming a folder doesn't add aliases, so its old address and its pages' old addresses are 404.
- Basic auth has no logout and no throttling of its own; tags and aliases are edited in the file, not in the editor.

- Moving a page doesn't move its `assets/` images, and images of trashed pages stay.
- `Ctrl+P` in the editor opens the switcher instead of printing.
- Search scans every page's text per query; fine for thousands of pages.

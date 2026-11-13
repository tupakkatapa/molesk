# Changelog

## Unreleased

### Added

- **Edit mode** (`--edit`, module `edit.enable`): a private notes app on the same data directory. Inline **+ New** rows in the sidebar, autosave, rename from the title, Write | Split | Preview, Markdown shortcuts and a formatting bar (with Code block and Table), trash instead of delete, folder rename and delete in a ⋯ menu, clickable checkboxes. `--edit` needs an explicit, writable directory.
  - **Security model:** it listens on `127.0.0.1` unless `--address` says otherwise (the module's `address` default follows `edit.enable`), refuses cross-site writes (`Sec-Fetch-Site`), and answers unknown host names with 421 against DNS rebinding. Name a proxy's host with `--allowed-host` (module `edit.allowedHosts`).
  - The module keeps edit-mode notes private to the service user and group (`UMask=0027`, state directory `0750`) and refuses `edit.enable` with a single note as `data`.
- **Images and videos in the editor.** Paste or drop a PNG, JPEG, GIF or WebP image (up to 10 MB) or an MP4, MOV or WebM video (up to 100 MB, one video upload at a time; the next gets 503). It is saved as `assets/<page>-<time>.<ext>` beside the page and linked at the caret (`PUT /api/assets/<path>`; never overwrites; the type is checked against the file's first bytes). Moving a page to another folder takes its files in `assets/` along, and copies any that another page still links.
- **History:** `--git` (module `edit.git.enable`) commits edits to a repository in the data directory and adds _History_ to the editor, restoring any version's text as a new edit. Every uploaded video stays in the history, so the repository grows by each clip's size.
- **Login:** `--auth-file <path>` (module `authFile`, passed with `LoadCredential`) protects every page with HTTP Basic auth from a file of `user:password` lines; passwords of 15+ characters, failures logged without credentials. `--allowed-host` (module `edit.allowedHosts`) also applies with a login alone.
- **Videos in pages.** `![label](clip.mp4)` (also `.mov`, `.webm`) plays inline with controls in the site's style: play/pause, seek with time, a speed menu from 0.25× to 2×, mute and volume, full screen. The controls fade while the clip plays. The label names the player. The controls load only on pages with a video; without JavaScript the browser's own controls show. A clip the browser cannot decode says so. `/content` serves video with Range support.
- **Mermaid diagrams.** `mermaid` code blocks render as diagrams in pages and the editor preview, following the theme. Without JavaScript, or when a diagram has an error, the source shows as code.
- **Wiki links and backlinks:** `[[Name]]`, `[[folder/Name]]`, `[[Name|text]]`. Pages list the notes linking to them under _Linked from_ when `--backlinks` is set (module `settings.backlinks.enable`; off by default). `--check` reports broken links and exits non-zero.
- **Front matter:** `title` names the page everywhere but its address; `order` (a number) lists a page before the unordered ones in its folder; `image` sets its link-preview picture; `toc: false` drops its table of contents; `aliases:` redirect old addresses and work as wiki-link names; `draft: true` keeps it off the published site (tree, index pages, feed, sitemap, previous/next, search; its addresses are 404) while edit and single-file mode show it with a _Draft_ badge.
- **Tags:** front-matter `tags:` show as chips under the page, and the editor has a field for them; `/tags/` and `/tags/<tag>/` list them. The sidebar tree ends with a **Tags** entry. `--no-index` removes the tag pages and makes the chips plain text.
- **Search in the sidebar** (`--[no-]search`, module `settings.search.enable`): typing narrows the tree by page name and tags and lists pages whose text matches under it. Arrow keys move the highlight and Enter opens it. `/` and `Ctrl+K` focus the box (`Ctrl+P` inside the editor; the magnifier on phones). A live region reads out the result count. In edit mode the last row creates the typed page in the current folder. `/api/search?q=` answers in both modes: case- and accent-insensitive, title hits first, at most 20 results with a snippet.
- **Table of contents** (`--toc`, module `settings.toc.enable`; off by default): a page with three or more `##`/`###` headings and a reading time of two minutes or more gets a closed **On this page** list under its title.
- **Reading position** (`--[no-]position`, module `settings.position.enable`): a page reopens where it was left, in the same browser, on a fresh load and on back/forward. A link inside the site opens at the top, and an address with a `#heading` goes to the heading.
- **Previous/next links** under each page, linking its neighbours in the folder. Off by default (`--pager`, module `settings.pager.enable`).
- **Reading time** (`N min read`, 200 words a minute, code left out) in the date caption; undated pages show it from 200 words.
- **Link previews.** `og:title`, `og:description` and `<meta name="description">` (front-matter `description`, else the first paragraph), `og:type`, `og:url`, `og:image` and `twitter:card`.
- **`/sitemap.xml`** in read-only mode: `/`, every published page (with `<lastmod>` from a `YYYY-MM-DD` date) and the folder pages without an index page of their own.
- **Print stylesheet.** Printing a page gives the text alone: no sidebar or controls, dark text on white, link addresses spelled out.
- **Works without JavaScript.** Pages, images, links, the feed link and video work. On phones the tree shows above the page with folders open. Controls that need JavaScript (search, theme toggle, sidebar buttons) are hidden.
- **Accessibility.** A skip link leads to the content; after navigation focus moves to the page's heading; social icons are named.
- Folder index pages at `/content/<folder>/`, with dates and excerpts. Task lists: `- [ ]` and `- [x]` render as checkboxes.
- `--home <file>` / `--no-home`, `--theme dark|light|auto`, `--image-size small|large`, `--url`, and module options `settings.{home,index.enable,theme,imageSize,url}` and `package`. Every toggle takes both forms (`--[no-]index`, `--[no-]download`, `--[no-]rss`, `--[no-]source`, …).
- `.avif`, `.gif` and `.webp` images, and `<link rel="alternate">` for feed readers.
- Read-only module installs get `/var/lib/molesk` created (root-owned) when `data` is the default.
- Fonts, icons and code themes are served by molesk itself; pages load nothing from other origins.

### Changed

- **Page addresses are lowercase slugs without spaces or extension.** `/content/posts/My%20First%20Post.md` is now `/content/posts/my-first-post`; folders, downloads and the editor follow. Old addresses redirect with 301, but RSS item links and sitemap entries change, so feed readers may show every item once more. Images keep their file names. Files on disk are not renamed. **Migration:** none needed; update hand-written links at your leisure.
- **`[[…]]` in prose is a wiki link** (or dimmed text when no page has that name). **Migration:** write `\[[` for literal brackets; code and space-padded `[[ … ]]` are unaffected.
- **`/` without a home note shows the index.** It used to redirect to the alphabetically first note. **Migration:** keep the old behaviour with `--no-index` (`settings.index.enable = false`), or pick a note with `--home <file>` (`settings.home`).
- **The home note** (`index.md`, `README.md` or `Home.md`, else `--home`) opens at `/` and leaves the sidebar; the site title links to it. Edit mode has no home note unless `--home` names one.
- **`--image` must be a readable file**; a missing one stops the start. **Migration:** fix the path or drop the option.
- **The CLI is strict.** Unknown flags, a flag missing its value, ports outside 1–65535, more than one file or directory, a file that is not `.md`/`.txt` and a `--link` without `icon:url` exit 1 with a message. The module's `port` is checked the same way.
- **Switches remove their routes.** `--no-download` makes `/download` 404, `--no-rss` makes `/rss.xml` 404, `--no-search` removes `/api/search`, `--no-index` removes folder listings and `/tags/`.
- **Module toggles are tri-state.** `settings.{source,rss,download,…}.enable` default to `null`, the mode default; existing `true`/`false` settings keep working.
- **Single-file mode** (`molesk note.md`) listens on `127.0.0.1`, serves only that note and its images, and has no feed or sitemap. Pass `-a 0.0.0.0` to share it.
- **The start line names the bound address**, or "all interfaces" for `0.0.0.0`.
- **Feed, sitemap and link previews use `--url`** when set, else the address the request came in on. Feed items list newest first, titles follow the page titles, undated notes carry no date, and the feed is plain escaped XML.
- **Dates come from front matter only** and read `9 Nov 2026`. Dated pages list newest first, then undated ones by name, in the sidebar, folder pages and previous/next links.
- **Titles.** One rule everywhere: no extension, `-`/`_` read as spaces unless the file name has spaces (`Oven-Baked Feta Pasta.md` keeps its hyphens), a capital first letter only for names without capitals. Names sort numerically (`Note 2` before `Note 10`).
- **A folder page drops an excerpt that only repeats the title.**
- **Layout.** The sidebar has a header row, full-width rows and folders that remember being open; the social links, source link and RSS icon sit at its bottom. Phones get a slim top bar with the menu, page title and the note's actions. A note's card ends at its content. The date is a caption above the title. Confirmations are bottom sheets on phones.
- **Escape closes the sidebar on phones only**; on wide screens it stays open.
- **Renaming a page in the editor** adds its old address to `aliases:` in the front matter, so old links redirect.
- **Conflicts.** _Keep mine_ keeps the replaced text in `.trash`; _Load theirs_ saves yours as `<name> (conflict).md`.
- **Markdown.** `+++ Title` blocks start closed and `++> Title` starts open. Code blocks without a language are not coloured by guesswork. Tight lists render tight.
- **Own scripts and styles revalidate on every load** (`max-age=0`, 304 when unchanged). Their ETag carries the version and install path, so an upgrade fetches them again even in the Nix store.
- **Hidden paths** (any segment starting with `.`) are 404 on every read route. Edit mode serves nothing through a symlink out of the notes.
- **No built-in rate limiting**; put it in the proxy.
- **Tighter service sandbox:** the unit sees only `data` and `settings.image` under `/home`, adds `PrivateDevices`, `ProtectKernelTunables/Modules/Logs`, `ProtectControlGroups`, `ProtectProc=invisible`, `RestrictAddressFamilies`, `RestrictNamespaces`, `LockPersonality`, `SystemCallFilter=@system-service` and an empty `CapabilityBoundingSet` (ports below 1024 get `CAP_NET_BIND_SERVICE`). It waits for the mount holding `data` and restarts after 5 s. An exotic setup may need an override.
- The package ships production dependencies only, on `nodejs-slim`. markdown-it 14.3.3. The CSP also sets `object-src 'none'`, `base-uri 'self'` and `form-action 'self'`.

### Fixed

- **A malformed link in a note** (`[x](%ff.md)`) no longer breaks pages, search, tags, the feed or the editor.
- **Text typed while the editor was still loading is saved.** The text area does not let the browser restore old text into it (`autocomplete="off"`).
- **Blocked storage** (`localStorage` off) no longer breaks the theme, sidebar, editor preview or reading position.
- **With `--git`, a slow commit still commits** (60 s timeout; git's automatic gc is off).
- **Page responses vary on `X-Requested-With`**, so a cache does not serve a page fragment as a full page.
- A stale upload temp file in `assets/` is removed at start.
- 404s log one line without a stack; an object as `description` shows nothing; a search answer that is not JSON ends the wait.
- An upload without a body is refused with 415 instead of 500.
- The editor preview shows images: relative ones resolve against the page.
- Concurrent writes can no longer deadlock or split a note across a folder being renamed; leaving the editor during a slow save no longer drops text.
- Bad YAML or unquoted dates in front matter no longer break every page; CRLF front matter is read. A page that starts with a `---` rule keeps its text.
- A run of `+++` lines no longer stalls rendering.
- Notes with names over about 237 bytes can be saved and deleted; new names are capped at 200 bytes.
- A failed folder sync after a successful save no longer reports the save as failed.
- A listen error exits instead of hanging. An unreadable or replaced folder no longer stops the server; content is re-read within 5 s, and unreadable entries are skipped with one warning.
- Opening the browser no longer goes through a shell.
- The dark theme no longer flashes light on load, and muted text, placeholders and input borders meet WCAG AA.

### Known limits

- Renaming a folder does not add aliases, so its old address and its pages' old addresses are 404.
- Basic auth has no logout and no throttling of its own. Aliases are edited in the file, not in the editor.
- Images and videos of trashed pages stay in `assets/`.
- `Ctrl+P` in the editor goes to the search box instead of printing.
- Search scans every page's text per query; fine for thousands of pages.
- Uploads are buffered in memory, up to 100 MB per video.

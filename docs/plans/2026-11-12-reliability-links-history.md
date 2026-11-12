# Reliability, links and history

Branch `next`. Seven items: unreadable folders and the watcher, rename redirects, login, reconciliation with `review-remediation`, wiki links, version history, tags. Amended after a three-lens plan review (scope/architecture, security/reliability, testing/UX/docs); dispositions at the end.

## Goal

The server keeps serving through any content-directory change, old addresses keep working after renames, the site can be put behind a login, notes link to each other by name with backlinks, editor changes have a recoverable history, and notes can be grouped by tag.

## Success criteria

| #   | Criterion                                                                                                                                                                                                                                                                                                          | Verified by                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1   | While an unreadable subfolder exists, every other page returns 200 and the folder is left out with one warning; the process never exits from a content change; editor writes show at once, external edits within the cache TTL (5 s)                                                                               | repro test that fails today; cache unit tests (ttl, coalescing, invalidate mid-build) |
| 2   | Renaming a note in the editor adds its old address to `aliases:` textually (other bytes unchanged); old `/content`, `/download`, `/edit` addresses 301 to the new ones; hand-written `aliases:` work; the editor keeps saving after a rename without a conflict                                                    | server + edit tests incl. negatives (table below)                                     |
| 3   | With `--auth-file`, every request (any mode) needs Basic auth from a listed user; 401 otherwise; unknown Host still 421; startup exits 1 on a bad file or a password under 15 characters; failures are logged without credentials                                                                                  | server tests, one browser test with credentials, VM test                              |
| 4   | `package` and `settings.url` options; `--url` (absolute http(s)) sets the origin of RSS, sitemap and `og:url`; `port` is `types.port`; unit has `RestartSec = 5`, `RequiresMountsFor`; Linux-only VM test boots a read-only and an edit node                                                                       | `nix flake check`                                                                     |
| 5   | `[[Name]]`, `[[Name\|label]]`, `[[folder/Name]]` link by slug path or alias; unknown targets render marked and unlinked; code, `\[[` and `[[ x ]]` stay literal; each note lists "Linked from"; `--check` prints `rel:line: broken link [[t]]` and exits 1 on broken links, 0 when clean, 2 when it couldn't check | markdown + server + CLI tests                                                         |
| 6   | With `--git` (edit mode), changes are committed into the data folder's own repository after 30 s quiet (at most 5 min), at startup if dirty, and on shutdown; History lists versions across renames and restores one's body; git failures never fail a save and show as "History paused"                           | server + edit tests, VM test                                                          |
| 7   | `tags:` show as chips; `/tags/` lists tags with counts; `/tags/<slug>/` lists tagged notes; drafts excluded; with `--no-index` tag pages 404 and chips are plain text                                                                                                                                              | server tests                                                                          |
| all | `nix fmt`, oxlint, full Playwright suite, `nix flake check` green; README and CHANGELOG updated per the docs map                                                                                                                                                                                                   | commands                                                                              |

### Negative cases that get tests

| Item | Case → expected                                                                                                                                                                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 0-mode folder present → other pages 200, one warning; malformed `aliases`/`tags` values → ignored, page renders                                                                                                                                                                         |
| 2    | alias equal to an existing page → page wins; two notes claim one alias → first by path, warning; alias on a draft in read-only → 404; invalid YAML front matter → move succeeds, file untouched, warning; rename back and forth → no self-alias, no loop; `Location` never echoes input |
| 3    | wrong password, unknown user, missing header, other scheme, bad base64 → 401; bad auth file (missing, empty, comments only, no `:`, empty user/password, hashed `$…`/`{SHA}` password, short password) → exit 1; unknown Host → 421; password never in logs                             |
| 5    | `[[x]]` in code, `\[[x]]`, `[[ x ]]`, `[[]]`, `[[                                                                                                                                                                                                                                       | l]]`, unclosed `[[x` → literal; `<script>` label → escaped; `[[a\|b]]` in a table cell → link, table intact; link to a draft → missing in read-only |
| 6    | git missing → exit 1; `--git` without `--edit` → exit 1; data folder inside another repo → exit 1; existing repo's hook failing → commit still made; bad sha / path → 400/404; never-committed note → empty list; version from before a rename → restorable                             |
| 7    | `C`, `C++`, `C#` → one page labelled with the first spelling, warning; `tags: 2026`, `[true, null]` → defined coercion (numbers → strings, others ignored)                                                                                                                              |

## Non-goals

Static export, KaTeX/TOC, custom CSS, image resizing. Multi-user permissions. Git push/pull. Editing front matter (`tags:`, `aliases:`) in the browser — written in the file. Aliases on folder moves (old folder addresses 404; documented). Tags in the sitemap or RSS categories. `[[x#heading]]` and `![[x]]` (left literal). A separate preview in the History dialog.

## Approach

### Files

`lib/cache.js` (expiring cache), `lib/site.js` (site index), `lib/aliases.js` (textual front-matter edit), `lib/auth.js`, `lib/history.js` (git + its router), `lib/tags.js` (tag routes + model), `lib/wikilinks.js` (markdown-it rule). `pages.js` and `edit.js` (near the 300-line limit) grow by an import plus a call each.

### Walks and caching (item 1)

- Walkers treat EACCES/EPERM/ELOOP like a missing entry: skipped with one warning per path per build; they never reject.
- `expiring(build, ttlMs)` → `{ get, peek, invalidate }`: concurrent `get`s share one build; stale-while-revalidate after the TTL; `invalidate()` drops value and in-flight build (generation counter, a build finishing after an invalidate is not stored); a rejected build is not kept.
- `fs.watch`, `stopCaching`, `isCaching` are deleted. `onChange` (no arguments) invalidates.

### Site index

- `lib/site.js`: one walk over notes; records `{ rel, title, slugPath, meta (date, description, draft, tags, aliases), text, links }`, memoised per file by `mtimeMs`+`size` so a rebuild stats every note and reads only changed ones.
- Search corpus and feed items become pure functions of it; their own caches and invalidations are deleted. The tree keeps its own cache (folder semantics).
- `loadMeta` gains `aliases` and `tags` (string or list → trimmed strings; numbers → strings; other values ignored). Parsing is total: a note that fails to parse is indexed with no links, aliases or tags.
- Draft visibility follows the mode (edit shows drafts).

### Rename redirects (item 2)

- `aliases:` entries are addresses (`posts/old`, `/content/posts/old`, legacy `posts/Old Name.md`), normalised with `slugPath`; absolute URLs, empty or `..` entries ignored with a warning.
- `resolveAddress` falls back to the alias map on a miss and returns the target `rel`; existing canonical checks in `serveNote`, `serveDownload` and `renderEditor` issue the 301 (`Location` always built from the target `rel`, query string kept). `renderEditor` checks aliases before treating an address as a new page. A real page beats an alias; two notes claiming one alias → first by path, warning.
- `POST /api/move` of a note, inside the write lock and before the rename: add the old slug path to `aliases:` textually — no front matter → prepend `---\naliases:\n  - <old>\n---\n\n`; parseable block without `aliases` → insert before the closing `---`; existing block-list `aliases:` → append; any other form or invalid YAML → leave unchanged and warn. Drop the note's own new address; dedupe. Body bytes preserved. Response `{ path, front }` with the new `ETag`; `moved()` in `editor-actions.js` adopts `ed.front`, `ed.etag`, `ed.acked`.

### Login (item 3)

- `--auth-file <path>`: lines `user:password` split at the first `:`, `\r` stripped, blank and `#` lines ignored. Read once at startup; missing, unreadable, empty, malformed, duplicate user, password under 15 characters, or a hashed password (`$id$…`, `{SHA}`) → exit 1 naming the line.
- Middleware order: security headers → `knownHost` (applied whenever edit mode or auth is on) → Basic auth → everything. Comparison of SHA-256 digests with `timingSafeEqual` over every entry, no early exit. Failure → 401, `WWW-Authenticate: Basic realm="molesk", charset="UTF-8"`, body "Sign in required. Reload to try again.", one log line `auth failed from <ip>`; no delay, no throttling (proxy/fail2ban; documented).
- With auth on, RSS and sitemap send `Cache-Control: private`.
- NixOS `services.molesk.authFile` (absolute path outside the store, asserted), `LoadCredential = "auth:${cfg.authFile}"`, script passes `--auth-file "$CREDENTIALS_DIRECTORY/auth"`.
- Warnings and help text that say "no login" are rewritten.

### Reconcile (item 4)

- Port from `review-remediation`: `services.molesk.package`; `--url` / `settings.url` (absolute http(s), trailing `/` trimmed) for RSS, sitemap and `og:url` (default: request host); `port` `types.port`; `RestartSec = 5`; `unitConfig.RequiresMountsFor = [ cfg.data ]`.
- `checks.vm` (Linux only) from `review-remediation:tests/module.nix`: read-only node (200 at `/`, RSS has `settings.url`, unit settings present); edit node with `authFile` and `edit.git.enable` (401 without, 200 with credentials, PUT a note, stop the unit, `git log` author `molesk`, password absent from journal and store). Module-eval script cases for the new options.
- A subagent audits `review-remediation`'s CHANGELOG against `next`; gaps in code this plan touches are fixed here, others listed as follow-ups.

### Wiki links (item 5)

- `lib/wikilinks.js`: inline rule emits a `wikilink` token `{ target, label }` for `[[target]]`/`[[target|label]]` (`\|` inside tables); not for `\[[`, empty or space-padded targets, or across lines.
- The renderer resolves through `env.site`: `slugPath(target)` matched as a segment-suffix against each note's slug path, then its aliases; first by path wins; resolved → `link_open`/`text`/`link_close` to `pageHref(rel)` with class `wikilink`; unresolved or no `env.site` → `span.wikilink.missing` with visually hidden "(no page yet)". No `html_inline`.
- `parseFileContent(data, { site })`; `serveNote` and `/api/preview` await the index (preview uses `peek()`); `plainText`/`excerptOf` use the label.
- Backlinks: `<nav class="backlinks" aria-labelledby>` "Linked from" above the pager, sorted by title, first 10 then `<details>`; nothing when empty; links from drafts hidden in read-only.
- `--check`: indexes with read-only rules, prints problems to stdout (`rel:line: broken link [[t]]`, `ambiguous link …`), a summary to stderr, exits 0/1/2; starts no server; with `--edit` or a single file → exit 2.

### Version history (item 6)

- `--git` requires `--edit`. Startup: `git --version` (missing → exit 1); `rev-parse --show-toplevel` under `GIT_CEILING_DIRECTORIES=<parent>`: another repo's toplevel → exit 1; none → `git init`, append `.trash/` and `.molesk-*` to `.git/info/exclude`; dubious ownership → exit 1 with git's message; stale `.git/index.lock` removed with a warning; dirty tree → commit "molesk: snapshot at start".
- Every git call: `execFile` (no shell, `timeout` 10 s, `maxBuffer` 16 MiB), env `GIT_DIR`, `GIT_WORK_TREE`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_TERMINAL_PROMPT=0`, `-c core.hooksPath=/dev/null -c core.fsmonitor=false -c commit.gpgsign=false -c gc.autoDetach=false -c user.name=molesk -c user.email=molesk@localhost`, `--` before paths. One serial queue; reads use `--no-optional-locks`.
- `onChange` → `history.touch()`: commit `add -A` 30 s after the last change, at most 5 min after the first; skipped when nothing staged. Errors kept (last one), logged once.
- SIGTERM/SIGINT (only with `--git`): close the server, wait for the write lock, flush (10 s cap), exit; a second signal exits at once. Timers and handlers end in `.catch`.
- `GET /api/history/<path>`: flushes pending work, returns `{ versions: [{ commit, date, subject, path }], error }` (`log --follow -n 50 --name-only`). `GET /api/history/<path>?at=<sha>` (sha `^[0-9a-f]{7,40}$`, path syntax-checked) → that version's text. GET only, behind the existing write guards.
- Editor ⋯ menu "History" (only with `--git`): dialog listing versions (empty state "No versions yet", "History paused: <reason>"); choosing one replaces the body by an undoable edit, keeps the current front matter, closes, shows "Restored <date>", then autosave saves it. Disabled during a conflict. Bottom sheet on phones.
- Delays are constructor parameters, tested in-process; no env knobs. NixOS `edit.git.enable` adds `pkgs.gitMinimal` to the unit's `path`; the package is unchanged; devShell gains `git`.

### Tags (item 7)

- `tags:` normalised as above, slug via `slugSegment`; equal slugs share one page labelled with the first spelling, warning.
- Chips under the date caption (own row when there is none) link to `/tags/<slug>/`; plain text with `--no-index`.
- `/tags/` lists tags with counts; `/tags/<slug>/` reuses the folder listing with no edit controls; both 404 with `--no-index`.

## Steps

1. Item 1: fix the stale watcher-test assertion; write the unreadable-folder repro (fails today); walkers + `lib/cache.js`; delete the watcher.
2. Site index (`lib/site.js`), `loadMeta` aliases/tags; feed and search derive from it.
3. Item 4: audit subagent; options, `--url`, unit settings, VM test skeleton.
4. Item 2: aliases resolution, textual rewrite on move, editor contract.
5. Item 5: wiki links, backlinks, `--check`.
6. Item 7: tags.
7. Item 3: auth (+ VM edit node).
8. Item 6: git history (+ VM assertions); shared edit test server gains `--git`; `useServers` gains `{ env }`.
9. Docs per the map; full verification; `nix flake check`.

## Docs map

| Item | README                                                                                                             | CHANGELOG (Unreleased)                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1    | Edit Mode: external edits show within 5 s                                                                          | rewrite the watcher line in place                         |
| 2    | front matter `aliases:`; routes prose; Edit Mode rename note; folder ceiling                                       | Added aliases; Changed: rename edits front matter         |
| 3    | config row, module `authFile`, file format, Security bullet (TLS, no logout, generate a password)                  | Added `--auth-file`; Changed security model bullet        |
| 4    | module `package`, `settings.url`; config row `--url`                                                               | Added; Changed `port` type, `og:url`/RSS/sitemap origin   |
| 5    | "Linking notes" (syntax, resolution, escapes); `--check`                                                           | Added; Changed: `[[…]]` in prose now links (escape `\[[`) |
| 6    | Edit Mode History; replace "Not included" history text; module `edit.git.enable`; operate repo as the service user | Added                                                     |
| 7    | `tags:`; routes `/tags/`, `/tags/<slug>/`, `/api/history/<path>`                                                   | Added                                                     |

## Risks and trade-offs

| Risk                                 | Handling                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| 5 s staleness for external edits     | accepted; editor writes invalidate at once                                                |
| Index rebuild per autosave           | stat all, parse changed only; preview uses the last index                                 |
| Rename edits the note's front matter | textual, body untouched, invalid YAML left alone; documented                              |
| Basic auth: no throttling, no logout | 15-character generated passwords, failures logged for fail2ban/proxy, TLS required (docs) |
| Tags or aliases with equal slugs     | first wins, warning                                                                       |
| `[[…]]` in existing prose            | escape `\[[`, space-padded stays literal, goldens reviewed                                |

## Review dispositions

- **Folded in:** every Blocker and High (front-matter contract on move; unreadable folders; single index with derived feed/search; aliases as wiki targets; git baseline, repo pinning, sandbox config, renames in history; auth brute-force stance and file format; textual alias edit; timing seams; negative-case matrix; harness changes; Restore semantics; docs map).
- **Folded in (Medium):** cache invalidation guarantee and stale-while-revalidate; alias lookup inside `resolveAddress`; render env handoff; `onChange` unchanged; git package via module; git queue, lock, debounce cap, shutdown, bounds; no-crash rules for async code; `authFile` LoadCredential; host check before auth; private caching; `/edit` alias redirect; `--check` output; tag/alias editing as non-goal; VM assertions; `[[…]]` escapes.
- **Cut (scope):** aliases on folder moves; tags in sitemap/RSS; History preview; login delay.
- **Deferred follow-ups:** missing wiki link creates the page in edit mode; README CLI block equality test; `[[x#heading]]`.

## Implementation notes

- **Audit of `review-remediation` (step 3).** Ported because the plan touches that code: `--no-download` route off, markdown-it 14.3.3, sandbox (`ProtectHome=tmpfs` + binds, `RestrictSUIDSGID`, `RestrictRealtime`, `SystemCallArchitectures`, `~@privileged`, `CAP_NET_BIND_SERVICE` below 1024), leading `---` rule kept, CSP `object-src`/`base-uri`/`form-action`, feed newest first, `--image` checked at start, `.avif`, feed autodiscovery, no feed or sitemap for a single file, oxlint in `nix flake check`.
- **Deviations.** The unit script now `exec`s molesk so SIGTERM reaches it (found by the VM test: the history flush was killed with the shell). A move commits the alias edit, then the rename on its own, so `git log --follow` works at git's default similarity. The package budget check rose to 16 MiB for Mermaid's bundle.
- **Follow-ups (not in this plan).** Clipboard buttons on plain HTTP (`navigator.clipboard` unguarded); remote images blocked by `img-src 'self' data:` (a policy decision); light-theme code colours below WCAG AA on the code background; `Escape` collapses the sidebar on desktop and `t` fires with modifiers; print stylesheet; a missing wiki link creating the page in edit mode; a test that the README CLI block equals `--help`; `[[x#heading]]`.

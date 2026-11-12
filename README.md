# molesk

> **Written by a JavaScript beginner relying heavily on AI**

Simple yet customizable, self-hosted platform designed to dynamically render Markdown files as HTML content from a specified directory.

My own instance is up and running at: [https://blog.coditon.com](https://blog.coditon.com)

## Key Features

- Automatically converts Markdown files into HTML web pages
- Parses YAML metadata to extract the publication date
- Easily customizable via NixOS module or CLI
- Syntax highlighting and a wide range of markdown-it plugins
- Supports both dark and light themes for user preference
- Fully responsive layout that looks great on both desktop and mobile devices
- Provides an RSS feed, a sitemap, link previews and article downloads
- Full-text search and a quick switcher (`Ctrl+K`)
- Drafts that stay off the published site
- Keyboard shortcuts for navigation
- Folder index pages and task-list checkboxes
- Optional edit mode that turns it into a private notes app

## Getting Started

Publish a folder of Markdown as a read-only site:

```shell
nix run github:tupakkatapa/molesk -- ./docs
```

Or keep private notes, editable in the browser on `127.0.0.1`:

```shell
nix run github:tupakkatapa/molesk -- ./notes --edit
```

For NixOS users, this can be seamlessly integrated as a module:

```nix
{
  inputs = {
    molesk.url = "github:tupakkatapa/molesk";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs, molesk }: {
    nixosConfigurations = {
      yourhostname = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          ./configuration.nix
          molesk.nixosModules.default
          # Module Configuration
          {
            services.molesk = { ... };
          }
        ];
      };
    };
  };
}
```

## Configuration

Every part of the page is a switch. Defaults depend on the mode: [edit mode](#edit-mode) is a private notes app, so publishing features default off there. Every default can be overridden.

| Concern      | Flag(s)                        | Module option              | Default          | Default with `--edit` |
| ------------ | ------------------------------ | -------------------------- | ---------------- | --------------------- |
| Write access | `--edit`                       | `edit.enable`              | off              | on                    |
| Login        | `--auth-file <path>`           | `authFile`                 | none             | none                  |
| History      | `--git`                        | `edit.git.enable`          | —                | off                   |
| Public URL   | `--url <url>`                  | `settings.url`             | request's own    | request's own         |
| Home page    | `--home <file>` / `--no-home`  | `settings.home`            | auto             | none                  |
| Index pages  | `--index` / `--no-index`       | `settings.index.enable`    | on               | on                    |
| Downloads    | `--download` / `--no-download` | `settings.download.enable` | on               | on                    |
| Search       | `--search` / `--no-search`     | `settings.search.enable`   | on               | on                    |
| RSS          | `--rss` / `--no-rss`           | `settings.rss.enable`      | on               | off                   |
| Source link  | `--source` / `--no-source`     | `settings.source.enable`   | on               | off                   |
| Links        | `--link icon:url`              | `settings.links`           | none             | none                  |
| Title        | `--title <text>`               | `settings.title`           | data source name | data source name      |
| Image        | `--image <path>`               | `settings.image`           | none             | none                  |
| Image size   | `--image-size small\|large`    | `settings.imageSize`       | large            | large                 |
| Theme        | `--theme dark\|light\|auto`    | `settings.theme`           | dark             | dark                  |

- **Home page.** `auto` picks the first of `index.md`, `README.md` and `Home.md` at the top of the data directory (any letter case); edit mode has none unless set. `/` opens it and the sidebar title links to it instead of listing it.
- **Index pages.** `/` without a home page, and every folder URL (`/content/<folder>/`), list their notes newest first. A folder's own `index.md` or `README.md` is shown instead when present. With `--no-index` folder URLs are 404 and `/` opens the first note.
- **Search.** A box over the sidebar tree that narrows it to the pages whose names match; `/` focuses it. `Ctrl+K`, or the magnifier in the box (or the top bar on phones), opens a switcher that finds pages by name and by text. `--no-search` turns off both, and `/api/search`.
- **Image size.** `large` shows the picture and the title centred above the tree; `small` puts a small picture beside the title in the header row. Without `--image` both show the title in the header row.
- **Theme.** The default for visitors who haven't picked one with the toggle; `auto` follows the system setting.
- **Login.** `--auth-file` names a file of `user:password` lines (blank lines and `#` comments skipped); every request then needs one of them through the browser's login prompt, in any mode. Passwords must be 15 characters or more; generate one (`openssl rand -base64 24`) and keep the file readable only by the service. Serve it over HTTPS (a proxy), since Basic auth sends the password with every request. There is no logout: close the browser, or use a private window on shared devices. Failed logins are logged as `auth failed from <ip>` for fail2ban or the proxy to throttle. Feed and sitemap become `Cache-Control: private`.
- **Public URL.** `--url https://blog.example.com` is the address in the feed, the sitemap and link previews; without it they use the address each request came in on.

## Module Configuration

### Options

- **`enable`** – Enables the molesk service.
- **`package`** – The molesk package to run (default: this flake's).
- **`data`** – Path to markdown file or directory (default: `/var/lib/molesk`).
- **`address`** – Host address for the service (default: `0.0.0.0`, with edit mode `127.0.0.1`).
- **`port`** – Port number for the service, 1–65535 (default: `8080`).
- **`authFile`** – Absolute path outside the Nix store of a `user:password` file; every page then needs a login (default: `null`). Passed in with systemd `LoadCredential`; restart the service after changing it.
- **`openFirewall`** – Open ports in the firewall for the web interface (default: `false`).
- **`user`** / **`group`** – User and group under which the service runs (default: `molesk`).
- **`edit.enable`** – Enable [edit mode](#edit-mode) (default: `false`). Makes `data` writable for the service; a `data` other than the default must be writable by `user`.
- **`edit.allowedHosts`** – With edit mode or `authFile`: host names molesk is reached by besides localhost, i.e. the name your HTTPS proxy forwards (default: `[]`). Other names get 421.
- **`edit.git.enable`** – Keep every change in a git repository in `data` and offer History in the editor (default: `false`). Puts git on the service's `PATH`.
- **`settings`** – Display and feature settings.
  - **`title`** – Title displayed on the site (default: data source name).
  - **`image`** – Path to the profile picture.
  - **`imageSize`** – `large` (the default) or `small`; see [Configuration](#configuration).
  - **`url`** – The site's public address for feed, sitemap and link previews (default: `null`, the request's own).
  - **`links`** – Social media links, each with a `fab` (FontAwesome icon class) and `url`.
  - **`download.enable`** – Show the download button (default: `true`).
  - **`home`**, **`index.enable`**, **`search.enable`**, **`rss.enable`**, **`source.enable`**, **`theme`** – See [Configuration](#configuration). `null` (the default) keeps the mode default.

### Example

```nix
{
  services.molesk = {
    enable = true;
    data = "/path/to/content";
    settings = {
      title = "Your Name";
      image = "/path/to/image.jpg";
      links = [
        { fab = "fa-github"; url = "https://github.com/yourusername"; }
        { fab = "fa-x-twitter"; url = "https://x.com/yourusername"; }
      ];
    };
  };
}
```

## Usage

Place your Markdown (`.md`) files in the configured data path. Each file becomes a page. The first of `index.md`, `README.md` and `Home.md` (or `--home`) opens at `/`; without one, `/` lists the notes. See [Configuration](#configuration).

```
data/
├── Home.md
├── image.jpg
├── assets
│   └── treasure_map.jpg
├── posts
│   ├── 'Desert Treasure.md'
│   └── 'The Fremennik Trials.md'
└── recipes
    ├── 'Pineapple Pizza.md'
    └── 'Gnome Cocktail.md'
```

Folders appear in the sidebar once they hold a page (in edit mode also while empty), so a folder of images like `assets` stays out of it.

Optionally, include YAML frontmatter:

```yaml
---
date: "2024-03-30"
description: "One line for link previews and the folder page"
draft: true
tags: [nixos, notes]
aliases:
  - posts/old-name
---
```

- **`date`** (`YYYY-MM-DD`) is the publication date: dated pages list newest first, above the undated ones. Pages show it with the reading time.
- **`description`** is the summary in link previews, the feed and folder pages; without it, the first paragraph.
- **`draft: true`** keeps a page off the published site: no tree, index, feed, sitemap or search entry, and its URL is 404. Edit mode and single-file mode show it, marked _Draft_.
- **`tags`** (one or a list) show as chips under the date; each links to `/tags/<tag>/`, which lists the tagged pages, and `/tags/` lists every tag. Tags whose addresses match (`C`, `C#`) share one page. Without index pages (`--no-index`) chips are plain text.
- **`aliases`** are the page's other addresses (`posts/old-name`, `/content/posts/old-name` or `posts/Old Name.md`): they redirect to it, and wiki links can use them. Renaming a page in the editor adds its old address here, so links to it keep working; renaming a folder doesn't, so old folder addresses are 404.

### Linking notes

`[[Name]]` links to the page called Name; `[[folder/Name]]` picks one in a folder, `[[Name|text]]` shows other text (`[[Name\|text]]` inside a table). Names match like addresses (case, spaces and punctuation don't matter), then a page's `aliases`; if two pages share a name, the first by path wins. A link to no page shows as dimmed text. Links in code stay as written, and so do `\[[escaped]]` and space-padded ones like `[[ -f file ]]`.

Every page lists the pages that link to it, by wiki link or by an ordinary link to its address, under _Linked from_.

`molesk <dir> --check` prints each broken link between notes as `<file>:<line>: broken link [[Name]]` (and ambiguous names as warnings) without starting a server, and exits 0 when there are none, 1 when there are, and 2 when a path couldn't be read. Drafts count as missing, as on the published site.

### Routes

Page and folder addresses are the file names in lowercase, with spaces and punctuation turned into `-` and no extension: `posts/My First Post.md` is `/content/posts/my-first-post`. Images keep their file names. Old addresses with the file name (`/content/posts/My%20First%20Post.md`), and a page's `aliases`, redirect permanently. If two names give the same address, the first by name gets it and the server logs a warning.

| Path                     | What                                                           |
| ------------------------ | -------------------------------------------------------------- |
| `/content/<path>`        | A page, an image, or a folder's index (`<folder>/`)            |
| `/download/<path>`       | A page's Markdown                                              |
| `/rss.xml`               | The feed (`--rss`)                                             |
| `/sitemap.xml`           | Every published page and folder index (read-only mode)         |
| `/api/search?q=<text>`   | Pages matching `text` by name or content, as JSON (`--search`) |
| `/tags/`, `/tags/<tag>/` | Every tag, and the pages with one (`--index`)                  |
| `/api/history/<path>`    | A note's versions, as JSON (`--edit --git`)                    |

### CLI Options

Can also be run directly without the NixOS module:

```shell
# With Nix
nix run github:tupakkatapa/molesk -- [options]

# With Node.js
git clone https://github.com/tupakkatapa/molesk && cd molesk
yarn install
node app.js [options]
```

```
Usage: molesk [file.md|directory] [options]

Arguments:
  file.md                  View one markdown file (opens the browser)
  directory                Serve the markdown files in a directory

Options:
  -h, --help               Display this help information
  -o, --open               Open the browser after starting
  -a, --address <host>     Address to listen on (default: 0.0.0.0;
                           127.0.0.1 for a single file or with --edit)
  -p, --port <port>        Port to listen on, 1-65535 (default: 8080)
  --url <url>              Public address for feed, sitemap and link-preview
                           links (default: the address each request came in on)
  -t, --title <text>       Site title (default: data source name)
  -i, --image <path>       Profile picture
  --image-size <size>      Picture beside the title (small) or above it
                           (large, default)
  -l, --link <icon:url>    Sidebar link with a FontAwesome icon, repeatable
                           (e.g. --link fa-github:github.com/username)
  --home <file>            Page shown at / (default: first of index.md,
                           README.md, Home.md; none with --edit);
                           --no-home shows the index
  --theme <name>           Default theme: dark, light or auto (default: dark)
  --[no-]index             List folder contents at / and folder URLs (default: on)
  --[no-]download          Markdown downloads at /download (default: on)
  --[no-]search            Search box over the sidebar (default: on)
  --[no-]rss               RSS feed at /rss.xml (default: on, off with --edit)
  --[no-]source            Source code link in the sidebar (default: on, off with --edit)
  --check                  Print broken links between notes and exit: 0 when
                           none, 1 when some, 2 when a path can't be read
  --edit                   Create, edit and delete pages in the browser; needs
                           a writable directory (add --auth-file before
                           exposing it beyond this machine)
  --git                    With --edit, keep every change in a git repository in
                           the directory; the editor's History restores them
  --auth-file <path>       Require a login for every page: a file of
                           user:password lines, passwords 15+ characters
  --allowed-host <name>    With --edit or --auth-file, a host name the site is
                           reached by besides localhost, e.g. the HTTPS proxy's;
                           repeatable, others get 421

Examples:
  molesk README.md         View one file
  molesk ./docs            Serve a docs directory
  molesk ./docs --edit     Edit in the browser on 127.0.0.1
```

### Keyboard Shortcuts

| Key             | Action                                     |
| --------------- | ------------------------------------------ |
| `t`             | Toggle dark/light theme                    |
| `Escape`        | Close sidebar; in the editor, Done         |
| `Home` / `End`  | Scroll to top / bottom                     |
| `e`             | Edit the open note (edit mode)             |
| `/`             | Search the sidebar                         |
| `Ctrl+K`        | Go to a page or search the text            |
| `Ctrl+P`        | The same, from inside the editor           |
| `Ctrl+S`        | Save now (the editor also saves by itself) |
| `Ctrl+B/I/K`    | Bold, italic, link (in the editor)         |
| `Enter` / `Tab` | Continue / indent lists (in the editor)    |

Touch: the menu button opens navigation, swipe left to close.

## Edit Mode

`--edit` turns a private instance into a notes app. Publishing features (RSS, source link) and the home page default off, so `/` lists your notes; switch any back on (see [Configuration](#configuration)).

```shell
# Listens on 127.0.0.1
molesk ./notes --edit

# Behind an HTTPS proxy reached as notes.example.ts.net
molesk ./notes --edit --allowed-host notes.example.ts.net
```

```nix
{
  services.molesk = {
    enable = true;
    data = "/var/lib/molesk";
    edit.enable = true;
    edit.allowedHosts = [ "notes.example.ts.net" ];
  };
}
```

- **Writing.** Every folder in the sidebar ends with **+ New**: type a name and press Enter to open the new note, or end it with `/` to make a folder (`ideas/2026/Idea` creates both). The pencil, or `e`, opens a note in the editor; **Done** or `Escape` goes back. The editor saves by itself shortly after you stop typing, switches between Write, Split and Preview, and keeps the formatting bar above the keyboard on phones. Edit the title to rename the note; its old address is added to its `aliases` so links keep working. Changes made outside molesk show within about 5 s. `Ctrl+K` jumps to any page, or creates the one you typed in the current folder.
- **Images.** Paste or drop an image (PNG, JPEG, GIF or WebP, up to 10 MB) into the editor: it is saved as `assets/<page>-<time>.<ext>` beside the page and linked where the caret was. Moving a page to another folder takes its images along (copying any another page there still uses); deleting a page leaves them where they are.
- **Folders and tasks.** A folder's page (`/content/<folder>/`) lists its notes; its ⋯ menu renames the folder, or deletes it once empty. Clicking a `- [ ]` checkbox on a note saves it.
- **Deleting.** Deleted notes move to `.trash/<path>~<time>` inside the data directory, never shown or served; restore one by moving it back.
- **Security.** Edit mode listens on `127.0.0.1` by default. To reach it from other devices, add a login with `--auth-file` (see [Configuration](#configuration)) or let an HTTPS proxy do it (e.g. `tailscale serve` with a tailnet ACL), name the proxy's host with `--allowed-host` and pass the `Host` header through. Requests naming any other host get 421, which stops DNS rebinding. An explicit non-loopback `--address` starts with a warning.
- **History.** With `--git`, changes are committed to a git repository in the data directory (created if needed; it must not sit inside another repository): 30 s after the last edit, at most 5 min after the first, at start if there are uncommitted changes, and when the service stops. The editor's ⋯ menu shows **History**: choosing a version puts its text in the editor as a new edit (`Ctrl+Z` undoes it); the page's front matter stays as it is. If a commit fails the save still works and History says why. Run your own git commands there as the service's user, so the files stay writable for it.
- **Concurrent edits.** Saves are conditional on the version you opened. If the file changed elsewhere (another tab, device, editor or sync tool), the editor keeps your text and offers _Keep mine_ (saves yours; theirs goes to `.trash`) or _Load theirs_ (opens theirs; yours is saved beside it as `<name> (conflict).md`).
- **Durability.** Writes go to a temporary file that is synced and renamed over the note, so a crash never leaves a half-written note.
- **Line endings.** Browsers normalise editor text to LF, so saving a CRLF note converts it to LF.
- **Scope.** Only `.md`/`.txt` files (and images under `assets/`) inside the data directory, no hidden paths, no symlinks out of the directory, 1 MB per note. Single-file mode can't be edited.
- **Rate limiting.** There is none built in; put it in the proxy if you need it.
- **Not included.** Other uploads than images, syncing the history anywhere (push it yourself), multiple users or per-user rights.

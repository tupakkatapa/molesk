# molesk

> Written largely by AI, reviewed and maintained by me

Simple yet customizable, self-hosted platform that renders a directory of Markdown files as a website. One file is one page, folders become the sidebar. Suits docs, a blog, a book or private notes.

My own instance is up and running at: [https://blog.coditon.com](https://blog.coditon.com)

- Syntax highlighting, Mermaid diagrams, task lists, `[[wiki links]]` and inline video (`![](clip.mp4)`)
- Sidebar search by page name, tags and text
- RSS feed, sitemap, link previews, dark and light themes, phone layout
- Readable without JavaScript
- Optional edit mode: a private notes app with autosave, uploads and git history
- Every optional feature has a switch, as a CLI flag and a NixOS module option

## Usage

```bash
# Try without installing
nix run github:tupakkatapa/molesk -- ./docs

# Single file, opens in the browser
nix run github:tupakkatapa/molesk -- note.md

# Report broken links between pages and exit
nix run github:tupakkatapa/molesk -- ./docs --check
```

Pages live at `/content/<path>`: the file name in lowercase, spaces as `-`, no extension. The first of `index.md`, `README.md` and `Home.md` opens at `/`.

Front matter is optional:

```yaml
---
title: "Chapter 2: Night" # shown instead of the file name
order: 2 # lowest first, before unordered pages
date: "2026-11-13" # dated pages list newest first
description: "Summary for link previews, the feed and folder pages"
image: assets/cover.jpg # link-preview picture
tags: [nixos, notes] # chips under the page, listed at /tags/
aliases: [posts/old-name] # old addresses that redirect here
draft: true # hidden from the published site
toc: false # no table of contents on this page
---
```

## Configuration

`molesk --help` describes every flag. Edit mode is private, so publishing features default off there.

| Concern       | Flag(s)                          | Module option               | Default          | Default with `--edit` |
| ------------- | -------------------------------- | --------------------------- | ---------------- | --------------------- |
| Write access  | `--edit`                         | `edit.enable`               | off              | on                    |
| History       | `--git`                          | `edit.git.enable`           | —                | off                   |
| Login         | `--auth-file <path>`             | `authFile`                  | none             | none                  |
| Allowed hosts | `--allowed-host <name>`          | `edit.allowedHosts`         | none             | none                  |
| Address       | `--address <host>`               | `address`                   | 0.0.0.0          | 127.0.0.1             |
| Port          | `--port <port>`                  | `port`                      | 8080             | 8080                  |
| Public URL    | `--url <url>`                    | `settings.url`              | request's own    | request's own         |
| Home page     | `--home <file>` / `--no-home`    | `settings.home`             | auto             | none                  |
| Index pages   | `--index` / `--no-index`         | `settings.index.enable`     | on               | on                    |
| Downloads     | `--download` / `--no-download`   | `settings.download.enable`  | on               | on                    |
| Search        | `--search` / `--no-search`       | `settings.search.enable`    | on               | on                    |
| RSS           | `--rss` / `--no-rss`             | `settings.rss.enable`       | on               | off                   |
| Source link   | `--source` / `--no-source`       | `settings.source.enable`    | on               | off                   |
| Previous/next | `--pager` / `--no-pager`         | `settings.pager.enable`     | off              | off                   |
| Linked from   | `--backlinks` / `--no-backlinks` | `settings.backlinks.enable` | off              | off                   |
| Contents list | `--toc` / `--no-toc`             | `settings.toc.enable`       | off              | off                   |
| Reading place | `--position` / `--no-position`   | `settings.position.enable`  | on               | on                    |
| Links         | `--link icon:url`                | `settings.links`            | none             | none                  |
| Title         | `--title <text>`                 | `settings.title`            | data source name | data source name      |
| Image         | `--image <path>`                 | `settings.image`            | none             | none                  |
| Image size    | `--image-size small\|large`      | `settings.imageSize`        | large            | large                 |
| Theme         | `--theme dark\|light\|auto`      | `settings.theme`            | dark             | dark                  |

Module toggles take `true`, `false` or `null`; `null` keeps the default.

## Edit Mode

```bash
# Listens on 127.0.0.1
molesk ./notes --edit --git

# Behind an HTTPS proxy reached as notes.example.ts.net
molesk ./notes --edit --allowed-host notes.example.ts.net --auth-file ./auth
```

- **+ New** in the sidebar creates a page or folder; the pencil or `e` opens the editor, which saves by itself
- Paste or drop images (10 MB) and videos (MP4, MOV, WebM; 100 MB) into the editor; they land in `assets/` beside the page
- Renaming a page keeps its old address as an alias; deleted pages move to `.trash/`
- `--git` commits changes to a repository in the data directory and adds **History** to the editor
- `--auth-file` holds `user:password` lines (15 characters or more) for Basic auth; serve it over HTTPS
- Requests for a host other than localhost and `--allowed-host` get 421

## NixOS Module

```nix
{
  inputs.molesk.url = "github:tupakkatapa/molesk";

  outputs = { nixpkgs, molesk, ... }: {
    nixosConfigurations.yourhostname = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        molesk.nixosModules.default
        {
          services.molesk = {
            enable = true;
            data = "/var/lib/molesk";
            openFirewall = true;
            settings = {
              title = "Your Name";
              url = "https://blog.example.com";
              links = [
                { fab = "fa-github"; url = "https://github.com/yourusername"; }
              ];
              toc.enable = true;
            };
          };
        }
      ];
    };
  };
}
```

## Contributing

```bash
nix develop           # Enter dev shell (or use direnv)
node app.js contents  # Run on the sample content
pre-commit run -a     # Formatters, pedantic oxlint and the Playwright tests
```

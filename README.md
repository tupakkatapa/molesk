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
- Provides an RSS feed and article downloads
- Keyboard shortcuts for navigation

## Getting Started

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

## Module Configuration

### Options

- **`enable`** – Enables the molesk service.
- **`data`** – Path to markdown file or directory (default: `/var/lib/molesk`).
- **`address`** – Host address for the service (default: `0.0.0.0`).
- **`port`** – Port number for the service (default: `8080`).
- **`openFirewall`** – Open ports in the firewall for the web interface (default: `false`).
- **`user`** / **`group`** – User and group under which the service runs (default: `molesk`).
- **`settings`** – Display and feature settings.
  - **`title`** – Title displayed on the site (default: data source name).
  - **`image`** – Path to the profile picture.
  - **`links`** – Social media links, each with a `fab` (FontAwesome icon class) and `url`.
  - **`source.enable`** – Show source code link in footer (default: `true`).
  - **`rss.enable`** – Show RSS feed link in footer (default: `true`).
  - **`download.enable`** – Show download button on content (default: `true`).

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

Place your Markdown (`.md`) files in the configured data path. Each file becomes a page, and the alphabetically first file serves as the index page.

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

Optionally, include YAML frontmatter to specify the publication date:

```yaml
---
date: "2024-03-30"
---
```

### CLI Options

Can also be run directly without the NixOS module:

```shell
# With Nix
nix run github:tupakkatapa/molesk -- [options]

# With Node.js
git clone https://github.com/tupakkatapa/molesk && cd molesk
npm install
node app.js [options]
```

```
Usage: molesk [file.md|directory] [options]

Arguments:
  file.md             Open a single markdown file in viewer mode
  directory           Serve markdown files from directory

Options:
  -h, --help          Display this help information
  -o, --open          Auto-open browser after starting server
  -a, --address       Set the host address (default: '0.0.0.0')
  -p, --port          Set the port number (default: 8080)
  -t, --title         Set the title displayed on the site (default: data source name)
  -i, --image         Set the path to the profile picture
  -l, --link          Add link with icon and URL in the format 'icon:url'
                      (e.g., --link fa-github:https://github.com/username)
  --no-source         Hide source code link in footer
  --no-rss            Hide RSS feed link in footer
  --no-download       Hide download button on content

Examples:
  molesk README.md              View single file (opens browser)
  molesk ./docs                 Serve docs directory
  molesk -o ./blog              Serve blog and open browser
```

### Keyboard Shortcuts

| Key      | Action                  |
| -------- | ----------------------- |
| `t`      | Toggle dark/light theme |
| `Escape` | Close sidebar           |
| `Home`   | Scroll to top           |
| `End`    | Scroll to bottom        |

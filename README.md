# coditon-md

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
    coditon-md.url = "github:tupakkatapa/coditon-md";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs, coditon-md }: {
    nixosConfigurations = {
      yourhostname = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          ./configuration.nix
          coditon-md.nixosModules.default
          # Module Configuration
          {
            services.coditon-md = { ... };
          }
        ];
      };
    };
  };
}
```

## Module Configuration

### Options

- **`enable`** -- Enables the coditon-md service.
- **`dataDir`** -- Directory where markdown files are located (default: `/var/lib/coditon-md`).
- **`address`** -- Host address for the service (default: `0.0.0.0`).
- **`port`** -- Port number for the service (default: `8080`).
- **`name`** -- Name displayed on the site (default: `Mike Wazowski`).
- **`image`** -- Path to the profile picture.
- **`links`** -- Social media links, each with a `fab` (FontAwesome icon class) and `url`.
- **`sourceLink`** -- Source code link displayed in the interface (default: `https://github.com/tupakkatapa/coditon-md`).
- **`openFirewall`** -- Open ports in the firewall for the web interface (default: `false`).
- **`user`** / **`group`** -- User and group under which the service runs (default: `coditon`).

### Example

```nix
{
  services.coditon-md = {
    enable = true;
    name = "Your Name";
    dataDir = "/path/to/content";
    image = "/path/to/image.jpg";
    links = [
      { fab = "fa-github"; url = "https://github.com/yourusername"; }
      { fab = "fa-x-twitter"; url = "https://x.com/yourusername"; }
    ];
  };
}
```

## Usage

Place your Markdown (`.md`) files in the configured data directory. Each file becomes a page, and the alphabetically first file serves as the index page.

```
dataDir/
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
nix run github:tupakkatapa/coditon-md -- [options]
```

```
$ node app.js --help
Usage: node [script] [options]

Options:
  -h, --help          Display this help information
  -d, --datadir       Set the data directory for contents (default: './contents')
  -a, --address       Set the host address (default: '0.0.0.0')
  -p, --port          Set the port number (default: 8080)
  -n, --name          Set the name displayed on the site (default: 'My Site')
  -i, --image         Set the path to the profile picture
  -l, --link          Add link with icon and URL in the format 'icon:url'
                      (e.g., --link fa-github:https://github.com/username)
  -s, --source        Set the source code repository URL
```

### Keyboard Shortcuts

| Key      | Action                  |
| -------- | ----------------------- |
| `t`      | Toggle dark/light theme |
| `Escape` | Close sidebar           |
| `Home`   | Scroll to top           |
| `End`    | Scroll to bottom        |

{ config
, lib
, pkgs
, ...
}:
with lib; let
  cfg = config.services.molesk;
  inherit (cfg) settings;
  loopback = [ "127.0.0.1" "::1" "localhost" ];
  stateDir = "/var/lib/molesk";
  toggle = name: value: optionalString (value != null) "--${optionalString (!value) "no-"}${name} ";
in
{
  options.services.molesk = {
    enable = mkEnableOption "molesk";

    package = mkOption {
      type = types.package;
      default = pkgs.callPackage ./package.nix { };
      defaultText = literalExpression "pkgs.callPackage ./package.nix { }";
      description = "The molesk package to run.";
    };

    data = mkOption {
      type = types.str;
      default = stateDir;
      description = ''
        Path to markdown file or directory containing markdown files. With
        edit mode, a path other than the default must be writable by `user`.
      '';
    };

    address = mkOption {
      type = types.str;
      default = if cfg.edit.enable then "127.0.0.1" else "0.0.0.0";
      defaultText = literalExpression ''if config.services.molesk.edit.enable then "127.0.0.1" else "0.0.0.0"'';
      description = ''
        Host address for the service. Off loopback, set `authFile` and put
        the service behind an HTTPS proxy.
      '';
    };

    port = mkOption {
      type = types.port;
      default = 8080;
      description = "Port number for the service.";
    };

    authFile = mkOption {
      type = types.nullOr types.str;
      default = null;
      example = "/run/secrets/molesk-auth";
      description = ''
        Absolute path, outside the Nix store, of a file of `user:password`
        lines (passwords of 15 characters or more). Every page then needs a
        login. Read once at start; restart the service after changing it.
      '';
    };

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Open ports in the firewall for the web interface.";
    };

    user = mkOption {
      type = types.str;
      default = "molesk";
      description = "User account under which service runs.";
    };

    group = mkOption {
      type = types.str;
      default = cfg.user;
      description = "Group under which service runs.";
    };

    edit.enable = mkEnableOption "creating, editing and deleting notes in the browser";

    edit.allowedHosts = mkOption {
      type = types.listOf types.str;
      default = [ ];
      example = [ "notes.example.ts.net" ];
      description = ''
        With edit mode or `authFile`: host names molesk is reached by besides
        localhost, i.e. the name your HTTPS proxy forwards. Requests naming any
        other host get 421, which stops DNS rebinding.
      '';
    };

    edit.git.enable = mkEnableOption ''
      version history: changes are committed to a git repository in `data`,
      which must not be inside another repository, and the editor's History
      restores them. Run git there as `user`
    '';

    settings = {
      title = mkOption {
        type = types.str;
        default = "";
        description = "The title to be displayed on the site. Defaults to data source name if not set.";
      };

      image = mkOption {
        type = types.str;
        default = "";
        description = "Path to the profile picture.";
      };

      imageSize = mkOption {
        type = types.enum [ "small" "large" ];
        default = "large";
        description = "Profile picture beside the title (small) or above it (large).";
      };

      links = mkOption {
        type = types.listOf (types.submodule {
          options = {
            fab = mkOption {
              type = types.str;
              description = "FontAwesome icon class for the link.";
            };
            url = mkOption {
              type = types.str;
              description = "URL for the link.";
            };
          };
        });
        default = [ ];
        description = "Social media links.";
      };

      source.enable = mkOption {
        type = types.nullOr types.bool;
        default = null;
        description = "Show source code link in the sidebar. Null keeps the mode default: on, off with edit mode.";
      };

      rss.enable = mkOption {
        type = types.nullOr types.bool;
        default = null;
        description = "RSS feed at `/rss.xml` and its link in the sidebar; false removes the route. Null keeps the mode default: on, off with edit mode.";
      };

      search.enable = mkOption {
        type = types.nullOr types.bool;
        default = null;
        description = "Search box over the sidebar. Null keeps the default: on.";
      };

      download.enable = mkOption {
        type = types.nullOr types.bool;
        default = null;
        description = "Markdown downloads at `/download` and the download button; false removes the route. Null keeps the default: on.";
      };

      pager.enable = mkOption {
        type = types.nullOr types.bool;
        default = null;
        description = "Previous and next page links under a page. Null keeps the default: off.";
      };

      backlinks.enable = mkOption {
        type = types.nullOr types.bool;
        default = null;
        description = "\"Linked from\" list under a page. Null keeps the default: off.";
      };

      toc.enable = mkOption {
        type = types.nullOr types.bool;
        default = null;
        description = "Table of contents on long pages. Null keeps the default: off.";
      };

      position.enable = mkOption {
        type = types.nullOr types.bool;
        default = null;
        description = "Reopen a page where the reader left it. Null keeps the default: on.";
      };

      home = mkOption {
        type = types.nullOr (types.either (types.enum [ false ]) types.str);
        default = null;
        example = "About.md";
        description = ''
          Note shown at `/`, relative to `data`. Null picks the first of
          `index.md`, `README.md` and `Home.md` (none in edit mode); false
          shows the index.
        '';
      };

      index.enable = mkOption {
        type = types.nullOr types.bool;
        default = null;
        description = "List folder contents at `/` and folder URLs, and the tag pages at `/tags/`. Null keeps the default: on.";
      };

      url = mkOption {
        type = types.nullOr types.str;
        default = null;
        example = "https://blog.example.com";
        description = "Public address used in feed, sitemap and link-preview links. Null uses the address each request came in on.";
      };

      theme = mkOption {
        type = types.nullOr (types.enum [ "dark" "light" "auto" ]);
        default = null;
        description = "Theme for visitors who haven't picked one; auto follows the system. Null keeps the default: dark.";
      };
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = !(cfg.edit.enable && any (ext: hasSuffix ext (toLower cfg.data)) [ ".md" ".txt" ]);
        message = "services.molesk.edit.enable needs `data` to be a directory, not a single note.";
      }
      {
        assertion = cfg.authFile == null || (hasPrefix "/" cfg.authFile && !hasPrefix builtins.storeDir cfg.authFile);
        message = "services.molesk.authFile must be an absolute path outside the Nix store, so the password isn't world-readable.";
      }
    ];

    warnings =
      # In a container the address is its private link to the host's proxy.
      optional (cfg.edit.enable && cfg.authFile == null && !elem cfg.address loopback && !config.boot.isContainer) ''
        services.molesk.address = "${cfg.address}" lets anyone who reaches it edit; set services.molesk.authFile and put it behind an HTTPS proxy (README, Edit Mode).
      '';

    systemd.services.molesk = {
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];
      unitConfig.RequiresMountsFor = [ cfg.data ];
      path = optional cfg.edit.git.enable pkgs.gitMinimal;
      serviceConfig = {
        Type = "simple";
        RestartSec = 5;
        LoadCredential = mkIf (cfg.authFile != null) "auth:${cfg.authFile}";
        User = cfg.user;
        Group = cfg.group;
        Restart = "on-failure";

        # Hardening
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        # Only the data and the picture are visible under /home
        ProtectHome = "tmpfs";
        BindReadOnlyPaths = optional (!cfg.edit.enable) cfg.data ++ optional (settings.image != "") settings.image;
        BindPaths = optional cfg.edit.enable cfg.data;
        PrivateTmp = true;
        PrivateDevices = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectKernelLogs = true;
        ProtectControlGroups = true;
        ProtectProc = "invisible";
        RestrictAddressFamilies = [ "AF_INET" "AF_INET6" "AF_UNIX" ];
        RestrictNamespaces = true;
        RestrictRealtime = true;
        RestrictSUIDSGID = true;
        SystemCallArchitectures = "native";
        LockPersonality = true;
        CapabilityBoundingSet = if cfg.port < 1024 then [ "CAP_NET_BIND_SERVICE" ] else "";
        AmbientCapabilities = mkIf (cfg.port < 1024) [ "CAP_NET_BIND_SERVICE" ];
        SystemCallFilter = [ "@system-service" "~@privileged" ];
        # MemoryDenyWriteExecute stays off: V8's JIT needs writable code pages.
        ReadWritePaths = mkIf cfg.edit.enable [ cfg.data ];
        # Notes stay private to the user and group.
        UMask = mkIf cfg.edit.enable "0027";
        StateDirectory = mkIf (cfg.edit.enable && cfg.data == stateDir) "molesk";
        StateDirectoryMode = mkIf (cfg.edit.enable && cfg.data == stateDir) "0750";
      };
      script =
        ''
          exec ${getExe cfg.package} ${escapeShellArg cfg.data} \
          --port ${toString cfg.port} \
          --address ${escapeShellArg cfg.address} \
        ''
        + optionalString (settings.title != "") "--title ${escapeShellArg settings.title} "
        + optionalString (settings.image != "") "--image ${escapeShellArg settings.image} "
        + optionalString (settings.imageSize != "large") "--image-size ${settings.imageSize} "
        + toggle "source" settings.source.enable
        + toggle "rss" settings.rss.enable
        + toggle "download" settings.download.enable
        + toggle "index" settings.index.enable
        + toggle "search" settings.search.enable
        + toggle "pager" settings.pager.enable
        + toggle "backlinks" settings.backlinks.enable
        + toggle "toc" settings.toc.enable
        + toggle "position" settings.position.enable
        + optionalString (isString settings.home) "--home ${escapeShellArg settings.home} "
        + optionalString (settings.home == false) "--no-home "
        + optionalString (settings.theme != null) "--theme ${settings.theme} "
        + optionalString (settings.url != null) "--url ${escapeShellArg settings.url} "
        + optionalString (cfg.authFile != null) "--auth-file \"$CREDENTIALS_DIRECTORY/auth\" "
        + optionalString cfg.edit.enable "--edit "
        + optionalString (cfg.edit.enable && cfg.edit.git.enable) "--git "
        + concatMapStrings (host: "--allowed-host ${escapeShellArg host} ") (optionals (cfg.edit.enable || cfg.authFile != null) cfg.edit.allowedHosts)
        + (concatStringsSep " " (map (item: "--link ${escapeShellArg "${item.fab}:${item.url}"}") settings.links));
    };

    systemd.tmpfiles.rules = optional (!cfg.edit.enable && cfg.data == stateDir) "d ${stateDir} 0755 root root -";

    networking.firewall = mkIf cfg.openFirewall {
      allowedTCPPorts = [ cfg.port ];
    };

    users.users = mkIf (cfg.user == "molesk") {
      "molesk" = {
        isSystemUser = true;
        inherit (cfg) group;
      };
    };

    users.groups = mkIf (cfg.group == "molesk") {
      "molesk" = { };
    };
  };
}

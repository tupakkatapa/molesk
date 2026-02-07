{ config
, lib
, pkgs
, ...
}:
with lib; let
  cfg = config.services.molesk;
  settings = cfg.settings;
  molesk = pkgs.callPackage ./package.nix { };
in
{
  options.services.molesk = {
    enable = mkEnableOption "Whether to enable molesk";

    data = mkOption {
      type = types.str;
      default = "/var/lib/molesk";
      description = "Path to markdown file or directory containing markdown files.";
    };

    address = mkOption {
      type = types.str;
      default = "0.0.0.0";
      description = "Host address for the service.";
    };

    port = mkOption {
      type = types.int;
      default = 8080;
      description = "Port number for the service.";
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
        type = types.bool;
        default = true;
        description = "Show source code link in footer.";
      };

      rss.enable = mkOption {
        type = types.bool;
        default = true;
        description = "Show RSS feed link in footer.";
      };

      download.enable = mkOption {
        type = types.bool;
        default = true;
        description = "Show download button on content.";
      };
    };
  };

  config = mkIf cfg.enable {
    systemd.services.molesk = {
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        Restart = "on-failure";

        # Hardening
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        ProtectHome = "read-only";
        PrivateTmp = true;
      };
      script =
        ''
          ${molesk}/bin/molesk ${escapeShellArg cfg.data} \
          --port ${toString cfg.port} \
          --address ${escapeShellArg cfg.address} \
        ''
        + optionalString (settings.title != "") "--title ${escapeShellArg settings.title} "
        + optionalString (settings.image != "") "--image ${escapeShellArg settings.image} "
        + optionalString (!settings.source.enable) "--no-source "
        + optionalString (!settings.rss.enable) "--no-rss "
        + optionalString (!settings.download.enable) "--no-download "
        + (concatStringsSep " " (map (item: "--link ${escapeShellArg "${item.fab}:${item.url}"}") settings.links));
    };

    networking.firewall = mkIf cfg.openFirewall {
      allowedTCPPorts = [ cfg.port ];
    };

    users.users = mkIf (cfg.user == "molesk") {
      "molesk" = {
        isSystemUser = true;
        group = cfg.group;
      };
    };

    users.groups = mkIf (cfg.group == "molesk") {
      "molesk" = { };
    };
  };
}

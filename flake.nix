{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    flake-parts.url = "github:hercules-ci/flake-parts";
    git-hooks.url = "github:cachix/git-hooks.nix";
    git-hooks.inputs.nixpkgs.follows = "nixpkgs";
    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, ... } @inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = inputs.nixpkgs.lib.systems.flakeExposed;
      imports = [
        inputs.git-hooks.flakeModule
        inputs.treefmt-nix.flakeModule
      ];

      perSystem =
        { self'
        , pkgs
        , lib
        , config
        , system
        , ...
        }: {
          # Nix code formatter -> 'nix fmt'
          treefmt.config = {
            projectRootFile = "flake.nix";
            flakeFormatter = true;
            flakeCheck = true;
            settings.global.excludes = [ "tests/golden/*" ];
            programs = {
              nixpkgs-fmt.enable = true;
              deadnix.enable = true;
              statix.enable = true;
              prettier.enable = true;
            };
          };

          # Pre-commit hooks
          pre-commit.check.enable = false;
          pre-commit.settings.hooks = {
            treefmt = {
              enable = true;
              package = config.treefmt.build.wrapper;
            };
            pedantic-oxlint = {
              enable = true;
              entry = "oxlint --deny pedantic --deny complexity";
              files = "\\.(js|ts|jsx|tsx)$";
              pass_filenames = false;
            };
            playwright = {
              enable = true;
              entry = "${pkgs.playwright-test}/bin/playwright test";
              pass_filenames = false;
              files = "\\.(js|ts|jsx|tsx|html|css|md|json)$";
            };
          };

          # Development shell -> 'nix develop' or 'direnv allow'
          devShells.default = pkgs.mkShell {
            packages = with pkgs; [
              yarn
              nodejs
              oxlint
              git
              pre-commit
              playwright-test
            ];
            env = {
              PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
              PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
              PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
            };
            shellHook = config.pre-commit.installationScript;
          };

          checks =
            let
              molesk = self'.packages.molesk;
              scriptOf = services: (inputs.nixpkgs.lib.nixosSystem {
                modules = [
                  self.nixosModules.molesk
                  {
                    nixpkgs.hostPlatform = system;
                    boot.isContainer = true;
                    system.stateVersion = "26.05";
                    services.molesk = { enable = true; } // services;
                  }
                ];
              }).config.systemd.services.molesk.script;
              cases = [
                {
                  services = { };
                  script = "exec ${molesk}/bin/molesk /var/lib/molesk \\\n--port 8080 \\\n--address 0.0.0.0 \\\n";
                }
                {
                  services = {
                    edit.enable = true;
                    edit.allowedHosts = [ "notes.test" ];
                    authFile = "/run/secrets/molesk";
                    edit.git.enable = true;
                    settings = {
                      rss.enable = true;
                      index.enable = false;
                      search.enable = false;
                      imageSize = "small";
                      home = false;
                      theme = "auto";
                      url = "https://notes.test";
                    };
                  };
                  script = "exec ${molesk}/bin/molesk /var/lib/molesk \\\n--port 8080 \\\n--address 127.0.0.1 \\\n--image-size small --rss --no-index --no-search --no-home --theme auto --url https://notes.test --auth-file \"$CREDENTIALS_DIRECTORY/auth\" --edit --git --allowed-host notes.test ";
                }
                {
                  services = {
                    edit.allowedHosts = [ "notes.test" ];
                    authFile = "/run/secrets/molesk";
                    settings = {
                      download.enable = false;
                      pager.enable = false;
                      backlinks.enable = false;
                      toc.enable = false;
                      position.enable = true;
                    };
                  };
                  script = "exec ${molesk}/bin/molesk /var/lib/molesk \\\n--port 8080 \\\n--address 0.0.0.0 \\\n--no-download --no-pager --no-backlinks --no-toc --position --auth-file \"$CREDENTIALS_DIRECTORY/auth\" --allowed-host notes.test ";
                }
              ];
            in
            {
              module-eval = pkgs.runCommand "molesk-module-eval"
                {
                  expected = lib.concatMapStrings (case: case.script + "\n") cases;
                  actual = lib.concatMapStrings (case: scriptOf case.services + "\n") cases;
                  passAsFile = [ "expected" "actual" ];
                } ''diff -u "$expectedPath" "$actualPath" && touch $out'';

              lint = pkgs.runCommand "molesk-lint" { } ''
                cd ${lib.fileset.toSource {
                  root = ./.;
                  fileset = lib.fileset.fileFilter (file: file.hasExt "js" || file.hasExt "mjs") ./.;
                }}
                ${lib.getExe pkgs.oxlint} --deny pedantic --deny complexity
                touch $out
              '';

              size = pkgs.runCommand "molesk-size"
                { closure = pkgs.closureInfo { rootPaths = [ molesk ]; }; }
                ''
                  size=$(du -sk ${molesk} | cut -f1)
                  if [ "$size" -gt 16384 ]; then
                    echo "package is $size KiB, over 16 MiB"
                    exit 1
                  fi
                  if grep -E -- '-nodejs-[0-9]' $closure/store-paths; then
                    echo "closure holds the full nodejs"
                    exit 1
                  fi
                  touch $out
                '';
            } // lib.optionalAttrs pkgs.stdenv.isLinux {
              vm = pkgs.testers.runNixOSTest (import ./tests/module.nix {
                inherit molesk;
                module = self.nixosModules.molesk;
                contents = ./contents;
              });
            };

          # Packages -> 'nix build' or 'nix run'
          packages = {
            molesk = pkgs.callPackage ./package.nix { };
            default = self'.packages.molesk;
          };
        };

      flake = {
        nixosModules = {
          molesk = import ./module.nix;
          default = self.nixosModules.molesk;
        };
      };
    };
}

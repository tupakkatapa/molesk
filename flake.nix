{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-parts.url = "github:hercules-ci/flake-parts";
    git-hooks.url = "github:cachix/git-hooks.nix";
    git-hooks.inputs.nixpkgs.follows = "nixpkgs";
    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";
    playwright.url = "github:pietdevries94/playwright-web-flake/1.55.0";
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
        , inputs'
        , pkgs
        , config
        , ...
        }: {
          # Nix code formatter -> 'nix fmt'
          treefmt.config = {
            projectRootFile = "flake.nix";
            flakeFormatter = true;
            flakeCheck = true;
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
            eslint.enable = true;
            playwright = {
              enable = true;
              entry = "${inputs'.playwright.packages.playwright-test}/bin/playwright test";
              pass_filenames = false;
              files = "\\.(js|ts|jsx|tsx|html|css|md|json)$";
            };
          };

          # Development shell -> 'nix develop' or 'direnv allow'
          devShells.default = pkgs.mkShell {
            packages = with pkgs; [
              yarn
              yarn2nix
              nodejs
              inputs'.playwright.packages.playwright-test
            ];
            env = {
              PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
              PLAYWRIGHT_BROWSERS_PATH = "${inputs'.playwright.packages.playwright-driver.browsers}";
              PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
            };
            shellHook = config.pre-commit.installationScript;
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

#!/usr/bin/env bash
# Run molesk locally with vladof configuration

nix run .# -- \
  /home/kari/nix-config/nixosConfigurations/vladof/services/containers/molesk/contents \
  --port 8080 \
  --address "0.0.0.0" \
  --title "Jesse Karjalainen" \
  --image "/home/kari/nix-config/nixosConfigurations/vladof/services/containers/molesk/contents/profile.jpg" \
  --link "fa-github:https://github.com/tupakkatapa" \
  --link "fa-x-twitter:https://x.com/tupakkatapa" \
  --link "fa-linkedin-in:https://www.linkedin.com/in/jesse-karjalainen-a7bb612b8/" \
  --open

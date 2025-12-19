#!/usr/bin/env bash
# Run coditon-md locally with vladof configuration

nix run .# -- \
  --datadir /home/kari/nix-config/nixosConfigurations/vladof/services/containers/coditon-md/contents \
  --port 8080 \
  --address "0.0.0.0" \
  --name "Jesse Karjalainen" \
  --image "/home/kari/nix-config/nixosConfigurations/vladof/services/containers/coditon-md/contents/profile.jpg" \
  --source "https://github.com/tupakkatapa/coditon-md" \
  --link "fa-github:https://github.com/tupakkatapa" \
  --link "fa-x-twitter:https://x.com/tupakkatapa" \
  --link "fa-linkedin-in:https://www.linkedin.com/in/jesse-karjalainen-a7bb612b8/"

{ stdenv
, lib
, fetchYarnDeps
, yarnConfigHook
, yarn
, nodejs
, nodejs-slim
, makeWrapper
}:
stdenv.mkDerivation (_finalAttrs: {
  pname = "molesk";
  version = "0.1.0";

  src = ./.;

  offlineCache = fetchYarnDeps {
    yarnLock = ./yarn.lock;
    hash = "sha256-B/fJzoRkgNGu2aJyMULpEAF+rVzyRkuIcAnjL8neWAo=";
  };

  # Patched shebangs and the wrapper point at the runtime node, not the
  # build's.
  strictDeps = true;
  nativeBuildInputs = [ yarnConfigHook yarn nodejs makeWrapper ];
  buildInputs = [ nodejs-slim ];

  # No build step: plain Node app served by app.js.
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    # Mermaid is a dev dependency: only its self-contained browser bundle ships
    mermaid=$TMPDIR/mermaid
    mkdir -p $mermaid/dist/chunks
    cp node_modules/mermaid/{package.json,LICENSE} $mermaid/
    cp node_modules/mermaid/dist/mermaid.esm.min.mjs $mermaid/dist/
    cp -r node_modules/mermaid/dist/chunks/mermaid.esm.min $mermaid/dist/chunks/

    yarn install --offline --frozen-lockfile --production --ignore-scripts --no-progress --non-interactive
    cp -r $mermaid node_modules/mermaid

    pushd node_modules
    find highlight.js -mindepth 1 -maxdepth 1 ! -name lib ! -name package.json ! -name styles -exec rm -r {} +
    find highlight.js/styles -mindepth 1 -maxdepth 1 ! -name github.min.css ! -name github-dark.min.css -exec rm -r {} +
    find @fontsource-variable/literata -mindepth 1 -maxdepth 1 ! -name files ! -name package.json ! -name LICENSE -exec rm -r {} +
    find @fontsource-variable/literata/files -type f ! -name 'literata-latin-opsz-*.woff2' ! -name 'literata-latin-ext-opsz-*.woff2' -delete
    find @fortawesome/fontawesome-free -mindepth 1 -maxdepth 1 ! -name css ! -name webfonts ! -name package.json ! -name LICENSE.txt -exec rm -r {} +
    find @fortawesome/fontawesome-free/css -type f ! -name fontawesome.min.css ! -name solid.min.css ! -name regular.min.css ! -name brands.min.css -delete
    find @fortawesome/fontawesome-free/webfonts -type f ! -name 'fa-*.woff2' -delete
    rm -f @fortawesome/fontawesome-free/webfonts/fa-v4compatibility.woff2
    # ejs needs jake, and jake these, only for its command line.
    rm -rf .bin ejs/node_modules jake picocolors filelist minimatch brace-expansion balanced-match async
    rm -f markdown-it/dist/markdown-it.js markdown-it/dist/markdown-it.min.js
    find . -type f \( -name '*.md' -o -name '*.ts' -o -name '*.map' \) -delete
    popd

    mkdir -p $out/lib/molesk
    cp -r app.js lib views public contents package.json node_modules $out/lib/molesk/

    makeWrapper ${lib.getExe nodejs-slim} $out/bin/molesk \
      --add-flags $out/lib/molesk/app.js

    runHook postInstall
  '';

  meta.mainProgram = "molesk";
})

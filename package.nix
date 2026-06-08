{ stdenv
, lib
, fetchYarnDeps
, yarnConfigHook
, nodejs
, makeWrapper
}:
stdenv.mkDerivation (_finalAttrs: {
  pname = "molesk";
  version = "0.1.0";

  src = ./.;

  offlineCache = fetchYarnDeps {
    yarnLock = ./yarn.lock;
    hash = "sha256-5mb7nECeoC8Jl3Z+cm0Bqk4mNn2ldVv+ZTRDpnjj7QM=";
  };

  nativeBuildInputs = [ yarnConfigHook nodejs makeWrapper ];

  # No build step: plain Node app served by app.js.
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/molesk
    cp -r app.js lib views public contents package.json node_modules $out/lib/molesk/

    makeWrapper ${lib.getExe nodejs} $out/bin/molesk \
      --add-flags $out/lib/molesk/app.js

    runHook postInstall
  '';

  meta.mainProgram = "molesk";
})

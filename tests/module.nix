{ molesk, module, contents }:
let
  password = "correct-horse-battery-staple";
in
{
  name = "molesk";

  nodes = {
    published = {
      imports = [ module ];
      services.molesk = {
        enable = true;
        package = molesk;
        data = "${contents}";
        port = 80;
        settings = {
          title = "Test \"site\"";
          url = "https://blog.example";
        };
      };
    };

    editor = { lib, pkgs, ... }: {
      environment.systemPackages = [ pkgs.gitMinimal ];
      imports = [ module ];
      services.molesk = {
        enable = true;
        package = molesk;
        edit.enable = true;
        edit.git.enable = true;
        authFile = "/run/molesk-auth";
      };
      # Started by the test once the password file exists
      systemd.services.molesk.wantedBy = lib.mkForce [ ];
    };
  };

  testScript = ''
    start_all()

    published.wait_for_unit("molesk.service")
    published.wait_for_open_port(80)
    page = published.succeed("curl -sfL localhost/")
    assert "Test &#34;site&#34;" in page, page
    published.succeed("curl -sf localhost/rss.xml | grep '<link>https://blog.example/content/' > /dev/null")
    unit = published.succeed("systemctl show molesk -p RestartUSec -p RequiresMountsFor -p ProtectHome")
    assert "RestartUSec=5s" in unit, unit
    assert "ProtectHome=tmpfs" in unit, unit
    print(published.succeed("systemd-analyze security molesk.service | tail -1"))

    editor.succeed("printf 'me:${password}\\n' > /run/molesk-auth && chmod 600 /run/molesk-auth")
    editor.systemctl("start molesk")
    editor.wait_for_unit("molesk.service")
    editor.wait_for_open_port(8080)
    status = editor.succeed("curl -s -o /dev/null -w '%{http_code}' localhost:8080/")
    assert status == "401", status
    editor.succeed(
      "curl -sf -u 'me:${password}' -X PUT -H 'Content-Type: text/markdown' -H 'If-None-Match: *' "
      "--data-binary '# Hello' localhost:8080/api/files/Hello.md"
    )
    editor.succeed("curl -sf -u 'me:${password}' localhost:8080/content/hello | grep Hello > /dev/null")
    editor.succeed("test -f /var/lib/molesk/Hello.md")
    editor.systemctl("stop molesk")
    commits = editor.succeed("git -c safe.directory=* -C /var/lib/molesk log --format='%an %s'")
    assert "molesk Edit Hello.md" in commits, commits
    editor.fail("journalctl -u molesk | grep -q '${password}'")
  '';
}

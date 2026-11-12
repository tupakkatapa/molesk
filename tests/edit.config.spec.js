import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import cli from "../lib/cli.js";

const resolve = (...args) => cli.parseArgs(cli.defaultConfig(), args);

const optionTable = () => {
  const readme = readFileSync("README.md", "utf8");
  const section = readme.split("## Configuration")[1].split("\n## ")[0];
  return section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) => {
      const [concern, flags, module, readOnly, edit] = line
        .slice(1, -1)
        .split(/(?<!\\)\|/u)
        .map((cell) => cell.trim());
      return { concern, flags, module, readOnly, edit };
    });
};

const toggleName = (flags) => /^`--([a-z]+)` \/ `--no-\1`$/u.exec(flags)?.[1];

test.describe("Option Table", () => {
  const rows = optionTable();

  test("documents every toggle the CLI has", () => {
    const documented = rows.map((row) => toggleName(row.flags));
    for (const name of Object.keys(cli.FEATURES)) {
      expect(documented).toContain(name);
    }
  });

  for (const row of rows.filter((r) => toggleName(r.flags))) {
    const name = toggleName(row.flags);
    test(`${row.concern} defaults match the table`, () => {
      const [key] = cli.FEATURES[name];
      expect(resolve()[key]).toBe(row.readOnly === "on");
      expect(resolve("contents", "--edit")[key]).toBe(row.edit === "on");
    });

    test(`${row.concern} overrides the mode default both ways`, () => {
      const [key] = cli.FEATURES[name];
      expect(resolve(`--no-${name}`)[key]).toBe(false);
      expect(resolve("contents", "--edit", `--${name}`)[key]).toBe(true);
      expect(resolve("contents", "--edit", `--no-${name}`)[key]).toBe(false);
    });
  }

  test("theme defaults match the table", () => {
    const row = rows.find((r) => r.flags.startsWith("`--theme"));
    expect(resolve().THEME).toBe(row.readOnly);
    expect(resolve("contents", "--edit").THEME).toBe(row.edit);
    expect(resolve("--theme", "auto").THEME).toBe("auto");
  });

  test("home is auto unless set or disabled", () => {
    const row = rows.find((r) => r.flags.startsWith("`--home"));
    expect(row.readOnly).toBe("auto");
    expect(resolve().HOME).toBeNull();
    expect(resolve("--home", "About.md").HOME).toBe("About.md");
    expect(resolve("--no-home").HOME).toBe(false);
  });

  test("edit mode has no home unless one is set", () => {
    const row = rows.find((r) => r.flags.startsWith("`--home"));
    expect(row.edit).toBe("none");
    expect(resolve("contents", "--edit").HOME).toBe(false);
    expect(resolve("contents", "--edit", "--home", "About.md").HOME).toBe(
      "About.md",
    );
  });
});

test.describe("Option Validation", () => {
  test("rejects an unknown theme", () => {
    const result = spawnSync("node", ["app.js", "--theme", "blue"], {
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--theme");
  });

  test("help lists every toggle", () => {
    const result = spawnSync("node", ["app.js", "--help"], {
      encoding: "utf8",
    });
    for (const name of Object.keys(cli.FEATURES)) {
      expect(result.stdout).toContain(`--[no-]${name}`);
    }
    expect(result.stdout).toContain("--home");
    expect(result.stdout).toContain("--theme");
  });
});

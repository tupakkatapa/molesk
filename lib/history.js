const fs = require("fs").promises;
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { httpError, resolveWritable } = require("./files");
const { splitFrontMatter } = require("./frontmatter");

const run = promisify(execFile);
const SHA = /^[\da-f]{7,40}$/u;
const MAX_VERSIONS = 50;
const RECORD = "\u001E";
const FIELD = "\u001F";

// Repository settings in the data folder, its hooks and the machine's git
// config never reach these commands: a commit always works and runs nothing.
const SAFE = [
  ["core.hooksPath", "/dev/null"],
  ["core.fsmonitor", "false"],
  ["core.quotePath", "false"],
  ["commit.gpgsign", "false"],
  ["gc.auto", "0"],
  ["gc.autoDetach", "false"],
  ["user.name", "molesk"],
  ["user.email", "molesk@localhost"],
].flatMap(([key, value]) => ["-c", `${key}=${value}`]);

// git pinned to `dir`'s own repository, its commands run one at a time.
function gitIn(dir) {
  const inherited = Object.entries(process.env).filter(
    ([name]) => !name.startsWith("GIT_"),
  );
  const env = {
    ...Object.fromEntries(inherited),
    GIT_DIR: path.join(dir, ".git"),
    GIT_WORK_TREE: dir,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
  };
  const git = async (args, options = {}) =>
    (
      await run("git", [...SAFE, ...args], {
        cwd: dir,
        env: options.env ?? env,
        timeout: options.timeout ?? 10_000,
        maxBuffer: 16 * 1024 * 1024,
      })
    ).stdout;
  let tail = Promise.resolve();
  const serial = (fn) => {
    const next = tail.then(fn);
    tail = next.catch(() => {});
    return next;
  };
  return { env, git, gitDir: env.GIT_DIR, serial };
}

const SLOW = { timeout: 60_000 };

async function commitAll(git, message) {
  await git(["add", "-A"], SLOW);
  const changed = (await git(["diff", "--cached", "--name-only", "-z"]))
    .split("\0")
    .filter(Boolean);
  if (changed.length === 0) return;
  const shown = changed.slice(0, 3).join(", ");
  const more = changed.length > 3 ? ` and ${changed.length - 3} more` : "";
  await git(["commit", "-q", "-m", message ?? `Edit ${shown}${more}`], SLOW);
}

// The repository the data folder already belongs to, found without
// GIT_DIR, or null; the folder must be its top.
async function existingTop({ env, git }, dir) {
  const outer = { ...env };
  delete outer.GIT_DIR;
  delete outer.GIT_WORK_TREE;
  let top = null;
  try {
    top = (await git(["rev-parse", "--show-toplevel"], { env: outer })).trim();
  } catch (err) {
    if (/dubious ownership/u.test(err.stderr ?? "")) {
      throw new Error(`--git: ${err.stderr.trim()}`, { cause: err });
    }
  }
  if (top && (await fs.realpath(top)) !== (await fs.realpath(dir))) {
    throw new Error(
      `--git: ${dir} is inside the repository ${top}; give molesk a folder of its own`,
    );
  }
  return top;
}

async function prepare(repo, dir) {
  try {
    await run("git", ["--version"]);
  } catch {
    throw new Error("--git needs git on PATH");
  }
  if (!(await existingTop(repo, dir))) {
    await repo.git(["init", "-q"]);
    await fs.appendFile(
      path.join(repo.gitDir, "info", "exclude"),
      "\n.trash/\n.molesk-*\n",
    );
  }
  const lock = path.join(repo.gitDir, "index.lock");
  if (
    await fs.rm(lock).then(
      () => true,
      () => false,
    )
  ) {
    console.warn(`Removed a stale ${lock}`);
  }
  await repo.serial(() => commitAll(repo.git, "molesk: snapshot at start"));
}

const parseLog = (out, rel) =>
  out
    .split(RECORD)
    .filter(Boolean)
    .map((record) => {
      const [head, ...names] = record.split("\n").filter(Boolean);
      const [commit, date, subject] = head.split(FIELD);
      return { commit, date, subject, path: names[0] ?? rel };
    });

// Versions of `rel`, newest first, across renames.
const logOf = (repo, rel) =>
  repo
    .serial(() =>
      repo.git([
        "--no-optional-locks",
        "log",
        "--follow",
        `-n${MAX_VERSIONS}`,
        `--format=${RECORD}%H${FIELD}%cI${FIELD}%s`,
        "--name-only",
        "--",
        rel,
      ]),
    )
    .then(
      (out) => parseLog(out, rel),
      () => [],
    );

// The text of `rel` at `commit`, or null.
const textAt = (repo, rel, commit) =>
  SHA.test(commit)
    ? repo
        .serial(() =>
          repo.git(["--no-optional-locks", "show", `${commit}:${rel}`]),
        )
        .catch(() => null)
    : Promise.resolve(null);

// Edits are committed to the data folder's own repository 30 s after the
// last one, and at most 5 min after the first. A failure never fails a
// save; it pauses history until a commit works again.
function createHistory(dir, { quietMs = 30_000, maxMs = 300_000 } = {}) {
  const repo = gitIn(dir);
  const state = { timer: null, firstAt: null, error: null };

  const flush = (message) => {
    clearTimeout(state.timer);
    state.timer = null;
    state.firstAt = null;
    return repo
      .serial(() => commitAll(repo.git, message))
      .then(
        () => {
          state.error = null;
        },
        (err) => {
          const reason = (err.stderr || err.message).trim();
          if (reason !== state.error)
            console.error(`History paused: ${reason}`);
          state.error = reason;
        },
      );
  };

  const touch = () => {
    const now = Date.now();
    state.firstAt ??= now;
    clearTimeout(state.timer);
    const wait = Math.max(0, Math.min(quietMs, state.firstAt + maxMs - now));
    state.timer = setTimeout(flush, wait);
  };

  const versions = async (rel) => {
    await flush();
    return { versions: await logOf(repo, rel), error: state.error };
  };

  return {
    flush,
    start: () => prepare(repo, dir),
    textAt: (rel, commit) => textAt(repo, rel, commit),
    touch,
    versions,
  };
}

const historyHandler = (config, history) => async (req, res) => {
  await resolveWritable(config.CONTENTS_DIR, req.params.path);
  if (req.query.at === undefined) {
    res.json(await history.versions(req.params.path));
    return;
  }
  const text = await history.textAt(req.params.path, String(req.query.at));
  if (text === null) throw httpError(404, "No such version");
  res.json({ body: splitFrontMatter(text).body });
};

module.exports = { createHistory, historyHandler };

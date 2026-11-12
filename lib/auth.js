const crypto = require("crypto");
const fs = require("fs");

const MIN_PASSWORD = 15;
const HASHED = /^(?:\$[a-z\d-]+\$|\{SHA\})/iu;
const digest = (text) => crypto.createHash("sha256").update(text).digest();

// The `user:password` lines of an auth file as digests; throws a message
// naming the line for anything else. Blank lines and `#` comments are
// skipped; a password may hold `:`.
function readAuthFile(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    throw new Error(`Cannot read --auth-file ${file}: ${err.code}`, {
      cause: err,
    });
  }
  const users = new Set();
  const entries = [];
  for (const [i, raw] of text.split("\n").entries()) {
    const line = raw.replace(/\r$/u, "");
    if (!line.trim() || line.startsWith("#")) continue;
    const where = `--auth-file line ${i + 1}`;
    const split = line.indexOf(":");
    const user = line.slice(0, split);
    const password = line.slice(split + 1);
    if (split <= 0 || !password) {
      throw new Error(`${where}: expected user:password`);
    }
    if (HASHED.test(password)) {
      throw new Error(
        `${where}: hashed passwords aren't supported; write user:password in a file only the service can read`,
      );
    }
    if (password.length < MIN_PASSWORD) {
      throw new Error(
        `${where}: the password is shorter than ${MIN_PASSWORD} characters; generate one, e.g. openssl rand -base64 24`,
      );
    }
    if (users.has(user)) throw new Error(`${where}: ${user} is listed twice`);
    users.add(user);
    entries.push(digest(`${user}:${password}`));
  }
  if (entries.length === 0) {
    throw new Error(`--auth-file ${file} has no user:password lines`);
  }
  return entries;
}

// HTTP Basic auth against the digests from readAuthFile. Every entry is
// compared, in constant time, so the time taken says nothing about which.
function basicAuth(entries) {
  return (req, res, next) => {
    const header = /^Basic\s+([A-Za-z\d+/=]+)$/iu.exec(
      req.get("Authorization") ?? "",
    );
    if (header) {
      const given = digest(Buffer.from(header[1], "base64").toString("utf8"));
      let match = false;
      for (const entry of entries) {
        match = crypto.timingSafeEqual(given, entry) || match;
      }
      if (match) return next();
      console.warn(`auth failed from ${req.ip}`);
    }
    res
      .status(401)
      .set("WWW-Authenticate", 'Basic realm="molesk", charset="UTF-8"')
      .type("text")
      .send("Sign in required. Reload to try again.");
  };
}

const LOOPBACK_NAMES = ["localhost", "127.0.0.1", "::1"];

const hostName = (host) => {
  const name = host.startsWith("[")
    ? host.slice(1, host.indexOf("]"))
    : host.split(":")[0];
  return name.toLowerCase();
};

// A page that re-resolves its own name to this machine (DNS rebinding) is
// same-origin with the editor; only the Host it sends gives it away.
function knownHost(allowedHosts) {
  const allowed = new Set(
    [...LOOPBACK_NAMES, ...allowedHosts].map((host) => host.toLowerCase()),
  );
  return (req, res, next) => {
    const host = req.get("Host");
    if (!host || allowed.has(hostName(host))) return next();
    res
      .status(421)
      .type("text")
      .send("Unknown host name; add it with --allowed-host");
  };
}

module.exports = { basicAuth, knownHost, readAuthFile };

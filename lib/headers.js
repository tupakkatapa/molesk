const crypto = require("crypto");

// The default ETag is built from size and mtime, and every file in the Nix
// store has the same mtime: the version and install path tell builds apart.
function staticOptions(root, version, maxAge = 0) {
  const hash = crypto.createHash("sha256").update(root).digest("hex");
  const build = `${version}-${hash.slice(0, 8)}`;
  return {
    maxAge,
    lastModified: false,
    setHeaders: (res, _file, stat) => {
      res.setHeader("ETag", `W/"${build}-${stat.size.toString(16)}"`);
    },
  };
}

// Security: CSP and other security headers
function securityHeaders(req, res, next) {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
      // unsafe-inline: markdown-it writes table alignment as style attributes
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; " +
      "object-src 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self'; " +
      "frame-ancestors 'none';",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  next();
}

module.exports = { securityHeaders, staticOptions };

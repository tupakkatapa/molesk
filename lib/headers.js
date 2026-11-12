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

module.exports = { securityHeaders };

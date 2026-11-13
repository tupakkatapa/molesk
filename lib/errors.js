const { ERROR_MESSAGES } = require("./helpers");
const { md } = require("./markdown");
const { renderPage, sidebarOf } = require("./shell");

const notFoundHandler = (req, res, next) => {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
};

// Client errors marked `expose` show their own message.
function statusAndMessage(err) {
  const status = err.code === "ENOENT" ? 404 : err.status || 500;
  if (status === 404) return [status, ERROR_MESSAGES.NOT_FOUND];
  const exposed = err.expose && status < 500;
  return [status, exposed ? err.message : ERROR_MESSAGES.GENERIC_ERROR];
}

async function handleError(req, res, err, config) {
  const [statusCode, message] = statusAndMessage(err);
  console.error(
    statusCode >= 500 ? err : `${statusCode} ${req.method} ${req.originalUrl}`,
  );
  let sidebar = { tree: [], sidebarTags: [] };
  try {
    sidebar = await sidebarOf(config);
  } catch (e) {
    console.error("Failed to build the sidebar for an error page:", e);
  }
  res.status(statusCode);
  await renderPage(
    config,
    res,
    {
      initialContent: md.render(message),
      pageTitle: `${statusCode} - ${config.TITLE}`,
      heading: statusCode === 404 ? "Not found" : "Error",
    },
    sidebar,
  );
}

function setupErrorHandlers(app, config) {
  app.use(notFoundHandler);
  app.use(async (err, req, res, _next) => {
    await handleError(req, res, err, config);
  });
}

module.exports = { setupErrorHandlers };

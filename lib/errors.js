const { ERROR_MESSAGES } = require("./helpers");
const { md } = require("./markdown");
const { generateFolderStructure } = require("./content");

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

async function handleError(res, err, config) {
  console.error(err);
  const [statusCode, message] = statusAndMessage(err);
  let tree = [];
  try {
    tree = await generateFolderStructure(config);
  } catch (e) {
    console.error("Failed to generate folder structure for error page:", e);
  }
  res.status(statusCode).render("index", {
    tree,
    initialContent: md.render(message),
    pageTitle: `${statusCode} - ${config.TITLE}`,
    heading: statusCode === 404 ? "Not found" : "Error",
  });
}

function setupErrorHandlers(app, config) {
  app.use(notFoundHandler);
  app.use(async (err, _req, res, _next) => {
    await handleError(res, err, config);
  });
}

module.exports = { setupErrorHandlers };

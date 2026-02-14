const { ERROR_MESSAGES } = require("./helpers");
const { md } = require("./markdown");
const { generateFolderStructure } = require("./content");

const notFoundHandler = (req, res, next) => {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
};

async function handleError(res, err, config) {
  console.error(err);
  let statusCode = err.status || 500;
  let message;
  if (statusCode === 404 || err.code === "ENOENT") {
    statusCode = 404;
    message = ERROR_MESSAGES.NOT_FOUND;
  } else if (
    err.message &&
    err.message.includes("Unsupported file extension")
  ) {
    statusCode = 400;
    message = ERROR_MESSAGES.UNSUPPORTED_FILE;
  } else {
    message = ERROR_MESSAGES.GENERIC_ERROR;
  }
  const markdownError = md.render(message);
  let folderStructure = "<ul></ul>";
  try {
    folderStructure = await generateFolderStructure(
      config.CONTENTS_DIR,
      config.CONTENTS_DIR,
    );
  } catch (e) {
    console.error("Failed to generate folder structure for error page:", e);
  }
  res.status(statusCode).render("index", {
    folderStructure,
    initialContent: markdownError,
    title: config.TITLE,
    image: config.IMAGE,
    socialLinks: config.SOCIAL_LINKS,
    sourceLink: config.SHOW_SOURCE ? config.SOURCE_LINK : null,
    showRss: config.SHOW_RSS,
    showDownload: config.SHOW_DOWNLOAD,
    pageTitle: statusCode.toString() + " - " + config.TITLE,
  });
}

function setupErrorHandlers(app, config) {
  app.use(notFoundHandler);
  // eslint-disable-next-line max-params
  const handler = async (err, _req, res, _next) => {
    await handleError(res, err, config);
  };
  app.use(handler);
}

module.exports = { setupErrorHandlers };

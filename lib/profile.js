const express = require("express");
const fs = require("fs").promises;

const imageType = (file) => {
  const type = express.static.mime.lookup(file);
  return type.startsWith("image/") ? type : "image/png";
};

// The profile image, read once, and the round favicon cut from it.
let profile = null;
async function profileImage(config) {
  if (!profile) {
    const data = await fs.readFile(config.IMAGE);
    const type = imageType(config.IMAGE);
    const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs>
<image href="data:${type};base64,${data.toString("base64")}" width="100" height="100" clip-path="url(#c)" preserveAspectRatio="xMidYMid slice"/>
</svg>`;
    profile = { data, type, favicon };
  }
  return profile;
}

async function serveProfilePic(config, req, res) {
  if (!config.IMAGE) return res.status(404).send("Image not found");
  const { data, type } = await profileImage(config);
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(data);
}

async function serveFavicon(config, req, res) {
  if (!config.IMAGE) return res.status(404).send("Favicon not found");
  const { favicon } = await profileImage(config);
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(favicon);
}

module.exports = { serveFavicon, serveProfilePic };

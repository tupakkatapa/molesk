import { randomUUID } from "node:crypto";
import { downloadHref, editHref } from "../public/slug.mjs";

export const unique = () => `ui-${randomUUID().slice(0, 8)}`;

export const create = (request, file, data) =>
  request.put(`/api/files/${file}`, {
    headers: { "Content-Type": "text/markdown", "If-None-Match": "*" },
    data,
  });

export const openNote = async (page, request, text, folder = "") => {
  const file = `${folder}${unique()}.md`;
  const created = await create(request, file, text);
  await page.goto(editHref(file));
  return { file, etag: created.headers().etag };
};

export const serverText = async (request, file) =>
  (await request.get(downloadHref(file))).text();

export const holdSaves = async (page, file) => {
  const puts = [];
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/files/${file}`, async (route) => {
    if (route.request().method() === "PUT") {
      puts.push({
        body: route.request().postData(),
        ifMatch: route.request().headers()["if-match"],
      });
      await held;
    }
    await route.continue();
  });
  return { puts, release };
};

export const dialogTypes = (page) => {
  const types = [];
  page.on("dialog", (dialog) => {
    types.push(dialog.type());
    dialog.dismiss();
  });
  return types;
};

export const status = (page) => page.locator("#editor .editor-status");
export const textarea = (page) => page.locator("#editor textarea");

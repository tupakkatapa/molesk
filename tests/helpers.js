import { expect } from "@playwright/test";

export async function openNav(page) {
  const menu = page.locator("#menuToggle");
  if (await menu.isVisible()) {
    await menu.click();
    await expect(page.locator(".sidebar")).not.toHaveClass(/collapsed/u);
  }
}

export const folderItem = (page, name) =>
  page
    .locator(".sidebar li.folder", {
      has: page.locator("> .tree-row", { hasText: name }),
    })
    .first();

export const folderRow = (page, name) =>
  folderItem(page, name).locator("> .tree-row");

export async function openFolder(page, name) {
  const row = folderRow(page, name);
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
}

export async function clickNavLink(page, folder, name) {
  await openNav(page);
  await openFolder(page, folder);
  await folderItem(page, folder).locator("a", { hasText: name }).click();
}

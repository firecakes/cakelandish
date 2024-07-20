// responsible for syncing and management of data under static folder and database.json
import { setPages } from "./db.ts";
import { logger } from "./log.ts";

export const EDITABLE_EXTENSIONS = ["html", "css", "js", "txt"];
const BLACKLISTED_FOLDERS = ["archive", "lib", "posts", "tmp"];
const IMPORTANT_FILES = [ // files the user should really not mess with unless they know what they're doing
  "components", // this is a directory, technically.
  "curssor", // this is a directory, technically.
  "feed.atom",
  "eye-open.png",
  "eye-closed.png",
  "feed-extras.png",
  "favicon.ico",
  "admin.html",
  "index.html",
  "layout.html",
  "login.html",
  "main.css",
  "manage.html",
  "pages.html",
  "upload.html",
  "404.html",
  "util.js",
].map((f) => `static/${f}`);

export async function parseStaticFolder() {
  try {
    const staticDirectory = await readDir("static", []);
    await setPages(staticDirectory);
  } catch (err) {
    logger.error("Error parsing static folder!");
    logger.error(err);
  }
}

async function readDir(directory, files) {
  for await (const file of Deno.readDir(directory)) {
    const fullPath = `${directory}/${file.name}`;
    const noStaticPath = fullPath.startsWith("static/")
      ? fullPath.split("static/")[1]
      : fullPath;

    if (file.isFile) {
      let isEditable = isEditableExtension(fullPath);
      files.push({
        url: noStaticPath,
        content: isEditable ? await Deno.readTextFile(fullPath) : null, // don't store content in database that isn't editable by the user
        directory: null,
        isImportant: IMPORTANT_FILES.includes(fullPath),
        extension: fullPath.split(".").pop(),
        editable: isEditable,
      });
    }

    if (file.isDirectory && !isBlacklistedPath(fullPath)) {
      const contents = await readDir(fullPath, []);
      files.push({
        url: noStaticPath,
        content: null,
        directory: contents,
        isImportant: IMPORTANT_FILES.includes(fullPath),
        extension: null,
        editable: true,
      });
    }
  }
  return files;
}

export function isEditableExtension(name) {
  return EDITABLE_EXTENSIONS.includes(name.split(".").pop());
}

export function isBlacklistedPath(name) {
  return BLACKLISTED_FOLDERS.includes(name.split("/")[1]);
}

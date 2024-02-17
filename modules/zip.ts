import { copyDirectory, tar } from "../deps.ts";
import { refreshFeedIntervals } from "./db.ts";
import * as xml from "./xml.ts";

const EXPORTED_ZIP_NAME = "exported.tar";

export async function exportData() {
  try {
    await Deno.remove("exported", { recursive: true });
  } catch (err) {
    // didn't exist in the first place. fine
  }

  await Deno.mkdir("exported", { recursive: true });
  await Deno.mkdir("static/posts", { recursive: true });
  await Deno.mkdir("static/files", { recursive: true });
  await Deno.mkdir("static/pages", { recursive: true });

  // move content to the exported folder and then tar it
  await copyDirectory(
    "static/posts",
    "exported/posts",
  );
  await copyDirectory(
    "static/files",
    "exported/files",
  );
  await copyDirectory(
    "static/pages",
    "exported/pages",
  );
  await Deno.copyFile("database.json", "exported/database.json");
  await tar.compress("exported", EXPORTED_ZIP_NAME);
  await Deno.remove("exported", { recursive: true });

  return EXPORTED_ZIP_NAME;
}

export async function importData(tarLocation) {
  let locationPrefix = "static/tmp/exported";
  await tar.uncompress(tarLocation, `static/tmp/`);

  await Deno.remove(
    "static/posts",
    { recursive: true },
  );
  await Deno.remove(
    "static/files",
    { recursive: true },
  );
  await Deno.remove(
    "static/pages",
    { recursive: true },
  );

  // move content from the imported folder
  await copyDirectory(
    `${locationPrefix}/posts`,
    "static/posts",
  );
  await copyDirectory(
    `${locationPrefix}/files`,
    "static/files",
  );
  await copyDirectory(
    `${locationPrefix}/pages`,
    "static/pages",
  );
  await Deno.copyFile(`${locationPrefix}/database.json`, "database.json");

  await Deno.remove(
    locationPrefix,
    { recursive: true },
  );

  // generate a new ATOM feed from database contents
  await xml.saveJsonToAtom();

  // force the feeds to refresh
  await refreshFeedIntervals();
}

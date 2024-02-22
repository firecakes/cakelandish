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
  try {
    // remove any existing tar file to prevent interference with newly created tars
    await Deno.remove("exported.tar", { recursive: true });
  } catch (err) {
    // didn't exist in the first place. fine
  }

  await Deno.mkdir("exported", { recursive: true });

  // move content to the exported folder and then tar it
  await copyDirectory(
    "static",
    "exported/static",
  );
  await Deno.copyFile("database.json", "exported/database.json");
  await tar.compress("exported", EXPORTED_ZIP_NAME);
  await Deno.remove("exported", { recursive: true });

  return EXPORTED_ZIP_NAME;
}

export async function importData(tarLocation) {
  let locationPrefix = "tmp/exported";

  await Deno.mkdir("tmp", { recursive: true });
  await tar.uncompress(tarLocation, `tmp/`);

  await Deno.remove(
    "static",
    { recursive: true },
  );

  // move content from the imported folder
  await copyDirectory(
    `${locationPrefix}/static`,
    "static",
  );
  await Deno.copyFile(`${locationPrefix}/database.json`, "database.json");

  await Deno.remove(
    "tmp",
    { recursive: true },
  );

  // generate a new ATOM feed from database contents
  await xml.saveJsonToAtom();

  // force the feeds to refresh
  await refreshFeedIntervals();
}

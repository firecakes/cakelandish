import { copyDirectory, tar } from "../deps.ts";

const EXPORTED_ZIP_NAME = "exported.tar";

export async function exportData() {
  try {
    await Deno.remove("exported", { recursive: true });
  } catch (err) {
    // didn't exist in the first place. fine
  }

  await Deno.mkdir("exported", { recursive: true });
  await Deno.mkdir("static/files", { recursive: true });

  // move content to the exported folder and then tar it
  await copyDirectory(
    "static/posts",
    "exported/posts",
  );
  await copyDirectory(
    "static/files",
    "exported/files",
  );
  await Deno.copyFile("database.json", "exported/database.json");
  await tar.compress("exported", EXPORTED_ZIP_NAME);

  return EXPORTED_ZIP_NAME;
}

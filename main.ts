import * as xml from "./modules/xml.ts";
import * as db from "./modules/db.ts";
import { startServer } from "./modules/server.ts";
import { generateCode, generateJwtSecret, deleteCode } from "./modules/auth.ts";

if (Deno.args[0] === "code") { // create temporary auth code
  console.log(
    "Authorization code generated. Paste the code below into your browser when asked to sign into the server.",
  );
  console.log("Code will expire in 20 minutes or once code is used.");
  console.log(
    "Please do not stop this program unless you have completed authentication.",
  );
  console.log(await generateCode(20));
} else { // no special arguments. run server normally
  console.log("Starting server");
  await deleteCode(); // delete potentially lingering auth code
  // creates a JWT secret for signing if one doesn't exist already
  await generateJwtSecret();
  // starts the web server. this must run before initializing the database in case
  // we are querying a feed from the server itself
  startServer();
  // initialize a database if it doesn't exist yet
  console.log("Initializing database...");
  await db.init();
  console.log("Database ready");
  // generate and save the ATOM feed from the database contents
  await xml.saveJsonToAtom();
  // initialize feeds after generating XML. default local feed tries to read the feed file and fails otherwise
  await db.initializeFeeds(await db.readDb());
}

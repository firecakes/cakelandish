import * as xml from "./modules/xml.ts";
import * as db from "./modules/db.ts";
import { parseStaticFolder } from "./modules/static.ts";
import { startServer } from "./modules/server.ts";
import { generateCode, generateJwtSecret, deleteCode, setJwtSecret } from "./modules/auth.ts";
import { logger } from "./modules/log.ts";

if (Deno.args[0] === "code") { // create temporary auth code
  logger.info(
    "Authorization code generated. Paste the code below into your browser when asked to sign into the server.",
  );
  logger.warn("Code will expire in 20 minutes or once code is used.");
  logger.warn(
    "Please do not stop this program unless you have completed authentication.",
  );
  await generateCode(20);
  Deno.exit(); // because having startServer() in the else branch keeps the process running somehow....?
} else if (Deno.args[0] === "keepalive") { // keepalive parent processor is being used. let it handle JWT secret storing
  logger.info("Starting server in keepalive mode");
  await deleteCode(); // delete potentially lingering auth code
  // this mode relies on the parent process to write a raw key to read from
  const exportedKeyBuffer = await Deno.readFile("key");
  await Deno.remove("key");
  setJwtSecret(await crypto.subtle.importKey("raw", exportedKeyBuffer, { name: "HMAC", hash: "SHA-512" }, true, ["sign", "verify"]));
  // creates a tmp directory if one does not already exist
  await Deno.mkdir(
    `static/tmp/`,
    { recursive: true },
  );
  // starts the web server. this must run before initializing the database in case
  // we are querying a feed from the server itself
  startServer();
  // initialize a database if it doesn't exist yet
  logger.info("Initializing database...");
  await db.init();
  logger.info("Database ready. Generating feeds...");
  // generate and save the ATOM feed from the database contents
  await xml.saveJsonToAtom();
  logger.info("Feeds ready. Synchronizing database with static contents...");
  // read static folder contents and update database with the changes
  await parseStaticFolder();
  logger.info("Synchronization complete. Cakelandish ready for use!");
} else { // no special arguments. run server normally
  logger.info("Starting server");
  await deleteCode(); // delete potentially lingering auth code
  // creates a JWT secret for signing if one doesn't exist already
  await generateJwtSecret();
  // creates a tmp directory if one does not already exist
  await Deno.mkdir(
    `static/tmp/`,
    { recursive: true },
  );
  // starts the web server. this must run before initializing the database in case
  // we are querying a feed from the server itself
  startServer();
  // initialize a database if it doesn't exist yet
  logger.info("Initializing database...");
  await db.init();
  logger.info("Database ready. Generating feeds...");
  // generate and save the ATOM feed from the database contents
  await xml.saveJsonToAtom();
  logger.info("Feeds ready. Synchronizing database with static contents...");
  // read static folder contents and update database with the changes
  await parseStaticFolder();
  logger.info("Synchronization complete. Cakelandish ready for use!");
}


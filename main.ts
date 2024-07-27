import * as xml from "./modules/xml.ts";
import * as db from "./modules/db.ts";
import { convertStringToUint8 } from "./modules/utils.ts";
import { parseStaticFolder } from "./modules/static.ts";
import { startServer } from "./modules/server.ts";
import { logger } from "./modules/log.ts";
import { generateJwtSecret, initAuth, setJwtSecret } from "./modules/auth.ts";
import { config } from "./config.ts";
import { OTPAuth } from "./deps.ts";

if (Deno.args[0] === "code") { // create temporary auth code
  const result = await fetch(`http://localhost:${config.port}/api/code`);
  if (config.useBasicAuthCode) {
    const code = (await result.json()).code;
    logger.info(
      "Authorization mode active. Input the following code into the login form",
    );
    logger.warn(
      "Authorization mode will expire in 10 minutes or once log in succeeds.",
    );
    console.log(code);
  } else {
    logger.info(
      "Authorization mode active. Use your authenticator app to input the code into the login form.",
    );
    logger.warn(
      "Authorization mode will expire in 10 minutes or once log in succeeds.",
    );
  }
  Deno.exit(); // because having startServer() in the else branch keeps the process running somehow....?
} else if (Deno.args[0] === "keepalive") { // keepalive parent processor is being used. let it handle JWT secret storing
  // this mode relies on the parent process to pass a raw key and OTP secret to read from
  const restoredKeyBuffer = convertStringToUint8(Deno.args[1]);
  const restoredOtpSecretString = convertStringToUint8(Deno.args[2]);
  const restoredOtpSecret = new OTPAuth.Secret({
    buffer: restoredOtpSecretString,
  });

  logger.info("Starting server in keepalive mode");
  initAuth(restoredOtpSecret);
  setJwtSecret(
    await crypto.subtle.importKey(
      "raw",
      restoredKeyBuffer,
      { name: "HMAC", hash: "SHA-512" },
      true,
      ["sign", "verify"],
    ),
  );
  initCakelandish();
} else { // no special arguments. run server normally
  logger.info("Starting server");
  initAuth();
  // creates a JWT secret for signing if one doesn't exist already
  await generateJwtSecret();
  initCakelandish();
}

async function initCakelandish() {
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

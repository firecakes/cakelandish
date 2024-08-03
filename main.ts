import * as xml from "./modules/xml.ts";
import * as db from "./modules/db.ts";
import { parseStaticFolder } from "./modules/static.ts";
import { startServer } from "./modules/server.ts";
import { logger } from "./modules/log.ts";
import { generateJwtSecret, initAuth, setJwtSecret } from "./modules/auth.ts";
import { getCodeFromSocket, openSocket } from "./modules/socket.ts";
import { config } from "./config.ts";
import { OTPAuth } from "./deps.ts";

if (Deno.args[0] === "code") { // create temporary auth code
  if (config.jwt) {
    const code = await getCodeFromSocket();
    if (config.useBasicAuthCode) {
      logger.info(
        "Authorization mode active. Input the following code into the login form",
      );
      console.log(code);
    } else {
      logger.info(
        "Authorization mode active. Use your authenticator app to input the code into the login form.",
      );
    }
    logger.warn(
      "Authorization mode will expire in 10 minutes or once log in succeeds.",
    );
  }
  Deno.exit(); // because having startServer() in the else branch keeps the process running somehow....?
} else if (Deno.args[0] === "keepalive") { // keepalive parent processor is being used. let it handle JWT secret storing
  // this mode relies on the parent process to pass a raw key and OTP secret to read from
  // starts the unix socket server
  // waits for secret input from the keepalive process first
  logger.info("Starting server in keepalive mode.");

  if (config.jwt) {
    logger.info("Waiting for keepalive process input...");
    const { keyBuffer, otpSecret } = await openSocket(true);
    const restoredOtpSecret = new OTPAuth.Secret({
      buffer: otpSecret,
    });

    initAuth(restoredOtpSecret);
    setJwtSecret(
      await crypto.subtle.importKey(
        "raw",
        keyBuffer,
        { name: "HMAC", hash: "SHA-512" },
        true,
        ["sign", "verify"],
      ),
    );
    logger.info("Input received");
  }

  initCakelandish();
} else { // no special arguments. run server normally
  logger.info("Starting server");
  initAuth();
  // creates a JWT secret for signing if one doesn't exist already
  await generateJwtSecret();
  if (config.jwt) {
    // starts the unix socket server
    // used purely for verifying a user owns the server by using sockets to activate authentication
    await openSocket(false);
  }
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

// not useful in "dev" mode, or when running with Deno. This program requires the Cakelandish executable to be on the same directory
// deno compile --target x86_64-unknown-linux-gnu --output keepalive-linux-x86_64 --no-check --allow-read --allow-run --allow-write --allow-env keepalive.ts
// deno compile --target x86_64-pc-windows-msvc --output keepalive-windows-x86_64 --no-check --allow-read --allow-run --allow-write --allow-env keepalive.ts
// deno compile --target x86_64-apple-darwin --output keepalive-mac-x86_64 --no-check --allow-read --allow-run --allow-write --allow-env keepalive.ts
// deno run --allow-read --allow-run --allow-write --allow-env keepalive.ts
import { generateJwtSecret, getJwtSecret } from "./modules/auth.ts";
import { logger } from "./modules/log.ts";
import { OTPAuth } from "./deps.ts";
import { putSecretDataToSocket } from "./modules/socket.ts";

async function keepAlive(keyBuffer, otpSecret) {
  const command = new Deno.Command("./Cakelandish", {
    args: [
      "keepalive",
    ],
  });
  const child = command.spawn();

  // use polling to send the secret data through sockets
  let success = false;
  while (!success) {
    try {
      await putSecretDataToSocket(keyBuffer, otpSecret);
      success = true;
    } catch (err) {
    }
    await new Promise((resolve) => setTimeout(resolve, 250)); // try every 1/4 second
  }

  await child.status;
}

async function main() {
  await generateJwtSecret(); // generate only once
  let rawKey = await crypto.subtle.exportKey("raw", getJwtSecret());
  const exportedKeyBuffer = new Uint8Array(rawKey);
  const otpSecret = new OTPAuth.Secret(); // generate only once
  // force Cakelandish to always stay running
  while (true) {
    logger.info("kick");
    await keepAlive(exportedKeyBuffer, otpSecret);
  }
}
main();

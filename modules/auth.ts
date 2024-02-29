import { cryptoRandomString, jwt, timingSafeEqual } from "../deps.ts";
import { config } from "../config.ts";

let jwtAccessKey;

// generates a temporarily usable code that can be used in the browser to authenticate it with this server
export async function generateCode(minutes = 20) {
  const code = cryptoRandomString({
    length: config.serverCodeLength,
    type: "hex",
  });

  // write one code to this file that the server can read from
  await Deno.writeTextFile("code.txt", code);

  console.log(code);
  await new Promise((resolve) => setTimeout(deleteCode, minutes * 60 * 1000));
}

// removes the code file immediately
export async function deleteCode() {
  // delete the code.txt file
  try {
    await Deno.remove("code.txt");
  } catch (err) {
  }
}

// generates a secret string for use with JWT signing for access and refresh tokens
export async function generateJwtSecret() {
  jwtAccessKey = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-512" },
    true,
    ["sign", "verify"],
  );
}

// generates an access JWT for an authorized user
export async function generateJwtAccessToken() {
  const token = await jwt.create({ alg: "HS512", typ: "JWT" }, {
    exp: jwt.getNumericDate(86400 * config.refreshTokenDays), // configurable lifespan. defaults to 2 months.
  }, jwtAccessKey);
  return {
    token: token,
    expiry: 86400 * 1000 * config.refreshTokenDays,
  };
}

// verifies an access JWT for an authorized user
export async function verifyJwtAccessToken(token) {
  return await jwt.verify(token, jwtAccessKey);
}

// safely compares two strings to avoid timing attacks
export function compareStrings(a, b) {
  return timingSafeEqual(
    new TextEncoder().encode(a),
    new TextEncoder().encode(b),
  );
}

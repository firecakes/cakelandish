import { cryptoRandomString, jwt, timingSafeEqual } from "../deps.ts";
import { config } from "../config.ts";

let jwtAccessKey;
let jwtRefreshKey;

// generates a temporarily usable code that can be used in the browser to authenticate it with this server
export async function generateCode(minutes = 20) {
  const code = cryptoRandomString({
    length: config.serverCodeLength,
    type: "hex",
  });

  // write one code to this file that the server can read from
  await Deno.writeTextFile("code.txt", code);

  setTimeout(() => deleteCode, minutes * 60 * 1000);
  return code;
}

// removes the code file immediately
export async function deleteCode() {
  // delete the code.txt file
  try {
    Deno.remove("code.txt");
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
  jwtRefreshKey = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-512" },
    true,
    ["sign", "verify"],
  );
}

// generates an access JWT for an authorized user
export async function generateJwtAccessToken() {
  const token = await jwt.create({ alg: "HS512", typ: "JWT" }, {
    exp: jwt.getNumericDate(60), // one minute lifespan
  }, jwtAccessKey);
  return token;
}

// generates a refresh JWT for an authorized user
export async function generateJwtRefreshToken() {
  const token = await jwt.create({ alg: "HS512", typ: "JWT" }, {
    exp: jwt.getNumericDate(86400 * config.refreshTokenDays), // configurable lifespan. defaults to 2 months.
  }, jwtRefreshKey);
  return token;
}

// verifies an access JWT for an authorized user
export async function verifyJwtAccessToken(token) {
  return await jwt.verify(token, jwtAccessKey);
}

// verifies a refresh JWT for an authorized user
export async function verifyJwtRefreshToken(token) {
  return await jwt.verify(token, jwtRefreshKey);
}

// safely compares two strings to avoid timing attacks
export function compareStrings(a, b) {
  return timingSafeEqual(
    new TextEncoder().encode(a),
    new TextEncoder().encode(b),
  );
}

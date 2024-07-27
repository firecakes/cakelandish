import { config } from "../config.ts";
import { cryptoRandomString, jwt, timingSafeEqual } from "../deps.ts";
import { logger } from "./log.ts";
import { OTPAuth, qrcode } from "../deps.ts";

let jwtAccessKey;
let authActive = false;
let totp;
let code = null;

// initialize authentication measures
// if secret is passed in, use that instead of generating a random secret
export function initAuth(secret) {
  if (config.jwt && !config.useBasicAuthCode) {
    // Create a new TOTP object.
    // tested for: Google Authenticator, Microsoft Authenticator, FreeOTP, LastPass Authenticator. Probably a lot of others
    totp = new OTPAuth.TOTP({
      // Provider or service the account is associated with.
      issuer: "Cakelandish",
      // Account identifier.
      label: "User",
      // Algorithm used for the HMAC function.
      algorithm: "SHA1", // Microsoft Authenticator does not respect changing this value
      // Length of the generated tokens.
      digits: 6, // Microsoft Authenticator does not respect changing this value
      // Interval of time for which a token is valid, in seconds.
      period: 30, // Google Authenticator and Microsoft Authenticator do not respect changing this value
      // Arbitrary key encoded in Base32 or OTPAuth.Secret instance.
      secret: secret ? secret : new OTPAuth.Secret(),
    });

    // Convert to Google Authenticator key URI format
    let uri = totp.toString();

    logger.info(
      "Scan the QR code using an OTP Authenticator app to receive codes for authorization.",
    );
    qrcode.generate(uri, { small: true }, function (qrcode) {
      console.log(qrcode); // don't output to logger, which may print to file
    });
  }
}

// returns whether authentication is currently enabled
export function isAuthActive() {
  return authActive;
}

// determines if the string passed in matches the token expected
export function checkToken(token) {
  if (!authActive) {
    return false;
  }
  if (config.useBasicAuthCode) {
    if (code === null) {
      return false;
    }
    return compareStrings(token, code);
  } else {
    return totp.validate({ token, window: 1 }) === 0;
  }
}

// allows authentication to temporarily be enabled with this server
export function enableAuth(minutes = 10) {
  if (!config.jwt) {
    return; // no point if JWT is disabled
  }
  authActive = true;

  setTimeout(() => {
    disableAuth();
  }, minutes * 60 * 1000);

  if (config.useBasicAuthCode) {
    // use basic authentication
    code = cryptoRandomString({
      length: config.serverCodeLength,
      type: "hex",
    });
    return code;
  }
}

// disables authentication
export function disableAuth() {
  authActive = false;
  code = null;
}

export function setJwtSecret(key) {
  jwtAccessKey = key;
}

export function getJwtSecret() {
  return jwtAccessKey;
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

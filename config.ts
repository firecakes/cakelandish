import { config as loadEnv } from "./deps.ts";
import { logger } from "./modules/log.ts";

// checks for required information before allowing the server to start
let envs = Deno.env.toObject();

try {
  await Deno.stat(".env");
  logger.warn(
    "Loading variables from .env file. It's better to define environment variables in the process environment itself to mitigate lFI vulnerabilities",
  );
  envs = loadEnv();
} catch {
  // Do nothing if .env not found
}

export const config = {
  version: "0.14.2",
  title: envs.TITLE || "Cakelandish Feed",
  subtitle: envs.SUBTITLE,
  author: envs.AUTHOR || "Anonymous",
  contributors: envs.CONTRIBUTORS
    ? envs.CONTRIBUTORS.split(",").map((e) => e.trim())
    : [],
  categories: envs.CATEGORIES
    ? envs.CATEGORIES.split(",").map((e) => e.trim().toLowerCase())
    : [],
  host: envs.HOST || "localhost",
  port: Number(envs.PORT) || 8000,
  https: Boolean(envs.HTTPS) || false,
  jwt: Boolean(envs.JWT) || false,
  refreshTokenDays: Number(envs.REFRESH_TOKEN_DAYS) || 120,
  serverCodeLength: Number(envs.SERVER_CODE_LENGTH) || 256,
  useBasicAuthCode: Boolean(envs.USE_BASIC_AUTH_CODE) || false,
  sslCertificateLocation: envs.HTTPS_CERTIFICATE_LOCATION,
  sslKeyLocation: envs.HTTPS_KEY_LOCATION,
  enableTrafficLogs: Boolean(envs.ENABLE_TRAFFIC_LOGS) || false,
  link: "",
  proxy: Boolean(envs.PROXY) || false,
  proxyCount: Number(envs.PROXY_COUNT) || 0,
  proxyRequestIP: envs.PROXY_REQ_IP || "127.0.0.1",
  cloudflared: Boolean(envs.CLOUDFLARED) || false,
  rateLimitWindow: Number(envs.RATE_LIMIT_WINDOW) || 5 * 60 * 1000, // In milliseconds, 5 minutes default
  rateLimitMax: Number(envs.RATE_LIMIT_MAX) || 500, // Default max 500 requests in window
  rateLimitExpire: Number(envs.RATE_LIMIT_EXPIRE) || 1 * 24 * 60 * 60 * 1000, // In milliseconds, 1 day default
  rateLimitDuration: Number(envs.RATE_LIMIT_DURATION) || 1 * 60 * 60 * 1000, // In milliseconds, 1 hour default
};

if (config.title === undefined) {
  throw new Error("Variable missing in environment: TITLE");
}
if (config.author === undefined) {
  throw new Error("Variable missing in environment: AUTHOR");
}
if (config.https === true && config.jwt !== true) {
  throw new Error("JWT authentication must be enabled if running on HTTPS!");
}
if (config.host !== "localhost" && config.jwt !== true) {
  throw new Error(
    "JWT authentication must be enabled if not running on localhost!",
  );
}
if (
  config.sslCertificateLocation && config.sslKeyLocation &&
  config.https !== true
) {
  throw new Error(
    "HTTPS must be set to true before using SSL certificate and key!",
  );
}

config.link = `${config.https ? "https" : "http"}://${config.host}${
  config.https ? "" : ":" + config.port
}`;

if (config.proxy && config.proxyCount === 0) {
  config.proxyCount = 1;
}

if (!config.proxy && config.cloudflared) {
  throw new Error(
    "Cloudflared status cannot be true if not being proxied!",
  );
}

if (config.proxy) {
  logger.info("Server is running behind proxy");
}

if (config.cloudflared) {
  logger.info("Cloudflared mode enabled");
}

if (config.proxyCount > 0) {
  logger.info(`Allowed maximum ${config.proxyCount} proxies`);
}

/*
  All environment variables:
  TITLE: Title of your feed
  SUBTITLE: Subtitle of your feed
  AUTHOR: Who made the feed. Put your name or username here
  CONTRIBUTORS: A comma-separated array of names you want to shoutout for helping with your feed
  CATEGORIES: A comma-separated array of keywords or tags to categorize the type of content you post
  HOST: The host name of the server. Defaults to localhost
  PORT: The port the web server should run on. The default is 8000
  HTTPS: Whether HTTPS is enabled. Defaults to false
  JWT: Whether JWT is enabled. Required for using HTTPS or a domain other than localhost. Defaults to false
  REFRESH_TOKEN_DAYS: How many days until another code needs to be generated on the server for authorization. Defaults to 120.
  SERVER_CODE_LENGTH: Determines how many characters the generated server code is for basic authorization. Defaults to 256.
  USE_BASIC_AUTH_CODE: If true, code is sent in console to be pasted in login form. If false (default), prints QR code to console for consumption by OTP app
  HTTPS_CERTIFICATE_LOCATION: An SSL cert path used to enable HTTPS connections with the server. HTTPS_KEY_LOCATION also needed.
  HTTPS_KEY_LOCATION: An SSL key path used to enable HTTPS connections with the server. HTTPS_CERTIFICATE_LOCATION also needed.
  ENABLE_TRAFFIC_LOGS: Whether the server will start tracking IPs and HTML files accessed over time, viewable in the admin page. Defaults to false.
  PROXY: Whether the server is going to run behind at least one proxy. Defaults to false.
  PROXY_COUNT: How many proxies are handling traffic in series to the server. Defaults to 1 if proxy is enabled.
  PROXY_REQ_IP: The IP address of the front-facing proxy server where requests come in. Defaults to 127.0.0.1
  CLOUDFLARED: Whether CloudFlare is being used to direct traffic to the server. Defaults to false.
  RATE_LIMIT_WINDOW: The window of time in which requests are being counted per IP. Defaults to 5 minutes.
  RATE_LIMIT_MAX: The maximum number of requests allowed in the rate limit window. Defaults to 500 requests.
  RATE_LIMIT_EXPIRE: For cleaning up client data in rate limiting algorithm. Defaults to 1 day for each IP.
  RATE_LIMIT_DURATION: How long to ban clients who surpass the max rate limit. Defaults to 1 hour.
*/

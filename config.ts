import { config as loadEnv } from "./deps.ts";
import { FeedDatabase } from "./modules/db.ts";

// checks for required information before allowing the server to start
const envs = loadEnv();

export let config = {
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
  https: !!envs.HTTPS || false,
  jwt: !!envs.JWT || false,
  refreshTokenDays: Number(envs.REFRESH_TOKEN_DAYS) || 120,
  serverCodeLength: Number(envs.SERVER_CODE_LENGTH) || 256,
  sslCertificateLocation: envs.HTTPS_CERTIFICATE_LOCATION,
  sslKeyLocation: envs.HTTPS_KEY_LOCATION,
  enableTrafficLogs: envs.ENABLE_TRAFFIC_LOGS || false,
  version: "0.11.0"
};

if (config.title === undefined) {
  throw new Error("Variable missing in .env file: TITLE");
}
if (config.author === undefined) {
  throw new Error("Variable missing in .env file: AUTHOR");
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
  SERVER_CODE_LENGTH: Determines how many characters the generated server code is for initial authorization. Defaults to 256.
  HTTPS_CERTIFICATE_LOCATION: An SSL cert path used to enable HTTPS connections with the server. HTTPS_KEY_LOCATION also needed.
  HTTPS_KEY_LOCATION: An SSL key path used to enable HTTPS connections with the server. HTTPS_CERTIFICATE_LOCATION also needed.
  ENABLE_TRAFFIC_LOGS: Whether the server will start tracking IPs and HTML files accessed over time, viewable in the admin page. Defaults to false.
*/

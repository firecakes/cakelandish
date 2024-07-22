import { config } from "../config.ts";

export async function handleError(ctx) {
  // https://github.com/koajs/examples/blob/master/404/app.js

  switch (ctx.state.errorRespType || ctx.accepts("html", "json")) {
    case "json":
      ctx.type = "json";
      ctx.body = {
        message: ctx.state.errorMessage,
      };
      break;
    case "html":
      ctx.type = "html";
      ctx.body = await Deno.readTextFile(ctx.state.errorPage);
      break;
    default:
      ctx.type = "text";
      ctx.body = ctx.state.errorMessage;
  }
}

async function serverUnauthorized(ctx) {
  ctx.status = 403;
  ctx.state.errorMessage = "Unauthorized";
  ctx.state.errorPage = "./static/403.html";

  await handleError(ctx);
}

export async function restoreRequesterIP(ctx, next) {
  ctx.state.originIP = ctx.request.ip;

  // Check if client is non localhost

  if (!(config.proxy) || ctx.state.originIP !== config.proxyRequestIP) {
    await next();
    return;
  }

  // Block request if it has cf-worker in header
  // Was abused before to bypass cloudflare's protection before

  let proxyHeader = (ctx.request.headers["cf-worker"] || "").trim();
  if (proxyHeader.length > 0) {
    await serverUnauthorized(ctx);
    return;
  }

  proxyHeader = (ctx.request.headers["x-forwarded-for"] || "").trim();
  if (proxyHeader.length > 0) {
    if (config.cloudflared) {
      // Cloudflare passed x-forwarded-for to origin, request was spoofed
      serverUnauthorized(ctx);
      return;
    }

    const proxiedIPs = proxyHeader.split(",");

    if (proxiedIPs.length === config.proxyCount) {
      ctx.state.originIP = proxiedIPs[config.proxyCount - 1];
    } else {
      serverUnauthorized(ctx);
      return;
    }
  }

  // Try parsing cloudflare if enabled

  proxyHeader = (ctx.request.headers["cf-connecting-ip"] || "").trim();
  if (proxyHeader.length > 0) {
    if (config.cloudflared) {
      ctx.state.originIP = ctx.request.headers["cf-connecting-ip"];
      await next();
      return;
    }
    // Someone is trying to spoof cloudflare header
    await serverUnauthorized(ctx);
    return;
  }

  // Client is localhost or x-forwarded-for extracted, proceed
  await next();
}

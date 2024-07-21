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

export async function restoreRequsterIP(ctx, next) {
  ctx.state.originIP = ctx.request.ip;

  // Check if client is non localhost

  if (!(config.proxy) || ctx.state.originIP !== config.proxyRequestIP) {
    await next();
    return;
  }

  // Try parsing cloudflare

  let proxyHeader = (ctx.request.headers["cf-connecting-ip"] || "").trim();
  if (proxyHeader.length > 0) {
    ctx.state.originIP = ctx.request.headers["cf-connecting-ip"];
    await next();
    return;
  }

  proxyHeader = (ctx.request.headers["x-forwarded-for"] || "").trim();
  if (proxyHeader.length > 0) {
    const proxiedIPs = proxyHeader.split(",");

    if (proxiedIPs.length === config.proxyCount) {
      ctx.state.originIP = proxiedIPs[config.proxyCount - 1];
    } else {
      ctx.status = 403;
      ctx.state.errorMessage = "Unauthorized";
      ctx.state.errorPage = "./static/403.html";

      await handleError(ctx);
      return;
    }
  }

  // Client is localhost or x-forwarded-for extracted, proceed
  await next();
}

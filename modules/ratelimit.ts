import { config } from "../config.ts";
import { logger } from "./log.ts";
import { handleError } from "./utils.ts";

const kvRateLimit = await Deno.openKv(":memory:");

type clientObj = {
  ip: string;
  reqsMade: number;
  expires: number;
  banned: boolean;
  bannedFor: number;
};

export async function rateLimiter(ctx, next) {
  const client = await kvRateLimit.get([ctx.state.originIP]);

  if (client.value == null) {
    const currentClient: clientObj = {
      ip: ctx.state.originIP,
      reqsMade: 1,
      expires: Date.now() + config.rateLimitWindow,
      banned: false,
      bannedFor: 0,
    };
    await kvRateLimit.set([ctx.state.originIP], currentClient);
    await next();
    return;
  }

  const currentClient: clientObj = client.value;

  if (currentClient.banned) {
    if (Date.now() > currentClient.bannedFor) {
      currentClient.banned = false;
    } else {
      ctx.status = 429;
      ctx.state.errorMessage = "Rate limited";
      ctx.state.errorPage = "./static/429.html";

      await handleError(ctx);
      return;
    }
  }

  if (Date.now() > currentClient.expires) {
    currentClient.reqsMade = 0;
    currentClient.expires = Date.now() + config.rateLimitWindow;
  }

  currentClient.reqsMade += 1;

  if (currentClient.reqsMade >= config.rateLimitMax) {
    currentClient.banned = true;
    currentClient.bannedFor = Date.now() + config.rateLimitDuration;
    logger.info(
      `Rate limited ${ctx.state.originIP} for ${currentClient.bannedFor}`,
    );
  }

  await kvRateLimit.atomic()
    .check(client)
    .set([ctx.state.originIP], currentClient, {
      expireIn: config.rateLimitExpire,
    })
    .commit();

  await next();
}

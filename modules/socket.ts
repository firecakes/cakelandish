import { net } from "../deps.ts";
import { enableAuth } from "./auth.ts";
import { config } from "../config.ts";

export async function openSocket() {
  try { // remove if exists
    await Deno.remove("code.sock");
  } catch (err) {
  }

  return new Promise((resolve) => {
    const unixSocketServer = net.createServer((s) => {
      // user is requesting authentication
      if (config.jwt) {
        const code = enableAuth();
        if (code) {
          s.end(code);
        }
      }
    });
    unixSocketServer.listen("code.sock", async () => {
      resolve(); // socket ready
    });
  });
}

export async function connectToSocket() {
  const conn = await Deno.connect({ path: "code.sock", transport: "unix" });
  const buffer = new Uint8Array(config.serverCodeLength); // we know ahead of time the code length
  await conn.read(buffer);
  conn.close();
  return new TextDecoder().decode(buffer);
}

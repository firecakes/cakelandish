import { net, protobuf } from "../deps.ts";
import { enableAuth } from "./auth.ts";
import { config } from "../config.ts";
import { logger } from "./log.ts";

let root;

async function init() {
  if (!root) {
    root = await protobuf.load("cakelandish.proto");
  }
}

function encodeMessage(type, payload = {}) {
  const MessageType = root.lookupType(`cakelandish.${type}`);
  const message = MessageType.fromObject(payload);
  return MessageType.encode(message).finish();
}

function decodeMessage(type, buffer) {
  const MessageType = root.lookupType(`cakelandish.${type}`);
  return MessageType.decode(buffer);
}

export async function openSocket(waitForKeepAliveInput = false) {
  try { // remove if exists
    await Deno.remove("cakelandish.sock");
  } catch (err) {
  }
  await init();

  return new Promise((resolve) => {
    const unixSocketServer = net.createServer((s) => {
      // get request info
      s.on("data", (data) => {
        try {
          const request = decodeMessage("MessageRequest", data);
          if (request.type === 0 && config.jwt) { // AUTH_CODE
            const code = enableAuth();
            const responseObj = {
              success: true,
            };
            if (code) {
              responseObj.code = code;
            }
            const response = encodeMessage("MessageResponseAuth", responseObj);
            s.end(response);
          } else if (request.type === 1) { // KEEP_ALIVE
            const response = encodeMessage("MessageResponseKeepAlive", {
              success: true,
            });
            s.end(response);
            if (waitForKeepAliveInput) {
              resolve({
                keyBuffer: request.keyBuffer,
                otpSecret: request.otpSecret,
              }); // ready when keepalive is on
            }
          }
        } catch (err) {
          logger.error(err);
        }
      });
    });
    unixSocketServer.listen("cakelandish.sock", () => {
      if (!waitForKeepAliveInput) {
        resolve(); // ready when keepalive is off
      }
    });
  });
}

export async function getCodeFromSocket() {
  await init();

  return new Promise((resolve) => {
    const client = net.createConnection({ path: "cakelandish.sock" }, () => {
      const buffer = encodeMessage("MessageRequest", {
        type: "AUTH_CODE",
      });
      client.write(buffer);
    });
    client.on("data", (data) => {
      const response = decodeMessage("MessageResponseAuth", data);
      client.end();
      resolve(response.code);
    });
  });
}

export async function putSecretDataToSocket(keyBuffer, otpSecret) {
  await init();

  return new Promise((resolve, reject) => {
    const client = net.createConnection({ path: "cakelandish.sock" }, () => {
      const buffer = encodeMessage("MessageRequest", {
        type: "KEEP_ALIVE",
        keyBuffer: keyBuffer,
        otpSecret: otpSecret.bytes,
      });
      client.write(buffer);
    });
    client.on("data", (data) => {
      const response = decodeMessage("MessageResponseKeepAlive", data);
      client.end();
      resolve();
    });
    // catch error events, otherwise Deno just crashes everything
    client.on("error", (data) => {
      reject();
    });
  });
}

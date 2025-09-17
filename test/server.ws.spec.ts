import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebSocket } from "ws";
import request from "supertest";
import { buildApp, attachWebSocket } from "../server";

let server: any;

function waitForMessage(ws: WebSocket, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    ws.once("message", (data) => {
      clearTimeout(t);
      resolve(String(data));
    });
  });
}

describe("WebSocket /cable", () => {
  beforeAll(async () => {
    const { app, store, conversationIdToClients } = buildApp();
    server = app.listen(0);
    attachWebSocket(server, store, conversationIdToClients);
  });

  afterAll(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  const headers = {
    "content-type": "application/vnd.api+json",
    accept: "application/vnd.api+json",
  };

  it("broadcasts new messages to subscribers", async () => {
    const auth = await request(server)
      .post("/authenticate")
      .set(headers)
      .send({
        data: {
          type: "auth",
          attributes: { username: "user1", password: "password1" },
        },
      });
    const token = auth.body.meta.token as string;

    const list = await request(server)
      .get("/conversations")
      .set({ ...headers, authorization: token });
    const convId = list.body.data[0].id as string;

    const address = server.address();
    const port = typeof address === "object" ? address.port : 0;
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/cable?conversationId=${convId}&token=${token}`
    );

    await new Promise((r) => ws.once("open", r));

    const post = request(server)
      .post(`/conversations/${convId}`)
      .set({ ...headers, authorization: token })
      .send({ data: { type: "messages", attributes: { text: "hello" } } });

    const payload = await Promise.race([
      waitForMessage(ws, 3000),
      post.then(() => waitForMessage(ws, 3000)),
    ]);
    const parsed = JSON.parse(payload);
    expect(parsed.event).toBe("message.created");
    expect(parsed.data.type).toBe("messages");

    ws.close();
  });
});

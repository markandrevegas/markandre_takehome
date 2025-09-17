import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../server";

let server: any;

describe("REST API", () => {
  beforeAll(async () => {
    const { app } = buildApp();
    server = app.listen(0);
  });

  afterAll(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  const headers = {
    "content-type": "application/vnd.api+json",
    accept: "application/vnd.api+json",
  };

  it("authenticates valid user and returns token", async () => {
    const res = await request(server)
      .post("/authenticate")
      .set(headers)
      .send({
        data: {
          type: "auth",
          attributes: { username: "user1", password: "password1" },
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.meta.token).toBeTruthy();
  });

  it("returns conversations for authenticated user", async () => {
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
    const res = await request(server)
      .get("/conversations")
      .set({ ...headers, authorization: token });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});


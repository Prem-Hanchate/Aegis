import request from "supertest";
import { createApp } from "../src/app.js";

describe("health endpoint", () => {
  it("returns the backend health snapshot", async () => {
    const response = await request(createApp()).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      service: "aegis-backend",
      environment: expect.any(String),
      database: {
        connected: false,
      },
    });
  });
});
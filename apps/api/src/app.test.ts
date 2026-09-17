import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("api", () => {
  it("reports service health without inventing chain data", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, service: "canopy-api" });
    await app.close();
  });
});


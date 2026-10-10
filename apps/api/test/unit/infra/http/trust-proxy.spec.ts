import { ConfigService } from "@nestjs/config";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { trustProxyHops } from "../../../../src/infra/http/trust-proxy";

const config = (values: Record<string, string>) => new ConfigService(values);

describe("trustProxyHops", () => {
  it("is 0 when unset or blank (local development: no proxy in front)", () => {
    expect(trustProxyHops(config({}))).toBe(0);
    expect(trustProxyHops(config({ TRUST_PROXY_HOPS: "  " }))).toBe(0);
  });

  it("reads the number of proxies", () => {
    expect(trustProxyHops(config({ TRUST_PROXY_HOPS: "2" }))).toBe(2);
  });

  it.each(["true", "-1", "1.5", "two"])("refuses %s at boot", (value) => {
    expect(() => trustProxyHops(config({ TRUST_PROXY_HOPS: value }))).toThrow(/TRUST_PROXY_HOPS/);
  });
});

describe("Express with 2 trusted hops (Cloudflare → Railway → API)", () => {
  const app = express();
  app.set("trust proxy", 2);
  app.get("/ip", (req, res) => {
    res.send(req.ip);
  });

  it("sees the visitor, not the proxy", async () => {
    const res = await request(app).get("/ip").set("X-Forwarded-For", "200.1.2.3, 172.70.1.1");
    expect(res.text).toBe("200.1.2.3");
  });

  it("ignores an address the client wrote into the header itself", async () => {
    const res = await request(app)
      .get("/ip")
      .set("X-Forwarded-For", "6.6.6.6, 200.1.2.3, 172.70.1.1");
    expect(res.text).toBe("200.1.2.3");
  });
});

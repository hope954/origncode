import { describe, expect, it, vi } from "vitest";
import { fetchJson } from "../src/http/fetch_client.js";

describe("fetch_client - timeout/retry/parse guards", () => {
  it("retries transient errors (network/Abort) when allowed by shouldRetry", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(async () => {
          calls.push("1");
          throw new Error("network_down");
        })
        .mockImplementationOnce(async () => {
          calls.push("2");
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }) as any
    );

    const r = await fetchJson(
      "https://example.com",
      { method: "GET" },
      {
        timeoutMs: 50,
        retryMax: 1,
        retryBaseDelayMs: 1,
        shouldRetry: ({ error }) => (error ? "retry" : "no_retry")
      }
    );

    expect(calls.length).toBe(2);
    expect(r.ok).toBe(true);
  });

  it("does not retry on 401", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "unauthorized" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock as any);
    const r = await fetchJson("https://example.com", { method: "GET" }, { retryMax: 3, retryBaseDelayMs: 1, shouldRetry: () => "retry" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(401);
  });

  it("does not retry on 403", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "forbidden" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock as any);
    const r = await fetchJson("https://example.com", { method: "GET" }, { retryMax: 3, retryBaseDelayMs: 1, shouldRetry: () => "retry" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(403);
  });

  it("does not crash when response lacks text(); uses json() fallback", async () => {
    const fakeRes = {
      ok: false,
      status: 401,
      json: async () => ({ message: "unauthorized" })
    };
    const fetchMock = vi.fn(async () => fakeRes);
    vi.stubGlobal("fetch", fetchMock as any);
    const r = await fetchJson("https://example.com", { method: "GET" });
    expect(r.status).toBe(401);
    expect(r.json).toMatchObject({ message: "unauthorized" });
  });

  it("does not crash on invalid JSON body", async () => {
    const fetchMock = vi.fn(async () => new Response("{not-json", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock as any);
    const r = await fetchJson("https://example.com", { method: "GET" }, { retryMax: 0 });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    expect(r.json).toBeUndefined();
  });
});


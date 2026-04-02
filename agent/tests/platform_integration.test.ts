/**
 * Real-platform code-path tests.
 * These tests set FEISHU_APP_ID / FEISHU_APP_SECRET so the real code paths execute,
 * but mock `globalThis.fetch` to avoid actual Feishu / Yuque HTTP calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Feishu adapter tests ─────────────────────────────────────────────────────

describe("FeishuAdapter real-mode (FEISHU_APP_ID configured + fetch mocked)", () => {
  let FeishuAdapter: (typeof import("../src/platform_adapters/feishuAdapter.js"))["FeishuAdapter"];
  let DocumentRef: import("../src/types.js").DocumentRef;

  beforeEach(async () => {
    process.env.FEISHU_APP_ID = "test_app_id";
    process.env.FEISHU_APP_SECRET = "test_app_secret";
    process.env.FEISHU_REDIRECT_URI = "https://myapp.example.com/callback";
    process.env.FEISHU_BASE_URL = "https://open.feishu.cn";
    // Re-import to pick up env vars (config is evaluated at module load, but feishuConfigured() reads runtime)
    const mod = await import("../src/platform_adapters/feishuAdapter.js");
    FeishuAdapter = mod.FeishuAdapter;
    DocumentRef = {
      doc_id: "doc_r1",
      session_id: "sess_r1",
      platform: "feishu" as const,
      url: "https://tenant.feishu.cn/docx/AbCdEf123",
      status: "pending" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  afterEach(() => {
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;
    delete process.env.FEISHU_REDIRECT_URI;
    vi.restoreAllMocks();
  });

  it("maps Feishu raw_content response to NormalizedDocument", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/raw_content")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ code: 0, data: { content: "# 项目背景\n主导后端接口优化，QPS 提升 30%。\n- 技术栈 Go / Redis" } })
        });
      }
      // document info endpoint
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ code: 0, data: { document: { title: "工作总结", document_id: "AbCdEf123" } } })
      });
    }));

    const adapter = new FeishuAdapter();
    const nd = await adapter.fetchDocument(DocumentRef, "feishu_at_realtoken123");
    expect(nd.platform).toBe("feishu");
    // title_path[0] extracted from heading in content when content has headings
    expect(nd.title).toBeTruthy();
    expect(nd.content_text).toContain("QPS 提升 30%");
    expect(nd.blocks.length).toBeGreaterThan(0);
  });

  it("throws access_denied when Feishu API returns 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ code: 403001, msg: "permission denied" })
    }));

    const adapter = new FeishuAdapter();
    await expect(adapter.fetchDocument(DocumentRef, "feishu_at_expired")).rejects.toMatchObject({
      message: "access_denied"
    });
  });

  it("throws token_expired when Feishu API returns 401 / code 99991663", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ code: 99991663, msg: "token expired" })
    }));

    const adapter = new FeishuAdapter();
    await expect(adapter.fetchDocument(DocumentRef, "feishu_at_stale")).rejects.toMatchObject({
      message: "token_expired"
    });
  });

  it("throws fetch_failed for unsupported URL format", async () => {
    const badDoc = { ...DocumentRef, url: "https://tenant.feishu.cn/spreadsheets/xxx" };
    const adapter = new FeishuAdapter();
    await expect(adapter.fetchDocument(badDoc, "feishu_at_ok")).rejects.toMatchObject({
      message: "fetch_failed"
    });
  });
});

// ─── Feishu auth real-mode tests ─────────────────────────────────────────────

describe("AuthService.handleFeishuCallback real-mode (FEISHU_APP_ID configured + fetch mocked)", () => {
  let AuthService: (typeof import("../src/auth_service/service.js"))["AuthService"];
  let Repository: (typeof import("../src/storage/repository.js"))["Repository"];
  let dataPath: string;

  beforeEach(async () => {
    process.env.FEISHU_APP_ID = "test_app_id";
    process.env.FEISHU_APP_SECRET = "test_app_secret";
    process.env.FEISHU_BASE_URL = "https://open.feishu.cn";
    dataPath = `./data/store.auth_real_${Date.now()}.json`;
    process.env.DATA_FILE = dataPath;
    const authMod = await import("../src/auth_service/service.js");
    const repoMod = await import("../src/storage/repository.js");
    AuthService = authMod.AuthService;
    Repository = repoMod.Repository;
  });

  afterEach(() => {
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;
    vi.restoreAllMocks();
    try { import("node:fs").then((fs) => { try { fs.unlinkSync(dataPath); } catch {} }); } catch {}
  });

  it("exchanges auth_code for real tokens via Feishu API (mocked)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("app_access_token")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ code: 0, app_access_token: "aat_mock_12345", expire: 7200 })
        });
      }
      // OIDC access_token exchange
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve({
          code: 0,
          data: {
            access_token: "u_access_real_123",
            refresh_token: "u_refresh_real_456",
            expires_in: 7199,
            refresh_expires_in: 2591999
          }
        })
      });
    }));

    const repo = new Repository();
    const svc = new AuthService(repo);
    const auth = await svc.handleFeishuCallback("u1", "sess1", "code_abc");
    expect(auth.platform).toBe("feishu");
    expect(auth.auth_status).toBe("connected");
    // Encrypted, not plaintext
    expect(auth.access_token_encrypted).not.toBe("u_access_real_123");
    expect(auth.access_token_encrypted).toBeTruthy();
  });

  it("returns auth_required when app_access_token fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: () => Promise.resolve({ code: 500, msg: "internal error" })
    }));

    const repo = new Repository();
    const svc = new AuthService(repo);
    await expect(svc.handleFeishuCallback("u2", "sess2", "code_bad")).rejects.toMatchObject({
      reason: "auth_required"
    });
  });

  it("rejects with auth_required when Feishu code exchange returns error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("app_access_token")) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ code: 0, app_access_token: "aat_ok", expire: 7200 })
        });
      }
      // code exchange fails
      return Promise.resolve({
        ok: false, status: 400,
        json: () => Promise.resolve({ code: 400, msg: "auth code expired" })
      });
    }));

    const repo = new Repository();
    const svc = new AuthService(repo);
    // "auth code expired" message contains "code" → maps to token_invalid
    await expect(svc.handleFeishuCallback("u_fail", "s_fail", "bad_code")).rejects.toMatchObject({
      reason: "token_invalid"
    });
  });
});

// ─── Yuque adapter real-mode tests ───────────────────────────────────────────

describe("YuqueAdapter real-mode (YUQUE_LIVE_FETCH=1 + fetch mocked)", () => {
  let YuqueAdapter: (typeof import("../src/platform_adapters/yuqueAdapter.js"))["YuqueAdapter"];

  beforeEach(async () => {
    process.env.YUQUE_LIVE_FETCH = "1";
    process.env.YUQUE_BASE_URL = "https://www.yuque.com";
    const mod = await import("../src/platform_adapters/yuqueAdapter.js");
    YuqueAdapter = mod.YuqueAdapter;
  });

  afterEach(() => {
    delete process.env.YUQUE_LIVE_FETCH;
    vi.restoreAllMocks();
  });

  const doc: import("../src/types.js").DocumentRef = {
    doc_id: "doc_y1",
    session_id: "sess_y1",
    platform: "yuque",
    url: "https://www.yuque.com/alice/proj/meeting-notes",
    status: "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  it("maps Yuque doc response to NormalizedDocument", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({
        data: {
          id: 1001,
          title: "周会纪要",
          slug: "meeting-notes",
          body: "# 周会纪要\n\n- 推进了接口重构，提升可维护性\n- 团队协同方案落地"
        }
      })
    }));

    const adapter = new YuqueAdapter();
    const nd = await adapter.fetchDocument(doc, "yq_validtoken123456789");
    expect(nd.platform).toBe("yuque");
    expect(nd.title).toBe("周会纪要");
    expect(nd.content_text).toContain("接口重构");
  });

  it("throws token_invalid when Yuque returns 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 401,
      json: () => Promise.resolve({ message: "unauthorized, token invalid" })
    }));

    const adapter = new YuqueAdapter();
    await expect(adapter.fetchDocument(doc, "yq_bad_token_12345")).rejects.toMatchObject({
      message: "token_invalid"
    });
  });

  it("throws access_denied when Yuque returns 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 403,
      json: () => Promise.resolve({ message: "forbidden" })
    }));

    const adapter = new YuqueAdapter();
    await expect(adapter.fetchDocument(doc, "yq_restricted_token")).rejects.toMatchObject({
      message: "access_denied"
    });
  });

  it("throws fetch_failed for unsupported Yuque URL", async () => {
    const badDoc = { ...doc, url: "https://www.yuque.com/only-two-parts" };
    const adapter = new YuqueAdapter();
    await expect(adapter.fetchDocument(badDoc, "yq_any_token_123456")).rejects.toMatchObject({
      message: "fetch_failed"
    });
  });
});

// ─── Yuque token verify live-probe tests ─────────────────────────────────────

describe("AuthService.verifyYuqueToken with YUQUE_LIVE_VERIFY=1", () => {
  let AuthService: (typeof import("../src/auth_service/service.js"))["AuthService"];
  let Repository: (typeof import("../src/storage/repository.js"))["Repository"];

  beforeEach(async () => {
    process.env.YUQUE_LIVE_VERIFY = "1";
    process.env.DATA_FILE = `./data/store.yuq_${Date.now()}.json`;
    const mod = await import("../src/auth_service/service.js");
    const rmod = await import("../src/storage/repository.js");
    AuthService = mod.AuthService;
    Repository = rmod.Repository;
  });

  afterEach(() => {
    delete process.env.YUQUE_LIVE_VERIFY;
    vi.restoreAllMocks();
  });

  it("returns true when Yuque user API responds 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const svc = new AuthService(new Repository());
    expect(await svc.verifyYuqueToken("yq_valid_token_123456")).toBe(true);
  });

  it("returns false when Yuque user API responds 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const svc = new AuthService(new Repository());
    expect(await svc.verifyYuqueToken("yq_invalid_token_1234")).toBe(false);
  });

  it("returns false for tokens that fail structural check regardless of HTTP", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const svc = new AuthService(new Repository());
    expect(await svc.verifyYuqueToken("short")).toBe(false);
  });
});

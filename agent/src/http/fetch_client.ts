import { config } from "../config.js";

export type RetryDecision = "retry" | "no_retry";

export interface FetchAttemptResult {
  ok: boolean;
  status: number;
  bodyText?: string;
  json?: unknown;
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  retryMax?: number;
  retryBaseDelayMs?: number;
  /**
   * Decides whether to retry this attempt.
   * Must be conservative: never retry auth/permission errors.
   */
  shouldRetry?: (r: { attempt: number; status?: number; error?: unknown }) => RetryDecision;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(baseMs: number): number {
  const factor = 0.7 + Math.random() * 0.6; // 0.7 ~ 1.3
  return Math.max(0, Math.round(baseMs * factor));
}

/**
 * Fetch JSON with timeout + minimal retry.
 *
 * Retry rules MUST be supplied by caller (platform specific),
 * but this helper enforces "never retry" for 401/403 by default.
 */
export async function fetchJson(
  url: string,
  init: RequestInit,
  opts: FetchJsonOptions = {}
): Promise<FetchAttemptResult> {
  const timeoutMs = opts.timeoutMs ?? config.http.timeoutMs;
  const retryMax = opts.retryMax ?? config.http.retryMax;
  const retryBaseDelayMs = opts.retryBaseDelayMs ?? config.http.retryBaseDelayMs;

  for (let attempt = 1; attempt <= retryMax + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const status = Number((res as { status?: number }).status ?? 0);
      const anyRes = res as unknown as {
        ok?: boolean;
        status?: number;
        text?: () => Promise<string>;
        json?: () => Promise<unknown>;
      };

      let bodyText = "";
      if (typeof anyRes.text === "function") {
        bodyText = await anyRes.text().catch(() => "");
      } else if (typeof anyRes.json === "function") {
        const j = await anyRes.json().catch(() => undefined);
        if (j !== undefined) bodyText = JSON.stringify(j);
      }
      let json: unknown = undefined;
      if (bodyText) {
        try {
          json = JSON.parse(bodyText);
        } catch {
          json = undefined;
        }
      }

      const ok = Boolean((anyRes.ok ?? false) || (status >= 200 && status < 300));
      if (ok) return { ok, status, bodyText, json };

      // Hard no-retry for auth / permission errors.
      if (status === 401 || status === 403) return { ok, status, bodyText, json };

      const decision = opts.shouldRetry?.({ attempt, status }) ?? "no_retry";
      if (decision === "retry" && attempt <= retryMax) {
        await sleep(jitter(retryBaseDelayMs * Math.pow(2, attempt - 1)));
        continue;
      }
      return { ok, status, bodyText, json };
    } catch (error) {
      const decision = opts.shouldRetry?.({ attempt, error }) ?? "no_retry";
      if (decision === "retry" && attempt <= retryMax) {
        await sleep(jitter(retryBaseDelayMs * Math.pow(2, attempt - 1)));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, status: 0 };
}


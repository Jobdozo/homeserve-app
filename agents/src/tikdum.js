// Client for the Tikdum API as one agent: swaps the agent's API key for a
// 15-minute token, refreshes it before expiry (or on a 401), and retries
// transient failures (network errors, 5xx) with backoff. 4xx are not retried.
const { apiBase } = require("./config");

class AgentSwitchedOff extends Error {}

class TikdumClient {
  constructor(name, apiKey) {
    this.name = name;
    this.apiKey = apiKey;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  async login() {
    const r = await fetch(`${apiBase}/agents/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: this.apiKey }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 403) throw new AgentSwitchedOff(data.error || "Agent switched off");
    if (!r.ok) throw new Error(`Agent login failed (${r.status}): ${data.error || "unknown"}`);
    this.token = data.token;
    this.tokenExpiresAt = Date.now() + (data.expiresInSec - 60) * 1000;
    this.profile = data.agent;
    return data.agent;
  }

  async request(method, path, body, { retries = 2 } = {}) {
    for (let attempt = 0; ; attempt++) {
      if (!this.token || Date.now() > this.tokenExpiresAt) await this.login();
      let r;
      try {
        r = await fetch(`${apiBase}${path}`, {
          method,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        });
      } catch (e) {
        if (attempt < retries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw e;
      }
      const data = r.status === 204 ? null : await r.json().catch(() => null);
      if (r.status === 401) {
        // Expired token, or the agent was switched off: one fresh login decides which.
        this.token = null;
        if (attempt === 0) continue;
        throw new AgentSwitchedOff(data?.error || "Not authorised");
      }
      if (r.status >= 500 && attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!r.ok) {
        const err = new Error(`${method} ${path} -> ${r.status}: ${data?.error || "failed"}`);
        err.status = r.status;
        throw err;
      }
      return data;
    }
  }

  get(path) {
    return this.request("GET", path);
  }
  post(path, body) {
    return this.request("POST", path, body);
  }

  // Helpers for the agent endpoints.
  heartbeat(status = "ok", note = "") {
    return this.post("/agents/heartbeat", { status, note }).catch(() => null);
  }
  feed(item) {
    return this.post("/agents/feed", item);
  }
  propose(action) {
    return this.post("/agents/actions", action);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { TikdumClient, AgentSwitchedOff };

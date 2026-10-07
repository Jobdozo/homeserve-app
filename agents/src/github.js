// Minimal GitHub REST client for the Engineering agents (zero dependencies).
//
// Identity, in order of preference:
//   1. GitHub App (GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY_FILE): short-lived
//      installation tokens limited to this one repo and to the permissions the
//      App was given (Contents, Pull requests, Issues: write; Checks, Actions:
//      read). Give it no "Workflows" permission so it can never edit CI.
//   2. GITHUB_TOKEN: a classic token of a separate machine user with "repo"
//      scope only (no "workflow" scope). Never your own token — you can bypass
//      branch protection, so a token of yours would let an agent push to master.
//
// What this client deliberately can't do: merge pull requests, approve
// reviews, change settings, push to the base branch, or force-push.
const crypto = require("crypto");
const fs = require("fs");
const config = require("./config");

const API = "https://api.github.com";
const b64u = (v) => Buffer.from(v).toString("base64url");

class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class GitHub {
  constructor({ repo = config.github.repo, base = config.github.base, appId = config.github.appId, privateKey, privateKeyFile = config.github.privateKeyFile, token = config.github.token, fetchImpl } = {}) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo || "")) throw new Error("GITHUB_REPO must be owner/name");
    this.repo = repo;
    this.base = base;
    this.appId = appId;
    this.privateKey = privateKey || (appId && privateKeyFile ? fs.readFileSync(privateKeyFile, "utf8") : null);
    this.staticToken = token;
    if (!(this.appId && this.privateKey) && !this.staticToken) throw new Error("GitHub isn't set up: set GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY_FILE (or GITHUB_TOKEN)");
    this.fetch = fetchImpl || fetch;
    this.installToken = null;
    this.installTokenExpires = 0;
  }

  appJwt() {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64u(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(this.appId) }))}`;
    return `${unsigned}.${crypto.sign("RSA-SHA256", Buffer.from(unsigned), this.privateKey).toString("base64url")}`;
  }

  async token() {
    if (!this.appId) return this.staticToken;
    if (this.installToken && Date.now() < this.installTokenExpires) return this.installToken;
    const jwt = this.appJwt();
    const inst = await this.raw("GET", `/repos/${this.repo}/installation`, undefined, jwt);
    const repoName = this.repo.split("/")[1];
    const t = await this.raw("POST", `/app/installations/${inst.id}/access_tokens`, { repositories: [repoName] }, jwt);
    this.installToken = t.token;
    this.installTokenExpires = Date.parse(t.expires_at) - 5 * 60 * 1000;
    return this.installToken;
  }

  async raw(method, path, body, bearer, { accept = "application/vnd.github+json", text = false } = {}) {
    const r = await this.fetch(path.startsWith("http") ? path : `${API}${path}`, {
      method,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${bearer}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "tikdum-agents",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (text && r.ok) return r.text();
    const data = r.status === 204 ? null : await r.json().catch(() => null);
    if (!r.ok) throw new GitHubError(r.status, `GitHub ${method} ${path.replace(API, "")} → ${r.status}: ${data?.message || "failed"}`);
    return data;
  }

  async api(method, path, body, opts) {
    return this.raw(method, path, body, await this.token(), opts);
  }

  // ---- reading ----
  async headSha(branch) {
    const ref = await this.api("GET", `/repos/${this.repo}/git/ref/heads/${encodeURIComponent(branch).replace(/%2F/g, "/")}`).catch((e) => {
      if (e.status === 404) return null;
      throw e;
    });
    return ref?.object?.sha || null;
  }

  async listFiles(sha) {
    const commit = await this.api("GET", `/repos/${this.repo}/git/commits/${sha}`);
    const tree = await this.api("GET", `/repos/${this.repo}/git/trees/${commit.tree.sha}?recursive=1`);
    return (tree.tree || []).filter((e) => e.type === "blob").map((e) => ({ path: e.path, size: e.size }));
  }

  async readFile(path, ref) {
    const f = await this.api("GET", `/repos/${this.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`).catch((e) => {
      if (e.status === 404) return null;
      throw e;
    });
    if (!f || f.type !== "file" || f.encoding !== "base64") return null;
    return Buffer.from(f.content, "base64").toString("utf8");
  }

  // ---- writing (branches other than the base only) ----
  // files: [{ path, content }] — content null deletes the file.
  async commit(branch, parentSha, message, files) {
    if (branch === this.base) throw new Error(`Refusing to commit to ${this.base}`);
    const parent = await this.api("GET", `/repos/${this.repo}/git/commits/${parentSha}`);
    const tree = await this.api("POST", `/repos/${this.repo}/git/trees`, {
      base_tree: parent.tree.sha,
      tree: files.map((f) => (f.content === null ? { path: f.path, mode: "100644", type: "blob", sha: null } : { path: f.path, mode: "100644", type: "blob", content: f.content })),
    });
    const commit = await this.api("POST", `/repos/${this.repo}/git/commits`, { message, tree: tree.sha, parents: [parentSha] });
    const existing = await this.headSha(branch);
    if (existing) {
      // Fast-forward only: if someone pushed meanwhile this fails and the agent retries later.
      await this.api("PATCH", `/repos/${this.repo}/git/refs/heads/${branch}`, { sha: commit.sha, force: false });
    } else {
      await this.api("POST", `/repos/${this.repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
    }
    return commit.sha;
  }

  // ---- pull requests ----
  openPulls() {
    return this.api("GET", `/repos/${this.repo}/pulls?state=open&base=${encodeURIComponent(this.base)}&per_page=50`);
  }
  async pullForBranch(branch) {
    const owner = this.repo.split("/")[0];
    const list = await this.api("GET", `/repos/${this.repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`);
    return list[0] || null;
  }
  openPull({ title, head, body }) {
    return this.api("POST", `/repos/${this.repo}/pulls`, { title, head, base: this.base, body });
  }
  async pullFiles(number) {
    const out = [];
    for (let page = 1; page <= 3; page++) {
      const batch = await this.api("GET", `/repos/${this.repo}/pulls/${number}/files?per_page=100&page=${page}`);
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  }
  async pullComments(number) {
    const [reviews, comments] = await Promise.all([
      this.api("GET", `/repos/${this.repo}/pulls/${number}/reviews?per_page=50`),
      this.api("GET", `/repos/${this.repo}/issues/${number}/comments?per_page=50`),
    ]);
    return [...reviews.filter((r) => r.body), ...comments].map((c) => ({ user: c.user?.login || "?", body: c.body || "", at: c.submitted_at || c.created_at }));
  }
  comment(number, body) {
    return this.api("POST", `/repos/${this.repo}/issues/${number}/comments`, { body });
  }
  // Always a plain COMMENT review — never APPROVE / REQUEST_CHANGES.
  async review(number, sha, body) {
    try {
      return await this.api("POST", `/repos/${this.repo}/pulls/${number}/reviews`, { commit_id: sha, body, event: "COMMENT" });
    } catch (e) {
      if (e.status === 422) return this.comment(number, body);
      throw e;
    }
  }
  addLabels(number, labels) {
    return this.api("POST", `/repos/${this.repo}/issues/${number}/labels`, { labels }).catch(() => null); // labels are nice-to-have
  }

  // ---- CI ----
  async checks(sha) {
    const r = await this.api("GET", `/repos/${this.repo}/commits/${sha}/check-runs?per_page=50`);
    return (r.check_runs || []).map((c) => ({ id: c.id, name: c.name, status: c.status, conclusion: c.conclusion, url: c.html_url }));
  }
  // For GitHub Actions the check-run id is the job id; the log is plain text.
  async jobLog(jobId) {
    return this.api("GET", `/repos/${this.repo}/actions/jobs/${jobId}/logs`, undefined, { accept: "application/vnd.github+json", text: true }).catch(() => "");
  }

  // ---- issues ----
  createIssue({ title, body, labels }) {
    return this.api("POST", `/repos/${this.repo}/issues`, { title, body, labels });
  }
  async openIssues(label) {
    const list = await this.api("GET", `/repos/${this.repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=50`);
    return list.filter((i) => !i.pull_request);
  }
}

module.exports = { GitHub, GitHubError };

/**
 * Sandpoint Wiki — save proxy (Cloudflare Worker)
 *
 * Sits between the public wiki site and GitHub so players can save pages
 * with just a shared "table password" — no GitHub accounts needed.
 * The GitHub token lives ONLY here, as a Worker secret, never in the site.
 *
 * Required settings (Worker → Settings → Variables and Secrets):
 *   GITHUB_TOKEN   (secret)  - fine-grained PAT, Contents read/write on the wiki repo only
 *   TABLE_PASSWORD (secret)  - the password you give your players
 *   REPO           (text)    - "owner/repo", e.g. "nicktaylorstl/HeroesOfPTH"
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    let body;
    try { body = await request.json(); } catch { return json({ error: "invalid JSON" }, 400); }

    const { password, path, content, message, sha, author, action } = body;

    if (!env.TABLE_PASSWORD || password !== env.TABLE_PASSWORD)
      return json({ error: "wrong password" }, 403);

    // Only allow markdown files inside pages/ (up to 3 folder levels deep) —
    // nothing else in the repo is touchable
    if (typeof path !== "string" || !/^pages\/(?:[a-z0-9-]{1,60}\/){0,3}[a-z0-9-]{1,60}\.md$/.test(path))
      return json({ error: "invalid path" }, 400);

    const ghUrl = `https://api.github.com/repos/${env.REPO}/contents/${path}`;
    const ghHeaders = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "sandpoint-wiki-worker",
    };

    // "get" hands the site the freshest content + sha, bypassing the anonymous
    // API's rate limit and caches (this token has its own 5000/hour budget)
    if (action === "get") {
      const res = await fetch(ghUrl, { headers: ghHeaders, cache: "no-store" });
      if (res.status === 404) return json({ ok: true, exists: false }, 200);
      if (!res.ok) return json({ error: `GitHub ${res.status}` }, 502);
      const d = await res.json();
      return json({ ok: true, exists: true, sha: d.sha, content: d.content }, 200);
    }

    const isDelete = action === "delete";

    if (isDelete) {
      if (typeof sha !== "string" || !sha)
        return json({ error: "missing sha" }, 400);
    } else if (typeof content !== "string" || content.length > 200000) {
      return json({ error: "content missing or too long" }, 400);
    }

    const commitMessage =
      (typeof message === "string" && message.slice(0, 120)) ||
      `Wiki ${isDelete ? "delete" : "edit"}${author ? ` — ${String(author).slice(0, 40)}` : ""}`;

    const ghBody = { message: commitMessage };
    if (isDelete) {
      ghBody.sha = sha; // GitHub requires the current sha to delete
    } else {
      ghBody.content = b64encodeUtf8(content);
      if (sha) ghBody.sha = sha; // update existing file; omit = create new
    }

    const res = await fetch(ghUrl, {
      method: isDelete ? "DELETE" : "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(ghBody),
    });

    if (res.status === 409 || res.status === 422) {
      // 409/422 from GitHub here almost always means the sha is stale:
      // someone else saved the page since this player loaded it.
      return json({ error: "conflict — page changed since you loaded it" }, 409);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json({ error: `GitHub ${res.status}`, detail: detail.slice(0, 300) }, 502);
    }

    // hand back the new file sha so the site can keep editing without
    // waiting out GitHub's API cache
    const data = await res.json().catch(() => ({}));
    return json({ ok: true, sha: data.content?.sha || null }, 200);
  },
};

# Sandpoint Chronicles — Party Wiki

A campaign wiki hosted on **GitHub Pages** that players can read and edit **without GitHub accounts**. Editing needs only a shared *table password*. Every edit is a git commit, so nothing is ever truly lost — any page can be reverted from the repo's history.

## How it works

```
Player's browser ──reads──▶ GitHub (public repo, pages/*.md)
Player's browser ──saves──▶ Cloudflare Worker ──commits──▶ GitHub
                            (checks table password;
                             holds the GitHub token)
```

- `index.html` — the whole site (single page app). Reads markdown from the repo via GitHub's public API and renders it.
- `pages/**/*.md` — the wiki content. One file per page; subdirectories show up as folders in the sidebar (up to 3 levels deep). A folder exists as long as it has at least one page in it — that's just how git works.
- `worker/worker.js` — the save proxy you deploy to Cloudflare (free tier). It's the only thing that can write, it only writes markdown files under `pages/`, and it requires the table password.

## One-time setup (~15 minutes)

### 1. Push this folder to the repo

The repo already exists at <https://github.com/nicktaylorstl/HeroesOfPTH> and this folder is a clone of it, so just:

```bash
git add .
git commit -m "Party wiki"
git push
```

### 2. Turn on GitHub Pages

Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
After a minute your site is at `https://nicktaylorstl.github.io/HeroesOfPTH/`.

### 3. Create a GitHub token (for the Worker only — never goes in the site)

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token.
2. Name: `heroes-wiki-worker`. Expiration: 1 year (set a reminder).
3. **Repository access: Only select repositories → your wiki repo.**
4. Permissions → Repository permissions → **Contents: Read and write**. Nothing else.
5. Generate and copy the token.

### 4. Deploy the Cloudflare Worker (free)

1. Sign up / log in at <https://dash.cloudflare.com> (free plan is fine).
2. **Workers & Pages → Create → Create Worker** → name it (e.g. `heroes-wiki`) → Deploy.
3. Click **Edit code**, replace the contents with `worker/worker.js` from this repo, then **Deploy**.
4. Back on the worker's page: **Settings → Variables and Secrets** → add:
   - `GITHUB_TOKEN` (type **Secret**) = the token from step 3
   - `TABLE_PASSWORD` (type **Secret**) = whatever password you'll give your players
   - `REPO` (type Text) = `nicktaylorstl/HeroesOfPTH`
5. Copy the worker URL (looks like `https://heroes-wiki.YOUR-SUBDOMAIN.workers.dev`).

### 5. Point the site at your repo and worker

Edit the `CONFIG` block near the bottom of `index.html`:

```js
const CONFIG = {
  owner: "nicktaylorstl",       // ✓ already set
  repo: "HeroesOfPTH",          // ✓ already set
  workerUrl: "https://heroes-wiki.YOUR-SUBDOMAIN.workers.dev"  // ← paste your worker URL here
};
```

Only the `workerUrl` still needs filling in. Commit and push. Done.

### 6. Tell your players

Send them the site URL and the table password. That's all they need — their browser remembers the password and their name after the first save.

## GM maintenance

- **Revert vandalism / mistakes:** the repo's commit history has every version of every page. On GitHub: open the file → History → pick the good version → copy it back (or `git revert`).
- **Delete a page:** delete the file on GitHub (the site's editor can create and change pages, but deliberately can't delete). Deleting a folder's last page removes the folder too.
- **Rename/move a page:** on GitHub (or locally with `git mv`) — the site treats the file path as the page's location.
- **Change the password:** update the `TABLE_PASSWORD` secret on the worker.
- **Rate limits:** reading uses GitHub's anonymous API (60 requests/hour per player IP). Fine for a gaming table; if someone ever hits it, it resets within the hour.

## Security notes (honest version)

- The wiki content is public (public repo + public site). Don't put GM secrets or personal info in it.
- The table password protects *writing*, not reading. If it leaks, worst case someone scribbles on the wiki and you revert the commits and change the password.
- The GitHub token can only touch this one repo's contents, and only via the worker, which only writes markdown files in `pages/`.

// Tiny client for GitHub *repository variables* (Settings → Secrets and variables → Actions → Variables).
// Used for the private, non-code state of the app: the Real Tracker list (TRACKERS) and password hashes (AUTH).
// Needs TRACKERS_GITHUB_TOKEN: fine-grained token, this repo only, permission "Variables: Read and write".
export function variables(env, fetchImpl = fetch) {
  const repo = env.TRACKERS_REPO || 'seanx888/aethersky';
  const base = `https://api.github.com/repos/${repo}/actions/variables`;
  const headers = {
    Authorization: `Bearer ${env.TRACKERS_GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'aethersky-tracker-sync',
  };
  const fail = async (res, what) => {
    const detail = (await res.text().catch(() => '')).slice(0, 160);
    throw Object.assign(new Error(`GitHub ${what} HTTP ${res.status} ${detail}`), { status: res.status });
  };
  return {
    /** The variable's text, or null when it does not exist yet. */
    async read(name) {
      const res = await fetchImpl(`${base}/${name}`, { headers });
      if (res.status === 404) return null;
      if (!res.ok) await fail(res, 'read');
      const { value } = await res.json();
      return value ?? '';
    },
    async write(name, value) {
      const body = JSON.stringify({ name, value });
      let res = await fetchImpl(`${base}/${name}`, { method: 'PATCH', headers, body });
      if (res.status === 404) res = await fetchImpl(base, { method: 'POST', headers, body });
      if (!res.ok) await fail(res, 'write');
    },
  };
}

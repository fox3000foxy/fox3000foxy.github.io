// src/lib/github.ts
var cachedRepos = null;
function headers() {
	const h = {};
	const token = typeof process === "undefined" ? void 0 : process.env.GITHUB_TOKEN;
	if (token) h.Authorization = `Bearer ${token}`;
	return h;
}
async function fetchRepos() {
	if (cachedRepos) return cachedRepos;
	const res = await fetch("https://api.github.com/users/fox3000foxy/repos?sort=updated&per_page=100&type=all", { headers: headers() });
	if (!res.ok) throw new Error(`GitHub API ${res.status}`);
	cachedRepos = (await res.json()).filter((r) => !(r.fork || r.name.includes("github.io"))).map((r) => ({
		...r,
		owner: r.owner?.login || "fox3000foxy"
	}));
	return cachedRepos;
}
async function fetchReadme(repo, branch, owner = "fox3000foxy") {
	const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/README.md`;
	const res = await fetch(url);
	if (!res.ok) return "";
	return res.text();
}
export { fetchRepos as n, fetchReadme as t };

export interface Repo {
	name: string;
	description: string | null;
	html_url: string;
	stargazers_count: number;
	fork: boolean;
	language: string | null;
	pushed_at: string;
	default_branch: string;
}

let cachedRepos: Repo[] | null = null;

function headers(): Record<string, string> {
	const h: Record<string, string> = {};
	const token =
		(typeof process !== "undefined" &&
			(process as Record<string, Record<string, string>>).env?.GITHUB_TOKEN) ||
		(typeof import.meta !== "undefined" &&
			(import.meta as Record<string, Record<string, string>>).env
				?.GITHUB_TOKEN);
	if (token) {
		h.Authorization = `Bearer ${token}`;
	}
	return h;
}

export async function fetchRepos(): Promise<Repo[]> {
	if (cachedRepos) {
		return cachedRepos;
	}
	const res = await fetch(
		"https://api.github.com/users/fox3000foxy/repos?sort=updated&per_page=100&type=all",
		{ headers: headers() }
	);
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
	}
	const all: Repo[] = await res.json();
	cachedRepos = all.filter((r) => !r.fork);
	return cachedRepos;
}

export async function fetchReadme(
	repo: string,
	branch: string
): Promise<string> {
	const url = `https://raw.githubusercontent.com/fox3000foxy/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/README.md`;
	const res = await fetch(url);
	if (!res.ok) {
		return "";
	}
	return res.text();
}

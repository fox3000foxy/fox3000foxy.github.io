import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/ProjectList.css";
import { useLang } from "../hooks/useLang";

interface Repo {
	name: string;
	description: string | null;
	language: string | null;
	stargazers_count: number;
	fork: boolean;
	archived: boolean;
	html_url: string;
	updated_at: string;
	pushed_at: string;
}

interface GistFile {
	filename: string;
	type?: string;
	language?: string | null;
}

interface Gist {
	id: string;
	description: string | null;
	html_url: string;
	updated_at: string;
	files: Record<string, GistFile>;
}

interface Org {
	login: string;
	avatar_url: string;
	html_url: string;
}

interface ProjectsCache {
	ownerRepos: Repo[];
	memberRepos: Repo[];
	orgs: Org[];
	orgRepos: Record<string, Repo[]>;
	gists: Gist[];
	fetchedAt: number;
}

const USERNAME = "fox3000foxy";
const CACHE_KEY = "fox3000foxy-projects-v2";
const INITIAL_DISPLAY_COUNT = 6;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

async function fetchPaginatedRepos(url: string): Promise<Repo[]> {
	const repos: Repo[] = [];
	let page = 1;
	const perPage = 100;

	while (true) {
		const separator = url.includes("?") ? "&" : "?";
		const res = await fetch(
			`${url}${separator}per_page=${perPage}&page=${page}`
		);
		if (!res.ok) {
			break;
		}
		const data: Repo[] = await res.json();
		if (data.length === 0) {
			break;
		}
		repos.push(...data);
		if (data.length < perPage) {
			break;
		}
		page++;
	}

	return repos;
}

function fetchAllRepos(username: string): Promise<Repo[]> {
	return fetchPaginatedRepos(
		`https://api.github.com/users/${encodeURIComponent(username)}/repos?type=owner`
	);
}

function fetchMemberRepos(username: string): Promise<Repo[]> {
	return fetchPaginatedRepos(
		`https://api.github.com/users/${encodeURIComponent(username)}/repos?type=member`
	);
}

async function fetchOrgs(username: string): Promise<Org[]> {
	const res = await fetch(
		`https://api.github.com/users/${encodeURIComponent(username)}/orgs`
	);
	if (!res.ok) {
		return [];
	}
	return (await res.json()) as Org[];
}

function fetchOrgRepos(org: string): Promise<Repo[]> {
	return fetchPaginatedRepos(
		`https://api.github.com/orgs/${encodeURIComponent(org)}/repos?type=public`
	);
}

async function fetchAllGists(username: string): Promise<Gist[]> {
	const res = await fetch(
		`https://api.github.com/users/${encodeURIComponent(username)}/gists?per_page=100`
	);
	if (!res.ok) {
		return [];
	}
	return (await res.json()) as Gist[];
}

const LANGUAGE_COLORS: Record<string, string> = {
	TypeScript: "#3178c6",
	JavaScript: "#f1e05a",
	Python: "#3572A5",
	Java: "#b07219",
	"C#": "#178600",
	"C++": "#f34b7d",
	C: "#555555",
	HTML: "#e34c26",
	CSS: "#563d7c",
	Rust: "#dea584",
	Go: "#00ADD8",
	Kotlin: "#A97BFF",
	Swift: "#F05138",
	Ruby: "#701516",
	PHP: "#4F5D95",
	Shell: "#89e051",
	Lua: "#000080",
	Dart: "#00B4AB",
	Vue: "#41b883",
};

const LANGUAGE_PRIORITY: string[] = [
	"TypeScript",
	"JavaScript",
	"Python",
	"Java",
	"C#",
	"C++",
	"C",
	"Kotlin",
	"Rust",
	"Go",
	"Swift",
	"Ruby",
	"PHP",
	"Shell",
	"Lua",
	"Dart",
	"HTML",
	"CSS",
	"Vue",
];

function sortRepos(repos: Repo[]): Repo[] {
	return [...repos].sort((a, b) => {
		const langA = LANGUAGE_PRIORITY.indexOf(a.language ?? "");
		const langB = LANGUAGE_PRIORITY.indexOf(b.language ?? "");
		const priorityA = langA === -1 ? LANGUAGE_PRIORITY.length : langA;
		const priorityB = langB === -1 ? LANGUAGE_PRIORITY.length : langB;
		if (priorityA !== priorityB) {
			return priorityA - priorityB;
		}
		return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
	});
}

function formatRelativeDate(dateString: string): string {
	const date = new Date(dateString);
	const diffMs = Date.now() - date.getTime();
	const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

	const divisions: { amount: number; name: Intl.RelativeTimeFormatUnit }[] = [
		{ amount: 60, name: "seconds" },
		{ amount: 60, name: "minutes" },
		{ amount: 24, name: "hours" },
		{ amount: 7, name: "days" },
		{ amount: 4.34524, name: "weeks" },
		{ amount: 12, name: "months" },
		{ amount: Number.POSITIVE_INFINITY, name: "years" },
	];

	let duration = diffMs / 1000;
	for (const division of divisions) {
		if (Math.abs(duration) < division.amount) {
			return rtf.format(Math.round(-duration), division.name);
		}
		duration /= division.amount;
	}

	return date.toLocaleDateString();
}

function RepoCard({ repo, internal }: { repo: Repo; internal: boolean }) {
	const card = (
		<>
			<div className="project-card-body">
				<h3 className="project-card-title">{repo.name}</h3>
				<p className="project-card-desc">
					{repo.description ?? <em>No description provided.</em>}
				</p>
			</div>
			<div className="project-card-footer">
				<div style={{ display: "flex", flexDirection: "column" }}>
					<div style={{ display: "flex" }}>
						{repo.language && (
							<span className="project-lang">
								<span
									className="lang-dot"
									style={{
										backgroundColor: LANGUAGE_COLORS[repo.language] ?? "#ccc",
									}}
								/>
								{repo.language}
							</span>
						)}
						{repo.stargazers_count > 0 && (
							<span className="project-stars">⭐ {repo.stargazers_count}</span>
						)}
					</div>
					<span className="repo-updated">
						{formatRelativeDate(repo.updated_at)}
					</span>
				</div>
			</div>
		</>
	);

	if (internal) {
		return (
			<Link
				to={`/projects/${repo.name}`}
				key={repo.name}
				className="project-card"
			>
				{card}
			</Link>
		);
	}

	return (
		<a
			href={repo.html_url}
			key={repo.html_url}
			className="project-card"
			target="_blank"
			rel="noreferrer"
		>
			{card}
		</a>
	);
}

export default function ProjectList() {
	const { t } = useLang();

	const cachedData = useMemo(() => {
		if (typeof localStorage === "undefined") {
			return null;
		}
		const cache = localStorage.getItem(CACHE_KEY);
		if (!cache) {
			return null;
		}
		try {
			const parsed: ProjectsCache = JSON.parse(cache);
			if (
				Array.isArray(parsed.ownerRepos) &&
				Array.isArray(parsed.memberRepos) &&
				Array.isArray(parsed.orgs) &&
				parsed.orgRepos &&
				Array.isArray(parsed.gists)
			) {
				return parsed;
			}
		} catch {
			// ignore
		}
		return null;
	}, []);

	const [ownerRepos, setOwnerRepos] = useState<Repo[]>(
		cachedData?.ownerRepos ?? []
	);
	const [memberRepos, setMemberRepos] = useState<Repo[]>(
		cachedData?.memberRepos ?? []
	);
	const [orgs, setOrgs] = useState<Org[]>(cachedData?.orgs ?? []);
	const [orgRepos, setOrgRepos] = useState<Record<string, Repo[]>>(
		cachedData?.orgRepos ?? {}
	);
	const [gists, setGists] = useState<Gist[]>(cachedData?.gists ?? []);
	const [loading, setLoading] = useState<boolean>(
		!cachedData?.ownerRepos?.length
	);
	const [showAllLessActive, setShowAllLessActive] = useState(false);

	useEffect(() => {
		const refreshData = async () => {
			try {
				const [repoData, memberData, orgData, gistData] = await Promise.all([
					fetchAllRepos(USERNAME),
					fetchMemberRepos(USERNAME),
					fetchOrgs(USERNAME),
					fetchAllGists(USERNAME),
				]);

				const orgReposMap: Record<string, Repo[]> = {};
				if (orgData.length > 0) {
					const results = await Promise.all(
						orgData.map((org) => fetchOrgRepos(org.login))
					);
					for (let i = 0; i < orgData.length; i++) {
						orgReposMap[orgData[i].login] = results[i];
					}
				}

				setOwnerRepos(sortRepos(repoData));
				setMemberRepos(sortRepos(memberData));
				setOrgs(orgData);
				setOrgRepos(orgReposMap);
				setGists(gistData);

				localStorage.setItem(
					CACHE_KEY,
					JSON.stringify({
						ownerRepos: sortRepos(repoData),
						memberRepos: sortRepos(memberData),
						orgs: orgData,
						orgRepos: orgReposMap,
						gists: gistData,
						fetchedAt: Date.now(),
					})
				);
			} catch {
				if (!cachedData?.ownerRepos?.length) {
					setOwnerRepos([]);
				}
				if (!cachedData?.gists?.length) {
					setGists([]);
				}
			} finally {
				setLoading(false);
			}
		};

		refreshData().catch(() => {});
	}, [cachedData]);

	const now = Date.now();

	const activeRepos = useMemo(
		() =>
			ownerRepos.filter(
				(r) =>
					!r.archived && new Date(r.pushed_at).getTime() > now - ONE_YEAR_MS
			),
		[ownerRepos, now]
	);

	const lessActiveRepos = useMemo(
		() =>
			ownerRepos.filter(
				(r) =>
					!r.archived && new Date(r.pushed_at).getTime() <= now - ONE_YEAR_MS
			),
		[ownerRepos, now]
	);

	const archivedRepos = useMemo(
		() => ownerRepos.filter((r) => r.archived),
		[ownerRepos]
	);

	const displayedLessActive = useMemo(
		() =>
			showAllLessActive
				? lessActiveRepos
				: lessActiveRepos.slice(0, INITIAL_DISPLAY_COUNT),
		[lessActiveRepos, showAllLessActive]
	);

	const handleToggleLessActive = useCallback(() => {
		setShowAllLessActive((prev) => !prev);
	}, []);

	if (loading) {
		return <p>{t("project.loading")}</p>;
	}

	return (
		<div className="project-list">
			<h2>Projects</h2>
			<p className="project-subtitle">
				{t("project.repoCount", { n: ownerRepos.length })}
			</p>

			{activeRepos.length > 0 && (
				<section className="project-section">
					<h3 className="project-section-title">
						{t("project.section.active")}
					</h3>
					<div className="project-grid">
						{activeRepos.map((repo) => (
							<RepoCard key={repo.name} repo={repo} internal />
						))}
					</div>
				</section>
			)}

			{lessActiveRepos.length > 0 && (
				<section className="project-section">
					<h3 className="project-section-title">
						{t("project.section.lessActive")}
					</h3>
					<div className="project-grid">
						{displayedLessActive.map((repo) => (
							<RepoCard key={repo.name} repo={repo} internal />
						))}
					</div>
					{lessActiveRepos.length > INITIAL_DISPLAY_COUNT && (
						<button
							type="button"
							className="see-more-btn"
							onClick={handleToggleLessActive}
						>
							{showAllLessActive ? t("project.seeLess") : t("project.seeMore")}
						</button>
					)}
				</section>
			)}

			{memberRepos.length > 0 && (
				<section className="project-section">
					<h3 className="project-section-title">
						{t("project.section.contributed")}
					</h3>
					<div className="project-grid">
						{memberRepos.map((repo) => (
							<RepoCard key={repo.html_url} repo={repo} internal={false} />
						))}
					</div>
				</section>
			)}

			{orgs.length > 0 && (
				<section className="project-section">
					<h3 className="project-section-title">
						{t("project.section.organizations")}
					</h3>
					{orgs.map((org) => {
						const repos = orgRepos[org.login] ?? [];
						if (repos.length === 0) {
							return null;
						}
						return (
							<div key={org.login} className="org-section">
								<div className="org-header">
									<img
										src={org.avatar_url}
										alt={org.login}
										className="org-avatar"
									/>
									<a
										href={org.html_url}
										target="_blank"
										rel="noreferrer"
										className="org-name"
									>
										{org.login}
									</a>
								</div>
								<div className="project-grid">
									{repos.map((repo) => (
										<RepoCard
											key={repo.html_url}
											repo={repo}
											internal={false}
										/>
									))}
								</div>
							</div>
						);
					})}
				</section>
			)}

			{archivedRepos.length > 0 && (
				<section className="project-section">
					<h3 className="project-section-title">
						{t("project.section.archived")}
					</h3>
					<div className="project-grid">
						{archivedRepos.map((repo) => (
							<RepoCard key={repo.name} repo={repo} internal />
						))}
					</div>
				</section>
			)}

			<section className="gist-list">
				<h2>Gists</h2>
				<p className="project-subtitle">
					{t("project.gistCount", { n: gists.length })}
				</p>
				{gists.length > 0 ? (
					<div className="project-grid">
						{gists.map((gist) => {
							const firstFile = Object.values(gist.files)[0];
							const filename = firstFile?.filename ?? "Unknown file";
							const language = firstFile?.language ?? "Unknown language";

							return (
								<a
									href={gist.html_url}
									key={gist.id}
									className="project-card"
									target="_blank"
									rel="noreferrer"
								>
									<div className="project-card-body">
										<h3 className="project-card-title">{filename}</h3>
										<p className="project-card-desc">
											<span
												className="lang-dot"
												style={{
													backgroundColor:
														LANGUAGE_COLORS[language as string] ?? "#ccc",
													marginRight: "5px",
												}}
											/>{" "}
											{language}
										</p>
									</div>
									<div className="project-card-footer">
										<span className="repo-updated">
											{formatRelativeDate(gist.updated_at)}
										</span>
									</div>
								</a>
							);
						})}
					</div>
				) : (
					<p>No gists found.</p>
				)}
			</section>
		</div>
	);
}

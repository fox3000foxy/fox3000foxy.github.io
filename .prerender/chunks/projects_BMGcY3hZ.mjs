import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { _ as renderTemplate, u as renderComponent, v as maybeRenderHead, w as addAttribute } from "./console_B4Ch7nu3.mjs";
import { c as breadcrumbJsonLd, h as createComponent, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
import { n as fetchRepos } from "./github_B7iWNdaq.mjs";
// src/pages/projects.astro
var projects_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Projects,
	file: () => $$file,
	url: () => $$url
});
var $$Projects = createComponent(async ($$result, $$props, $$slots) => {
	const LANGUAGE_COLORS = {
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
		Vue: "#41b883"
	};
	const LANG_PRIORITY = [
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
		"Vue"
	];
	let repos = [];
	let error = "";
	try {
		repos = await fetchRepos();
	} catch (e) {
		error = e.message;
	}
	const sortedRepos = [...repos].sort((a, b) => {
		const ia = LANG_PRIORITY.indexOf(a.language ?? "");
		const ib = LANG_PRIORITY.indexOf(b.language ?? "");
		const pa = ia === -1 ? LANG_PRIORITY.length : ia;
		const pb = ib === -1 ? LANG_PRIORITY.length : ib;
		if (pa !== pb) return pa - pb;
		return new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime();
	});
	const cutoff = Date.now() - 31536e6;
	const active = sortedRepos.filter((r) => !r.fork && new Date(r.pushed_at).getTime() > cutoff);
	const lessActive = sortedRepos.filter((r) => !r.fork && new Date(r.pushed_at).getTime() <= cutoff);
	const forked = sortedRepos.filter((r) => r.fork);
	function formatDate(d) {
		const diff = Date.now() - new Date(d).getTime();
		const days = Math.floor(diff / 864e5);
		if (days < 1) return "today";
		if (days < 30) return `${days}d ago`;
		if (days < 365) return `${Math.floor(days / 30)}mo ago`;
		return `${Math.floor(days / 365)}y ago`;
	}
	const langColor = (l) => LANGUAGE_COLORS[l ?? ""] ?? "#ccc";
	const projectsJsonLd = breadcrumbJsonLd([{
		name: "Home",
		url: "/"
	}, {
		name: "Projects",
		url: "/projects"
	}]);
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "Projects",
		"description": "My open-source projects -- active, less active, forks and contributions",
		"extraHead": `<script type="application/ld+json">${projectsJsonLd}<\/script>`,
		"wide": true,
		"data-astro-cid-3rkrlumz": true
	}, { "default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<div class="project-list" data-astro-cid-3rkrlumz><h1 data-astro-cid-3rkrlumz>Projects</h1><p class="project-subtitle" data-astro-cid-3rkrlumz>${repos.length} repositories</p>${error && renderTemplate`<p class="projects-error" data-astro-cid-3rkrlumz>⚠️ ${error}</p>`}${active.length > 0 && renderTemplate`<section class="project-section" data-astro-cid-3rkrlumz><h3 class="project-section-title" data-astro-cid-3rkrlumz>Active</h3><div class="project-grid" data-astro-cid-3rkrlumz>${active.map((repo) => renderTemplate`<a${addAttribute(`/projects/${repo.name}`, "href")} class="project-card" data-astro-cid-3rkrlumz><div class="project-card-body" data-astro-cid-3rkrlumz><h3 class="project-card-title" data-astro-cid-3rkrlumz>${repo.name}</h3><p class="project-card-desc" data-astro-cid-3rkrlumz>${repo.description ?? renderTemplate`<em data-astro-cid-3rkrlumz>No description</em>`}</p></div><div class="project-card-footer" data-astro-cid-3rkrlumz><div data-astro-cid-3rkrlumz>${repo.language && renderTemplate`<span class="project-lang" data-astro-cid-3rkrlumz><span class="lang-dot"${addAttribute(`background-color:${langColor(repo.language)}`, "style")} data-astro-cid-3rkrlumz></span>${repo.language}</span>`}${repo.stargazers_count > 0 && renderTemplate`<span class="project-stars" data-astro-cid-3rkrlumz>⭐ ${repo.stargazers_count}</span>`}</div><span class="repo-updated" data-astro-cid-3rkrlumz>${formatDate(repo.pushed_at)}</span></div></a>`)}</div></section>`}${lessActive.length > 0 && renderTemplate`<section class="project-section" data-astro-cid-3rkrlumz><h3 class="project-section-title" data-astro-cid-3rkrlumz>Less active</h3><div class="project-grid" data-astro-cid-3rkrlumz>${lessActive.map((repo) => renderTemplate`<a${addAttribute(`/projects/${repo.name}`, "href")} class="project-card" data-astro-cid-3rkrlumz><div class="project-card-body" data-astro-cid-3rkrlumz><h3 class="project-card-title" data-astro-cid-3rkrlumz>${repo.name}</h3><p class="project-card-desc" data-astro-cid-3rkrlumz>${repo.description ?? renderTemplate`<em data-astro-cid-3rkrlumz>No description</em>`}</p></div><div class="project-card-footer" data-astro-cid-3rkrlumz><div data-astro-cid-3rkrlumz>${repo.language && renderTemplate`<span class="project-lang" data-astro-cid-3rkrlumz><span class="lang-dot"${addAttribute(`background-color:${langColor(repo.language)}`, "style")} data-astro-cid-3rkrlumz></span>${repo.language}</span>`}${repo.stargazers_count > 0 && renderTemplate`<span class="project-stars" data-astro-cid-3rkrlumz>⭐ ${repo.stargazers_count}</span>`}</div><span class="repo-updated" data-astro-cid-3rkrlumz>${formatDate(repo.pushed_at)}</span></div></a>`)}</div></section>`}${forked.length > 0 && renderTemplate`<section class="project-section" data-astro-cid-3rkrlumz><h3 class="project-section-title" data-astro-cid-3rkrlumz>Forks & contributions</h3><div class="project-grid" data-astro-cid-3rkrlumz>${forked.map((repo) => renderTemplate`<a${addAttribute(repo.html_url, "href")} target="_blank" rel="noopener noreferrer" class="project-card" data-astro-cid-3rkrlumz><div class="project-card-body" data-astro-cid-3rkrlumz><h3 class="project-card-title" data-astro-cid-3rkrlumz>${repo.name}</h3><p class="project-card-desc" data-astro-cid-3rkrlumz>${repo.description ?? renderTemplate`<em data-astro-cid-3rkrlumz>No description</em>`}</p></div><div class="project-card-footer" data-astro-cid-3rkrlumz><div data-astro-cid-3rkrlumz>${repo.language && renderTemplate`<span class="project-lang" data-astro-cid-3rkrlumz><span class="lang-dot"${addAttribute(`background-color:${langColor(repo.language)}`, "style")} data-astro-cid-3rkrlumz></span>${repo.language}</span>`}${repo.stargazers_count > 0 && renderTemplate`<span class="project-stars" data-astro-cid-3rkrlumz>⭐ ${repo.stargazers_count}</span>`}</div><span class="repo-updated" data-astro-cid-3rkrlumz>${formatDate(repo.pushed_at)}</span></div></a>`)}</div></section>`}</div>` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/projects.astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/projects.astro";
var $$url = "/projects";
// \0virtual:astro:page:src/pages/projects@_@astro
var page = () => projects_exports;
export { page };

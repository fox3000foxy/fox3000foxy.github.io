import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { E as unescapeHTML, _ as renderTemplate, d as Fragment, u as renderComponent, v as maybeRenderHead, w as addAttribute } from "./console_B4Ch7nu3.mjs";
import { h as createComponent, m as createAstro, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
import { n as fetchRepos, t as fetchReadme } from "./github_B7iWNdaq.mjs";
import { t as renderMarkdown } from "./markdown_BCVPBWCJ.mjs";
// src/pages/projects/[slug].astro
var _slug__exports = /* @__PURE__ */ __exportAll({
	default: () => $$Slug,
	file: () => $$file,
	getStaticPaths: () => getStaticPaths,
	url: () => $$url
});
createAstro("https://fox3000foxy.com");
async function getStaticPaths() {
	let repos = [];
	try {
		repos = await fetchRepos();
	} catch {
		return [{
			params: { slug: "placeholder" },
			props: {
				repo: null,
				readme: ""
			}
		}];
	}
	const readmes = await Promise.all(repos.map((r) => fetchReadme(r.name, r.default_branch, r.owner).catch(() => "")));
	return repos.map((repo, i) => ({
		params: { slug: repo.name },
		props: {
			repo,
			readme: readmes[i]
		}
	}));
}
var $$Slug = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Slug;
	const { repo, readme } = Astro.props;
	const slug = Astro.params.slug;
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": repo?.name ?? slug,
		"description": repo?.description ?? "",
		"wide": true,
		"data-astro-cid-yq2gsstb": true
	}, { "default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<article data-astro-cid-yq2gsstb><p class="project-back" data-astro-cid-yq2gsstb><a href="/projects" data-astro-cid-yq2gsstb>← Back to projects</a></p>${repo ? renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate`<div class="project-header-meta" data-astro-cid-yq2gsstb>${repo.description && renderTemplate`<p class="article-description" data-astro-cid-yq2gsstb>${repo.description}</p>`}<p class="project-meta-links" data-astro-cid-yq2gsstb><a${addAttribute(repo.html_url, "href")} target="_blank" rel="noopener noreferrer" data-astro-cid-yq2gsstb>View on GitHub</a>${repo.language && renderTemplate`<span class="project-meta-lang" data-astro-cid-yq2gsstb>${repo.language}</span>`}${repo.stargazers_count > 0 && renderTemplate`<span data-astro-cid-yq2gsstb>★ ${repo.stargazers_count}</span>`}</p></div><div class="project-readme" data-astro-cid-yq2gsstb>${unescapeHTML(readme ? renderMarkdown(readme) : "<p>No README available.</p>")}</div>` })}` : renderTemplate`<p data-astro-cid-yq2gsstb>Project not found.</p>`}</article>` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/projects/[slug].astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/projects/[slug].astro";
var $$url = "/projects/[slug]";
// \0virtual:astro:page:src/pages/projects/[slug]@_@astro
var page = () => _slug__exports;
export { page };

import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { _ as renderTemplate, u as renderComponent, v as maybeRenderHead, w as addAttribute } from "./console_B4Ch7nu3.mjs";
import { h as createComponent, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
import { i as createT } from "./i18n_Bu9Xwf1t.mjs";
import { n as readAllArticleIndexes } from "./langContent_S7f5E-LS.mjs";
// src/pages/tags/index.astro
var tags_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Index,
	file: () => $$file,
	url: () => $$url
});
var $$Index = createComponent(($$result, $$props, $$slots) => {
	const allIndexes = readAllArticleIndexes();
	const t = createT("en");
	const normalized = (allIndexes?.en ?? []).map((item) => typeof item === "string" ? { slug: item } : item);
	const HIDDEN_TAGS = /* @__PURE__ */ new Set(["honeypot"]);
	const tagCounts = /* @__PURE__ */ new Map();
	for (const a of normalized) for (const tag of a.tags ?? []) {
		if (HIDDEN_TAGS.has(tag)) continue;
		tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
	}
	const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "Tags",
		"description": "All tags",
		"wide": true
	}, { "default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<div class="tags-index"><h2>${t("tags.title")}</h2>${sortedTags.length === 0 ? renderTemplate`<p>${t("blog.no.articles")}</p>` : renderTemplate`<div class="tags-cloud">${sortedTags.map(([tag, count]) => renderTemplate`<a${addAttribute(`/tags/${tag}`, "href")} class="tag-cloud-item"><span class="tag-label">${tag}</span><span class="tag-count">${count}</span></a>`)}</div>`}</div>` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/tags/index.astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/tags/index.astro";
var $$url = "/tags";
// \0virtual:astro:page:src/pages/tags/index@_@astro
var page = () => tags_exports;
export { page };

import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { _ as renderTemplate, u as renderComponent, v as maybeRenderHead, w as addAttribute } from "./console_B4Ch7nu3.mjs";
import { c as breadcrumbJsonLd, h as createComponent, m as createAstro, n as $$Image, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
import { n as readAllArticleIndexes } from "./langContent_S7f5E-LS.mjs";
import { i as createT } from "./i18n_Bu9Xwf1t.mjs";
import { n as getAuthors } from "./authors_DpDBersm.mjs";
import { t as isNew } from "./isNew_CQxT6q0L.mjs";
import fs from "node:fs";
import path from "node:path";
// src/pages/tags/[tag].astro
var _tag__exports = /* @__PURE__ */ __exportAll({
	default: () => $$Tag,
	file: () => $$file,
	getStaticPaths: () => getStaticPaths,
	url: () => $$url
});
createAstro("https://fox3000foxy.com");
async function getStaticPaths() {
	const indexPath = path.resolve("public/articles/en/index.json");
	if (!fs.existsSync(indexPath)) return [];
	const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
	const tags = /* @__PURE__ */ new Set();
	const HIDDEN_TAGS = /* @__PURE__ */ new Set(["honeypot"]);
	for (const entry of index) if (entry.tags) for (const tag of entry.tags) {
		if (HIDDEN_TAGS.has(tag)) continue;
		tags.add(tag);
	}
	return [...tags].map((tag) => ({ params: { tag } }));
}
var $$Tag = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Tag;
	const { tag } = Astro.params;
	const allIndexes = readAllArticleIndexes();
	const t = createT("en");
	const normalized = (allIndexes?.en ?? []).map((item) => typeof item === "string" ? { slug: item } : item);
	const articles = tag ? normalized.filter((a) => a.tags?.includes(tag)).sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()) : [];
	const tagJsonLd = breadcrumbJsonLd([
		{
			name: "Home",
			url: "/"
		},
		{
			name: "Tags",
			url: "/tags"
		},
		{
			name: `#${tag}`,
			url: `/tags/${tag}`
		}
	]);
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": `#${tag}`,
		"description": `Articles tagged with ${tag}`,
		"extraHead": `<script type="application/ld+json">${tagJsonLd}<\/script>`,
		"wide": true
	}, { "default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<div class="blog-list"><div class="tag-page-header"><a href="/blog" class="tag-page-back">← ${t("blog.title")}</a><h2>#${tag}</h2></div>${articles.length > 0 ? renderTemplate`<div class="blog-grid">${articles.map((article) => {
		const { slug, title, description, date, tags, image, authors, aiGenerated, sponsored } = article;
		const authorList = getAuthors(authors);
		return renderTemplate`<a${addAttribute(`/blog/${slug}`, "href")} class="blog-card">${image && renderTemplate`<img class="blog-card-img"${addAttribute(image, "src")} alt="" loading="lazy" decoding="async">`}<div class="blog-card-body"><h3 class="blog-card-title">${title ?? slug?.replace(/-/g, " ")}</h3>${(isNew(date) || aiGenerated || sponsored) && renderTemplate`<div class="blog-card-badges">${isNew(date) && renderTemplate`<span class="new-badge">NEW</span>`}${aiGenerated && renderTemplate`<span class="ai-badge">${t("article.ai")}</span>`}${sponsored && renderTemplate`<span class="sponsored-badge">💕 Sponsorisé</span>`}</div>`}${description && renderTemplate`<p class="blog-card-desc">${description}</p>`}${tags && tags.length > 0 && renderTemplate`<div class="blog-card-tags">${tags.map((t) => renderTemplate`<span class="tag-badge">${t}</span>`)}</div>`}</div><div class="blog-card-footer"><div class="blog-card-meta">${date && renderTemplate`<time${addAttribute(date, "datetime")}>${(/* @__PURE__ */ new Date(`${date}T00:00:00`)).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric"
		})}</time>`}</div><div class="blog-card-authors">${authorList.map((a) => renderTemplate`${renderComponent($$result, "Image", $$Image, {
			"class": "blog-card-author-avatar",
			"src": a.avatar ?? `https://github.com/${a.id}.png`,
			"alt": a.name,
			"title": a.name,
			"width": 20,
			"height": 20
		})}`)}</div></div></a>`;
	})}</div>` : renderTemplate`<p>${t("blog.no.tag", { tag: tag || "" })}</p>`}</div>` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/tags/[tag].astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/tags/[tag].astro";
var $$url = "/tags/[tag]";
// \0virtual:astro:page:src/pages/tags/[tag]@_@astro
var page = () => _tag__exports;
export { page };

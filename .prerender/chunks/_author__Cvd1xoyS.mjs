import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { _ as renderTemplate, u as renderComponent, v as maybeRenderHead, w as addAttribute } from "./console_B4Ch7nu3.mjs";
import { h as createComponent, m as createAstro, n as $$Image, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
import { n as readAllArticleIndexes } from "./langContent_S7f5E-LS.mjs";
import { t as getAuthor } from "./authors_DpDBersm.mjs";
/* empty css                   */
// src/pages/authors/[author].astro
var _author__exports = /* @__PURE__ */ __exportAll({
	default: () => $$Author,
	file: () => $$file,
	getStaticPaths: () => getStaticPaths,
	url: () => $$url
});
createAstro("https://fox3000foxy.com");
async function getStaticPaths() {
	const enIndex = readAllArticleIndexes().en ?? [];
	const authors = /* @__PURE__ */ new Set();
	for (const entry of enIndex) if (entry.authors) for (const a of entry.authors) authors.add(a);
	return [...authors].map((author) => ({ params: { author } }));
}
var $$Author = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Author;
	const { author: authorId } = Astro.params;
	const articles = (readAllArticleIndexes().en ?? []).filter((a) => a.authors?.includes(authorId)).sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
	const authorInfo = getAuthor(authorId);
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": authorInfo.name,
		"description": `Articles by ${authorInfo.name}`
	}, { "default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<div class="blog-list"><div class="tag-page-header"><a href="/blog" class="tag-page-back">← Blog</a><div class="author-page-title">${renderComponent($$result, "Image", $$Image, {
		"class": "author-page-avatar",
		"src": authorInfo.avatar ?? `https://github.com/${authorInfo.id}.png`,
		"alt": authorInfo.name,
		"width": 64,
		"height": 64
	})}<h2>${authorInfo.name}</h2></div></div>${articles.length > 0 ? renderTemplate`<div class="blog-grid">${articles.map((article) => renderTemplate`<a${addAttribute(`/blog/${article.slug}`, "href")} class="blog-card"><h3>${article.title ?? article.slug}</h3>${article.description && renderTemplate`<p>${article.description}</p>`}<div class="blog-card-meta">${article.date && renderTemplate`<time>${article.date}</time>`}${article.tags && article.tags.length > 0 && renderTemplate`<div class="blog-card-tags">${article.tags.map((tag) => renderTemplate`<span class="tag-badge">${tag}</span>`)}</div>`}</div></a>`)}</div>` : renderTemplate`<p>No articles found for this author.</p>`}</div>` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/authors/[author].astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/authors/[author].astro";
var $$url = "/authors/[author]";
// \0virtual:astro:page:src/pages/authors/[author]@_@astro
var page = () => _author__exports;
export { page };

import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { _ as renderTemplate, u as renderComponent, v as maybeRenderHead, w as addAttribute } from "./console_B4Ch7nu3.mjs";
import { h as createComponent, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
import { t as ALL_LANGS } from "./types_BCRoIkYX.mjs";
import { n as readAllArticleIndexes } from "./langContent_S7f5E-LS.mjs";
import { i as createT } from "./i18n_Bu9Xwf1t.mjs";
// src/pages/archive.astro
var archive_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Archive,
	file: () => $$file,
	url: () => $$url
});
var $$Archive = createComponent(($$result, $$props, $$slots) => {
	const allIndexes = readAllArticleIndexes();
	const t = createT("en");
	const lang = "en";
	function groupByYearMonth(articles, locale) {
		const map = /* @__PURE__ */ new Map();
		for (const a of articles) {
			if (!a.date) continue;
			const d = /* @__PURE__ */ new Date(`${a.date}T00:00:00`);
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(a);
		}
		return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([key, arts]) => {
			const [year, month] = key.split("-");
			return {
				label: new Date(Number(year), Number(month) - 1).toLocaleDateString(locale, {
					year: "numeric",
					month: "long"
				}),
				articles: arts
			};
		});
	}
	const groups = groupByYearMonth((allIndexes?.[lang] ?? allIndexes?.en ?? []).map((item) => typeof item === "string" ? { slug: item } : item), ALL_LANGS[0]);
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "Archive",
		"description": "All articles by date",
		"wide": true
	}, { "default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<div class="archive"><h2>${t("archive.title")}</h2>${groups.length === 0 ? renderTemplate`<p>${t("archive.loading")}</p>` : groups.map((group) => renderTemplate`<section class="archive-group"><h3 class="archive-month">${group.label}</h3><ul class="archive-list">${group.articles.map((a) => renderTemplate`<li class="archive-item"><time class="archive-day"${addAttribute(a.date, "datetime")}>${a.date ? (/* @__PURE__ */ new Date(`${a.date}T00:00:00`)).getDate() : "??"}</time><a${addAttribute(`/blog/${a.slug}`, "href")} class="archive-link">${a.title ?? a.slug.replace(/-/g, " ")}</a></li>`)}</ul></section>`)}</div>` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/archive.astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/archive.astro";
var $$url = "/archive";
// \0virtual:astro:page:src/pages/archive@_@astro
var page = () => archive_exports;
export { page };

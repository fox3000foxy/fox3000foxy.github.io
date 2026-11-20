import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { E as unescapeHTML, _ as renderTemplate, u as renderComponent, v as maybeRenderHead, w as addAttribute } from "./console_B4Ch7nu3.mjs";
import { c as breadcrumbJsonLd, h as createComponent, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
import { t as ALL_LANGS } from "./types_BCRoIkYX.mjs";
import { t as renderMarkdown } from "./markdown_BCVPBWCJ.mjs";
import fs from "node:fs";
import path from "node:path";
// src/pages/legacy.astro
var legacy_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Legacy,
	file: () => $$file,
	url: () => $$url
});
var $$Legacy = createComponent(($$result, $$props, $$slots) => {
	const allContent = {};
	for (const lang of ALL_LANGS) {
		const filePath = path.resolve(`public/legacy.${lang}.md`);
		if (fs.existsSync(filePath)) allContent[lang] = renderMarkdown(fs.readFileSync(filePath, "utf-8"));
	}
	if (!allContent["en"]) allContent["en"] = renderMarkdown(fs.readFileSync(path.resolve("public/legacy.md"), "utf-8"));
	const en = allContent["en"] ?? "";
	for (const lang of ALL_LANGS) if (!allContent[lang]) allContent[lang] = en;
	const legacyJsonLd = breadcrumbJsonLd([{
		name: "Home",
		url: "/"
	}, {
		name: "Portfolio",
		url: "/legacy"
	}]);
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "Portfolio",
		"description": "Legacy portfolio -- projects, contributions, and open-source work by Fox3000foxy",
		"extraHead": `<script type="application/ld+json">${legacyJsonLd}<\/script>`
	}, { "default": ($$result) => renderTemplate`${ALL_LANGS.map((l) => renderTemplate`${maybeRenderHead($$result)}<article class="home lang-content"${addAttribute(l, "data-lang")}>${unescapeHTML(allContent[l])}</article>`)}` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/legacy.astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/legacy.astro";
var $$url = "/legacy";
// \0virtual:astro:page:src/pages/legacy@_@astro
var page = () => legacy_exports;
export { page };

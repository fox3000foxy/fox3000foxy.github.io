import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { E as unescapeHTML, _ as renderTemplate, u as renderComponent, v as maybeRenderHead, w as addAttribute } from "./console_B4Ch7nu3.mjs";
import { h as createComponent, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
import { t as renderMarkdown } from "./markdown_BCVPBWCJ.mjs";
import { t as ALL_LANGS } from "./types_BCRoIkYX.mjs";
import fs from "node:fs";
import path from "node:path";
// src/pages/uses.astro
var uses_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Uses,
	file: () => $$file,
	url: () => $$url
});
var $$Uses = createComponent(($$result, $$props, $$slots) => {
	const allContent = {};
	for (const lang of ALL_LANGS) {
		const filePath = path.resolve(`public/uses.${lang}.md`);
		if (fs.existsSync(filePath)) allContent[lang] = renderMarkdown(fs.readFileSync(filePath, "utf-8"));
	}
	if (!allContent["en"]) allContent["en"] = renderMarkdown(fs.readFileSync(path.resolve("public/uses.md"), "utf-8"));
	const en = allContent["en"] ?? "";
	for (const lang of ALL_LANGS) if (!allContent[lang]) allContent[lang] = en;
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "Uses",
		"description": "Tools and software I use"
	}, { "default": ($$result) => renderTemplate`${ALL_LANGS.map((l) => renderTemplate`${maybeRenderHead($$result)}<article class="lang-content"${addAttribute(l, "data-lang")}>${unescapeHTML(allContent[l])}</article>`)}` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/uses.astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/uses.astro";
var $$url = "/uses";
// \0virtual:astro:page:src/pages/uses@_@astro
var page = () => uses_exports;
export { page };

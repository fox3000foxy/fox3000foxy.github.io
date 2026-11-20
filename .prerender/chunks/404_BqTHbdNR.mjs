import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { E as unescapeHTML, _ as renderTemplate, u as renderComponent, v as maybeRenderHead, w as addAttribute } from "./console_B4Ch7nu3.mjs";
import { h as createComponent, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
import { t as renderMarkdown } from "./markdown_BCVPBWCJ.mjs";
import { t as ALL_LANGS } from "./types_BCRoIkYX.mjs";
import { i as createT } from "./i18n_Bu9Xwf1t.mjs";
import fs from "node:fs";
import path from "node:path";
// src/pages/404.astro
var _404_exports = /* @__PURE__ */ __exportAll({
	default: () => $$404,
	file: () => $$file,
	url: () => $$url
});
var $$404 = createComponent(($$result, $$props, $$slots) => {
	const t = createT("en");
	const allContent = {};
	for (const lang of ALL_LANGS) {
		const filePath = path.resolve(`public/404.${lang}.md`);
		if (fs.existsSync(filePath)) allContent[lang] = renderMarkdown(fs.readFileSync(filePath, "utf-8"));
	}
	if (!allContent["en"]) {
		const fallback = path.resolve("public/404.md");
		if (fs.existsSync(fallback)) allContent["en"] = renderMarkdown(fs.readFileSync(fallback, "utf-8"));
	}
	const en = allContent["en"] ?? "";
	for (const lang of ALL_LANGS) if (!allContent[lang]) allContent[lang] = en;
	const redirectScript = `(function(){var ls=${JSON.stringify(ALL_LANGS)};var p=location.pathname;for(var i=0;i<ls.length;i++){var pref='/'+ls[i];if(p===pref||p===pref+'/'){location.replace('/');return}if(p.indexOf(pref+'/')===0){location.replace(p.slice(pref.length));return}}})()`;
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "404",
		"description": "Page not found"
	}, { "default": ($$result) => renderTemplate`<script>${unescapeHTML(redirectScript)}<\/script>${ALL_LANGS.map((l) => renderTemplate`${maybeRenderHead($$result)}<div class="lang-content"${addAttribute(l, "data-lang")}>${allContent[l] ? renderTemplate`<article>${unescapeHTML(allContent[l])}</article>` : renderTemplate`<div><h2>404</h2><p>${t("notFound.title")}</p><p><a href="/">${t("notFound.return")}</a></p></div>`}</div>`)}` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/404.astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/404.astro";
var $$url = "/404";
// \0virtual:astro:page:src/pages/404@_@astro
var page = () => _404_exports;
export { page };

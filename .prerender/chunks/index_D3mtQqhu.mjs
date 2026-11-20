import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { E as unescapeHTML, _ as renderTemplate, u as renderComponent, v as maybeRenderHead, w as addAttribute } from "./console_B4Ch7nu3.mjs";
import { c as breadcrumbJsonLd, d as siteNavigationJsonLd, f as webSiteJsonLd, h as createComponent, p as SITE_DESCRIPTION, t as $$BaseLayout, u as personJsonLd } from "./BaseLayout_DjXKcLim.mjs";
import { t as ALL_LANGS } from "./types_BCRoIkYX.mjs";
import { r as readAllHomeContent } from "./langContent_S7f5E-LS.mjs";
// src/pages/index.astro
var pages_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Index,
	file: () => $$file,
	url: () => ""
});
var $$Index = createComponent(($$result, $$props, $$slots) => {
	const allContent = readAllHomeContent();
	const homeJsonLd = [
		webSiteJsonLd(),
		personJsonLd(),
		siteNavigationJsonLd(),
		breadcrumbJsonLd([{
			name: "Home",
			url: "/"
		}])
	].map((s) => `<script type="application/ld+json">${s}<\/script>`).join("\n");
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "Home",
		"description": SITE_DESCRIPTION,
		"extraHead": homeJsonLd
	}, { "default": ($$result) => renderTemplate`${ALL_LANGS.map((l) => renderTemplate`${maybeRenderHead($$result)}<article class="home lang-content"${addAttribute(l, "data-lang")}>${unescapeHTML(allContent[l])}</article>`)}` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/index.astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/index.astro";
// \0virtual:astro:page:src/pages/index@_@astro
var page = () => pages_exports;
export { page };

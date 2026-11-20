import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { _ as renderTemplate, u as renderComponent } from "./console_B4Ch7nu3.mjs";
import { h as createComponent, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
// src/pages/write.astro
var write_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Write,
	file: () => $$file,
	url: () => $$url
});
var $$Write = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "Write Article",
		"description": "Write and submit a new article",
		"wide": true
	}, { "default": ($$result) => renderTemplate`${renderComponent($$result, "WriteArticle", null, {
		"client:only": "react",
		"client:component-hydration": "only",
		"client:component-path": "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/islands/WriteArticle.tsx",
		"client:component-export": "default"
	})}` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/write.astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/write.astro";
var $$url = "/write";
// \0virtual:astro:page:src/pages/write@_@astro
var page = () => write_exports;
export { page };

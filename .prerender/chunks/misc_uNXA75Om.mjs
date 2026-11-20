import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { _ as renderTemplate, u as renderComponent, v as maybeRenderHead } from "./console_B4Ch7nu3.mjs";
import { h as createComponent, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
// src/pages/misc.astro
var misc_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Misc,
	file: () => $$file,
	url: () => $$url
});
var $$Misc = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "Misc",
		"description": "Miscellaneous interactive tools and experiments",
		"data-astro-cid-hu5d6jpf": true
	}, { "default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<article data-astro-cid-hu5d6jpf><h1 data-astro-cid-hu5d6jpf>Misc</h1><p data-astro-cid-hu5d6jpf>Interactive tools, chatbots, and experiments — all running client-side in your browser.</p><div class="misc-grid" data-astro-cid-hu5d6jpf><a href="/misc/chatbots" class="misc-card" data-astro-cid-hu5d6jpf><h2 data-astro-cid-hu5d6jpf>Chatbots</h2><p data-astro-cid-hu5d6jpf>Historic conversational agents ported to TypeScript — ELIZA, PARRY, A.L.I.C.E., Jabberwacky, and Cleverbot. Talk with them directly in your browser.</p><span class="misc-link" data-astro-cid-hu5d6jpf>Try it →</span></a></div></article>` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/misc.astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/misc.astro";
var $$url = "/misc";
// \0virtual:astro:page:src/pages/misc@_@astro
var page = () => misc_exports;
export { page };

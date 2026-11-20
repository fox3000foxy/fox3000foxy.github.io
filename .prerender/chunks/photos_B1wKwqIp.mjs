import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { _ as renderTemplate, u as renderComponent, v as maybeRenderHead } from "./console_B4Ch7nu3.mjs";
import { h as createComponent, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
// src/pages/photos.astro
var photos_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Photos,
	file: () => $$file,
	url: () => $$url
});
var $$Photos = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "Photos",
		"description": "Photo gallery",
		"wide": true,
		"data-astro-cid-6bdwuc52": true
	}, { "default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<h1 data-astro-cid-6bdwuc52>Photos</h1><div class="photos-grid" data-astro-cid-6bdwuc52><p data-astro-cid-6bdwuc52>Photo gallery coming soon.</p></div>` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/photos.astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/photos.astro";
var $$url = "/photos";
// \0virtual:astro:page:src/pages/photos@_@astro
var page = () => photos_exports;
export { page };

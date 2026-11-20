import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { E as unescapeHTML, _ as renderTemplate, d as Fragment, u as renderComponent, v as maybeRenderHead, w as addAttribute } from "./console_B4Ch7nu3.mjs";
import { c as breadcrumbJsonLd, h as createComponent, m as createAstro, n as $$Image, s as articleJsonLd, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
import { i as createT } from "./i18n_Bu9Xwf1t.mjs";
import { t as ALL_LANGS } from "./types_BCRoIkYX.mjs";
import { n as readAllArticleIndexes, t as readAllArticleData } from "./langContent_S7f5E-LS.mjs";
import { t as renderMarkdown } from "./markdown_BCVPBWCJ.mjs";
import { n as getAuthors } from "./authors_DpDBersm.mjs";
import { t as isNew } from "./isNew_CQxT6q0L.mjs";
import fs from "node:fs";
import path from "node:path";
// src/utils/frontmatter.ts
function parseFrontMatter(text) {
	const meta = {};
	const normalized = text.replace(/\r\n/g, "\n");
	let content = normalized;
	if (normalized.startsWith("---\n")) {
		const end = normalized.indexOf("\n---\n", 4);
		if (end !== -1) {
			const raw = normalized.slice(4, end);
			content = normalized.slice(end + 5);
			const lines = raw.split("\n");
			let listKey = null;
			for (const line of lines) {
				const colonIdx = line.indexOf(":");
				if (colonIdx !== -1) {
					listKey = null;
					const key = line.slice(0, colonIdx).trim();
					const val = line.slice(colonIdx + 1).trim();
					if (key === "title") meta.title = val.replace(/^["']|["']$/g, "");
					else if (key === "description") meta.description = val.replace(/^["']|["']$/g, "");
					else if (key === "date") meta.date = val;
					else if (key === "lastmod") meta.lastmod = val;
					else if (key === "aiGenerated") meta.aiGenerated = val === "true";
					else if (key === "sponsored") meta.sponsored = val === "true";
					else if (key === "series") meta.series = val;
					else if (key === "tags" || key === "authors") {
						const arr = val.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
						if (!(arr.length || val)) {
							listKey = key;
							if (key === "tags") meta.tags = [];
							else meta.authors = [];
						} else if (key === "tags") meta.tags = arr;
						else meta.authors = arr;
					} else if (key === "author_pubkey") meta.author_pubkey = val.replace(/^["']|["']$/g, "");
					else if (key === "author_sig") meta.author_sig = val.replace(/^["']|["']$/g, "");
				} else if (listKey && /^\s+-\s+/.test(line)) {
					const item = line.replace(/^\s+-\s+/, "").trim();
					if (item) {
						if (listKey === "tags") meta.tags = [...meta.tags || [], item];
						else if (listKey === "authors") meta.authors = [...meta.authors || [], item];
					}
				}
			}
		}
	}
	return {
		meta,
		content
	};
}
// src/utils/headings.ts
function slugify(text) {
	return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
function parseHeadings(markdown) {
	const regex = /^(#{2,3})\s+(.+)$/gm;
	const entries = [];
	while (true) {
		const match = regex.exec(markdown);
		if (match === null) break;
		const level = match[1].length;
		const text = match[2].trim();
		entries.push({
			level,
			text,
			id: slugify(text)
		});
	}
	return entries;
}
// src/pages/blog/[slug].astro
var _slug__exports = /* @__PURE__ */ __exportAll({
	default: () => $$Slug,
	file: () => $$file,
	getStaticPaths: () => getStaticPaths,
	url: () => $$url
});
createAstro("https://fox3000foxy.com");
async function getStaticPaths() {
	const allSlugs = /* @__PURE__ */ new Set();
	for (const lang of ALL_LANGS) {
		const indexPath = path.resolve(`public/articles/${lang}/index.json`);
		if (fs.existsSync(indexPath)) {
			const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
			for (const entry of index) if (entry.slug) allSlugs.add(entry.slug);
		}
	}
	return Array.from(allSlugs).map((slug) => ({ params: { slug } }));
}
var $$Slug = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Slug;
	const { slug } = Astro.params;
	const data = slug ? readAllArticleData(slug) : null;
	const allMeta = {};
	if (data) {
		for (const lang of ALL_LANGS) {
			const raw = data.raw[lang];
			if (raw) {
				const { meta } = parseFrontMatter(raw);
				allMeta[lang] = {
					...meta,
					slug
				};
			}
		}
		if (!allMeta["en"] && ALL_LANGS.length > 0) {
			const first = ALL_LANGS.find((l) => allMeta[l]);
			if (first) allMeta["en"] = allMeta[first];
		}
		const enMeta = allMeta["en"] || {};
		for (const lang of ALL_LANGS) if (!allMeta[lang]) allMeta[lang] = enMeta;
	}
	const enMeta = allMeta["en"] || {};
	const title = enMeta.title || "Article";
	const description = enMeta.description || "";
	const t = createT("en");
	function formatDate(date, _lang) {
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric"
		});
	}
	function readingTime(text) {
		const noCode = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "");
		return Math.max(1, Math.ceil(noCode.trim().split(/\s+/).length / 150));
	}
	function processArticleContent(text) {
		return text.replaceAll("assets/", "/articles/assets/");
	}
	const bodyEn = data?.content?.["en"] ? renderMarkdown(processArticleContent(data.content["en"])) : "";
	const rawBodyEn = data?.content?.["en"] ? processArticleContent(data.content["en"]) : "";
	const articleUrl = `https://fox3000foxy.com/blog/${slug}`;
	const ogImage = data?.firstImage || "";
	const articleMetaTags = enMeta.date ? `
  <meta property="og:type" content="article" />
  <meta property="article:published_time" content="${enMeta.date}" />
  ${enMeta.lastmod ? `<meta property="article:modified_time" content="${enMeta.lastmod}" />` : ""}
  ${(enMeta.tags || []).filter((t) => !["honeypot"].includes(t)).map((t) => `<meta property="article:tag" content="${t}" />`).join("\n  ")}
` : "";
	const articleSchemaJson = data ? articleJsonLd({
		slug: slug || "",
		title: enMeta.title || slug || "",
		description: enMeta.description || "",
		datePublished: enMeta.date || "",
		dateModified: enMeta.lastmod || enMeta.date || "",
		authors: enMeta.authors || ["fox3000foxy"],
		tags: enMeta.tags,
		image: ogImage || void 0,
		inLanguage: "en",
		wordCount: rawBodyEn ? rawBodyEn.split(/\s+/).length : void 0
	}) : "";
	const breadcrumbSchemaJson = breadcrumbJsonLd([
		{
			name: "Home",
			url: "/"
		},
		{
			name: "Blog",
			url: "/blog"
		},
		{
			name: title,
			url: `/blog/${slug}`
		}
	]);
	const extraHead = articleMetaTags + (articleSchemaJson ? `<script type="application/ld+json">${articleSchemaJson}<\/script><script type="application/ld+json">${breadcrumbSchemaJson}<\/script>` : "");
	const allArticles = ((data?.allIndexes ?? readAllArticleIndexes())?.en ?? []).map((item) => typeof item === "string" ? { slug: item } : item);
	const sorted = [...allArticles].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
	const idx = sorted.findIndex((a) => a.slug === slug);
	const prevArticle = idx < sorted.length - 1 ? sorted[idx + 1] : null;
	const nextArticle = idx > 0 ? sorted[idx - 1] : null;
	const HIDDEN_TAGS = /* @__PURE__ */ new Set(["honeypot"]);
	const currentTags = (enMeta.tags ?? []).filter((t) => !HIDDEN_TAGS.has(t));
	const suggested = allArticles.filter((a) => a.slug !== slug).map((a) => ({
		article: a,
		score: currentTags.filter((tag) => (a.tags ?? []).includes(tag)).length
	})).filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": title,
		"description": description,
		"canonical": articleUrl,
		"extraHead": extraHead,
		"image": ogImage,
		"wide": true,
		"data-astro-cid-zg7dkzxc": true
	}, { "default": ($$result) => renderTemplate`${data ? renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate`${ALL_LANGS.map((l) => {
		const langKey = l;
		if (!data.hasTranslation[langKey]) {
			const tl = createT(langKey);
			return renderTemplate`${maybeRenderHead($$result)}<div class="lang-content"${addAttribute(l, "data-lang")} data-astro-cid-zg7dkzxc><div class="not-translated" data-astro-cid-zg7dkzxc><p data-astro-cid-zg7dkzxc>${tl("article.notTranslated")}</p></div></div>`;
		}
		const meta = allMeta[l] || {};
		const body = l === "en" ? bodyEn : renderMarkdown(processArticleContent(data.content[langKey]));
		const rt = readingTime(body);
		const headings = l === "en" ? parseHeadings(rawBodyEn) : parseHeadings(data.content[langKey] ? processArticleContent(data.content[langKey]) : "");
		return renderTemplate`<div class="lang-content"${addAttribute(l, "data-lang")} data-astro-cid-zg7dkzxc><article data-astro-cid-zg7dkzxc><div class="article-header" data-astro-cid-zg7dkzxc>${meta.aiGenerated && renderTemplate`<span class="ai-badge" data-astro-cid-zg7dkzxc>${t("article.ai")}</span>`}${meta.sponsored && renderTemplate`<span class="sponsored-badge" data-astro-cid-zg7dkzxc>💕 Sponsorisé</span>`}${isNew(meta.date) && renderTemplate`<span class="new-badge" data-astro-cid-zg7dkzxc>NEW</span>`}<h1 class="article-title" data-astro-cid-zg7dkzxc>${meta.title ?? slug ?? ""}</h1><p class="article-date" data-astro-cid-zg7dkzxc>${meta.date && renderTemplate`<time${addAttribute(meta.date, "datetime")} data-astro-cid-zg7dkzxc>${formatDate(meta.date, l)}</time>`}${meta.lastmod && meta.lastmod !== meta.date && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate`<span class="article-sep" data-astro-cid-zg7dkzxc>·</span><span class="article-updated" data-astro-cid-zg7dkzxc>${t("article.updated", { date: formatDate(meta.lastmod, l) })}</span>` })}`}${meta.date && renderTemplate`<span class="article-sep" data-astro-cid-zg7dkzxc>·</span>`}<span data-astro-cid-zg7dkzxc>${t("article.minRead", { n: rt })}</span></p>${meta.authors && meta.authors.length > 0 && renderTemplate`<div class="author-bio-top" data-astro-cid-zg7dkzxc>${getAuthors(meta.authors).map((author) => renderTemplate`<a${addAttribute(`/authors/${author.id}`, "href")} class="author-bio-item" data-astro-cid-zg7dkzxc>${renderComponent($$result, "Image", $$Image, {
			"class": "author-avatar-small",
			"src": author.avatar ?? `https://github.com/${author.id}.png`,
			"alt": author.name,
			"width": 24,
			"height": 24,
			"data-astro-cid-zg7dkzxc": true
		})}<div class="author-info-top" data-astro-cid-zg7dkzxc><span class="author-name-top" data-astro-cid-zg7dkzxc>${author.name}${(data.verifiedByLang?.[l] ?? data.verified) && renderTemplate`<span class="verified-badge" data-astro-cid-zg7dkzxc>Verified</span>`}</span><span class="author-link-top" data-astro-cid-zg7dkzxc>@${author.id}</span></div></a>`)}</div>`}${meta.description && renderTemplate`<p class="article-description" data-astro-cid-zg7dkzxc>${meta.description}</p>`}${meta.tags && meta.tags.filter((t) => !HIDDEN_TAGS.has(t)).length > 0 && renderTemplate`<div class="article-tags" data-astro-cid-zg7dkzxc>${meta.tags.filter((t) => !HIDDEN_TAGS.has(t)).map((tag) => renderTemplate`<a${addAttribute(`/tags/${tag}`, "href")} class="tag-badge" data-astro-cid-zg7dkzxc>${tag}</a>`)}</div>`}</div><div class="share-buttons article-share-top" data-astro-cid-zg7dkzxc><a${addAttribute(`https://twitter.com/intent/tweet?text=${encodeURIComponent(meta.title ?? slug ?? "")}&url=${encodeURIComponent(`https://fox3000foxy.com/blog/${slug}`)}`, "href")} target="_blank" rel="noopener noreferrer" class="share-btn" aria-label="Share on Twitter" data-astro-cid-zg7dkzxc>𝕏</a><a${addAttribute(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://fox3000foxy.com/blog/${slug}`)}`, "href")} target="_blank" rel="noopener noreferrer" class="share-btn" aria-label="Share on LinkedIn" data-astro-cid-zg7dkzxc>in</a><button type="button" class="share-btn reading-mode-btn" aria-label="Toggle reading mode" title="Reading mode" data-astro-cid-zg7dkzxc>Aa</button><button type="button" class="bookmark-btn"${addAttribute(slug, "data-slug")} aria-label="Add bookmark" data-astro-cid-zg7dkzxc>☆</button></div><div class="article-layout" data-astro-cid-zg7dkzxc>${headings.length >= 2 && renderTemplate`<nav class="toc" data-astro-cid-zg7dkzxc><h4 class="toc-title" data-astro-cid-zg7dkzxc>Contents</h4><ul class="toc-list" data-astro-cid-zg7dkzxc>${headings.map((h) => renderTemplate`<li${addAttribute(`toc-item toc-level-${h.level}`, "class")} data-astro-cid-zg7dkzxc><a${addAttribute(`#${h.id}`, "href")} class="toc-link" data-astro-cid-zg7dkzxc>${h.text}</a></li>`)}</ul></nav>`}<div class="article-content" data-astro-cid-zg7dkzxc><div class="article-body" data-astro-cid-zg7dkzxc>${unescapeHTML(body)}</div><nav class="article-nav" data-astro-cid-zg7dkzxc><a${addAttribute(`/blog/${slug}`, "href")} class="article-nav-link permalink" data-astro-cid-zg7dkzxc>Permalink</a></nav></div></div></article></div>`;
	})}<div class="article-widgets-bottom" data-astro-cid-zg7dkzxc>${suggested.length > 0 && renderTemplate`<section class="suggested-articles" data-astro-cid-zg7dkzxc><h3 data-astro-cid-zg7dkzxc>${t("article.related")}</h3><div class="suggested-grid" data-astro-cid-zg7dkzxc>${suggested.map(({ article }) => renderTemplate`<a${addAttribute(`/blog/${article.slug}`, "href")} class="suggested-card" data-astro-cid-zg7dkzxc><h4 class="suggested-title" data-astro-cid-zg7dkzxc>${article.title ?? article.slug.replace(/-/g, " ")}</h4>${article.description && renderTemplate`<p class="suggested-desc" data-astro-cid-zg7dkzxc>${article.description}</p>`}${article.date && renderTemplate`<time class="suggested-date"${addAttribute(article.date, "datetime")} data-astro-cid-zg7dkzxc>${(/* @__PURE__ */ new Date(`${article.date}T00:00:00`)).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric"
	})}</time>`}</a>`)}</div></section>`}${(prevArticle || nextArticle) && renderTemplate`<nav class="article-nav" data-astro-cid-zg7dkzxc>${prevArticle && renderTemplate`<a${addAttribute(`/blog/${prevArticle.slug}`, "href")} class="article-nav-link prev" data-astro-cid-zg7dkzxc><span class="article-nav-label" data-astro-cid-zg7dkzxc>${t("article.prev")}</span><span class="article-nav-title" data-astro-cid-zg7dkzxc>${prevArticle.title}</span></a>`}${nextArticle && renderTemplate`<a${addAttribute(`/blog/${nextArticle.slug}`, "href")} class="article-nav-link next" data-astro-cid-zg7dkzxc><span class="article-nav-label" data-astro-cid-zg7dkzxc>${t("article.next")}</span><span class="article-nav-title" data-astro-cid-zg7dkzxc>${nextArticle.title}</span></a>`}</nav>`}<div class="giscus-comments" data-lang="en" data-astro-cid-zg7dkzxc></div></div>` })}` : renderTemplate`<p data-astro-cid-zg7dkzxc>Article not found.</p>`}` })}<script>
(function(){
  var progress = document.createElement('div');
  progress.className = 'reading-progress';
  progress.style.cssText = 'position:fixed;top:0;left:0;width:0;height:3px;background:var(--accent,#7c3aed);z-index:9999;transition:width 0.1s linear';
  document.body.appendChild(progress);
  var updateProgress = function() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (h > 0 ? Math.min(window.scrollY / h * 100, 100) : 0) + '%';
  };
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress, { passive: true });
  updateProgress();

  var tocLinks = document.querySelectorAll('.toc-link');
  if (tocLinks.length > 0) {
    var headings = [];
    tocLinks.forEach(function(link) {
      var id = link.getAttribute('href').slice(1);
      var el = document.getElementById(id);
      if (el) headings.push({ el: el, link: link.parentElement });
    });
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          tocLinks.forEach(function(l) { l.parentElement.classList.remove('toc-active'); });
          var match = headings.find(function(h) { return h.el === entry.target; });
          if (match) match.link.classList.add('toc-active');
        }
      });
    }, { rootMargin: '-80px 0px -70% 0px' });
    headings.forEach(function(h) { observer.observe(h.el); });
  }

  var readBtn = document.querySelector('.reading-mode-btn');
  if (readBtn) {
    var rm = localStorage.getItem('readingMode') === 'true';
    if (rm) document.documentElement.classList.add('reading-mode');
    readBtn.addEventListener('click', function() {
      var on = document.documentElement.classList.toggle('reading-mode');
      localStorage.setItem('readingMode', String(on));
      readBtn.classList.toggle('active', on);
    });
  }

  document.querySelectorAll('.article-body pre').forEach(function(pre) {
    var wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    var header = document.createElement('div');
    header.className = 'code-block-header';
    var lang = '';
    var codeEl = pre.querySelector('code');
    if (codeEl) {
      for (var i = 0; i < codeEl.classList.length; i++) {
        var cls = codeEl.classList[i];
        if (cls.startsWith('language-')) { lang = cls.slice(9); break; }
      }
    }
    if (lang) {
      var label = document.createElement('span');
      label.className = 'code-lang-label';
      label.textContent = lang;
      header.appendChild(label);
    }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy-btn';
    btn.textContent = 'Copy';
    btn.addEventListener('click', function() {
      var code = pre.querySelector('code') || pre;
      navigator.clipboard.writeText(code.textContent || '').then(function() {
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
      })['catch'](function() {});
    });
    header.appendChild(btn);
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);
  });

  var bookmarkBtn = document.querySelector('.bookmark-btn[data-slug]');
  if (bookmarkBtn) {
    var BOOKMARK_KEY = 'bookmarks';
    var bSlug = bookmarkBtn.getAttribute('data-slug');
    var bStored = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]');
    if (bStored.indexOf(bSlug) !== -1) bookmarkBtn.classList.add('active');
    bookmarkBtn.addEventListener('click', function(e) {
      e.preventDefault();
      var s = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]');
      var idx = s.indexOf(bSlug);
      if (idx === -1) s.push(bSlug); else s.splice(idx, 1);
      localStorage.setItem(BOOKMARK_KEY, JSON.stringify(s));
      this.classList.toggle('active');
      this.setAttribute('aria-label', this.classList.contains('active') ? 'Remove bookmark' : 'Add bookmark');
      this.textContent = this.classList.contains('active') ? '\\u2605' : '\\u2606';
    });
  }

  var gc = document.querySelector('.giscus-comments');
  if (gc) {
    var gcl = gc.getAttribute('data-lang') || 'en';
    var gs = document.createElement('script');
    gs.src = 'https://giscus.app/client.js';
    gs.async = true;
    gs.crossOrigin = 'anonymous';
    gs.setAttribute('data-repo', 'fox3000foxy/fox3000foxy'+".github"+".io");
    gs.setAttribute('data-repo-id', 'R_kgDORhZXLg');
    gs.setAttribute('data-category', 'Announcements');
    gs.setAttribute('data-category-id', 'DIC_kwDORhZXLs4C-FFI');
    gs.setAttribute('data-mapping', 'pathname');
    gs.setAttribute('data-strict', '0');
    gs.setAttribute('data-reactions-enabled', '1');
    gs.setAttribute('data-emit-metadata', '0');
    gs.setAttribute('data-input-position', 'bottom');
    var themeCheckbox = document.getElementById('theme-toggle');
    gs.setAttribute('data-theme', themeCheckbox && themeCheckbox.checked ? 'light' : 'dark');
    gs.setAttribute('data-lang', gcl);
    gc.appendChild(gs);

    document.addEventListener('change', function(ev) {
      if (ev.target && ev.target.id === 'theme-toggle') {
        var iframe = gc.querySelector('iframe');
        if (iframe) {
          iframe.contentWindow.postMessage({ giscus: { setConfig: { theme: ev.target.checked ? 'light' : 'dark' } } }, 'https://giscus.app');
        }
      }
    });
  }
})();
<\/script>`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/blog/[slug].astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/blog/[slug].astro";
var $$url = "/blog/[slug]";
// \0virtual:astro:page:src/pages/blog/[slug]@_@astro
var page = () => _slug__exports;
export { page };

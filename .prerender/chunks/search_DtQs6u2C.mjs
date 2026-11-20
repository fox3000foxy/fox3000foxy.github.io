import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { E as unescapeHTML, _ as renderTemplate, u as renderComponent, v as maybeRenderHead } from "./console_B4Ch7nu3.mjs";
import { h as createComponent, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
import { n as readAllArticleIndexes } from "./langContent_S7f5E-LS.mjs";
import { t as ALL_LANGS } from "./types_BCRoIkYX.mjs";
// src/pages/search.astro
var search_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Search,
	file: () => $$file,
	url: () => $$url
});
var $$Search = createComponent(($$result, $$props, $$slots) => {
	const allIndexes = readAllArticleIndexes();
	function normalize(data) {
		return data.map((item) => typeof item === "string" ? { slug: item } : item);
	}
	const langsData = Object.fromEntries(ALL_LANGS.map((l) => [l, normalize(allIndexes[l] ?? [])]));
	const articlesJson = JSON.stringify(langsData);
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "Search",
		"description": "Search articles",
		"wide": true
	}, { "default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<div class="search-page"><h2>Search</h2><div class="search-input-wrap"><input type="search" class="search-input" id="search-input" placeholder="Search articles, tags, content..."><button type="button" class="search-clear-btn" id="search-clear" aria-label="Clear" style="display:none">×</button></div><div class="search-results" id="search-results"></div></div><script id="search-data" type="application/json">${unescapeHTML(articlesJson)}<\/script><script>
  (function() {
    var data = JSON.parse(document.getElementById('search-data').textContent);
    var currentLang = 'en';
    var query = '';
    var input = document.getElementById('search-input');
    var clearBtn = document.getElementById('search-clear');
    var resultsEl = document.getElementById('search-results');

    function detectLang() {
      var stored = localStorage.getItem('fox-blog-lang');
      if (stored && data[stored]) return stored;
      var prefs = navigator.languages || [navigator.language];
      for (var i = 0; i < prefs.length; i++) {
        var code = prefs[i].split('-')[0];
        if (data[code]) return code;
      }
      return 'en';
    }

    function render() {
      var q = query.trim().toLowerCase();
      if (!q) { resultsEl.innerHTML = ''; return; }

      var articles = data[currentLang] || data.en || [];
      var results = articles
        .filter(function(a) {
          var title = (a.title || '').toLowerCase();
          var desc = (a.description || '').toLowerCase();
          var tags = (a.tags || []).join(' ').toLowerCase();
          var body = (a.body || '').toLowerCase();
          return title.indexOf(q) !== -1 || desc.indexOf(q) !== -1 || tags.indexOf(q) !== -1 || body.indexOf(q) !== -1 || (a.slug || '').toLowerCase().indexOf(q) !== -1;
        })
        .sort(function(a, b) {
          var aScore = (a.title || '').toLowerCase().indexOf(q) !== -1 ? 2 : 1;
          var bScore = (b.title || '').toLowerCase().indexOf(q) !== -1 ? 2 : 1;
          return bScore - aScore;
        });

      var html = '';
      if (results.length === 0) {
        html = '<p class="search-no-results">No results found for "' + q + '".</p>';
      } else {
        for (var i = 0; i < results.length; i++) {
          var a = results[i];
          html += '<a href="/blog/' + a.slug + '" class="search-result-card">';
          html += '<h3 class="search-result-title">' + (a.title || a.slug) + '</h3>';
          if (a.description) html += '<p class="search-result-desc">' + a.description + '</p>';
          html += '<div class="search-result-meta">';
          if (a.date) html += '<time>' + a.date + '</time>';
          if (a.tags && a.tags.length > 0) {
            html += '<span class="search-result-tags">';
            for (var j = 0; j < a.tags.length; j++) html += '#' + a.tags[j] + ' ';
            html += '</span>';
          }
          html += '</div></a>';
        }
      }
      resultsEl.innerHTML = html;
    }

    currentLang = detectLang();

    input.addEventListener('input', function(e) {
      query = e.target.value;
      clearBtn.style.display = query ? '' : 'none';
      render();
    });

    clearBtn.addEventListener('click', function() {
      input.value = '';
      query = '';
      clearBtn.style.display = 'none';
      render();
      input.focus();
    });
  })();
  <\/script>` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/search.astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/search.astro";
var $$url = "/search";
// \0virtual:astro:page:src/pages/search@_@astro
var page = () => search_exports;
export { page };

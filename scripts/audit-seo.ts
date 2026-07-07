import * as fs from "node:fs";
import * as path from "node:path";

const SITE_URL = "https://fox3000foxy.com";
const DIST = "dist";

let errors = 0;
let warnings = 0;

function fail(area: string, msg: string) {
	errors++;
	console.error(`  ❌ [${area}] ${msg}`);
}

function warn(area: string, msg: string) {
	warnings++;
	console.warn(`  ⚠️  [${area}] ${msg}`);
}

function ok(area: string, msg: string) {
	console.log(`  ✅ [${area}] ${msg}`);
}

// ── 1. RSS feed ──────────────────────────────────────────
function checkRss() {
	console.log("\n📡 RSS Feed (feed.xml)");
	const file = path.join(DIST, "feed.xml");
	if (!fs.existsSync(file)) { fail("RSS", "feed.xml not found"); return; }

	const xml = fs.readFileSync(file, "utf8");

	// Basic structure
	if (!xml.includes('<?xml version="1.0"')) fail("RSS", "Missing XML declaration");
	if (!xml.includes('<rss version="2.0"')) fail("RSS", "Not RSS 2.0");
	if (!xml.includes("<channel>")) fail("RSS", "Missing <channel>");

	// Count items
	const items = xml.match(/<item>/g);
	if (!items || items.length === 0) fail("RSS", "No items");
	else ok("RSS", `${items.length} items`);

	// Channel-level elements
	if (!xml.includes("<title>")) fail("RSS", "Missing channel <title>");
	if (!xml.includes("<link>")) fail("RSS", "Missing channel <link>");
	if (!xml.includes("<description>")) fail("RSS", "Missing channel <description>");
	if (!xml.includes("<language>")) warn("RSS", "Missing channel <language>");
	if (!xml.includes("<lastBuildDate>")) warn("RSS", "Missing <lastBuildDate>");
	if (!xml.includes("<atom:link")) warn("RSS", "Missing <atom:link self>");
	if (!xml.includes("<image>")) warn("RSS", "Missing <image> (recommended for readers)");
	if (!xml.includes("<copyright>")) warn("RSS", "Missing <copyright>");
	if (!xml.includes("<managingEditor>")) warn("RSS", "Missing <managingEditor>");

	// Check each item has required elements
	const itemBlocks = xml.split("</item>");
	for (const block of itemBlocks) {
		if (!block.includes("<item>")) continue;
		if (!block.includes("<title>")) fail("RSS", "Item missing <title>");
		if (!block.includes("<link>")) fail("RSS", "Item missing <link>");
		if (!block.includes("<guid")) fail("RSS", "Item missing <guid>");
		if (!block.includes("<pubDate>")) fail("RSS", "Item missing <pubDate>");
		if (!block.includes("<description>")) warn("RSS", "Item missing <description>");

		// Check date format: RFC 2822
		const matchDate = block.match(/<pubDate>(.+?)<\/pubDate>/);
		if (matchDate) {
			const d = new Date(matchDate[1]);
			if (isNaN(d.getTime())) fail("RSS", `Invalid pubDate: ${matchDate[1]}`);
		}
	}

	// ⚠️  Multilingual issue: count unique languages in items
	const langDirs = fs.readdirSync("public/articles")
		.filter(d => fs.statSync(`public/articles/${d}`).isDirectory() && d !== "assets");
	const seenSlugs = new Map<string, number>(); // slug -> count
	for (const block of itemBlocks) {
		if (!block.includes("<item>")) continue;
		const m = block.match(/<link>.*\/([^/]+)<\/link>/);
		if (m) {
			const slug = m[1];
			seenSlugs.set(slug, (seenSlugs.get(slug) || 0) + 1);
		}
	}
	// Each article appears once per language
	const expectedCount = langDirs.length;
	for (const [slug, count] of seenSlugs) {
		if (count > 1 && count < expectedCount * 0.5) {
			warn("RSS", `Article "${slug}" appears ${count}x (not all ${expectedCount} langs)`);
		}
	}
	// Warn if some slugs appear too many times (multilingual in one feed)
	const multiLangCount = [...seenSlugs.values()].filter(c => c > 1).length;
	if (multiLangCount > 0) {
		warn("RSS", `${multiLangCount} articles appear in multiple languages in a SINGLE feed. RSS readers expect one language per feed. Google News requires separate feeds per language.`);
	}

	// Language tag vs actual content
	const lang = xml.match(/<language>(.+?)<\/language>/);
	if (lang && lang[1] === "en" && multiLangCount > 0) {
		warn("RSS", `Feed says <language>en</language> but contains articles in multiple languages`);
	}
}

// ── 2. Google News Sitemap ──────────────────────────────
function checkNewsSitemap() {
	console.log("\n📰 Google News Sitemap (news-sitemap.xml)");
	const file = path.join(DIST, "news-sitemap.xml");
	if (!fs.existsSync(file)) { fail("NewsSitemap", "news-sitemap.xml not found"); return; }

	const xml = fs.readFileSync(file, "utf8");

	if (!xml.includes('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"')) {
		fail("NewsSitemap", "Missing news namespace");
	}

	const urls = xml.match(/<url>[\s\S]*?<\/url>/g);
	// if (!urls) { fail("NewsSitemap", "No URLs found"); return; }

	const today = new Date();
	const twoDaysAgo = new Date(today.getTime() - 48 * 60 * 60 * 1000);

	for (const urlBlock of urls) {
		const dateMatch = urlBlock.match(/<news:publication_date>(.+?)<\/news:publication_date>/);
		const titleMatch = urlBlock.match(/<news:title>(.+?)<\/news:title>/);
		const langMatch = urlBlock.match(/<news:language>(.+?)<\/news:language>/);
		const locMatch = urlBlock.match(/<loc>(.+?)<\/loc>/);

		if (!dateMatch) { fail("NewsSitemap", "URL missing <news:publication_date>"); continue; }
		if (!titleMatch) { fail("NewsSitemap", "URL missing <news:title>"); continue; }

		const pubDate = new Date(dateMatch[1] + "T00:00:00");
		if (pubDate < twoDaysAgo) {
			warn("NewsSitemap", `"${titleMatch[1].slice(0, 40)}..." published ${dateMatch[1]}. Google News only accepts articles < 48h old.`);
		}

		if (!langMatch) {
			warn("NewsSitemap", `"${titleMatch[1].slice(0, 40)}..." missing <news:language>.`);
		}

		if (locMatch && !locMatch[1].startsWith(SITE_URL)) {
			fail("NewsSitemap", `Unexpected URL: ${locMatch[1]}`);
		}
	}

	ok("NewsSitemap", `${urls.length} URLs checked`);
}

// ── 3. Main Sitemap ──────────────────────────────────────
function checkSitemap() {
	console.log("\n🗺️  Main Sitemap (sitemap.xml)");
	const file = path.join(DIST, "sitemap.xml");
	if (!fs.existsSync(file)) { fail("Sitemap", "sitemap.xml not found"); return; }

	const xml = fs.readFileSync(file, "utf8");
	if (!xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')) {
		fail("Sitemap", "Missing sitemap namespace");
	}

	const urls = xml.match(/<loc>.*?<\/loc>/g);
	if (!urls) { fail("Sitemap", "No URLs"); return; }

	// Check for language-specific URLs missing from sitemap
	const langDirs = fs.readdirSync("public/articles")
		.filter(d => fs.statSync(`public/articles/${d}`).isDirectory() && d !== "assets");
	for (const lang of langDirs) {
		if (!xml.includes(`?lang=${lang}`) && lang !== "en") {
			warn("Sitemap", `No URL with ?lang=${lang} found. Language-specific pages should be in sitemap.`);
		}
	}

	ok("Sitemap", `${urls.length} URLs`);
}

// ── 4. Robots.txt ────────────────────────────────────────
function checkRobots() {
	console.log("\n🤖 robots.txt");
	const file = path.join(DIST, "robots.txt");
	if (!fs.existsSync(file)) { fail("robots.txt", "not found"); return; }
	const txt = fs.readFileSync(file, "utf8");
	if (!txt.includes("Sitemap:")) warn("robots.txt", "Missing Sitemap directive");
	if (!txt.includes("User-agent:")) fail("robots.txt", "Missing User-agent directive");
	else ok("robots.txt", "Found");
}

// ── 5. OG Pages ──────────────────────────────────────────
function checkOgPages() {
	console.log("\n🖼️  OG Pages");
	const ogDir = path.join(DIST, "og");
	if (!fs.existsSync(ogDir)) { fail("OG", "og/ directory not found"); return; }

	const pngs = fs.readdirSync(ogDir).filter(f => f.endsWith(".png"));
	if (pngs.length === 0) { fail("OG", "No PNG OG images"); return; }
	ok("OG", `${pngs.length} OG images`);

	// Check each article has a static HTML page
	const langDirs = fs.readdirSync("public/articles")
		.filter(d => fs.statSync(`public/articles/${d}`).isDirectory() && d !== "assets");
	for (const lang of langDirs) {
		const indexPath = path.join("public/articles", lang, "index.json");
		if (!fs.existsSync(indexPath)) continue;
		const articles = JSON.parse(fs.readFileSync(indexPath, "utf8"));
		for (const article of articles) {
			const pagePath = path.join(DIST, "blog", article.slug, "index.html");
			if (!fs.existsSync(pagePath)) {
				fail("OG", `Missing static page for ${article.slug}`);
			}
		}
	}
	ok("OG", "All article static pages exist");
}

// ── 6. hreflang / canonical (SPA side) ───────────────────
function checkSpaSeo() {
	console.log("\n🌐 SPA SEO checks");
	const indexHtml = path.join(DIST, "index.html");
	if (!fs.existsSync(indexHtml)) { fail("SPA", "index.html not found"); return; }
	const html = fs.readFileSync(indexHtml, "utf8");

	// <html lang="...">
	if (!html.match(/<html[^>]+lang=/)) warn("SPA", "Missing <html lang> attribute");
	else ok("SPA", "html lang attribute found");

	if (!html.includes('rel="canonical"')) warn("SPA", "Missing canonical link in <head>");
	if (!html.includes('rel="alternate"')) warn("SPA", "Missing hreflang alternate links in <head>");
	if (!html.includes('rel="webmention"')) {
		warn("SPA", "Missing webmention link");
	} else {
		ok("SPA", "Webmention link found");
	}

	// JSON-LD
	if (!html.includes('"@type":"Blog"') && !html.includes('"@type":["Blog"') && !html.includes('"@type": "Blog"')) warn("SPA", "No Blog JSON-LD in index.html");
	if (!html.includes('"@context":"https://schema.org"')) warn("SPA", "No schema.org context in JSON-LD");

	// OG tags
	for (const tag of ["og:title", "og:description", "og:url", "og:image", "og:type"]) {
		if (!html.includes(`property="${tag}"`)) warn("SPA", `Missing ${tag}`);
	}
	ok("SPA", "OG tags checked");
}

// ── 7. JSON-LD in static OG pages ────────────────────────
function checkOgJsonLd() {
	console.log("\n📄 Static OG pages JSON-LD");
	let checked = 0;
	const blogDist = path.join(DIST, "blog");
	if (!fs.existsSync(blogDist)) return;
	const articleDirs = fs.readdirSync(blogDist).filter(d => fs.statSync(path.join(blogDist, d)).isDirectory());
	for (const slug of articleDirs) {
		const html = fs.readFileSync(path.join(blogDist, slug, "index.html"), "utf8");
		// Find the Article JSON-LD (second block, after the Blog one from index.html)
		const allJsonLd = [...html.matchAll(/<script type="application\/ld\+json">(.+?)<\/script>/g)];
		const jsonLdMatch = allJsonLd.length > 1 ? allJsonLd[1] : allJsonLd[0];
		if (!jsonLdMatch) { fail("OG-JSONLD", `${slug}: missing JSON-LD`); continue; }
		try {
			const parsed = JSON.parse(jsonLdMatch[1]);
			if (!parsed.headline) fail("OG-JSONLD", `${slug}: missing headline`);
			if (!parsed.datePublished) warn("OG-JSONLD", `${slug}: missing datePublished`);
			if (parsed.inLanguage === "multiple") warn("OG-JSONLD", `${slug}: inLanguage is "multiple", should be specific language`);
			if (!parsed.author) fail("OG-JSONLD", `${slug}: missing author`);
			checked++;
		} catch {
			fail("OG-JSONLD", `${slug}: invalid JSON in JSON-LD`);
		}
	}
	ok("OG-JSONLD", `${checked} pages checked`);
}

// ── Main ─────────────────────────────────────────────────
console.log("🔍 SEO & RSS Audit for fox3000foxy.com\n");

checkRss();
checkNewsSitemap();
checkSitemap();
checkRobots();
checkOgPages();
checkSpaSeo();
checkOgJsonLd();

console.log(`\n${"=".repeat(50)}`);
console.log(`📊 Results: ${errors} ❌ errors, ${warnings} ⚠️  warnings`);
if (errors > 0) process.exit(1);

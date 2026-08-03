// @ts-nocheck
// Post-build: appends decoy "public/" files to the generated sitemap.
// Rationale (in real life it'd be an accident): these routes are not real
// Astro pages, but they ship in `dist/` because they live in `public/`.
// A naive glob over the output folder catches them, so they "leak" into the
// sitemap alongside the real pages.
import * as fs from "node:fs";
import * as path from "node:path";

const DIST_DIR = "dist";
const SITEMAP = path.join(DIST_DIR, "sitemap-0.xml");
const SITE = "https://fox3000foxy.com";

// Curated list of decoy "public/" files that leak into the sitemap.
// These ship in `dist/` because they live in `public/`, so a naive glob over
// the output folder catches them. Explicitly NOT included: /.git/* (no real
// site exposes it) and the honeypot beacon folder (_honeypot).
const DECOYS = [
	"/wp-login.php",
	"/wp-config.php",
	"/xmlrpc.php",
	"/wp-admin/",
	"/wp-json/wp/v2/users/",
	"/wp-content/plugins/wp-updater-guru/",
	"/package.json",
	"/.env.production",
	"/.env.backup",
	"/api/health/",
	"/api/auth/session.json",
	"/api/users/",
	"/api/admin/",
	"/api/internal/config.json",
	"/_next/static/chunks/main.js",
	"/phpinfo.php",
	"/phpmyadmin/",
	"/swagger/openapi.json",
	"/actuator/env.json",
	"/actuator/health.json",
	"/composer.json",
	"/wp-json/",
	"/wp-cron.php",
	"/wp-trackback.php",
	"/wp-content/debug.log",
];

function escapeXml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function main() {
	if (!fs.existsSync(SITEMAP)) {
		console.error("[decoy-sitemap] sitemap-0.xml not found, skipping");
		return;
	}
	let xml = fs.readFileSync(SITEMAP, "utf8");
	// Insert before the closing </urlset>.
	const closing = "</urlset>";
	if (!xml.includes(closing)) {
		console.error("[decoy-sitemap] unexpected sitemap format, skipping");
		return;
	}
	const entries = DECOYS.map(
		(url) =>
			`<url><loc>${escapeXml(SITE + url)}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`
	).join("");
	xml = xml.replace(closing, entries + closing);
	fs.writeFileSync(SITEMAP, xml);
	console.log(`[decoy-sitemap] injected ${DECOYS.length} decoy URLs`);
}

main();

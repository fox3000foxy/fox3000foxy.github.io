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

// The "site generator" (a very naive glob over dist/) swept every file it
// could find into the sitemap. That's the whole point: it looks like an
// accident from a beginner who just dumped the build output.
// We keep the analytics beacon folder (_assets) out of the sitemap.
// WordPress-specific paths (wp-*, readme.html, license.txt) are excluded:
// they only appear in the internal-sitemap.xml inside wp-admin/.
const DECOYS = [
	"/.env.production",
	"/.env.backup",
	"/api/health/",
	"/api/auth/session.json",
	"/api/users/",
	"/api/admin/",
	"/api/internal/config.json",
	"/phpmyadmin/",
	"/actuator/health.json",
	"/server-status/",
	"/server-info/",
	"/.htaccess",
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
	// WordPress-specific paths as XML comments: visible in source but ignored
	// by sitemap parsers. An agent reading the raw XML will see them.
	const commented = [
		"/wp-config.php",
		"/wp-config.php.bak",
		"/xmlrpc.php",
		"/wp-admin/",
		"/wp-json/wp/v2/users/",
		"/wp-content/plugins/wp-updater-guru/",
		"/wp-content/themes/fox3k/style.css",
		"/wp-content/uploads/fox3k_backup.sql",
		"/wp-content/debug.log",
		"/wp-includes/version.php",
		"/wp-login.php",
		"/wp-admin/internal-sitemap.xml",
		"/todo.txt",
		"/notes.md",
		"/test.php",
		"/backup.sh",
		"/wp-config-sample.php",
		"/root/.card_payment",
		"/root/.bash_history",
		"/root/.ovh_config",
		"/root/.msmtprc",
		"/home/fox3000foxy/.bash_history",
		"/mongo/.credentials",
		"/etc/apache2/sites-available/fox3000foxy.conf",
		"/wp-content/languages/fr_FR.po",
	].map((url) => `<!-- <url><loc>${escapeXml(SITE + url)}</loc></url> -->`).join("\n");
	xml = xml.replace(closing, entries + "\n" + commented + "\n" + closing);
	fs.writeFileSync(SITEMAP, xml);
	console.log(`[decoy-sitemap] injected ${DECOYS.length} decoy URLs`);
}

main();

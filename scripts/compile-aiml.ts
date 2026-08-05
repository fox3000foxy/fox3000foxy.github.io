// @ts-nocheck
/**
 * compile-aiml.ts — Reads all .aiml files and compiles them into a
 * JSON file (public/chatbots/alice/aiml.json) with pre-parsed categories.
 *
 * Usage: bun run scripts/compile-aiml.ts [aiml-dir]
 */
import * as fs from "node:fs";
import * as path from "node:path";

interface Category {
	pattern: string;
	template: string;
	that?: string;
}

function clean(s: string): string {
	return s.replace(/\s+/g, " ").trim().toUpperCase();
}

function extractTag(xml: string, tag: string): string | null {
	const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
	const m = xml.match(re);
	return m ? m[1].trim() : null;
}

function parseAimlFile(filePath: string): Category[] {
	const xml = fs.readFileSync(filePath, "utf-8");

	const catRe = /<category>([\s\S]*?)<\/category>/gi;
	const categories: Category[] = [];
	for (const catMatch of xml.matchAll(catRe)) {
		const catXml = catMatch[1];
		const pattern = extractTag(catXml, "pattern");
		const template = extractTag(catXml, "template");
		const that = extractTag(catXml, "that");

		if (pattern && template) {
			categories.push({
				pattern: clean(pattern),
				template,
				that: that ? clean(that) : undefined,
			});
		}
	}
	return categories;
}

function main() {
	const aimlDir = path.resolve(process.argv[2] || "/tmp/chatbots/alice/aiml");
	const outDir = path.resolve("public/chatbots/alice");
	const outPath = path.join(outDir, "aiml.json");

	if (!fs.existsSync(aimlDir)) {
		if (fs.existsSync(outPath)) {
			console.log(`AIML source dir not found (${aimlDir}), using existing ${outPath}`);
			return;
		}
		console.error(`AIML directory not found: ${aimlDir}`);
		process.exit(1);
	}

	const files = fs
		.readdirSync(aimlDir)
		.filter((f) => f.endsWith(".aiml"))
		.sort();

	let allCategories: Category[] = [];
	for (const file of files) {
		const cats = parseAimlFile(path.join(aimlDir, file));
		console.log(`  ${file}: ${cats.length} categories`);
		allCategories = allCategories.concat(cats);
	}

	allCategories.sort((a, b) => {
		const awc = (a.pattern.match(/[*_]/g) || []).length;
		const bwc = (b.pattern.match(/[*_]/g) || []).length;
		if (awc !== bwc) {
			return awc - bwc;
		}
		return b.pattern.length - a.pattern.length;
	});

	console.log(`\nTotal: ${allCategories.length} categories`);

	fs.mkdirSync(outDir, { recursive: true });
	fs.writeFileSync(outPath, JSON.stringify(allCategories), "utf-8");
	const size = fs.statSync(outPath).size;
	console.log(`Written to ${outPath} (${(size / 1024).toFixed(0)} KB)`);
}

main();

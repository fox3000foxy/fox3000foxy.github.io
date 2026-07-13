// @ts-nocheck
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const root = process.cwd();
const articlesDir = path.join(root, "public/articles");
const audioDir = path.join(articlesDir, "assets");

const langToVoice: Record<string, string> = {
	en: "en-US-JennyNeural",
	ar: "ar-SA-ZariyahNeural",
	de: "de-DE-KatjaNeural",
	es: "es-ES-ElviraNeural",
	fr: "fr-FR-DeniseNeural",
	hi: "hi-IN-SwaraNeural",
	id: "id-ID-GadisNeural",
	it: "it-IT-ElsaNeural",
	ja: "ja-JP-NanamiNeural",
	ko: "ko-KR-SunHiNeural",
	pt: "pt-BR-FranciscaNeural",
	ru: "ru-RU-SvetlanaNeural",
	th: "th-TH-PremwadeeNeural",
	tr: "tr-TR-EmelNeural",
	vi: "vi-VN-HoaiMyNeural",
	zh: "zh-CN-XiaoxiaoNeural",
};

function parseFrontMatter(text: string): { content: string } {
	let content = text;
	if (text.startsWith("---\n")) {
		const end = text.indexOf("\n---\n", 4);
		if (end !== -1) {
			content = text.slice(end + 5);
		}
	}
	return { content };
}

function stripMarkdown(md: string): string {
	let text = md;
	text = text.replace(/^---[\s\S]*?\n---\n*/m, "");
	text = text.replace(/```[\s\S]*?```/g, "");
	text = text.replace(/`[^`\n]+`/g, "");
	text = text.replace(/!\[.*?\]\(.*?\)/g, "");
	text = text.replace(/\[([^\]]*)\]\(.*?\)/g, "$1");
	text = text.replace(/<[^>]*>/g, "");
	text = text.replace(/^#{1,6}\s+/gm, "");
	text = text.replace(/(\*{1,3}|_{1,3})(.+?)\1/g, "$2");
	text = text.replace(/^[-*_]{3,}\s*$/gm, "");
	text = text.replace(/^>\s?/gm, "");
	text = text.replace(/^[\s]*[-*+]\s+/gm, "");
	text = text.replace(/^[\s]*\d+\.\s+/gm, "");
	text = text.replace(/^[\s]*\|[\s\-:|]+\|[\s]*$/gm, "");
	text = text.replace(/\|/g, "");
	text = text.replace(/[─├└│┌┐┘┝┥┤┴┬┼═║╒╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬]+/g, "");
	text = text.replace(/\n{3,}/g, "\n\n");
	text = text.replace(/^\s*\n/gm, "\n");
	return text.trim();
}

function generateAudio(
	voice: string,
	text: string,
	outputPath: string
): boolean {
	const tmpFile = path.join(root, `tmp_tts_${Date.now()}.txt`);
	fs.writeFileSync(tmpFile, text, "utf8");

	try {
		execSync(
			`edge-tts --voice "${voice}" -f "${tmpFile}" --write-media "${outputPath}"`,
			{
				timeout: 300000,
				encoding: "utf8",
				maxBuffer: 100 * 1024 * 1024,
				stdio: ["ignore", "pipe", "pipe"],
			}
		);
		return true;
	} catch (e: unknown) {
		const err = e as { stderr?: string; message?: string };
		console.error(
			`  ✗ ${err.stderr?.split("\n")[0] || err.message || "unknown error"}`
		);
		try {
			fs.unlinkSync(outputPath);
		} catch {}
		return false;
	} finally {
		try {
			fs.unlinkSync(tmpFile);
		} catch {}
	}
}

function main() {
	fs.mkdirSync(audioDir, { recursive: true });

	const langDirs = fs
		.readdirSync(articlesDir, { withFileTypes: true })
		.filter((d) => d.isDirectory() && d.name !== "assets");

	let totalFiles = 0;
	let totalOk = 0;
	let totalSkip = 0;
	let totalFail = 0;

	for (const entry of langDirs) {
		const lang = entry.name;
		const voice = langToVoice[lang];
		if (!voice) {
			console.warn(`Skipping '${lang}' (no voice mapping)`);
			continue;
		}

		const langPath = path.join(articlesDir, lang);
		const files = fs
			.readdirSync(langPath)
			.filter((f) => f.endsWith(".md") && f !== "index.json");

		for (const file of files) {
			const slug = file.replace(/\.md$/, "");
			const outputPath = path.join(audioDir, `audio-${slug}-${lang}.mp3`);

			if (fs.existsSync(outputPath)) {
				totalSkip++;
				continue;
			}

			const md = fs.readFileSync(path.join(langPath, file), "utf8");
			const { content } = parseFrontMatter(md);
			const plainText = stripMarkdown(content);
			if (!plainText) {
				console.warn(`⚠ Empty text for ${lang}/${slug}`);
				continue;
			}

			const words = plainText.split(/\s+/).length;
			console.log(`[${lang}] ${slug} (${words} words)`);

			totalFiles++;
			if (generateAudio(voice, plainText, outputPath)) {
				const size = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
				console.log(`  ✓ ${size} MB`);
				totalOk++;
			} else {
				totalFail++;
			}
		}
	}

	console.log(
		`\nDone: ${totalFiles} files, ${totalOk} ok, ${totalSkip} skipped, ${totalFail} failed`
	);
}

main();

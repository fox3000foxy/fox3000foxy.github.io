// @ts-nocheck
// Merges the decoy honeypot folder into public/ so Astro copies it to dist/.
// We keep the decoys out of public/ in the repo (so the real content stays
// clean), and only splice them in at build time.
//
// Why .git_exposed: git refuses to track any path containing a ".git" folder
// (it treats it as repository metadata). We keep the decoy as ".git_exposed"
// in the repo, then rename it to ".git" here, before Astro copies everything.
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "honeypot");
const DST = path.join(ROOT, "public");

function copyDir(src, dst) {
	fs.mkdirSync(dst, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const s = path.join(src, entry.name);
		const d = path.join(dst, entry.name);
		if (entry.isDirectory()) {
			copyDir(s, d);
		} else {
			fs.copyFileSync(s, d);
		}
	}
}

function main() {
	if (!fs.existsSync(SRC)) {
		console.log("[honeypot] no honeypot folder, skipping");
		return;
	}
	copyDir(SRC, DST);

	// Rename the decoy git dir to its "live" name.
	// Idempotent: clear any leftovers from a previous merge first.
	const exposed = path.join(DST, ".git_exposed");
	if (fs.existsSync(exposed)) {
		const live = path.join(DST, ".git");
		fs.rmSync(live, { recursive: true, force: true });
		fs.renameSync(exposed, live);
	}

	console.log("[honeypot] merged decoys into public/");
}

main();

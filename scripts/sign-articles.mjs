#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createSign, createPrivateKey } from "crypto";
import { globSync } from "glob";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Load .env if present
const envPath = resolve(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const PRIVATE_KEY_BASE64 = process.env.SIGNING_PRIVATE_KEY;
if (!PRIVATE_KEY_BASE64) {
  console.error("ERROR: SIGNING_PRIVATE_KEY env var not set (add it to .env or export it)");
  process.exit(1);
}

const PUBLIC_KEY_BASE64 =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQcreZmmVx1U8zFHwsD+JTDIUKtMP5RYijaEkOIqZVfXIKA/i3h0lslw+ZgUBlLXKW3OVA2tGM8svcJWTXDxS8A==";

const privateKey = createPrivateKey({
  key: Buffer.from(PRIVATE_KEY_BASE64, "base64"),
  type: "pkcs8",
  format: "der",
});

function signArticle(slug, author, date, content) {
  const msg = `${slug}|${author}|${date}|${content}`;
  const sign = createSign("SHA256");
  sign.update(msg);
  sign.end();
  return sign.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }, "base64");
}

const files = globSync("public/articles/*/*.md", {
  ignore: "public/articles/*/index.json",
});

let ok = 0;
let skip = 0;
let fail = 0;

for (const file of files) {
  const text = readFileSync(file, "utf-8");

  // Parse frontmatter
  if (!text.startsWith("---\n")) {
    fail++;
    console.error(`FAIL: ${file} - no frontmatter`);
    continue;
  }
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) {
    fail++;
    console.error(`FAIL: ${file} - bad frontmatter`);
    continue;
  }

  const frontmatter = text.slice(4, end);
  const content = text.slice(end + 5);

  // Extract fields
  let title = "",
    date = "",
    authors = [],
    listKey = null;

  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      listKey = null;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (key === "title") title = val.replace(/^["']|["']$/g, "");
      else if (key === "date") date = val;
      else if (key === "authors") {
        authors = val
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        if (!authors.length && !val) listKey = "authors";
      }
    } else if (listKey === "authors" && /^\s+-\s+/.test(line)) {
      const item = line.replace(/^\s+-\s+/, "").trim();
      if (item) authors.push(item);
    }
  }

  const author = authors[0] || "";
  const slug = file.split("/").pop().replace(/\.md$/, "");

  // Strip any existing author_pubkey/author_sig lines
  const cleanFrontmatter = frontmatter
    .split("\n")
    .filter((l) => !l.startsWith("author_pubkey:") && !l.startsWith("author_sig:"))
    .join("\n");

  const sig = signArticle(slug, author, date, content);

  const newFrontmatter =
    cleanFrontmatter + `\nauthor_pubkey: "${PUBLIC_KEY_BASE64}"\nauthor_sig: "${sig}"`;
  const newText = `---\n${newFrontmatter}\n---\n${content}`;
  writeFileSync(file, newText);
  ok++;
  console.log(`✓ ${file}`);
}

console.log(`\nDone: ${ok} signed, ${skip} skipped, ${fail} failed`);

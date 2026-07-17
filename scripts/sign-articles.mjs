#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createSign, createVerify, createPrivateKey, createPublicKey } from "crypto";
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

const privateKey = createPrivateKey({
  key: Buffer.from(PRIVATE_KEY_BASE64, "base64"),
  type: "pkcs8",
  format: "der",
});
const publicKey = createPublicKey(privateKey);
const PUBLIC_KEY_BASE64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");

function signArticle(slug, author, date, content) {
  const msg = `${slug}|${author}|${date}|${content}`;
  const sign = createSign("SHA256");
  sign.update(msg);
  sign.end();
  return sign.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }, "base64");
}

function verifySignature(slug, author, date, content, sigBase64, pubkeyBase64) {
  const msg = `${slug}|${author}|${date}|${content}`;
  const verify = createVerify("SHA256");
  verify.update(msg);
  verify.end();
  try {
    return verify.verify(
      { key: Buffer.from(pubkeyBase64, "base64"), type: "spki", format: "der", dsaEncoding: "ieee-p1363" },
      sigBase64,
      "base64"
    );
  } catch {
    return false;
  }
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return null;
  return { frontmatter: text.slice(4, end), content: text.slice(end + 5) };
}

function extractFields(frontmatter) {
  let title = "", date = "", authors = [], pubkey = "", sig = "", listKey = null;
  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      listKey = null;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (key === "title") title = val.replace(/^["']|["']$/g, "");
      else if (key === "date") date = val;
      else if (key === "author_pubkey") pubkey = val.replace(/^["']|["']$/g, "");
      else if (key === "author_sig") sig = val.replace(/^["']|["']$/g, "");
      else if (key === "authors") {
        authors = val.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
        if (!authors.length && !val) listKey = "authors";
      }
    } else if (listKey === "authors" && /^\s+-\s+/.test(line)) {
      const item = line.replace(/^\s+-\s+/, "").trim();
      if (item) authors.push(item);
    }
  }
  return { title, date, authors, pubkey, sig };
}

const files = globSync("public/articles/*/*.md", {
  ignore: "public/articles/*/index.json",
});

let ok = 0;
let skip = 0;
let fail = 0;

for (const file of files) {
  const text = readFileSync(file, "utf-8");

  const parsed = parseFrontmatter(text);
  if (!parsed) {
    fail++;
    console.error(`FAIL: ${file} - no/bad frontmatter`);
    continue;
  }

  const { frontmatter, content } = parsed;
  const { date, authors, pubkey, sig } = extractFields(frontmatter);
  const author = authors[0] || "";
  const slug = file.split("/").pop().replace(/\.md$/, "");

  // Check if existing signature is valid
  if (pubkey && sig) {
    console.log(`Checking existing signature for ${file}...`);
    const isValid = verifySignature(slug, author, date, content, sig, pubkey);
    console.log(`Signature valid: ${isValid}`);
    if (isValid) {
      skip++;
      console.log(`– ${file} (signature valid)`);
      continue;
    }
  }

  // Re-sign
  const cleanFrontmatter = frontmatter
    .split("\n")
    .filter((l) => !l.startsWith("author_pubkey:") && !l.startsWith("author_sig:"))
    .join("\n");

  const newSig = signArticle(slug, author, date, content);
  const newFrontmatter =
    cleanFrontmatter + `\nauthor_pubkey: "${PUBLIC_KEY_BASE64}"\nauthor_sig: "${newSig}"`;
  const newText = `---\n${newFrontmatter}\n---\n${content}`;
  writeFileSync(file, newText);
  ok++;
  console.log(`✓ ${file}`);
}

console.log(`\nDone: ${ok} signed, ${skip} skipped, ${fail} failed`);

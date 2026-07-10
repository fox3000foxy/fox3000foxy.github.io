#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { createSign, createPrivateKey } from "crypto";
import { globSync } from "glob";

const PRIVATE_KEY_BASE64 =
  "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgzkN4fVhQw60koTjbCAbF02ozk186oExSGu36F5HDTe+hRANCAASpXzk6hiZ+vDRskYx5njj+pKS4xopPZCnqh9YraVd18v5B/ww8D/o3TaZxrf+t+JUcE1ZdlFEVEidsxj/DwWq0";

const PUBLIC_KEY_BASE64 =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEqV85OoYmfrw0bJGMeZ44/qSkuMaKT2Qp6ofWK2lXdfL+Qf8MPA/6N02mca3/rfiVHBNWXZRRFRInbMY/w8FqtA==";

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
  return sign.sign(privateKey, "base64");
}

const files = globSync("public/articles/*/*.md", {
  ignore: "public/articles/*/index.json",
});

let ok = 0;
let skip = 0;
let fail = 0;

for (const file of files) {
  const text = readFileSync(file, "utf-8");

  // Check if already signed
  if (text.includes("author_sig:")) {
    skip++;
    continue;
  }

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
    authors = [];

  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
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
    }
  }

  const author = authors[0] || "";
  const slug = file.split("/").pop().replace(/\.md$/, "");

  const sig = signArticle(slug, author, date, content);

  const newFrontmatter =
    frontmatter + `\nauthor_pubkey: "${PUBLIC_KEY_BASE64}"\nauthor_sig: "${sig}"`;
  const newText = `---\n${newFrontmatter}\n---\n${content}`;
  writeFileSync(file, newText);
  ok++;
  console.log(`✓ ${file}`);
}

console.log(`\nDone: ${ok} signed, ${skip} skipped, ${fail} failed`);

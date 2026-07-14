#!/usr/bin/env python3
"""
Scans public/articles/<lang>/*.md for stray characters from a script that
doesn't belong to that language (e.g. Chinese fragments in a Korean article,
Arabic fragments in a Thai article, encoding corruption, etc).

Usage:
    python3 scripts/check-lang-contamination.py
    python3 scripts/check-lang-contamination.py --fail-on-error   # exit 1 if anomalies found (for CI)

Each Unicode script range is checked against the *expected* script(s) for
that language directory. Anything else found is reported with line context.
A small whitelist covers legitimate cross-script mentions (foreign product
names cited in their original language, e.g. "UTAU" written as 歌う).
"""

import re
import sys
import glob
import argparse

ARTICLES_DIR = "public/articles"

RANGES = {
    "cyrillic": (0x0400, 0x04FF),
    "arabic": (0x0600, 0x06FF),
    "devanagari": (0x0900, 0x097F),
    "han": (0x4E00, 0x9FFF),
    "hangul": (0xAC00, 0xD7A3),
    "hiragana_katakana": (0x3040, 0x30FF),
    "thai": (0x0E00, 0x0E7F),
}

LATIN_LANGS = {"en", "de", "es", "fr", "it", "pt", "tr", "vi", "id"}

# For non-Latin languages: which script(s) are expected/allowed natively.
EXPECTED_SCRIPT = {
    "ar": {"arabic"},
    "hi": {"devanagari"},
    "ja": {"hiragana_katakana", "han"},
    "ko": {"hangul"},
    "ru": {"cyrillic"},
    "th": {"thai"},
    "zh": {"han", "hiragana_katakana"},  # zh often cites Japanese terms too
}

# Known legitimate cross-script mentions: proper nouns / original-language
# terms intentionally kept as-is (e.g. explaining "UTAU" via 歌う).
WHITELIST = {
    "歌", "人力", "う", "ボーカロイド",
    "СберБанк", "Тинькофф", "Газпромбанк",
    "成功",
}

REPLACEMENT_CHAR = "\ufffd"

# Languages where words are normally space-delimited, so a CJK/Thai
# character glued directly to a Latin word (no space) is a strong signal of
# lost linebreaks/corruption. Japanese and Chinese do NOT use spaces between
# words/particles and proper nouns (e.g. "のGitHub" is completely normal),
# so they're excluded to avoid false positives.
FUSION_CHECK_LANGS = {"ko", "th"}


def strip_non_prose(content: str) -> str:
    content = re.sub(r"```.*?```", "", content, flags=re.S)
    content = re.sub(r"`[^`]*`", "", content)
    content = re.sub(r"https?://\S+", "", content)
    return content


def find_structural_corruption(raw: str, lang: str) -> dict:
    """Detects symptoms of lost linebreaks / truncated generation:
    - a CJK/Thai sentence-ending character glued directly to a capital
      Latin letter or digit with no space/punctuation in between
      (e.g. '다다이아몬드', '될 것NNA')
    - a broken markdown image path missing its 'assets/' or leading slash
      (e.g. '](assetsace-bot-arena.png)')
    """
    found = {}

    # Broken image paths: ]( not followed by a proper path start
    broken_images = re.findall(r"!\[[^\]]*\]\((assets[a-zA-Z][^)]*)\)", raw)
    broken_images += re.findall(r"!\[[^\]]*\]\((?!assets/|/|https?://)([a-zA-Z][^)]*\.(?:png|jpg|jpeg|svg|gif))\)", raw)
    if broken_images:
        found["broken_image_path"] = broken_images

    if lang in FUSION_CHECK_LANGS:
        content = strip_non_prose(raw)
        # CJK/Thai sentence-ending char directly followed by an uppercase
        # Latin letter or digit, no space/punctuation -- strong signal of a
        # lost paragraph break mid-generation.
        fused = re.findall(r"[\u4e00-\u9fff\uac00-\ud7a3\u3040-\u30ff\u0e00-\u0e7f][A-Z][a-zA-Z]{2,}", content)
        if fused:
            found["fused_sentence_into_latin"] = fused

    return found


def find_anomalies(path: str, lang: str) -> dict:
    raw = open(path, encoding="utf-8").read()
    anomalies = {}

    if REPLACEMENT_CHAR in raw:
        anomalies["encoding_corruption (U+FFFD)"] = ["<replacement character found>"]

    anomalies.update(find_structural_corruption(raw, lang))

    content = strip_non_prose(raw)

    if lang in LATIN_LANGS:
        allowed = set()
    elif lang in EXPECTED_SCRIPT:
        allowed = EXPECTED_SCRIPT[lang]
    else:
        return anomalies  # unknown lang dir, skip script check

    for key, (lo, hi) in RANGES.items():
        if key in allowed:
            continue
        matches = [m for m in re.findall(f"[{chr(lo)}-{chr(hi)}]+", content) if m not in WHITELIST]
        if matches:
            anomalies[key] = matches

    return anomalies


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fail-on-error", action="store_true")
    args = parser.parse_args()

    results = {}
    for lang_dir in sorted(glob.glob(f"{ARTICLES_DIR}/*/")):
        lang = lang_dir.rstrip("/").split("/")[-1]
        if lang == "assets":
            continue
        for f in sorted(glob.glob(f"{lang_dir}*.md")):
            anomalies = find_anomalies(f, lang)
            if anomalies:
                results[f] = anomalies

    if not results:
        print("✅ No language contamination found across all articles.")
        sys.exit(0)

    print(f"⚠️  {len(results)} file(s) with suspected contamination:\n")
    for f, anomalies in results.items():
        print(f"  {f}")
        for kind, matches in anomalies.items():
            preview = ", ".join(matches[:8])
            print(f"    - {kind}: {preview}")
        print()

    if args.fail_on_error:
        sys.exit(1)


if __name__ == "__main__":
    main()

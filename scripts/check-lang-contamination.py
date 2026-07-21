#!/usr/bin/env python3
"""
Scans public/articles/<lang>/*.md for stray characters from a script that
doesn't belong to that language (e.g. Chinese fragments in a Korean article,
Arabic fragments in a Thai article, encoding corruption, etc).

Features:
  - Per-script Unicode range detection against per-language allowlists
  - Visual confusables: characters that look identical but belong to a
    different script (e.g. Cyrillic а vs Latin a, Greek ο vs Latin o)
  - Structural corruption: fused words, broken image paths, orphaned
    combining marks, replacement characters
  - Context-aware reporting with original file line numbers
  - YAML frontmatter is excluded from checks
  - Single-file mode for quick inspection

Usage:
    python3 scripts/check-lang-contamination.py
    python3 scripts/check-lang-contamination.py --fail-on-error   # exit 1 if anomalies found (for CI)
    python3 scripts/check-lang-contamination.py --file articles/ko/foo.md
"""

import re
import sys
import glob
import argparse

ARTICLES_DIR = "public/articles"

# ── Unicode script ranges ──────────────────────────────────────────────

RANGES = {
    "cyrillic":             (0x0400, 0x04FF),
    "cyrillic_supplement":  (0x0500, 0x052F),
    "arabic":               (0x0600, 0x06FF),
    "arabic_supplement":    (0x0750, 0x077F),
    "arabic_extended_a":    (0x08A0, 0x08FF),
    "devanagari":           (0x0900, 0x097F),
    "devanagari_extended":  (0xA8E0, 0xA8FF),
    "bengali":              (0x0980, 0x09FF),
    "tamil":                (0x0B80, 0x0BFF),
    "telugu":               (0x0C00, 0x0C7F),
    "thai":                 (0x0E00, 0x0E7F),
    "khmer":                (0x1780, 0x17FF),
    "myanmar":              (0x1000, 0x109F),
    "han":                  (0x4E00, 0x9FFF),
    "han_extension_a":      (0x3400, 0x4DBF),
    "han_compatibility":    (0xF900, 0xFAFF),
    "hangul":               (0xAC00, 0xD7A3),
    "hangul_jamo":          (0x1100, 0x11FF),
    "hiragana_katakana":    (0x3040, 0x30FF),
    "katakana_extension":   (0x31F0, 0x31FF),
    "halfwidth_cjk":        (0xFF00, 0xFFEF),
    "greek":                (0x0370, 0x03FF),
    "hebrew":               (0x0590, 0x05FF),
    "cjk_punctuation":      (0x3000, 0x303F),
    "fullwidth_latin":      (0xFF01, 0xFF5E),
}

# ── Per-language allowed scripts ──────────────────────────────────────

LATIN_LANGS = {"en", "de", "es", "fr", "it", "pt", "tr", "vi", "id"}

EXPECTED_SCRIPT = {
    "ar": {"arabic", "arabic_supplement", "arabic_extended_a"},
    "hi": {"devanagari", "devanagari_extended"},
    "ja": {"hiragana_katakana", "katakana_extension", "han", "han_extension_a",
           "han_compatibility", "halfwidth_cjk", "cjk_punctuation", "fullwidth_latin"},
    "ko": {"hangul", "hangul_jamo", "halfwidth_cjk"},
    "ru": {"cyrillic", "cyrillic_supplement"},
    "th": {"thai"},
    "zh": {"han", "han_extension_a", "han_compatibility", "hiragana_katakana",
           "katakana_extension", "halfwidth_cjk", "cjk_punctuation", "fullwidth_latin"},
}

# ── Visual confusables ─────────────────────────────────────────────────
# Pairs of homoglyphic characters from different scripts that are easy to
# accidentally mix up. Key = (script_name, char), shown alongside where it was found.
VISUAL_CONFUSABLES = {
    # Cyrillic → Latin confusables (common in tech writing)
    "\u0430": ("cyrillic", "Latin a"),    # Cyrillic а → Latin a
    "\u0435": ("cyrillic", "Latin e"),    # Cyrillic е → Latin e
    "\u043e": ("cyrillic", "Latin o"),    # Cyrillic о → Latin o
    "\u0440": ("cyrillic", "Latin p"),    # Cyrillic р → Latin p
    "\u0441": ("cyrillic", "Latin c"),    # Cyrillic с → Latin c
    "\u0443": ("cyrillic", "Latin y"),    # Cyrillic у → Latin y
    "\u0445": ("cyrillic", "Latin x"),    # Cyrillic х → Latin x
    # Greek → Latin confusables
    "\u03bf": ("greek", "Latin o"),       # Greek ο → Latin o
    "\u03b5": ("greek", "Latin e"),       # Greek ε → Latin e
    # Cyrillic → other confusables
    "\u0456": ("cyrillic", "Latin i"),    # Cyrillі і → Latin i (Ukrainian/Belarusian)
}

VISUAL_CONFUSABLE_LANGS = {"en", "fr", "de", "es", "it", "pt", "tr", "vi", "id",
                           "ru", "ar", "hi", "ko", "th", "ja", "zh"}


# ── Whitelist of legitimate cross-script terms ─────────────────────────

WHITELIST = {
    "歌", "人力", "う", "ボーカロイド",
    "СберБанк", "Тинькофф", "Газпромбанк",
    "成功",
    "新しい", "プロジェクト", "GitHub", "Discord",
}

REPLACEMENT_CHAR = "\ufffd"

FUSION_CHECK_LANGS = {"ko", "th"}

# Minimum match length for certain noisier scripts (single chars are often
# legitimate loan glyphs or punctuation in tech writing).
MIN_LENGTH = {
    "han": 2,
    "han_extension_a": 2,
    "han_compatibility": 2,
    "cjk_punctuation": 1,
    "halfwidth_cjk": 2,
    "fullwidth_latin": 2,
}

# Languages where text is NOT space-delimited -- fusion detection doesn't
# apply (would produce false positives for compound/agglutinative writing).
SPACELESS_SCRIPTS = {"ja", "zh", "th", "ko"}


# ── Helpers ────────────────────────────────────────────────────────────

def strip_yaml(text: str) -> str:
    """Remove YAML frontmatter between leading --- ... ---."""
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            return text[end + 5:]
    return text


def strip_non_prose(text: str) -> str:
    """Remove code blocks, inline code, URLs, image markdown."""
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"`[^`]*`", "", text)
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)
    return text


def find_visual_confusables(text: str, lang: str) -> list:
    """Detect homoglyphic characters from wrong scripts in visible prose.

    A confusable character is suspicious only when it appears isolated in
    text of a different script. If it is surrounded by other characters from
    its own script, it is intentional (e.g. a Russian bank name written in
    Cyrillic within an English article).
    """
    found = []
    prose = strip_non_prose(strip_yaml(text))

    for i, ch in enumerate(prose):
        if ch not in VISUAL_CONFUSABLES:
            continue

        script, looks_like = VISUAL_CONFUSABLES[ch]
        if lang in EXPECTED_SCRIPT and script in EXPECTED_SCRIPT[lang]:
            continue

        # Check if there are other characters of the same script nearby
        # (within 40 positions). If yes, this is intentional foreign text.
        lo, hi = RANGES[script]
        window = prose[max(0, i - 40): min(len(prose), i + 41)]
        same_script_count = sum(1 for c in window if lo <= ord(c) <= hi)
        if same_script_count > 1:
            continue  # part of a legitimate foreign word

        line_num = prose[:i].count("\n") + 1
        ctx_start = max(0, i - 20)
        ctx_end = min(len(prose), i + 20)
        pre = "..." if ctx_start > 0 else ""
        post = "..." if ctx_end < len(prose) else ""
        ctx = pre + prose[ctx_start:ctx_end] + post
        found.append(f"L{line_num}: {ch!r} (looks like {looks_like}) in {ctx!r}")

    return found


def find_structural_corruption(raw: str, lang: str) -> dict:
    """Detect broken image paths, fusion, orphaned combining marks."""
    found = {}
    content = strip_non_prose(raw)

    # Broken image paths
    broken = re.findall(r"!\[[^\]]*\]\((assets[a-zA-Z][^)]*)\)", raw)
    broken += re.findall(
        r"!\[[^\]]*\]\((?!assets/|/|https?://)([a-zA-Z][^)]*\.(?:png|jpg|jpeg|svg|gif))\)", raw)
    if broken:
        found["broken_image_path"] = broken

    # Fusion detection for space-delimited languages
    if lang in FUSION_CHECK_LANGS:
        fused = re.findall(
            r"[\u4e00-\u9fff\uac00-\ud7a3\u3040-\u30ff\u0e00-\u0e7f][A-Z][a-zA-Z]{2,}", content)
        if fused:
            found["fused_sentence_into_latin"] = fused

    # Orphaned combining marks (sign of truncation)
    orphaned = re.findall(r"(?:^|\s)(?:[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7\u06e8\u06ea-\u06ed\u0900-\u0902\u093a-\u093c\u0941-\u0948\u094d\u0951-\u0957\u0962\u0963\u0981\u09bc\u09be\u09c1-\u09c4\u09cd\u09e2\u09e3\u0a01\u0a02\u0a3c\u0a41\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a70\u0a71\u0b3e\u0b3f\u0b41-\u0b44\u0b4d\u0b56\u0b62\u0b63\u0b82\u0bbe\u0bc0\u0bcd\u0c3e-\u0c40\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0cbf\u0cc6\u0ccc\u0ccd\u0d41-\u0d44\u0d4d\u0dca\u0e31\u0e34-\u0e3a\u0e47-\u0e4e])",
        content)
    if orphaned:
        found["orphaned_combining_mark"] = orphaned

    return found


# ── Core analysis ──────────────────────────────────────────────────────

def find_anomalies(path: str, lang: str) -> dict:
    raw = open(path, encoding="utf-8").read()
    anomalies = {}

    # Replacement character
    if REPLACEMENT_CHAR in raw:
        pos = raw.index(REPLACEMENT_CHAR)
        line = raw[:pos].count("\n") + 1
        anomalies["encoding_corruption"] = [f"U+FFFD at original line {line}"]

    # Structural corruption
    anomalies.update(find_structural_corruption(raw, lang))

    # Visual confusables
    if lang in VISUAL_CONFUSABLE_LANGS:
        confusables = find_visual_confusables(raw, lang)
        if confusables:
            anomalies["visual_confusable"] = confusables

    # Script range violations
    body = strip_yaml(raw)
    prose = strip_non_prose(body)
    prose_lines = prose.split("\n")

    # Map stripped line number back to original file line number
    body_lines = body.split("\n")
    stripped_to_orig: dict[int, int] = {}
    si = 0
    for oi, ol in enumerate(body_lines, 1):
        if si < len(prose_lines):
            stripped_line = prose_lines[si].strip()
            orig_line = ol.strip()
            # Check if this original line maps to the current stripped line
            if stripped_line and orig_line == stripped_line:
                stripped_to_orig[si + 1] = oi
                si += 1
            elif not orig_line:
                pass  # blank lines in original are skipped in prose
            else:
                # Content differs (code was stripped). Advance stripped index
                # if the stripped line appears somewhere in the original.
                if stripped_line and stripped_line in ol:
                    stripped_to_orig[si + 1] = oi
                    si += 1

    if lang not in LATIN_LANGS and lang not in EXPECTED_SCRIPT:
        return anomalies

    allowed = set() if lang in LATIN_LANGS else EXPECTED_SCRIPT.get(lang, set())

    for key, (lo, hi) in RANGES.items():
        if key in allowed:
            continue

        min_len = MIN_LENGTH.get(key, 1)

        for line_idx, line in enumerate(prose_lines, 1):
            matches = re.findall(f"[{chr(lo)}-{chr(hi)}]+", line)
            matches = [m for m in matches if len(m) >= min_len and m not in WHITELIST]
            if not matches:
                continue

            orig_line = stripped_to_orig.get(line_idx, line_idx)
            if key not in anomalies:
                anomalies[key] = []

            for m in matches:
                ctx_start = max(0, line.find(m) - 30)
                ctx_end = min(len(line), line.find(m) + len(m) + 30)
                pre = "..." if ctx_start > 0 else ""
                post = "..." if ctx_end < len(line) else ""
                ctx = pre + line[ctx_start:ctx_end] + post
                anomalies[key].append(f"L{orig_line}: {m!r} in {ctx!r}")

    return anomalies


# ── CLI ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Detect language script contamination in translated articles.")
    parser.add_argument("--fail-on-error", action="store_true",
                        help="Exit with code 1 if any contamination is found")
    parser.add_argument("--file", type=str,
                        help="Check a single file instead of all articles")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Show all checks including files that pass")
    args = parser.parse_args()

    results = {}

    if args.file:
        path = args.file
        parts = path.replace("\\", "/").split("/")
        lang = (parts[parts.index("articles") + 1]
                if "articles" in parts and parts.index("articles") + 1 < len(parts)
                else "")
        anomalies = find_anomalies(path, lang)
        if anomalies:
            results[path] = anomalies
        elif args.verbose:
            print(f"  {path} -- clean")
    else:
        for lang_dir in sorted(glob.glob(f"{ARTICLES_DIR}/*/")):
            lang = lang_dir.rstrip("/").split("/")[-1]
            if lang == "assets":
                continue
            for f in sorted(glob.glob(f"{lang_dir}*.md")):
                if f.endswith("index.json"):
                    continue
                anomalies = find_anomalies(f, lang)
                if anomalies:
                    results[f] = anomalies
                elif args.verbose:
                    print(f"  {f} -- clean")

    if not results:
        print("No language contamination found across all articles.")
        sys.exit(0)

    print(f"{len(results)} file(s) with suspected contamination:\n")
    for f, anomalies in results.items():
        print(f"  {f}")
        for kind, matches in anomalies.items():
            header = kind.replace("_", " ").title()
            print(f"    {header}:")
            for m in matches[:5]:
                print(f"      {m}")
            if len(matches) > 5:
                print(f"      ... and {len(matches) - 5} more")
        print()

    if args.fail_on_error:
        sys.exit(1)


if __name__ == "__main__":
    main()

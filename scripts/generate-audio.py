#!/usr/bin/env python3
"""Generate audio for all articles using edge-tts (async, faster)."""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

import edge_tts

ROOT = Path(os.getcwd())
ARTICLES_DIR = ROOT / "public" / "articles"
AUDIO_DIR = ARTICLES_DIR / "assets"

LANG_TO_VOICE = {
    "en": "en-US-JennyNeural",
    "ar": "ar-SA-ZariyahNeural",
    "de": "de-DE-KatjaNeural",
    "es": "es-ES-ElviraNeural",
    "fr": "fr-FR-DeniseNeural",
    "hi": "hi-IN-SwaraNeural",
    "id": "id-ID-GadisNeural",
    "it": "it-IT-ElsaNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "pt": "pt-BR-FranciscaNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "th": "th-TH-PremwadeeNeural",
    "tr": "tr-TR-EmelNeural",
    "vi": "vi-VN-HoaiMyNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
}


def strip_markdown(md: str) -> str:
    text = md
    text = re.sub(r"^---[\s\S]*?\n---\n*", "", text)
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"`[^`\n]+`", "", text)
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)
    text = re.sub(r"\[([^\]]*)\]\(.*?\)", r"\1", text)
    text = re.sub(r"<[^>]*>", "", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"(\*{1,3}|_{1,3})(.+?)\1", r"\2", text)
    text = re.sub(r"^[-*_]{3,}\s*$", "", text, flags=re.MULTILINE)
    text = re.sub(r"^>\s?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[\s]*[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[\s]*\d+\.\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[\s]*\|[\s\-:|]+\|[\s]*$", "", text, flags=re.MULTILINE)
    text = text.replace("|", "")
    text = re.sub(r"[─├└│┌┐┘┝┥┤┴┬┼═║╒╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬]+", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"^\s*\n", "\n", text, flags=re.MULTILINE)
    return text.strip()


async def generate_one(voice: str, text: str, output_path: Path) -> bool:
    try:
        communicate = edge_tts.Communicate(text, voice)
        with open(output_path, "wb") as f:
            async for chunk in communicate.stream():
                data = chunk.get("data")
                if chunk["type"] == "audio" and data:
                    f.write(data)
        return True
    except Exception as e:
        print(f"  ✗ {e}", file=sys.stderr)
        try:
            output_path.unlink()
        except FileNotFoundError:
            pass
        return False


async def main():
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    lang_dirs = sorted(
        d for d in ARTICLES_DIR.iterdir()
        if d.is_dir() and d.name != "assets"
    )

    total_files = 0
    total_ok = 0
    total_skip = 0
    total_fail = 0

    sem = asyncio.Semaphore(3)  # 3 concurrent TTS calls

    async def process_file(lang: str, voice: str, md_path: Path, slug: str):
        nonlocal total_files, total_ok, total_skip, total_fail
        output_path = AUDIO_DIR / f"audio-{slug}-{lang}.mp3"

        if output_path.exists():
            nonlocal total_skip
            total_skip += 1
            return

        text = md_path.read_text("utf-8")
        # Parse frontmatter
        content = text
        if text.startswith("---\n"):
            end = text.find("\n---\n", 4)
            if end != -1:
                content = text[end + 5:]
        plain = strip_markdown(content)
        if not plain:
            print(f"⚠  Empty text for {lang}/{slug}")
            return

        words = len(plain.split())
        print(f"[{lang}] {slug} ({words} words)")

        async with sem:
            total_files += 1
            if await generate_async_wrapper(voice, plain, output_path, slug, lang):
                total_ok += 1
            else:
                total_fail += 1

    tasks = []
    for entry in lang_dirs:
        lang = entry.name
        voice = LANG_TO_VOICE.get(lang)
        if not voice:
            print(f"⚠ No voice for '{lang}', skipping")
            continue

        for f in entry.iterdir():
            if not f.name.endswith(".md") or f.name == "index.json":
                continue
            slug = f.name[:-3]
            tasks.append(process_file(lang, voice, f, slug))

    # Process in batches to show progress
    for i, task in enumerate(asyncio.as_completed(tasks)):
        await task
        if (i + 1) % 10 == 0:
            print(f"  --- {i + 1}/{len(tasks)} done ---")

    print(f"\nDone: {total_files} new, {total_ok} ok, {total_skip} skipped, {total_fail} failed")


async def generate_async_wrapper(voice: str, text: str, output_path: Path, lang: str, slug: str) -> bool:
    try:
        communicate = edge_tts.Communicate(text, voice)
        with open(output_path, "wb") as f:
            async for chunk in communicate.stream():
                data = chunk.get("data")
                if chunk["type"] == "audio" and data:
                    f.write(data)
        # Re-encode to 16kbps mono to drastically reduce file size
        tmp = output_path.with_suffix(".tmp.mp3")
        ret = os.system(
            f'ffmpeg -y -i "{output_path}" -codec:a libmp3lame -b:a 16k -ac 1 -ar 22050 "{tmp}" 2>/dev/null'
        )
        if ret == 0 and tmp.exists():
            tmp.replace(output_path)
        size = output_path.stat().st_size / 1024 / 1024
        print(f"  ✓ {size:.1f} MB")
        return True
    except Exception as e:
        print(f"  ✗ {e}", file=sys.stderr)
        try:
            output_path.unlink()
        except FileNotFoundError:
            pass
        return False


if __name__ == "__main__":
    asyncio.run(main())
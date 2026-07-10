#!/bin/bash
dir="public/articles/assets"
count=0
max=6

for f in "$dir"/audio-*.mp3; do
  s=$(stat -c %s "$f" 2>/dev/null)
  [ -z "$s" ] && continue
  [ "$s" -le 300000 ] && continue

  tmp="${f%.*}.tmp.mp3"
  (
    timeout 120 ffmpeg -y -i "$f" -codec:a libmp3lame -b:a 16k -ac 1 -ar 22050 "$tmp" 2>/dev/null && mv "$tmp" "$f" || rm -f "$tmp" 2>/dev/null
  ) &

  count=$((count + 1))
  if [ $((count % max)) -eq 0 ]; then
    wait
  fi
done
wait
echo "DONE: $(ls "$dir"/audio-*.mp3 | wc -l) files"
du -sh "$dir"/audio-*.mp3 2>/dev/null | tail -1
echo "M $(du -sb "$dir"/audio-*.mp3 | awk '{print $1}') bytes"

#!/bin/bash
set -e
cd "$(dirname "$0")"
FF=/Users/mac/.local/bin/ffmpeg
FP=/Users/mac/.local/bin/ffprobe
mkdir -p parts
rm -f parts/*.mp4 concat.txt
for s in 01-welcome 02-dashboard 03-deals 04-calendar 05-explore 06-alerts 07-concierge 08-pricing; do
  d=$($FP -v quiet -show_entries format=duration -of csv=p=0 "audio/$s.mp3")
  echo "· $s → ${d}s"
  $FF -y -v error -i "scenes/$s.webm" -i "audio/$s.mp3" \
    -t "$d" -r 30 -c:v libx264 -crf 21 -preset medium -pix_fmt yuv420p \
    -c:a aac -b:a 128k -ar 44100 "parts/$s.mp4"
  echo "file 'parts/$s.mp4'" >> concat.txt
done
$FF -y -v error -f concat -safe 0 -i concat.txt -c copy -movflags +faststart flycheap-demo.mp4
# poster: dashboard scene, 6s in (offset by scene 1 duration)
$FF -y -v error -ss 36 -i flycheap-demo.mp4 -vframes 1 -q:v 3 flycheap-demo-poster.jpg
$FP -v quiet -show_entries format=duration -of csv=p=0 flycheap-demo.mp4
ls -la flycheap-demo.mp4 flycheap-demo-poster.jpg

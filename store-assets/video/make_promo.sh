#!/usr/bin/env bash
# Builds the Marketplace promo video from a raw Chrome screencast.
# Usage: make_promo.sh RAW.mp4 FREEZE.png OUT.mp4
set -euo pipefail
RAW=$1; FREEZE=$2; OUT=$3
W=$(mktemp -d)
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
FONT_R=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
ENC="-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 -an"

# Chrome screencasts are variable frame rate with long gaps while the page is
# idle; convert to constant 30 fps first so cuts land on the requested times.
ffmpeg -v error -y -i "$RAW" -vf fps=30 -c:v libx264 -preset veryfast -crf 12 -pix_fmt yuv420p -an "$W/cfr.mp4"
RAW="$W/cfr.mp4"

cap() { # caption bar at the bottom of the frame
  local t=${1//:/\\:}
  echo "drawbox=x=0:y=ih-96:w=iw:h=96:color=0x0B3D91@0.88:t=fill,drawtext=fontfile=$FONT:text='$t':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=h-48-text_h/2"
}
seg() { # seg N START DURATION CAPTION
  ffmpeg -v error -y -ss "$2" -i "$RAW" -t "$3" -vf "$(cap "$4"),fade=t=in:st=0:d=0.25,fade=t=out:st=$(echo "$3-0.25" | bc):d=0.25" $ENC "$W/$1.mp4"
}
card() { # card N DURATION LINE1 LINE2 LINE3
  ffmpeg -v error -y -f lavfi -i "color=c=0x0B3D91:s=1280x720:d=$2:r=30" -vf "drawtext=fontfile=$FONT:text='$3':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=h/2-110,drawtext=fontfile=$FONT_R:text='$4':fontcolor=0xFFD200:fontsize=40:x=(w-text_w)/2:y=h/2-10,drawtext=fontfile=$FONT_R:text='$5':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=h/2+70,fade=t=in:st=0:d=0.3,fade=t=out:st=$(echo "$2-0.3" | bc):d=0.3" $ENC "$W/$1.mp4"
}

card 1 3 "Make public documents" "easier to read" "Flesch-Kincaid Readability for Google Docs"
seg  2 16.5 7.5 "See the reading grade as you write"
seg  3 29   5   "Spot long sentences, passive voice, and jargon"
seg  4 43.5 3.5 "One click: rewrite it in plain language with AI"
ffmpeg -v error -y -loop 1 -i "$FREEZE" -t 4.5 -vf "fps=30,$(cap "Every rewrite is re-graded and checked for meaning"),fade=t=in:st=0:d=0.25,fade=t=out:st=4.25:d=0.25" $ENC "$W/5.mp4"
seg  6 65.5 3.5 "Accept to update your document"
seg  7 78   6   "Grade 17 → Grade 8"
card 8 4 "Flesch-Kincaid Readability" "Plain language checks + AI rewrites" "Extensions → Add-ons → Get add-ons"

# Re-encode while joining: stream-copy concat breaks on the looped still segment.
ffmpeg -v error -y $(for i in 1 2 3 4 5 6 7 8; do printf -- '-i %s ' "$W/$i.mp4"; done) \
  -filter_complex "$(for i in 0 1 2 3 4 5 6 7; do printf '[%d:v]setpts=PTS-STARTPTS,settb=1/30[v%d];' $i $i; done)$(for i in 0 1 2 3 4 5 6 7; do printf '[v%d]' $i; done)concat=n=8:v=1:a=0[out]" \
  -map "[out]" $ENC -movflags +faststart "$OUT"
rm -rf "$W"

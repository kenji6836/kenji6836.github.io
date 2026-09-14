#!/bin/bash
# レーン V: 実写風写真 8 枚を ChatGPT 画像生成で順に生成（専用プロファイル :9223・チケット ~/.claude/production-ticket.json）
W=$HOME/Workspace/hp-lane-v/site/src/photos
PY=$HOME/Workspace/app-factory/tools/imagegen/.venv/bin/python
DRV=$HOME/Workspace/video-factory/tools/imagegen/chatgpt_driver.py
LOG=$W/work/run.log
mkdir -p "$W/work/raw"
echo "[$(date +%H:%M:%S)] start" >> "$LOG"
python3 -c "import json;[print(p['id']+'\t'+p['ratio']+'\t'+p['prompt']) for p in json.load(open('$W/prompts.json'))]" | while IFS=$'\t' read -r id ratio prompt; do
  out="$W/work/raw/$id.png"
  [ -s "$out" ] && { echo "[skip] $id exists" >> "$LOG"; continue; }
  full="Generate a photorealistic image, $ratio aspect ratio. $prompt"
  for try in 1 2; do
    echo "[$(date +%H:%M:%S)] start $id (try $try)" >> "$LOG"
    "$PY" "$DRV" gen "$full" "$out" 420 >> "$LOG" 2>&1
    rc=$?
    echo "[$(date +%H:%M:%S)] end $id try=$try rc=$rc size=$(stat -f%z "$out" 2>/dev/null)" >> "$LOG"
    [ -s "$out" ] && break
    sleep 20
  done
  sleep 5
done
echo "[$(date +%H:%M:%S)] ALL DONE" >> "$LOG"

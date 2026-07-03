#!/bin/bash
# Dump hook stdin payload, keyed by event name (arg 1)
mkdir -p ~/ai/claude-telepathy/spike/hook-captures
cat | /usr/bin/python3 -c "import sys,json;d=json.load(sys.stdin);print(json.dumps(d))" >> ~/ai/claude-telepathy/spike/hook-captures/"$1".jsonl 2>/dev/null
exit 0

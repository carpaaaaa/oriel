#!/usr/bin/env python3
"""A native messaging host for the tests (studio/04 §5.3): Chrome's framing,
a 4-byte little-endian length and JSON, on stdin and stdout. It answers each
message with {"echo": message, "count": n, "origin": argv[1]}; {"big": n}
gets n characters back, to cross many reads; {"bye": true} makes it exit."""
import json
import struct
import sys

count = 0
origin = sys.argv[1] if len(sys.argv) > 1 else ""
while True:
    head = sys.stdin.buffer.read(4)
    if len(head) < 4:
        break
    (length,) = struct.unpack("<I", head)
    message = json.loads(sys.stdin.buffer.read(length).decode("utf-8"))
    count += 1
    if isinstance(message, dict) and message.get("bye"):
        break
    answer = {"echo": message, "count": count, "origin": origin}
    if isinstance(message, dict) and "big" in message:
        answer["text"] = "x" * int(message["big"])
    body = json.dumps(answer, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(body)) + body)
    sys.stdout.buffer.flush()

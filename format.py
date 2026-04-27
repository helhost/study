#!/usr/bin/env python3

import json
from pathlib import Path

ROOT = Path("material")


def format_file(path):
    data = json.loads(path.read_text(encoding="utf-8"))

    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main():
    files = [
        path
        for path in sorted(ROOT.rglob("*.json"))
        if path.name != "_template.json"
    ]

    for path in files:
        format_file(path)
        print(f"Formatted {path}")

    print(f"\nFormatted {len(files)} files.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3

import json
import re
from pathlib import Path

ROOT = Path("material")
GREEN = "\033[92m"
RESET = "\033[0m"

BAD_PATTERNS = [
    # Months, excluding plain "may"
    r"\b(?:jan|january|feb|february|mar|march|apr|april|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b",

    # May only when date-like
    r"\bMay\s+\d{1,2}\b",
    r"\b\d{1,2}\s+May\b",
    r"\bMay\s+(?:19|20)\d{2}\b",

    # Years
    r"\b(?:19|20)\d{2}\b",

    # Specific costs / quantities / percentages
    r"\$\s?\d+",
    r"€\s?\d+",
    r"£\s?\d+",
    r"\b\d+(?:\.\d+)?\s?(?:usd|eur|gbp|dollars|euros|pounds)\b",
    r"\b\d+(?:\.\d+)?\s?%",
    r"\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b",

    # Legal / standards / article identifiers
    r"\barticle\s+\d+[a-z]?\b",
    r"\bart\.?\s*\d+[a-z]?\b",
    r"\bsection\s+\d+[a-z]?\b",
    r"\bstandard\s+\d+(?:[-:]\d+)*\b",
    r"\biso\s+\d+(?:[-:]\d+)*\b",
    r"\brfc\s+\d+\b",
    r"\biec\s+\d+(?:[-:]\d+)*\b",
]

BAD_RE = re.compile("|".join(BAD_PATTERNS), re.IGNORECASE)


def list_material_files():
    return [
        path
        for path in sorted(ROOT.rglob("*.json"))
        if path.name != "_template.json"
    ]


def done_marker(path, done_files):
    if path in done_files:
        return f"{GREEN}[DONE]{RESET} "
    return "       "


def choose_file(files, done_files):
    available_count = len([path for path in files if path not in done_files])

    print(f"\nChoose file ({available_count} available, {len(files)} total), ALL [a], or quit [q]:\n")

    for idx, path in enumerate(files, start=1):
        marker = done_marker(path, done_files)
        print(f"{marker}{idx:>2}. {path}")

    while True:
        choice = input("\nFile index, a for ALL, or q to quit: ").strip()

        if choice.lower() == "q":
            return "quit"

        if choice.lower() == "a":
            remaining = [path for path in files if path not in done_files]
            if not remaining:
                print("All files are already marked done.")
                continue
            return None

        if not choice.isdigit():
            print("Enter a number, a for ALL, or q to quit.")
            continue

        idx = int(choice)

        if not (1 <= idx <= len(files)):
            print(f"Enter a number from 1 to {len(files)}, a for ALL, or q to quit.")
            continue

        selected = files[idx - 1]

        if selected in done_files:
            print("That file is already marked done. Choose another file.")
            continue

        return selected


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path, data):
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def entry_text(entry):
    parts = []

    for key in ("front", "back", "question", "answer"):
        value = entry.get(key)

        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, bool):
            parts.append(str(value))
        elif isinstance(value, int):
            parts.append(str(value))
        elif isinstance(value, float):
            parts.append(str(value))

    for option in entry.get("options", []):
        if isinstance(option, str):
            parts.append(option)

    return "\n".join(parts)


def find_line_number(path, entry):
    raw = path.read_text(encoding="utf-8")

    candidates = []

    if entry.get("type") == "flashcard" and "front" in entry:
        candidates.append(("front", entry["front"]))

    if entry.get("type") == "quiz" and "question" in entry:
        candidates.append(("question", entry["question"]))

    for key in ("front", "question", "back", "answer"):
        value = entry.get(key)
        if isinstance(value, str):
            candidates.append((key, value))

    for key, value in candidates:
        encoded_value = json.dumps(value, ensure_ascii=False)
        needle = f'"{key}": {encoded_value}'
        idx = raw.find(needle)

        if idx != -1:
            return raw[:idx].count("\n") + 1

    return None


def audit_entries(path, entries):
    flagged = []

    for i, entry in enumerate(entries):
        text = entry_text(entry)
        match = BAD_RE.search(text)

        if match:
            flagged.append(
                {
                    "index": i,
                    "line": find_line_number(path, entry),
                    "match": match.group(0),
                    "entry": entry,
                }
            )

    return flagged


def print_entry(entry):
    print(json.dumps(entry, ensure_ascii=False, indent=2))


def review_file(path):
    data = load_json(path)
    entries = data.get("entries", [])

    if not isinstance(entries, list):
        print(f"{path} does not contain an entries list.")
        return 0

    flagged = audit_entries(path, entries)

    print(f"\n{path}")

    if not flagged:
        print("No flagged entries.")
        return 0

    pos = 0
    deleted = 0

    while pos < len(flagged):
        item = flagged[pos]
        current_index = item["index"]
        line = item["line"] if item["line"] is not None else "unknown"

        print("\n" + "=" * 80)
        print(f"Match {pos + 1}/{len(flagged)}")
        print(
            f"  [{current_index}] line {line} "
            f"matched {item['match']!r}:"
        )
        print_entry(item["entry"])

        while True:
            choice = input("\n[n] next, [d] delete, [q] quit file: ").strip().lower()

            if choice in ("", "n"):
                pos += 1
                break

            if choice == "d":
                if 0 <= current_index < len(entries):
                    removed = entries.pop(current_index)
                    save_json(path, data)
                    deleted += 1

                    print("\nDeleted entry:")
                    print_entry(removed)

                    for later in flagged[pos + 1:]:
                        if later["index"] > current_index:
                            later["index"] -= 1

                    pos += 1
                    break

                print("Could not delete: index is out of range.")
                pos += 1
                break

            if choice == "q":
                print(f"\nStopped at match {pos + 1}/{len(flagged)}.")
                print(f"Deleted {deleted} entries from {path}.")
                return deleted

            print("Enter n for next, d to delete, or q to quit this file.")

    print(f"\nReviewed {len(flagged)} flagged entries.")
    print(f"Deleted {deleted} entries from {path}.")
    return deleted


def main():
    files = list_material_files()
    done_files = set()
    total_deleted = 0

    if not files:
        print(f"No JSON files found under {ROOT}")
        return

    while True:
        selected = choose_file(files, done_files)

        if selected == "quit":
            print(f"\nStopped. Deleted {total_deleted} entries total.")
            return

        if selected is None:
            remaining = [path for path in files if path not in done_files]

            for path in remaining:
                deleted = review_file(path)
                total_deleted += deleted
                done_files.add(path)

                choice = input(
                    "\nContinue to next file? [n] next file, [q] back to file list: "
                ).strip().lower()

                if choice == "q":
                    break

        else:
            deleted = review_file(selected)
            total_deleted += deleted
            done_files.add(selected)

        if len(done_files) == len(files):
            print(f"\nAll files done. Deleted {total_deleted} entries total.")
            return


if __name__ == "__main__":
    main()

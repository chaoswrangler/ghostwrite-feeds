#!/usr/bin/env python3
"""Aggregate RSS feeds into a single JSON file."""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import feedparser
import yaml


def parse_feed(name, url, category):
    """Fetch and parse a single feed. Return list of normalized items."""
    try:
        parsed = feedparser.parse(url)
    except Exception as e:
        print(f"  ERROR fetching {name}: {e}", file=sys.stderr)
        return [], "fetch_error"

    if parsed.bozo and not parsed.entries:
        print(f"  ERROR parsing {name}: {parsed.bozo_exception}", file=sys.stderr)
        return [], "parse_error"

    items = []
    for entry in parsed.entries[:10]:
        pub_date = None
        for field in ("published_parsed", "updated_parsed"):
            if getattr(entry, field, None):
                pub_date = datetime(*getattr(entry, field)[:6], tzinfo=timezone.utc)
                break

        items.append({
            "source": name,
            "category": category,
            "title": entry.get("title", "").strip(),
            "link": entry.get("link", ""),
            "published": pub_date.isoformat() if pub_date else None,
            "summary": entry.get("summary", "")[:500].strip(),
            "author": entry.get("author", ""),
        })

    return items, "ok"


def main():
    feeds_file = Path("feeds.yaml")
    output_file = Path("docs/feed.json")
    output_file.parent.mkdir(exist_ok=True)

    with open(feeds_file) as f:
        config = yaml.safe_load(f)

    all_items = []
    feed_status = {}

    for category, feeds in config.items():
        print(f"\nCategory: {category}")
        for feed in feeds:
            print(f"  Fetching {feed['name']}...")
            items, status = parse_feed(feed["name"], feed["url"], category)
            feed_status[feed["name"]] = {
                "url": feed["url"],
                "category": category,
                "status": status,
                "item_count": len(items),
            }
            all_items.extend(items)

    # Sort newest first; items without dates go to the end
    all_items.sort(
        key=lambda x: x["published"] or "0",
        reverse=True
    )

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_items": len(all_items),
        "feed_status": feed_status,
        "items": all_items,
    }

    with open(output_file, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    ok_count = sum(1 for s in feed_status.values() if s["status"] == "ok")
    print(f"\nDone. {ok_count}/{len(feed_status)} feeds succeeded.")
    print(f"Total items: {len(all_items)}")
    print(f"Output: {output_file}")


if __name__ == "__main__":
    main()

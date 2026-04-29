#!/usr/bin/env python3
"""Aggregate RSS feeds into a single JSON file."""

import json
import socket
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import feedparser
import yaml

socket.setdefaulttimeout(10)


def parse_feed(name, url, category):
    """Fetch and parse a single feed. Return list of normalized items."""
    try:
        parsed = feedparser.parse(url)
    except Exception as e:
        print(f"  ERROR fetching {name}: {e}", file=sys.stderr)
        return [], "fetch_error"

    if parsed.bozo and not parsed.entries:
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

    if "source_cohorts" in config:
        cohorts = config["source_cohorts"]
    else:
        cohorts = {
            name: {"sources": feeds}
            for name, feeds in config.items()
            if isinstance(feeds, list)
        }

    all_items = []
    feed_status = {}
    cohort_metadata = {}

    fetch_tasks = []
    for cohort_name, cohort_data in cohorts.items():
        description = cohort_data.get("description", "")
        sources = cohort_data.get("sources", [])
        cohort_metadata[cohort_name] = {
            "description": description,
            "source_count": len(sources),
        }
        for source in sources:
            fetch_tasks.append((source, cohort_name))

    print(f"Fetching {len(fetch_tasks)} feeds across {len(cohorts)} cohorts...")
    print(f"Timeout: 10 seconds per feed, 10 concurrent workers\n")

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            executor.submit(parse_feed, source["name"], source["url"], cohort_name): (source, cohort_name)
            for source, cohort_name in fetch_tasks
        }

        for future in as_completed(futures):
            source, cohort_name = futures[future]
            try:
                items, status = future.result()
            except Exception as e:
                print(f"  ERROR: {source['name']}: {e}", file=sys.stderr)
                items, status = [], "fetch_error"

            symbol = "OK" if status == "ok" else "FAIL"
            print(f"  [{symbol}] {source['name']} ({cohort_name}): {len(items)} items")

            feed_status[source["name"]] = {
                "url": source["url"],
                "cohort": cohort_name,
                "status": status,
                "item_count": len(items),
            }
            all_items.extend(items)

    all_items.sort(key=lambda x: x["published"] or "0", reverse=True)

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_items": len(all_items),
        "cohorts": cohort_metadata,
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

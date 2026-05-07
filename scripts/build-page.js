const fs = require("fs");
const path = require("path");

const feedPath = path.join(__dirname, "../docs/feed.json");
const outputPath = path.join(__dirname, "../docs/index.html");

const feed = JSON.parse(fs.readFileSync(feedPath, "utf8"));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeItems(feed) {
  if (Array.isArray(feed)) return feed;

  if (Array.isArray(feed.items)) return feed.items;
  if (Array.isArray(feed.sources)) return feed.sources;
  if (Array.isArray(feed.events)) return feed.events;
  if (Array.isArray(feed.entries)) return feed.entries;

  const buckets = [];

  for (const [category, value] of Object.entries(feed)) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        buckets.push({
          category,
          ...item,
        });
      });
    }
  }

  return buckets;
}

const items = normalizeItems(feed);

const generatedAt = new Date().toISOString();

const cards = items
  .map((item) => {
    const title = item.title || item.name || item.source || item.event || "Untitled entry";
    const url = item.url || item.link || item.href || "";
    const category = item.category || item.type || item.kind || "General";
    const date = item.date || item.published || item.updated || item.deadline || "";
    const summary = item.summary || item.description || item.notes || "";

    return `
      <article class="card">
        <div class="meta">${escapeHtml(category)}${date ? ` · ${escapeHtml(date)}` : ""}</div>
        <h2>${url ? `<a href="${escapeHtml(url)}">${escapeHtml(title)}</a>` : escapeHtml(title)}</h2>
        ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
        ${url ? `<p class="source"><a href="${escapeHtml(url)}">Source link</a></p>` : ""}
      </article>
    `;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Ghostwrite Feed</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Curated Ghostwrite feed for threat intelligence, cyber events, CFPs, and security research sources.">
  <style>
    :root {
      color-scheme: dark;
      --bg: #07111f;
      --panel: #101c2f;
      --text: #e8f0ff;
      --muted: #9fb3d1;
      --accent: #68a7ff;
      --border: #243653;
    }

    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: radial-gradient(circle at top left, #12345a, var(--bg) 38%);
      color: var(--text);
      line-height: 1.55;
    }

    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 48px 20px;
    }

    header {
      margin-bottom: 32px;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 2.4rem;
      letter-spacing: -0.04em;
    }

    .subtitle {
      color: var(--muted);
      max-width: 780px;
      font-size: 1.05rem;
    }

    .updated {
      margin-top: 16px;
      color: var(--muted);
      font-size: 0.9rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 18px;
    }

    .card {
      border: 1px solid var(--border);
      background: rgba(16, 28, 47, 0.88);
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
    }

    .meta {
      color: var(--muted);
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 10px;
    }

    h2 {
      margin: 0 0 10px;
      font-size: 1.15rem;
      line-height: 1.3;
    }

    a {
      color: var(--accent);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    p {
      margin: 0 0 12px;
    }

    .source {
      margin-top: 14px;
      font-size: 0.92rem;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Ghostwrite Feed</h1>
      <p class="subtitle">
        Curated source feed for threat intelligence, security research, cyber events, CFPs, and advisory inputs used by Ghostwrite and Cyber SAGE workflows.
      </p>
      <p class="updated">Generated at: ${escapeHtml(generatedAt)}</p>
    </header>

    <section class="grid">
      ${cards || "<p>No feed items found.</p>"}
    </section>
  </main>
</body>
</html>`;

fs.writeFileSync(outputPath, html);
console.log(`Generated ${outputPath} with ${items.length} items.`);

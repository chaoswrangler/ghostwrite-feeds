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

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function slugify(value) {
  return String(value ?? "general")
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const items = Array.isArray(feed.items) ? feed.items : [];
const cohorts = feed.cohorts || {};
const feedStatus = feed.feed_status || {};
const generatedAt = feed.generated_at || new Date().toISOString();

const okSources = Object.values(feedStatus).filter((source) => source.status === "ok").length;
const totalSources = Object.keys(feedStatus).length;
const parseErrors = Object.entries(feedStatus)
  .filter(([, source]) => source.status && source.status !== "ok")
  .map(([name, source]) => ({ name, ...source }));

const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort();

const latestItems = items
  .slice()
  .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));

const categoryNav = categories
  .map((category) => {
    const count = items.filter((item) => item.category === category).length;
    return `<a class="chip" href="#${escapeHtml(slugify(category))}">${escapeHtml(category)} <span>${count}</span></a>`;
  })
  .join("");

const cohortCards = Object.entries(cohorts)
  .map(([key, cohort]) => {
    return `
      <article class="cohort-card" data-cohort="${escapeHtml(key)}">
        <h3>${escapeHtml(key.replaceAll("_", " "))}</h3>
        <p>${escapeHtml(cohort.description || "")}</p>
        <div class="small-meta">${escapeHtml(cohort.source_count || 0)} sources</div>
      </article>
    `;
  })
  .join("");

function renderItem(item, index) {
  const title = item.title || "Untitled item";
  const link = item.link || item.url || "";
  const source = item.source || "Unknown source";
  const category = item.category || "uncategorized";
  const author = item.author || "";
  const published = item.published || "";
  const summary = stripHtml(item.summary || "");

  return `
    <article
      class="feed-item"
      id="item-${index + 1}"
      data-source="${escapeHtml(source)}"
      data-category="${escapeHtml(category)}"
      data-published="${escapeHtml(published)}"
      itemscope
      itemtype="https://schema.org/Article"
    >
      <div class="item-topline">
        <span class="category">${escapeHtml(category.replaceAll("_", " "))}</span>
        <time datetime="${escapeHtml(published)}" itemprop="datePublished">${escapeHtml(formatDate(published))}</time>
      </div>

      <h3 itemprop="headline">
        ${
          link
            ? `<a href="${escapeHtml(link)}" itemprop="url">${escapeHtml(title)}</a>`
            : escapeHtml(title)
        }
      </h3>

      <div class="source-line">
        <span itemprop="publisher">${escapeHtml(source)}</span>
        ${author ? `<span> · ${escapeHtml(author)}</span>` : ""}
      </div>

      ${summary ? `<p itemprop="description">${escapeHtml(summary)}</p>` : ""}

      <dl class="machine-readable">
        <div>
          <dt>Source</dt>
          <dd>${escapeHtml(source)}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>${escapeHtml(category)}</dd>
        </div>
        <div>
          <dt>Published</dt>
          <dd>${escapeHtml(published)}</dd>
        </div>
        <div>
          <dt>URL</dt>
          <dd>${link ? `<a href="${escapeHtml(link)}">${escapeHtml(link)}</a>` : "None"}</dd>
        </div>
      </dl>
    </article>
  `;
}

const sections = categories
  .map((category) => {
    const categoryItems = latestItems.filter((item) => item.category === category);

    return `
      <section class="category-section" id="${escapeHtml(slugify(category))}">
        <div class="section-heading">
          <h2>${escapeHtml(category.replaceAll("_", " "))}</h2>
          <span>${categoryItems.length} items</span>
        </div>
        <div class="feed-list">
          ${categoryItems.map(renderItem).join("")}
        </div>
      </section>
    `;
  })
  .join("");

const parseErrorBlock = parseErrors.length
  ? `
    <section class="status-panel warning">
      <h2>Feed source warnings</h2>
      <p>Some sources did not parse successfully during the last feed build. They are listed here for operational visibility.</p>
      <ul>
        ${parseErrors
          .map(
            (source) =>
              `<li><strong>${escapeHtml(source.name)}</strong>: ${escapeHtml(source.status)} · <a href="${escapeHtml(source.url)}">${escapeHtml(source.url)}</a></li>`
          )
          .join("")}
      </ul>
    </section>
  `
  : "";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Ghostwrite Feed",
  description:
    "Curated feed for threat intelligence, security research, cyber events, CFPs, and security advisory workflows.",
  dateModified: generatedAt,
  numberOfItems: items.length,
  itemListElement: latestItems.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    item: {
      "@type": "Article",
      headline: item.title || "Untitled item",
      url: item.link || item.url || "",
      datePublished: item.published || "",
      author: item.author || "",
      publisher: item.source || "",
      articleSection: item.category || "",
      description: stripHtml(item.summary || ""),
    },
  })),
};

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Ghostwrite Feed</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Curated Ghostwrite feed for threat intelligence, security research, cyber events, CFPs, and security advisory workflows.">
  <meta name="robots" content="index, follow">

  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>

  <style>
    :root {
      color-scheme: dark;
      --bg: #07111f;
      --bg2: #0d1b2f;
      --panel: rgba(15, 28, 48, 0.92);
      --panel2: rgba(21, 39, 67, 0.92);
      --text: #edf4ff;
      --muted: #a7b8d4;
      --accent: #69a7ff;
      --accent2: #8ee6ff;
      --border: rgba(139, 176, 230, 0.22);
      --warning: #ffd37a;
    }

    * {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(38, 111, 196, 0.35), transparent 34rem),
        radial-gradient(circle at top right, rgba(120, 232, 255, 0.16), transparent 28rem),
        linear-gradient(145deg, var(--bg), var(--bg2));
      color: var(--text);
      line-height: 1.55;
    }

    a {
      color: var(--accent2);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    main {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      padding: 44px 0 72px;
    }

    .hero {
      border: 1px solid var(--border);
      background: linear-gradient(135deg, rgba(16, 35, 64, 0.96), rgba(8, 18, 32, 0.94));
      border-radius: 28px;
      padding: 34px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
      margin-bottom: 22px;
    }

    .eyebrow {
      color: var(--accent2);
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 0.78rem;
      font-weight: 700;
      margin-bottom: 10px;
    }

    h1 {
      margin: 0;
      font-size: clamp(2.4rem, 7vw, 5.5rem);
      letter-spacing: -0.07em;
      line-height: 0.92;
    }

    .subtitle {
      color: var(--muted);
      max-width: 840px;
      font-size: 1.08rem;
      margin: 18px 0 0;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 26px;
    }

    .stat {
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.04);
      border-radius: 18px;
      padding: 16px;
    }

    .stat strong {
      display: block;
      font-size: 1.8rem;
      letter-spacing: -0.03em;
    }

    .stat span {
      color: var(--muted);
      font-size: 0.88rem;
    }

    .utility-links {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 18px 0 28px;
    }

    .button-link,
    .chip {
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.055);
      color: var(--text);
      border-radius: 999px;
      padding: 9px 13px;
      font-size: 0.9rem;
    }

    .chip span {
      color: var(--accent2);
      margin-left: 5px;
    }

    .panel {
      border: 1px solid var(--border);
      background: var(--panel);
      border-radius: 24px;
      padding: 24px;
      margin-bottom: 22px;
    }

    .panel h2,
    .status-panel h2,
    .category-section h2 {
      margin: 0 0 12px;
      letter-spacing: -0.035em;
      text-transform: capitalize;
    }

    .cohort-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }

    .cohort-card {
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.045);
      border-radius: 18px;
      padding: 16px;
    }

    .cohort-card h3 {
      margin: 0 0 8px;
      text-transform: capitalize;
      letter-spacing: -0.02em;
    }

    .cohort-card p {
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 0.94rem;
    }

    .small-meta {
      color: var(--accent2);
      font-size: 0.86rem;
      font-weight: 700;
    }

    .category-section {
      margin-top: 30px;
    }

    .section-heading {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 18px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
      margin-bottom: 16px;
    }

    .section-heading span {
      color: var(--muted);
      white-space: nowrap;
    }

    .feed-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
    }

    .feed-item {
      border: 1px solid var(--border);
      background: var(--panel2);
      border-radius: 22px;
      padding: 20px;
      box-shadow: 0 18px 54px rgba(0, 0, 0, 0.22);
    }

    .item-topline {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: var(--muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.075em;
      margin-bottom: 10px;
    }

    .category {
      color: var(--accent2);
      font-weight: 700;
    }

    .feed-item h3 {
      margin: 0 0 10px;
      font-size: 1.15rem;
      letter-spacing: -0.025em;
      line-height: 1.3;
    }

    .source-line {
      color: var(--muted);
      font-size: 0.88rem;
      margin-bottom: 12px;
    }

    .feed-item p {
      color: #d8e5fa;
      margin: 0 0 14px;
    }

    .machine-readable {
      border-top: 1px solid var(--border);
      margin: 16px 0 0;
      padding-top: 14px;
      display: grid;
      gap: 8px;
      font-size: 0.84rem;
    }

    .machine-readable div {
      display: grid;
      grid-template-columns: 90px 1fr;
      gap: 10px;
    }

    .machine-readable dt {
      color: var(--muted);
      font-weight: 700;
    }

    .machine-readable dd {
      margin: 0;
      overflow-wrap: anywhere;
    }

    .status-panel {
      border: 1px solid rgba(255, 211, 122, 0.38);
      background: rgba(255, 211, 122, 0.08);
      border-radius: 24px;
      padding: 24px;
      margin-bottom: 22px;
    }

    .status-panel p,
    .status-panel li {
      color: #ffe7af;
    }

    footer {
      color: var(--muted);
      margin-top: 40px;
      border-top: 1px solid var(--border);
      padding-top: 22px;
      font-size: 0.9rem;
    }

    @media (max-width: 640px) {
      .hero {
        padding: 24px;
      }

      .item-topline,
      .section-heading {
        display: block;
      }

      .machine-readable div {
        grid-template-columns: 1fr;
        gap: 2px;
      }
    }
  </style>
</head>

<body>
  <main>
    <header class="hero">
      <div class="eyebrow">Ghostwrite Strategic Feed</div>
      <h1>Threat Signal, Source Intelligence, and Research Inputs</h1>
      <p class="subtitle">
        A curated, machine-readable and human-readable feed for threat intelligence, security research, cyber news,
        AI security, policy, vulnerability research, detection operations, and practitioner analysis.
      </p>

      <div class="stats" aria-label="Feed status summary">
        <div class="stat">
          <strong>${escapeHtml(feed.total_items || items.length)}</strong>
          <span>Total feed items</span>
        </div>
        <div class="stat">
          <strong>${escapeHtml(totalSources)}</strong>
          <span>Configured sources</span>
        </div>
        <div class="stat">
          <strong>${escapeHtml(okSources)}</strong>
          <span>Healthy sources</span>
        </div>
        <div class="stat">
          <strong>${escapeHtml(formatDate(generatedAt))}</strong>
          <span>Generated</span>
        </div>
      </div>
    </header>

    <nav class="utility-links" aria-label="Feed navigation">
      <a class="button-link" href="./feed.json">Raw JSON feed</a>
      ${categoryNav}
    </nav>

    <section class="panel">
      <h2>Source cohorts</h2>
      <div class="cohort-grid">
        ${cohortCards}
      </div>
    </section>

    ${parseErrorBlock}

    ${sections}

    <footer>
      <p>
        This page is generated from <code>docs/feed.json</code>. The rendered HTML is intended for people,
        search indexing, and M365 Agent Builder knowledge ingestion. The JSON file remains the source of truth.
      </p>
    </footer>
  </main>
</body>
</html>`;

fs.writeFileSync(outputPath, html);
console.log(`Generated ${outputPath} with ${items.length} feed items.`);

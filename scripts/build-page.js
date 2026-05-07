const fs = require("fs");
const path = require("path");

const feedPath = path.join(__dirname, "../docs/feed.json");
const outputPath = path.join(__dirname, "../docs/index.html");

const LOOKBACK_DAYS = 7;

const feed = JSON.parse(fs.readFileSync(feedPath, "utf8"));

const excludedNonEnglishSources = new Set([
  "CERT-FR Avis",
  "CERT-FR Alerts"
]);

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

function formatCategory(value) {
  const labels = {
    threat_research_primary: "Threat Research",
    ai_security_agentic_risk: "AI Security & Agentic Risk",
    government_authoritative: "Government & Authoritative",
    offensive_vulnerability_research: "Offensive Vulnerability Research",
    detection_response_operations: "Detection & Response Operations",
    cloud_identity_infrastructure: "Cloud, Identity & Infrastructure",
    ransomware_ecrime_financial_crime: "Ransomware, eCrime & Financial Crime",
    cyber_news_breach_reporting: "Cyber News & Breach Reporting",
    policy_strategy_geopolitics: "Policy, Strategy & Geopolitics",
    practitioner_analysis: "Practitioner Analysis"
  };

  if (labels[value]) return labels[value];

  return String(value ?? "uncategorized")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function slugify(value) {
  return String(value ?? "general")
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getCutoffDate(days = LOOKBACK_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

function getItemTime(item) {
  const date = new Date(item.published || item.updated || item.date || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isWithinLookbackWindow(item, days = LOOKBACK_DAYS) {
  const itemTime = getItemTime(item);

  if (!itemTime) {
    return false;
  }

  return itemTime >= getCutoffDate(days).getTime();
}

function containsMostlyLatinText(value) {
  const text = String(value ?? "").replace(/\s+/g, "");

  if (!text) {
    return true;
  }

  const latinMatches = text.match(/[A-Za-z0-9]/g) || [];
  const cyrillicMatches = text.match(/[\u0400-\u04FF]/g) || [];
  const arabicMatches = text.match(/[\u0600-\u06FF]/g) || [];
  const cjkMatches = text.match(/[\u3040-\u30FF\u3400-\u9FFF]/g) || [];

  const nonLatinCount =
    cyrillicMatches.length +
    arabicMatches.length +
    cjkMatches.length;

  return nonLatinCount === 0 || latinMatches.length >= nonLatinCount * 2;
}

function isEnglishEnoughItem(item) {
  const source = item.source || "";
  const title = item.title || "";
  const summary = stripHtml(item.summary || "");

  if (excludedNonEnglishSources.has(source)) {
    return false;
  }

  const combinedText = `${title} ${summary}`;

  if (!containsMostlyLatinText(combinedText)) {
    return false;
  }

  return true;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|and|or|to|of|in|on|for|with|from|by|at|is|are|was|were|as|this|that|it|its|into|about|after|before|new|how|why|what|will|can|could|should|would|their|there|they|them|your|you|our|out|over|under)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getKeywords(item) {
  const text = normalizeText(`${item.title || ""} ${stripHtml(item.summary || "")}`);

  return text
    .split(" ")
    .filter((word) => word.length > 4)
    .slice(0, 24);
}

function jaccardSimilarity(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);

  if (!setA.size || !setB.size) {
    return 0;
  }

  let intersection = 0;

  for (const value of setA) {
    if (setB.has(value)) {
      intersection++;
    }
  }

  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

function getThemeKey(item) {
  const title = String(item.title || "").toLowerCase();
  const summary = stripHtml(item.summary || "").toLowerCase();
  const source = String(item.source || "").toLowerCase();
  const text = `${title} ${summary} ${source}`;

  const themeRules = [
    {
      key: "ivanti_epmm_exploitation",
      label: "Ivanti EPMM Exploitation",
      patterns: ["ivanti", "epmm", "endpoint manager mobile"]
    },
    {
      key: "palo_alto_pan_os_zero_day",
      label: "Palo Alto / PAN-OS Zero-Day Activity",
      patterns: ["palo alto", "pan-os", "pan os", "cve-2026-0300"]
    },
    {
      key: "pcpjack_cloud_credential_theft",
      label: "PCPJack / Cloud Credential Theft",
      patterns: ["pcpjack", "teampcp", "credential stealer"]
    },
    {
      key: "clickfix_social_engineering",
      label: "ClickFix / Social Engineering Malware Delivery",
      patterns: ["clickfix", "vidar", "fake captcha", "captcha-gated", "captcha gated"]
    },
    {
      key: "ai_coding_agent_risk",
      label: "AI Coding Agent Risk",
      patterns: ["claude code", "cursor", "copilot cli", "gemini cli", "ai coding", "coding agent", "trustfall", "cline", "mcp", "oauth tokens"]
    },
    {
      key: "ai_model_security_research",
      label: "AI Model Security Research",
      patterns: ["prompt injection", "model", "llm", "agentic", "vision-language", "vlm", "adversarial", "ai security bug", "ai-generated security"]
    },
    {
      key: "north_korea_it_workers",
      label: "North Korean IT Worker Schemes",
      patterns: ["north korea", "north korean", "laptop farm", "it workers"]
    },
    {
      key: "crypto_theft_financial_crime",
      label: "Crypto Theft / Financial Crime",
      patterns: ["crypto", "cryptocurrency", "blockchain", "heist", "laundering", "chainalysis", "wallet"]
    },
    {
      key: "identity_passwordless_passkeys",
      label: "Identity / Passwordless / Passkeys",
      patterns: ["passkey", "passwordless", "identity", "oauth", "token", "credentials", "credential", "service account"]
    },
    {
      key: "browser_security",
      label: "Browser Security",
      patterns: ["chrome", "firefox", "browser", "extension", "edge", "safari"]
    },
    {
      key: "cloud_security_posture",
      label: "Cloud Security Posture",
      patterns: ["aws", "azure", "google cloud", "cloud", "container", "kubernetes", "saas", "multicloud", "infrastructure"]
    },
    {
      key: "active_exploitation_vulnerabilities",
      label: "Active Exploitation / Vulnerabilities",
      patterns: ["active exploitation", "zero-day", "0-day", "exploit", "exploitation", "rce", "privilege escalation", "cve", "critical-severity", "high-severity"]
    },
    {
      key: "ransomware_ecrime_malware",
      label: "Ransomware / eCrime / Malware",
      patterns: ["ransomware", "extortion", "botnet", "malware", "stealer", "backdoor", "worm", "loader"]
    },
    {
      key: "phishing_social_engineering",
      label: "Phishing / Social Engineering",
      patterns: ["phishing", "social engineering", "qr code", "captcha", "tycoon", "bec", "business email compromise"]
    },
    {
      key: "policy_government_strategy",
      label: "Policy / Government / Strategy",
      patterns: ["cisa", "government", "policy", "regulation", "congress", "national security", "scholarship", "public sector"]
    },
    {
      key: "data_security_dlp",
      label: "Data Security / DLP",
      patterns: ["dlp", "data protection", "data security", "sensitive data", "purview", "copy/paste"]
    }
  ];

  const matchedRule = themeRules.find((rule) =>
    rule.patterns.some((pattern) => text.includes(pattern))
  );

  if (matchedRule) {
    return matchedRule;
  }

  return {
    key: "other_recent_signal",
    label: "Other Recent Signal"
  };
}

function groupItemsByTheme(items) {
  const groups = new Map();

  for (const item of items) {
    const theme = getThemeKey(item);

    if (!groups.has(theme.key)) {
      groups.set(theme.key, {
        key: theme.key,
        label: theme.label,
        items: []
      });
    }

    groups.get(theme.key).items.push(item);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => getItemTime(b) - getItemTime(a)),
      newest: Math.max(...group.items.map(getItemTime))
    }))
    .sort((a, b) => b.newest - a.newest);
}

function scoreItem(item) {
  const title = String(item.title || "");
  const summary = stripHtml(item.summary || "");
  const category = String(item.category || "").toLowerCase();
  const source = String(item.source || "").toLowerCase();
  const text = `${title} ${summary}`.toLowerCase();

  let score = 0;

  const itemTime = getItemTime(item);

  if (itemTime) {
    const ageHours = (Date.now() - itemTime) / 36e5;

    if (ageHours <= 12) score += 80;
    else if (ageHours <= 24) score += 65;
    else if (ageHours <= 48) score += 45;
    else if (ageHours <= 72) score += 30;
    else if (ageHours <= 168) score += 15;
  }

  if (category.includes("threat")) score += 35;
  if (category.includes("ai_security") || category.includes("ai security") || category.includes("agentic")) score += 32;
  if (category.includes("vulnerability")) score += 24;
  if (category.includes("detection")) score += 18;
  if (category.includes("cloud") || category.includes("identity")) score += 16;
  if (category.includes("ransomware") || category.includes("ecrime")) score += 16;

  const majorTerms = [
    "active exploitation",
    "zero-day",
    "0-day",
    "rce",
    "credential",
    "token",
    "oauth",
    "ransomware",
    "malware",
    "stealer",
    "backdoor",
    "phishing",
    "supply chain",
    "prompt injection",
    "agentic",
    "mcp",
    "cve",
    "critical",
    "state-sponsored",
    "apt",
    "cloud",
    "identity",
    "incident"
  ];

  for (const term of majorTerms) {
    if (text.includes(term)) {
      score += 8;
    }
  }

  const prioritySources = [
    "microsoft",
    "google",
    "mandiant",
    "openai",
    "anthropic",
    "cisa",
    "cloudflare",
    "crowdstrike",
    "sentinelone",
    "palo alto",
    "unit 42",
    "red canary",
    "huntress",
    "wiz",
    "bleepingcomputer",
    "the hacker news",
    "securityweek",
    "dark reading",
    "help net security"
  ];

  for (const vendor of prioritySources) {
    if (source.includes(vendor)) {
      score += 6;
    }
  }

  return score;
}

function selectTopUniqueInsights(items, limit = 10) {
  const candidates = items
    .filter((item) => item.title || item.summary)
    .map((item) => ({
      item,
      score: scoreItem(item),
      keywords: getKeywords(item),
      domain: domainFromUrl(item.link || item.url || ""),
      theme: getThemeKey(item).key
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return getItemTime(b.item) - getItemTime(a.item);
    });

  const selected = [];

  for (const candidate of candidates) {
    const isDuplicate = selected.some((chosen) => {
      const sameDomain = candidate.domain && candidate.domain === chosen.domain;
      const sameTheme = candidate.theme === chosen.theme;

      const titleSimilarity = jaccardSimilarity(
        getKeywords({ title: candidate.item.title, summary: "" }),
        getKeywords({ title: chosen.item.title, summary: "" })
      );

      const fullSimilarity = jaccardSimilarity(candidate.keywords, chosen.keywords);

      return (
        titleSimilarity >= 0.55 ||
        fullSimilarity >= 0.5 ||
        (sameDomain && fullSimilarity >= 0.38) ||
        (sameTheme && fullSimilarity >= 0.36)
      );
    });

    if (!isDuplicate) {
      selected.push(candidate);
    }

    if (selected.length >= limit) {
      break;
    }
  }

  return selected.map((entry) => entry.item);
}

function buildInsight(item, index) {
  const title = item.title || "Untitled item";
  const summary = stripHtml(item.summary || "");
  const source = item.source || "Unknown source";
  const category = item.category || "uncategorized";
  const link = item.link || item.url || "";
  const published = item.published || "";
  const theme = getThemeKey(item);

  const insightText = summary
    ? summary.slice(0, 360)
    : `Relevant signal from ${source} in ${formatCategory(category)}.`;

  return `
    <article class="insight" data-category="${escapeHtml(category)}" data-source="${escapeHtml(source)}" data-theme="${escapeHtml(theme.key)}">
      <div class="rank">#${index + 1}</div>
      <div class="insight-body">
        <div class="insight-meta">
          <span>${escapeHtml(theme.label)}</span>
          <span>${escapeHtml(formatCategory(category))}</span>
          <span>${escapeHtml(source)}</span>
          ${published ? `<time datetime="${escapeHtml(published)}">${escapeHtml(formatDate(published))}</time>` : ""}
        </div>
        <h3>${link ? `<a href="${escapeHtml(link)}">${escapeHtml(title)}</a>` : escapeHtml(title)}</h3>
        <p>${escapeHtml(insightText)}</p>
      </div>
    </article>
  `;
}

function renderLineItem(item, index) {
  const title = item.title || "Untitled item";
  const link = item.link || item.url || "";
  const source = item.source || "Unknown source";
  const category = item.category || "uncategorized";
  const author = item.author || "";
  const published = item.published || "";
  const summary = stripHtml(item.summary || "");
  const compactSummary = summary.length > 280 ? `${summary.slice(0, 280)}...` : summary;
  const theme = getThemeKey(item);

  return `
    <li
      class="feed-line"
      id="item-${escapeHtml(index)}"
      data-source="${escapeHtml(source)}"
      data-category="${escapeHtml(category)}"
      data-theme="${escapeHtml(theme.key)}"
      data-published="${escapeHtml(published)}"
      itemscope
      itemtype="https://schema.org/Article"
    >
      <div class="line-main">
        <h4 itemprop="headline">
          ${link ? `<a href="${escapeHtml(link)}" itemprop="url">${escapeHtml(title)}</a>` : escapeHtml(title)}
        </h4>
        ${compactSummary ? `<p itemprop="description">${escapeHtml(compactSummary)}</p>` : ""}
      </div>

      <dl class="line-meta">
        <div>
          <dt>Source</dt>
          <dd itemprop="publisher">${escapeHtml(source)}</dd>
        </div>
        ${author ? `
        <div>
          <dt>Author</dt>
          <dd>${escapeHtml(author)}</dd>
        </div>` : ""}
        <div>
          <dt>Published</dt>
          <dd><time datetime="${escapeHtml(published)}" itemprop="datePublished">${escapeHtml(formatDate(published))}</time></dd>
        </div>
        <div>
          <dt>URL</dt>
          <dd>${link ? `<a href="${escapeHtml(link)}">${escapeHtml(domainFromUrl(link) || link)}</a>` : "None"}</dd>
        </div>
      </dl>
    </li>
  `;
}

function renderThemeGroup(group, categoryIndex) {
  return `
    <section class="theme-group" data-theme="${escapeHtml(group.key)}">
      <div class="theme-heading">
        <h3>${escapeHtml(group.label)}</h3>
        <span>${group.items.length} related item${group.items.length === 1 ? "" : "s"}</span>
      </div>
      <ol class="feed-lines">
        ${group.items.map((item, index) => renderLineItem(item, `${categoryIndex}-${index}`)).join("")}
      </ol>
    </section>
  `;
}

const allItems = Array.isArray(feed.items) ? feed.items : [];

const items = allItems
  .filter(isEnglishEnoughItem)
  .filter((item) => isWithinLookbackWindow(item, LOOKBACK_DAYS))
  .sort((a, b) => getItemTime(b) - getItemTime(a));

const cohorts = feed.cohorts || {};
const rawFeedStatus = feed.feed_status || {};
const generatedAt = feed.generated_at || new Date().toISOString();

const feedStatus = Object.fromEntries(
  Object.entries(rawFeedStatus).filter(([sourceName]) => {
    return !excludedNonEnglishSources.has(sourceName);
  })
);

const okSources = Object.values(feedStatus).filter((source) => source.status === "ok").length;
const totalSources = Object.keys(feedStatus).length;

const parseErrors = Object.entries(feedStatus)
  .filter(([, source]) => source.status && source.status !== "ok")
  .map(([name, source]) => ({ name, ...source }));

const categoryPriority = [
  "threat_research_primary",
  "threat research",
  "ai_security_agentic_risk",
  "ai_security",
  "ai security",
  "agentic_risk"
];

function sortCategories(a, b) {
  const aLower = String(a).toLowerCase();
  const bLower = String(b).toLowerCase();

  const aPriority = categoryPriority.findIndex((priority) => aLower === priority);
  const bPriority = categoryPriority.findIndex((priority) => bLower === priority);

  const normalizedAPriority = aPriority === -1 ? 999 : aPriority;
  const normalizedBPriority = bPriority === -1 ? 999 : bPriority;

  if (normalizedAPriority !== normalizedBPriority) {
    return normalizedAPriority - normalizedBPriority;
  }

  return aLower.localeCompare(bLower);
}

const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort(sortCategories);
const latestItems = items.slice().sort((a, b) => getItemTime(b) - getItemTime(a));
const topInsights = selectTopUniqueInsights(latestItems, 10);

const filteredOutCount = allItems.length - items.length;

const categoryNav = categories
  .map((category) => {
    const count = items.filter((item) => item.category === category).length;
    return `<a class="chip" href="#${escapeHtml(slugify(category))}">${escapeHtml(formatCategory(category))} <span>${count}</span></a>`;
  })
  .join("");

const cohortCards = Object.entries(cohorts)
  .map(([key, cohort]) => {
    return `
      <article class="cohort-card" data-cohort="${escapeHtml(key)}">
        <h3>${escapeHtml(formatCategory(key))}</h3>
        <p>${escapeHtml(cohort.description || "")}</p>
        <div class="small-meta">${escapeHtml(cohort.source_count || 0)} configured sources</div>
      </article>
    `;
  })
  .join("");

const sections = categories
  .map((category, categoryIndex) => {
    const categoryItems = latestItems.filter((item) => item.category === category);
    const themeGroups = groupItemsByTheme(categoryItems);

    return `
      <section class="category-section" id="${escapeHtml(slugify(category))}">
        <div class="section-heading">
          <h2>${escapeHtml(formatCategory(category))}</h2>
          <span>${categoryItems.length} items from the last ${LOOKBACK_DAYS} days</span>
        </div>

        ${themeGroups.map((group) => renderThemeGroup(group, categoryIndex)).join("")}
      </section>
    `;
  })
  .join("");

const parseErrorBlock = parseErrors.length
  ? `
    <section class="status-panel warning" id="source-health">
      <h2>Source Health and Parse Warnings</h2>
      <p>
        These sources did not parse successfully during the last feed build. This section is placed at the bottom so the page reads as an intelligence brief first.
      </p>
      <ul>
        ${parseErrors
          .map((source) => {
            const url = source.url || "";
            return `<li><strong>${escapeHtml(source.name)}</strong>: ${escapeHtml(source.status)}${url ? ` · <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>` : ""}</li>`;
          })
          .join("")}
      </ul>
    </section>
  `
  : `
    <section class="status-panel" id="source-health">
      <h2>Source Health</h2>
      <p>No parse warnings were reported during the last feed build.</p>
    </section>
  `;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Ghostwrite Feed",
  description:
    "Curated English-language feed for threat intelligence, AI security, security research, cyber events, CFPs, and advisory workflows. Items are limited to the last 7 days.",
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
      keywords: getKeywords(item).join(", ")
    }
  }))
};

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Ghostwrite Feed</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Curated English-language Ghostwrite feed for threat intelligence, AI security, security research, cyber events, CFPs, and advisory workflows. Last 7 days only.">
  <meta name="robots" content="index, follow">

  <script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
  </script>

  <style>
    :root {
      color-scheme: dark;
      --bg: #06101d;
      --bg2: #0c1b2f;
      --panel: rgba(15, 28, 48, 0.94);
      --panel2: rgba(17, 34, 60, 0.94);
      --line: rgba(139, 176, 230, 0.22);
      --text: #edf4ff;
      --muted: #a9bbd7;
      --accent: #6be7ff;
      --accent2: #78aaff;
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
        radial-gradient(circle at top left, rgba(44, 122, 218, 0.35), transparent 34rem),
        radial-gradient(circle at top right, rgba(107, 231, 255, 0.14), transparent 28rem),
        linear-gradient(145deg, var(--bg), var(--bg2));
      color: var(--text);
      line-height: 1.55;
    }

    a {
      color: var(--accent);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    code {
      color: var(--accent);
    }

    main {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      padding: 42px 0 72px;
    }

    .hero {
      border: 1px solid var(--line);
      background: linear-gradient(135deg, rgba(16, 35, 64, 0.96), rgba(8, 18, 32, 0.94));
      border-radius: 28px;
      padding: 34px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
      margin-bottom: 22px;
    }

    .eyebrow {
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 0.78rem;
      font-weight: 700;
      margin-bottom: 10px;
    }

    h1 {
      margin: 0;
      font-size: clamp(2.4rem, 7vw, 5.2rem);
      letter-spacing: -0.07em;
      line-height: 0.94;
    }

    .subtitle {
      color: var(--muted);
      max-width: 900px;
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
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.045);
      border-radius: 18px;
      padding: 16px;
    }

    .stat strong {
      display: block;
      font-size: 1.55rem;
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
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.055);
      color: var(--text);
      border-radius: 999px;
      padding: 9px 13px;
      font-size: 0.9rem;
    }

    .chip span {
      color: var(--accent);
      margin-left: 5px;
    }

    .panel,
    .insights-panel {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 24px;
      padding: 24px;
      margin-bottom: 24px;
    }

    .panel h2,
    .insights-panel h2,
    .status-panel h2,
    .category-section h2 {
      margin: 0 0 12px;
      letter-spacing: -0.035em;
    }

    .panel-intro {
      color: var(--muted);
      margin: 0 0 18px;
      max-width: 900px;
    }

    .cohort-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }

    .cohort-card {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.045);
      border-radius: 18px;
      padding: 16px;
    }

    .cohort-card h3 {
      margin: 0 0 8px;
      letter-spacing: -0.02em;
    }

    .cohort-card p {
      margin: 0 0 12px;
      color: var(--muted);
      font-size: 0.94rem;
    }

    .small-meta {
      color: var(--accent);
      font-size: 0.86rem;
      font-weight: 700;
    }

    .insight-list {
      display: grid;
      gap: 14px;
      margin-top: 18px;
    }

    .insight {
      display: grid;
      grid-template-columns: 62px 1fr;
      gap: 16px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.045);
      border-radius: 18px;
      padding: 16px;
    }

    .rank {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 16px;
      background: rgba(107, 231, 255, 0.11);
      border: 1px solid rgba(107, 231, 255, 0.28);
      color: var(--accent);
      font-weight: 800;
    }

    .insight-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      color: var(--muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      margin-bottom: 7px;
    }

    .insight h3 {
      margin: 0 0 8px;
      font-size: 1.08rem;
      line-height: 1.3;
    }

    .insight p {
      margin: 0;
      color: #dbe8fb;
    }

    .category-section {
      margin-top: 30px;
    }

    .section-heading {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 18px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 12px;
      margin-bottom: 16px;
    }

    .section-heading span {
      color: var(--muted);
      white-space: nowrap;
    }

    .theme-group {
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.035);
      border-radius: 20px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .theme-heading {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 10px;
      margin-bottom: 12px;
    }

    .theme-heading h3 {
      margin: 0;
      color: var(--accent);
      font-size: 1rem;
      letter-spacing: -0.02em;
    }

    .theme-heading span {
      color: var(--muted);
      font-size: 0.86rem;
      white-space: nowrap;
    }

    .feed-lines {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 10px;
    }

    .feed-line {
      border: 1px solid var(--line);
      background: var(--panel2);
      border-radius: 16px;
      padding: 15px 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 34%);
      gap: 18px;
    }

    .feed-line h4 {
      margin: 0 0 6px;
      font-size: 1rem;
      line-height: 1.32;
    }

    .feed-line p {
      margin: 0;
      color: #dbe8fb;
      font-size: 0.92rem;
    }

    .line-meta {
      margin: 0;
      display: grid;
      gap: 6px;
      font-size: 0.82rem;
      color: var(--muted);
      align-content: start;
    }

    .line-meta div {
      display: grid;
      grid-template-columns: 80px minmax(0, 1fr);
      gap: 8px;
    }

    .line-meta dt {
      font-weight: 700;
      color: #c1d3ec;
    }

    .line-meta dd {
      margin: 0;
      overflow-wrap: anywhere;
    }

    .status-panel {
      border: 1px solid rgba(255, 211, 122, 0.38);
      background: rgba(255, 211, 122, 0.075);
      border-radius: 24px;
      padding: 24px;
      margin-top: 42px;
    }

    .status-panel p,
    .status-panel li {
      color: #ffe7af;
    }

    footer {
      color: var(--muted);
      margin-top: 34px;
      border-top: 1px solid var(--line);
      padding-top: 22px;
      font-size: 0.9rem;
    }

    @media (max-width: 820px) {
      .feed-line {
        grid-template-columns: 1fr;
      }

      .insight {
        grid-template-columns: 1fr;
      }

      .section-heading,
      .theme-heading {
        display: block;
      }
    }

    @media (max-width: 640px) {
      .hero {
        padding: 24px;
      }

      .line-meta div {
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
        Curated English-language feed for threat research, AI security, cyber news, vulnerability intelligence,
        policy signal, practitioner analysis, and advisory workflows. This page only includes items published in the last ${LOOKBACK_DAYS} days, ordered newest first, and grouped by logical threat affinity.
      </p>

      <div class="stats" aria-label="Feed status summary">
        <div class="stat">
          <strong>${escapeHtml(items.length)}</strong>
          <span>Rendered items from last ${LOOKBACK_DAYS} days</span>
        </div>
        <div class="stat">
          <strong>${escapeHtml(totalSources)}</strong>
          <span>Configured English-language sources</span>
        </div>
        <div class="stat">
          <strong>${escapeHtml(okSources)}</strong>
          <span>Healthy sources</span>
        </div>
        <div class="stat">
          <strong>${escapeHtml(filteredOutCount)}</strong>
          <span>Filtered out by date, language, or source rules</span>
        </div>
      </div>
    </header>

    <nav class="utility-links" aria-label="Feed navigation">
      <a class="button-link" href="./feed.json">Raw JSON feed</a>
      <a class="button-link" href="#top-insights">Top 10 insights</a>
      ${categoryNav}
      <a class="button-link" href="#source-health">Source health</a>
    </nav>

    <section class="insights-panel" id="top-insights">
      <h2>Top 10 Major Unique Insights Across the Feed</h2>
      <p class="panel-intro">
        These items are selected from the last ${LOOKBACK_DAYS} days only, deduplicated across the full feed cohort, and grouped by logical threat affinity so repeated coverage of the same story does not crowd out distinct signal.
      </p>
      <div class="insight-list">
        ${topInsights.map(buildInsight).join("")}
      </div>
    </section>

    <section class="panel">
      <h2>Source Cohorts</h2>
      <p class="panel-intro">
        Feed sources are grouped by cohort so humans and agents can understand the source mix behind the current briefing. Non-English sources are excluded from the rendered page.
      </p>
      <div class="cohort-grid">
        ${cohortCards}
      </div>
    </section>

    ${sections}

    ${parseErrorBlock}

    <footer>
      <p>
        This page is generated from <code>docs/feed.json</code>. The rendered HTML is designed for human review,
        search indexing, and M365 Agent Builder knowledge ingestion. The rendered page is English-only, limited to the last ${LOOKBACK_DAYS} days, ordered newest first, and grouped by logical affinity.
      </p>
      <p>
        Generated at: ${escapeHtml(formatDate(generatedAt))}
      </p>
    </footer>
  </main>
</body>
</html>`;

fs.writeFileSync(outputPath, html);

console.log(`Generated ${outputPath}`);
console.log(`Rendered ${items.length} items from the last ${LOOKBACK_DAYS} days.`);
console.log(`Filtered out ${filteredOutCount} items by date, language, or source rules.`);
console.log(`Selected ${topInsights.length} unique top insights.`);
console.log(`Detected ${parseErrors.length} source warnings.`);

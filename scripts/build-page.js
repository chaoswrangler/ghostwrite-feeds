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
    practitioner_analysis: "Practitioner Analysis",
    reddit_practitioner_osint: "Reddit Practitioner OSINT"
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

function externalLinkAttrs() {
  return 'target="_blank" rel="noopener noreferrer"';
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

function isProductMarketingOrPositioning(item) {
  const title = String(item.title || "").toLowerCase();
  const summary = stripHtml(item.summary || "").toLowerCase();
  const source = String(item.source || "").toLowerCase();
  const category = String(item.category || "").toLowerCase();
  const text = `${title} ${summary} ${source} ${category}`;

  const productMarketingTerms = [
    "announcing",
    "announces",
    "announcement",
    "launches",
    "launched",
    "introducing",
    "introduced",
    "general availability",
    "generally available",
    "now available",
    "available now",
    "new feature",
    "new features",
    "product update",
    "platform update",
    "monthly update",
    "release notes",
    "roadmap",
    "preview",
    "public preview",
    "private preview",
    "customer story",
    "case study",
    "partner",
    "partners with",
    "partnership",
    "integrated with",
    "integration",
    "webinar",
    "event recap",
    "conference",
    "keynote",
    "award",
    "recognition",
    "magic quadrant",
    "market guide",
    "buyers guide",
    "best practices for using",
    "how to get started",
    "how we help",
    "protect your business with",
    "modernize your security",
    "transform your security",
    "accelerate your security",
    "secure your ai journey",
    "trusted ai",
    "responsible ai",
    "customer success",
    "business value",
    "roi",
    "total economic impact",
    "forrester",
    "gartner",
    "leader in",
    "named a leader",
    "wins award",
    "named winner",
    "product-led",
    "product led"
  ];

  const productNounTerms = [
    "our platform",
    "our product",
    "our solution",
    "our customers",
    "our partners",
    "our latest",
    "new capability",
    "new capabilities",
    "security solution",
    "security platform",
    "cloud security platform",
    "ai security platform",
    "this release",
    "this update",
    "this feature",
    "this capability"
  ];

  return (
    productMarketingTerms.some((term) => text.includes(term)) ||
    productNounTerms.some((term) => text.includes(term))
  );
}

function isThreatIntelRelevant(item) {
  const title = String(item.title || "").toLowerCase();
  const summary = stripHtml(item.summary || "").toLowerCase();
  const category = String(item.category || "").toLowerCase();
  const source = String(item.source || "").toLowerCase();
  const text = `${title} ${summary} ${source}`;

  const allowedCategories = [
    "threat_research_primary",
    "offensive_vulnerability_research",
    "detection_response_operations",
    "ransomware_ecrime_financial_crime",
    "cyber_news_breach_reporting",
    "reddit_practitioner_osint"
  ];

  const allowedAiSecurityTerms = [
    "prompt injection",
    "agentic",
    "ai agent",
    "ai agents",
    "llm",
    "model abuse",
    "model exploitation",
    "remote code execution",
    "rce",
    "vulnerability",
    "exploit",
    "exploitation",
    "oauth",
    "token theft",
    "credential",
    "malware",
    "phishing",
    "supply chain",
    "mcp",
    "coding agent",
    "claude code",
    "copilot cli",
    "cursor",
    "gemini cli"
  ];

  const ctiTerms = [
    "active exploitation",
    "actively exploited",
    "exploited in the wild",
    "in the wild",
    "zero-day",
    "zero day",
    "0-day",
    "rce",
    "remote code execution",
    "privilege escalation",
    "vulnerability",
    "cve-",
    "cvss",
    "exploit",
    "exploitation",
    "malware",
    "ransomware",
    "backdoor",
    "stealer",
    "infostealer",
    "loader",
    "worm",
    "botnet",
    "trojan",
    "phishing",
    "credential theft",
    "credential stealer",
    "token theft",
    "oauth",
    "apt",
    "state-sponsored",
    "state sponsored",
    "nation-state",
    "nation state",
    "campaign",
    "intrusion",
    "breach",
    "compromise",
    "ioc",
    "iocs",
    "indicator",
    "indicators",
    "tactics",
    "techniques",
    "procedures",
    "ttp",
    "ttps",
    "detection",
    "hunting",
    "threat actor",
    "espionage",
    "supply chain attack",
    "supply-chain attack",
    "cloud secrets",
    "cloud credentials",
    "initial access",
    "persistence",
    "lateral movement",
    "command and control",
    "c2",
    "exfiltration",
    "dll sideloading",
    "webshell",
    "web shell",
    "implant",
    "post-exploitation",
    "post exploitation"
  ];

  const explicitNonCtiTerms = [
    "world passkey day",
    "passwordless authentication",
    "monthly digest",
    "icymi",
    "funding",
    "raises $",
    "trial pitting",
    "risks to humanity",
    "scholarship program",
    "new leader",
    "data center deal",
    "sub-millisecond",
    "certifications",
    "supply chain decisions",
    "customer service agents",
    "big words",
    "unplug your way to better code",
    "presentation tool",
    "keynote",
    "conference",
    "webinar today",
    "public good",
    "board room",
    "operator",
    "socially cohesive",
    "democracy",
    "political violence",
    "early edition",
    "podcast",
    "forecasting",
    "prediction markets"
  ];

  if (isProductMarketingOrPositioning(item)) {
    return false;
  }

  if (explicitNonCtiTerms.some((term) => text.includes(term))) {
    return false;
  }

  const categoryAllowed = allowedCategories.includes(category);
  const hasCtiTerm = ctiTerms.some((term) => text.includes(term));

  if (categoryAllowed && hasCtiTerm) {
    return true;
  }

  if (category === "ai_security_agentic_risk") {
    return allowedAiSecurityTerms.some((term) => text.includes(term));
  }

  return false;
}

function isBreachOrThreatInsight(item) {
  const title = String(item.title || "").toLowerCase();
  const summary = stripHtml(item.summary || "").toLowerCase();
  const category = String(item.category || "").toLowerCase();
  const source = String(item.source || "").toLowerCase();
  const text = `${title} ${summary} ${category} ${source}`;

  const breachTerms = [
    "breach",
    "breached",
    "data breach",
    "data leak",
    "leaked",
    "leak",
    "exposed",
    "exposure",
    "stolen",
    "stole",
    "theft",
    "compromised",
    "compromise",
    "intrusion",
    "incident",
    "unauthorized access",
    "exfiltration",
    "extortion",
    "ransomware",
    "victim",
    "victims"
  ];

  const threatTerms = [
    "active exploitation",
    "actively exploited",
    "exploited in the wild",
    "in the wild",
    "zero-day",
    "zero day",
    "0-day",
    "cve-",
    "rce",
    "remote code execution",
    "privilege escalation",
    "exploit",
    "exploitation",
    "malware",
    "backdoor",
    "stealer",
    "infostealer",
    "loader",
    "trojan",
    "botnet",
    "phishing",
    "credential theft",
    "credential stealer",
    "token theft",
    "oauth abuse",
    "supply chain attack",
    "supply-chain attack",
    "campaign",
    "threat actor",
    "apt",
    "state-sponsored",
    "state sponsored",
    "nation-state",
    "nation state",
    "initial access",
    "persistence",
    "lateral movement",
    "command and control",
    "c2",
    "webshell",
    "web shell",
    "implant",
    "post-exploitation",
    "post exploitation",
    "iocs",
    "indicator of compromise",
    "indicators of compromise",
    "ttps",
    "tactics techniques and procedures"
  ];

  const insightSources = [
    "bleepingcomputer",
    "the hacker news",
    "securityweek",
    "dark reading",
    "the record",
    "cyberscoop",
    "mandiant",
    "unit 42",
    "crowdstrike",
    "sentinelone",
    "red canary",
    "huntress",
    "cisa",
    "microsoft",
    "google",
    "wiz",
    "expel",
    "proofpoint",
    "talos",
    "sophos",
    "rapid7",
    "watchtowr",
    "arctic wolf",
    "elastic",
    "zscaler",
    "cloudflare",
    "akamai",
    "sucuri",
    "malwarebytes",
    "greynoise",
    "shadowserver",
    "vulncheck",
    "packet storm",
    "exploit-db"
  ];

  const hasBreachSignal = breachTerms.some((term) => text.includes(term));
  const hasThreatSignal = threatTerms.some((term) => text.includes(term));

  const isThreatCategory =
    category.includes("threat") ||
    category.includes("ransomware") ||
    category.includes("ecrime") ||
    category.includes("offensive") ||
    category.includes("breach") ||
    category.includes("detection") ||
    category.includes("cloud") ||
    category.includes("identity");

  const isCredibleInsightSource = insightSources.some((sourceName) =>
    source.includes(sourceName)
  );

  return (hasBreachSignal || hasThreatSignal) && (isThreatCategory || isCredibleInsightSource);
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

function normalizeForDedupe(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\bcve-\d{4}-\d{4,7}\b/g, " CVE_TOKEN ")
    .replace(/\bzero[-\s]?day\b/g, "zero day")
    .replace(/\brce\b/g, "remote code execution")
    .replace(/\biocs?\b/g, "indicator")
    .replace(/\bttps?\b/g, "tactics techniques procedures")
    .replace(/\bmalware campaign\b/g, "campaign")
    .replace(/\bransomware attack\b/g, "ransomware")
    .replace(/\bdata breach\b/g, "breach")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|and|or|to|of|in|on|for|with|from|by|at|is|are|was|were|as|this|that|it|its|into|about|after|before|new|how|why|what|will|can|could|should|would|their|there|they|them|your|you|our|out|over|under|says|said|report|reports|reported|researcher|researchers|warn|warns|warning|analysis|blog|post|article|security|cyber|cybersecurity)\b/g, " ")
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

function getDedupeTokens(item) {
  const text = normalizeForDedupe(`${item.title || ""} ${stripHtml(item.summary || "")}`);

  return text
    .split(" ")
    .filter((word) => word.length > 3)
    .slice(0, 80);
}

function extractCves(item) {
  const text = `${item.title || ""} ${stripHtml(item.summary || "")}`.toLowerCase();
  return [...new Set(text.match(/\bcve-\d{4}-\d{4,7}\b/g) || [])];
}

function extractNamedSignals(item) {
  const text = `${item.title || ""} ${stripHtml(item.summary || "")}`.toLowerCase();

  const patterns = [
    "ivanti",
    "citrix",
    "fortinet",
    "palo alto",
    "pan-os",
    "sonicwall",
    "sharepoint",
    "exchange",
    "confluence",
    "jira",
    "chrome",
    "firefox",
    "windows",
    "linux",
    "vmware",
    "esxi",
    "microsoft",
    "google",
    "aws",
    "azure",
    "okta",
    "entra",
    "duo",
    "salesforce",
    "github",
    "npm",
    "pypi",
    "docker",
    "kubernetes",
    "north korea",
    "north korean",
    "lazarus",
    "kimsuky",
    "muddywater",
    "sandworm",
    "volt typhoon",
    "lockbit",
    "akira",
    "clop",
    "black basta",
    "ransomhub",
    "scattered spider",
    "shinyhunters",
    "clickfix",
    "vidar",
    "lumma",
    "redline",
    "remcos",
    "qakbot",
    "emotet",
    "cobalt strike",
    "asyncrat",
    "darkgate",
    "amadyey",
    "latrodectus"
  ];

  return patterns.filter((pattern) => text.includes(pattern));
}

function canonicalUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";

    const removableParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid"
    ];

    for (const param of removableParams) {
      parsed.searchParams.delete(param);
    }

    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
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

function tokenOverlapScore(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);

  if (!a.size || !b.size) {
    return 0;
  }

  let intersection = 0;

  for (const token of a) {
    if (b.has(token)) {
      intersection++;
    }
  }

  const smaller = Math.min(a.size, b.size);
  return intersection / smaller;
}

function jaccardTokenScore(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);

  if (!a.size || !b.size) {
    return 0;
  }

  let intersection = 0;

  for (const token of a) {
    if (b.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

function areLikelyDuplicateItems(a, b) {
  const aUrl = canonicalUrl(a.link || a.url || "");
  const bUrl = canonicalUrl(b.link || b.url || "");

  if (aUrl && bUrl && aUrl === bUrl) {
    return true;
  }

  const aTitle = normalizeForDedupe(a.title || "");
  const bTitle = normalizeForDedupe(b.title || "");

  if (aTitle && bTitle && aTitle === bTitle) {
    return true;
  }

  const aCves = extractCves(a);
  const bCves = extractCves(b);
  const sharedCves = aCves.filter((cve) => bCves.includes(cve));

  const aSignals = extractNamedSignals(a);
  const bSignals = extractNamedSignals(b);
  const sharedSignals = aSignals.filter((signal) => bSignals.includes(signal));

  const aTokens = getDedupeTokens(a);
  const bTokens = getDedupeTokens(b);

  const titleSimilarity = jaccardTokenScore(
    getDedupeTokens({ title: a.title || "", summary: "" }),
    getDedupeTokens({ title: b.title || "", summary: "" })
  );

  const fullJaccard = jaccardTokenScore(aTokens, bTokens);
  const overlap = tokenOverlapScore(aTokens, bTokens);

  if (sharedCves.length && (titleSimilarity >= 0.25 || fullJaccard >= 0.22 || overlap >= 0.45)) {
    return true;
  }

  if (sharedSignals.length >= 2 && (titleSimilarity >= 0.32 || fullJaccard >= 0.28 || overlap >= 0.5)) {
    return true;
  }

  if (titleSimilarity >= 0.62) {
    return true;
  }

  if (fullJaccard >= 0.48 || overlap >= 0.72) {
    return true;
  }

  return false;
}

function dedupeItems(items) {
  const sorted = items
    .slice()
    .sort((a, b) => {
      const scoreDiff = scoreItem(b) - scoreItem(a);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return getItemTime(b) - getItemTime(a);
    });

  const selected = [];

  for (const item of sorted) {
    const duplicate = selected.some((existing) => areLikelyDuplicateItems(item, existing));

    if (!duplicate) {
      selected.push(item);
    }
  }

  return selected;
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
      key: "ai_agent_framework_rce",
      label: "AI Agent Framework RCE",
      patterns: ["prompts become shells", "ai agent frameworks", "remote code execution", "rce vulnerabilities in ai agent"]
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
      key: "iran_muddywater_chaos_ransomware",
      label: "Iran / MuddyWater / Chaos Ransomware",
      patterns: ["iranian", "muddywater", "chaos ransomware", "mois"]
    },
    {
      key: "crypto_theft_financial_crime",
      label: "Crypto Theft / Financial Crime",
      patterns: ["crypto", "cryptocurrency", "blockchain", "heist", "laundering", "chainalysis", "wallet"]
    },
    {
      key: "identity_credential_theft",
      label: "Identity / Credential Theft",
      patterns: ["credential", "credentials", "oauth", "token", "password", "service account", "suspicious login"]
    },
    {
      key: "browser_security",
      label: "Browser Security",
      patterns: ["chrome", "firefox", "browser", "extension", "edge", "safari"]
    },
    {
      key: "cloud_security_threats",
      label: "Cloud Security Threats",
      patterns: ["aws", "azure", "google cloud", "cloud", "container", "kubernetes", "saas", "multicloud", "cloud secrets", "cloud credentials"]
    },
    {
      key: "active_exploitation_vulnerabilities",
      label: "Active Exploitation / Vulnerabilities",
      patterns: ["active exploitation", "actively exploited", "zero-day", "0-day", "exploit", "exploitation", "rce", "privilege escalation", "cve", "critical-severity", "high-severity"]
    },
    {
      key: "ransomware_ecrime_malware",
      label: "Ransomware / eCrime / Malware",
      patterns: ["ransomware", "extortion", "botnet", "malware", "stealer", "backdoor", "worm", "loader", "trojan"]
    },
    {
      key: "phishing_social_engineering",
      label: "Phishing / Social Engineering",
      patterns: ["phishing", "social engineering", "qr code", "captcha", "tycoon", "bec", "business email compromise"]
    },
    {
      key: "data_security_dlp",
      label: "Data Security / DLP",
      patterns: ["dlp", "data protection", "data security", "sensitive data", "purview", "copy/paste"]
    },
    {
      key: "reddit_practitioner_chatter",
      label: "Reddit Practitioner Chatter",
      patterns: ["reddit", "r/netsec", "r/cybersecurity", "r/sysadmin", "r/msp", "r/blueteamsec"]
    }
  ];

  const matchedRule = themeRules.find((rule) =>
    rule.patterns.some((pattern) => text.includes(pattern))
  );

  if (matchedRule) {
    return matchedRule;
  }

  return {
    key: "other_recent_threat_signal",
    label: "Other Recent Threat Signal"
  };
}

function getThreatCategory(item) {
  const title = String(item.title || "").toLowerCase();
  const summary = stripHtml(item.summary || "").toLowerCase();
  const category = String(item.category || "").toLowerCase();
  const source = String(item.source || "").toLowerCase();
  const text = `${title} ${summary} ${category} ${source}`;

  const rules = [
    {
      key: "breach_incident",
      label: "Breach / Incident",
      priority: 100,
      patterns: [
        "breach",
        "data breach",
        "data leak",
        "leaked",
        "exposed",
        "stolen",
        "unauthorized access",
        "intrusion",
        "incident",
        "compromised",
        "exfiltration"
      ]
    },
    {
      key: "active_exploitation",
      label: "Active Exploitation",
      priority: 95,
      patterns: [
        "active exploitation",
        "actively exploited",
        "exploited in the wild",
        "in the wild",
        "zero-day",
        "zero day",
        "0-day",
        "weaponized",
        "mass exploitation"
      ]
    },
    {
      key: "vulnerability_exploitability",
      label: "Vulnerability / Exploitability",
      priority: 85,
      patterns: [
        "cve-",
        "rce",
        "remote code execution",
        "privilege escalation",
        "proof-of-concept",
        "poc exploit",
        "exploit",
        "exploitation",
        "critical vulnerability",
        "high-severity vulnerability"
      ]
    },
    {
      key: "ransomware_extortion",
      label: "Ransomware / Extortion",
      priority: 80,
      patterns: [
        "ransomware",
        "extortion",
        "double extortion",
        "encryptor",
        "ransom note",
        "leak site",
        "victim"
      ]
    },
    {
      key: "malware_infrastructure",
      label: "Malware / Infrastructure",
      priority: 75,
      patterns: [
        "malware",
        "backdoor",
        "loader",
        "stealer",
        "infostealer",
        "trojan",
        "botnet",
        "worm",
        "implant",
        "command and control",
        "c2"
      ]
    },
    {
      key: "phishing_social_engineering",
      label: "Phishing / Social Engineering",
      priority: 70,
      patterns: [
        "phishing",
        "social engineering",
        "bec",
        "business email compromise",
        "clickfix",
        "fake captcha",
        "qr code",
        "credential harvesting"
      ]
    },
    {
      key: "identity_cloud_abuse",
      label: "Identity / Cloud Abuse",
      priority: 65,
      patterns: [
        "credential theft",
        "token theft",
        "oauth",
        "session hijacking",
        "cloud credentials",
        "service account",
        "identity provider",
        "idp",
        "sso",
        "mfa bypass",
        "aws",
        "azure",
        "google cloud",
        "kubernetes"
      ]
    },
    {
      key: "apt_geopolitical",
      label: "APT / Geopolitical",
      priority: 60,
      patterns: [
        "apt",
        "state-sponsored",
        "state sponsored",
        "nation-state",
        "nation state",
        "espionage",
        "china-linked",
        "russia-linked",
        "iran-linked",
        "north korea",
        "north korean"
      ]
    },
    {
      key: "ai_security",
      label: "AI Security",
      priority: 55,
      patterns: [
        "prompt injection",
        "llm",
        "agentic",
        "ai agent",
        "model exploitation",
        "model abuse",
        "mcp",
        "coding agent",
        "claude code",
        "copilot cli",
        "cursor",
        "gemini cli"
      ]
    },
    {
      key: "detection_response",
      label: "Detection / Response",
      priority: 45,
      patterns: [
        "detection",
        "hunting",
        "sigma",
        "yara",
        "suricata",
        "incident response",
        "dfir",
        "forensics",
        "telemetry"
      ]
    },
    {
      key: "policy_strategy",
      label: "Policy / Strategy",
      priority: 20,
      patterns: [
        "regulation",
        "policy",
        "law",
        "sanctions",
        "advisory",
        "guidance",
        "framework",
        "strategy"
      ]
    }
  ];

  const matches = rules
    .filter((rule) => rule.patterns.some((pattern) => text.includes(pattern)))
    .sort((a, b) => b.priority - a.priority);

  if (matches.length) {
    return {
      key: matches[0].key,
      label: matches[0].label
    };
  }

  return {
    key: "other_threat_signal",
    label: "Other Threat Signal"
  };
}

function getIndustryTags(item) {
  const title = String(item.title || "").toLowerCase();
  const summary = stripHtml(item.summary || "").toLowerCase();
  const source = String(item.source || "").toLowerCase();
  const category = String(item.category || "").toLowerCase();
  const text = `${title} ${summary} ${source} ${category}`;

  const industryRules = [
    {
      key: "financial_services",
      label: "Financial Services",
      patterns: [
        "bank",
        "banks",
        "banking",
        "credit union",
        "fintech",
        "payment",
        "payments",
        "swift",
        "atm",
        "insurance",
        "brokerage",
        "crypto",
        "cryptocurrency",
        "exchange",
        "wallet",
        "trading",
        "financial"
      ]
    },
    {
      key: "healthcare",
      label: "Healthcare",
      patterns: [
        "hospital",
        "healthcare",
        "health care",
        "clinic",
        "patient",
        "medical",
        "pharma",
        "pharmaceutical",
        "biotech",
        "hipaa",
        "ehr",
        "electronic health record"
      ]
    },
    {
      key: "government_public_sector",
      label: "Government & Public Sector",
      patterns: [
        "government",
        "federal",
        "state agency",
        "municipal",
        "city government",
        "public sector",
        "defense",
        "military",
        "dod",
        "election",
        "embassy",
        "ministry",
        "public administration"
      ]
    },
    {
      key: "education",
      label: "Education",
      patterns: [
        "school",
        "schools",
        "university",
        "universities",
        "college",
        "campus",
        "student",
        "students",
        "k-12",
        "district",
        "education"
      ]
    },
    {
      key: "critical_infrastructure",
      label: "Critical Infrastructure",
      patterns: [
        "critical infrastructure",
        "energy",
        "utility",
        "utilities",
        "electric",
        "power grid",
        "water",
        "wastewater",
        "pipeline",
        "oil",
        "gas",
        "telecom",
        "transportation",
        "rail",
        "airport",
        "aviation",
        "maritime",
        "port"
      ]
    },
    {
      key: "technology_saas",
      label: "Technology & SaaS",
      patterns: [
        "saas",
        "software",
        "developer",
        "developers",
        "github",
        "npm",
        "pypi",
        "open source",
        "cloud",
        "aws",
        "azure",
        "google cloud",
        "kubernetes",
        "container",
        "api",
        "oauth",
        "token",
        "identity provider",
        "idp",
        "msp",
        "managed service provider"
      ]
    },
    {
      key: "retail_ecommerce",
      label: "Retail & eCommerce",
      patterns: [
        "retail",
        "ecommerce",
        "e-commerce",
        "merchant",
        "pos",
        "point of sale",
        "shopping",
        "customer data",
        "payment card",
        "loyalty program"
      ]
    },
    {
      key: "manufacturing_industrial",
      label: "Manufacturing & Industrial",
      patterns: [
        "manufacturing",
        "manufacturer",
        "industrial",
        "factory",
        "plant",
        "ot",
        "ics",
        "scada",
        "plc",
        "supply chain",
        "automotive",
        "aerospace"
      ]
    },
    {
      key: "media_communications",
      label: "Media & Communications",
      patterns: [
        "media",
        "journalist",
        "newsroom",
        "broadcast",
        "telecommunications",
        "telecom",
        "isp",
        "mobile carrier",
        "satellite"
      ]
    },
    {
      key: "legal_professional_services",
      label: "Legal & Professional Services",
      patterns: [
        "law firm",
        "legal",
        "consulting",
        "consultancy",
        "accounting",
        "audit firm",
        "professional services"
      ]
    }
  ];

  const matched = industryRules.filter((rule) =>
    rule.patterns.some((pattern) => text.includes(pattern))
  );

  if (matched.length) {
    return matched.map(({ key, label }) => ({ key, label }));
  }

  return [{ key: "cross_industry", label: "Cross-Industry" }];
}

function groupItemsByIndustry(items) {
  const groups = new Map();

  for (const item of items) {
    const industries = getIndustryTags(item);

    for (const industry of industries) {
      if (!groups.has(industry.key)) {
        groups.set(industry.key, {
          key: industry.key,
          label: industry.label,
          items: []
        });
      }

      groups.get(industry.key).items.push(item);
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => scoreItem(b) - scoreItem(a)),
      newest: Math.max(...group.items.map(getItemTime))
    }))
    .sort((a, b) => {
      if (b.items.length !== a.items.length) {
        return b.items.length - a.items.length;
      }

      return b.newest - a.newest;
    });
}

function groupItemsByThreatCategory(items) {
  const groups = new Map();

  for (const item of items) {
    const threatCategory = getThreatCategory(item);

    if (!groups.has(threatCategory.key)) {
      groups.set(threatCategory.key, {
        key: threatCategory.key,
        label: threatCategory.label,
        items: []
      });
    }

    groups.get(threatCategory.key).items.push(item);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => scoreItem(b) - scoreItem(a)),
      newest: Math.max(...group.items.map(getItemTime))
    }))
    .sort((a, b) => {
      if (b.items.length !== a.items.length) {
        return b.items.length - a.items.length;
      }

      return b.newest - a.newest;
    });
}

function groupItemsBySourceCohort(items) {
  const groups = new Map();

  for (const item of items) {
    const key = item.category || "uncategorized";
    const label = formatCategory(key);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label,
        items: []
      });
    }

    groups.get(key).items.push(item);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => scoreItem(b) - scoreItem(a)),
      newest: Math.max(...group.items.map(getItemTime))
    }))
    .sort((a, b) => {
      if (b.items.length !== a.items.length) {
        return b.items.length - a.items.length;
      }

      return b.newest - a.newest;
    });
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
  if (category.includes("offensive")) score += 28;
  if (category.includes("ransomware") || category.includes("ecrime")) score += 26;
  if (category.includes("detection")) score += 22;
  if (category.includes("cloud") || category.includes("identity")) score += 14;
  if (category.includes("reddit")) score -= 25;

  const highImpactTerms = [
    "breach",
    "data breach",
    "data leak",
    "stolen",
    "compromised",
    "intrusion",
    "incident",
    "unauthorized access",
    "exfiltration",
    "extortion",
    "active exploitation",
    "actively exploited",
    "exploited in the wild",
    "zero-day",
    "0-day",
    "rce",
    "remote code execution",
    "ransomware",
    "malware",
    "stealer",
    "infostealer",
    "backdoor",
    "supply chain attack",
    "campaign",
    "threat actor",
    "apt",
    "state-sponsored",
    "nation-state"
  ];

  for (const term of highImpactTerms) {
    if (text.includes(term)) {
      score += 14;
    }
  }

  const majorTerms = [
    "credential",
    "token",
    "oauth",
    "phishing",
    "mcp",
    "cve",
    "critical",
    "cloud credentials",
    "initial access",
    "persistence",
    "lateral movement",
    "command and control",
    "c2",
    "webshell",
    "implant",
    "iocs",
    "indicators",
    "ttps",
    "detection",
    "hunting"
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
    "help net security",
    "the record",
    "cyberscoop",
    "talos",
    "sophos",
    "rapid7",
    "watchtowr",
    "greynoise",
    "shadowserver",
    "vulncheck",
    "akamai",
    "cloudflare"
  ];

  for (const vendor of prioritySources) {
    if (source.includes(vendor)) {
      score += 6;
    }
  }

  if (isProductMarketingOrPositioning(item)) {
    score -= 200;
  }

  return score;
}

function selectTopUniqueInsights(items, limit = 10) {
  const candidates = items
    .filter((item) => item.title || item.summary)
    .filter(isThreatIntelRelevant)
    .filter(isBreachOrThreatInsight)
    .filter((item) => !isProductMarketingOrPositioning(item));

  const deduped = dedupeItems(candidates);

  const selected = [];
  const threatCategoryCounts = new Map();
  const themeCounts = new Map();

  for (const item of deduped) {
    const threatCategory = getThreatCategory(item).key;
    const theme = getThemeKey(item).key;

    const threatCategoryCount = threatCategoryCounts.get(threatCategory) || 0;
    const themeCount = themeCounts.get(theme) || 0;

    if (threatCategoryCount >= 3) {
      continue;
    }

    if (themeCount >= 2) {
      continue;
    }

    selected.push(item);
    threatCategoryCounts.set(threatCategory, threatCategoryCount + 1);
    themeCounts.set(theme, themeCount + 1);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

function renderFilterChip({ label, key, type, count }) {
  return `<button class="filter-chip" type="button" data-filter-type="${escapeHtml(type)}" data-filter-key="${escapeHtml(key)}">${escapeHtml(label)} <span>${escapeHtml(count)}</span></button>`;
}

function buildInsight(item, index) {
  const title = item.title || "Untitled item";
  const summary = stripHtml(item.summary || "");
  const source = item.source || "Unknown source";
  const category = item.category || "uncategorized";
  const link = item.link || item.url || "";
  const published = item.published || "";
  const theme = getThemeKey(item);
  const threatCategory = getThreatCategory(item);
  const industries = getIndustryTags(item);

  const insightText = summary
    ? summary.slice(0, 360)
    : `Relevant threat signal from ${source} in ${formatCategory(category)}.`;

  return `
    <article
      class="insight"
      data-category="${escapeHtml(category)}"
      data-source="${escapeHtml(source)}"
      data-theme="${escapeHtml(theme.key)}"
      data-threat-category="${escapeHtml(threatCategory.key)}"
      data-industries="${escapeHtml(industries.map((industry) => industry.key).join(" "))}"
    >
      <div class="rank">#${index + 1}</div>
      <div class="insight-body">
        <div class="insight-meta">
          <span>${escapeHtml(threatCategory.label)}</span>
          <span>${escapeHtml(theme.label)}</span>
          <span>${escapeHtml(source)}</span>
          ${published ? `<time datetime="${escapeHtml(published)}">${escapeHtml(formatDate(published))}</time>` : ""}
        </div>
        <div class="tag-row">
          <button class="threat-tag" type="button" data-filter-type="threat" data-filter-key="${escapeHtml(threatCategory.key)}">${escapeHtml(threatCategory.label)}</button>
          ${industries
            .map((industry) => `<button class="industry-tag" type="button" data-filter-type="industry" data-filter-key="${escapeHtml(industry.key)}">${escapeHtml(industry.label)}</button>`)
            .join("")}
        </div>
        <h3>${link ? `<a href="${escapeHtml(link)}" ${externalLinkAttrs()}>${escapeHtml(title)}</a>` : escapeHtml(title)}</h3>
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
  const threatCategory = getThreatCategory(item);
  const industries = getIndustryTags(item);

  return `
    <li
      class="feed-line"
      id="item-${escapeHtml(index)}"
      data-source="${escapeHtml(source)}"
      data-category="${escapeHtml(category)}"
      data-theme="${escapeHtml(theme.key)}"
      data-threat-category="${escapeHtml(threatCategory.key)}"
      data-industries="${escapeHtml(industries.map((industry) => industry.key).join(" "))}"
      data-published="${escapeHtml(published)}"
      itemscope
      itemtype="https://schema.org/Article"
    >
      <div class="line-main">
        <h4 itemprop="headline">
          ${link ? `<a href="${escapeHtml(link)}" itemprop="url" ${externalLinkAttrs()}>${escapeHtml(title)}</a>` : escapeHtml(title)}
        </h4>
        ${compactSummary ? `<p itemprop="description">${escapeHtml(compactSummary)}</p>` : ""}
        <div class="tag-row">
          <button class="threat-tag" type="button" data-filter-type="threat" data-filter-key="${escapeHtml(threatCategory.key)}">${escapeHtml(threatCategory.label)}</button>
          ${industries
            .map((industry) => `<button class="industry-tag" type="button" data-filter-type="industry" data-filter-key="${escapeHtml(industry.key)}">${escapeHtml(industry.label)}</button>`)
            .join("")}
        </div>
      </div>

      <dl class="line-meta">
        <div>
          <dt>Source</dt>
          <dd itemprop="publisher">${escapeHtml(source)}</dd>
        </div>
        <div>
          <dt>Cohort</dt>
          <dd>${escapeHtml(formatCategory(category))}</dd>
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
          <dd>${link ? `<a href="${escapeHtml(link)}" ${externalLinkAttrs()}>${escapeHtml(domainFromUrl(link) || link)}</a>` : "None"}</dd>
        </div>
      </dl>
    </li>
  `;
}

const allItems = Array.isArray(feed.items) ? feed.items : [];

const languageFilteredItems = allItems.filter(isEnglishEnoughItem);
const dateFilteredItems = languageFilteredItems.filter((item) => isWithinLookbackWindow(item, LOOKBACK_DAYS));

const items = dateFilteredItems
  .filter(isThreatIntelRelevant)
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

const latestItems = items.slice().sort((a, b) => getItemTime(b) - getItemTime(a));
const dedupedLatestItems = dedupeItems(latestItems);
const topInsights = selectTopUniqueInsights(dedupedLatestItems, 10);
const industryGroups = groupItemsByIndustry(dedupedLatestItems);
const threatCategoryGroups = groupItemsByThreatCategory(dedupedLatestItems);
const sourceCohortGroups = groupItemsBySourceCohort(dedupedLatestItems);

const languageFilteredOutCount = allItems.length - languageFilteredItems.length;
const dateFilteredOutCount = languageFilteredItems.length - dateFilteredItems.length;
const ctiFilteredOutCount = dateFilteredItems.length - items.length;
const dedupeFilteredOutCount = items.length - dedupedLatestItems.length;
const totalFilteredOutCount = allItems.length - dedupedLatestItems.length;

const threatCategoryNav = threatCategoryGroups
  .map((threatCategory) =>
    renderFilterChip({
      label: threatCategory.label,
      key: threatCategory.key,
      type: "threat",
      count: threatCategory.items.length
    })
  )
  .join("");

const industryNav = industryGroups
  .map((industry) =>
    renderFilterChip({
      label: industry.label,
      key: industry.key,
      type: "industry",
      count: industry.items.length
    })
  )
  .join("");

const cohortFilterNav = sourceCohortGroups
  .map((cohort) =>
    renderFilterChip({
      label: cohort.label,
      key: cohort.key,
      type: "cohort",
      count: cohort.items.length
    })
  )
  .join("");

const cohortCards = Object.entries(cohorts)
  .map(([key, cohort]) => {
    const count = dedupedLatestItems.filter((item) => item.category === key).length;

    return `
      <button class="cohort-card" type="button" data-filter-type="cohort" data-filter-key="${escapeHtml(key)}">
        <h3>${escapeHtml(formatCategory(key))}</h3>
        <p>${escapeHtml(cohort.description || "")}</p>
        <div class="small-meta">${escapeHtml(cohort.source_count || 0)} configured sources · ${escapeHtml(count)} rendered items</div>
      </button>
    `;
  })
  .join("");

const articleCorpus = `
  <section class="panel" id="article-corpus">
    <h2>Article Corpus</h2>
    <p class="panel-intro" id="active-filter-label">
      Showing ${dedupedLatestItems.length} deduplicated CTI items from the last ${LOOKBACK_DAYS} days. Use the filters to assemble views by threat category, industry, or source cohort.
    </p>

    <div class="filter-toolbar" aria-label="Dynamic filters">
      <button class="filter-chip active" type="button" data-filter-type="all" data-filter-key="all">All <span>${dedupedLatestItems.length}</span></button>
      ${threatCategoryNav}
      ${industryNav}
      ${cohortFilterNav}
    </div>

    <ol class="feed-lines dynamic-feed-lines" id="dynamic-feed-lines">
      ${dedupedLatestItems
        .map((item, index) => renderLineItem(item, `deduped-${index}`))
        .join("")}
    </ol>
  </section>
`;

const parseErrorBlock = parseErrors.length
  ? `
    <section class="status-panel warning" id="source-health">
      <h2>Source Health and Filter Summary</h2>
      <p>
        These sources did not parse successfully during the last feed build. This section is placed at the bottom so the page reads as an intelligence brief first.
      </p>
      <ul>
        ${parseErrors
          .map((source) => {
            const url = source.url || "";
            return `<li><strong>${escapeHtml(source.name)}</strong>: ${escapeHtml(source.status)}${url ? ` · <a href="${escapeHtml(url)}" ${externalLinkAttrs()}>${escapeHtml(url)}</a>` : ""}</li>`;
          })
          .join("")}
      </ul>

      <h3>Filter Summary</h3>
      <ul>
        <li>${escapeHtml(languageFilteredOutCount)} removed by language/source rules.</li>
        <li>${escapeHtml(dateFilteredOutCount)} removed by date window.</li>
        <li>${escapeHtml(ctiFilteredOutCount)} removed as non-CTI.</li>
        <li>${escapeHtml(dedupeFilteredOutCount)} removed by deduplication.</li>
        <li>${escapeHtml(totalFilteredOutCount)} total items filtered out before rendering.</li>
      </ul>
    </section>
  `
  : `
    <section class="status-panel" id="source-health">
      <h2>Source Health and Filter Summary</h2>
      <p>No parse warnings were reported during the last feed build.</p>

      <h3>Filter Summary</h3>
      <ul>
        <li>${escapeHtml(languageFilteredOutCount)} removed by language/source rules.</li>
        <li>${escapeHtml(dateFilteredOutCount)} removed by date window.</li>
        <li>${escapeHtml(ctiFilteredOutCount)} removed as non-CTI.</li>
        <li>${escapeHtml(dedupeFilteredOutCount)} removed by deduplication.</li>
        <li>${escapeHtml(totalFilteredOutCount)} total items filtered out before rendering.</li>
      </ul>
    </section>
  `;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Wolfram Threatstream Feed",
  description:
    "Curated cyber news and threat insight feed. Items are limited to the last 7 days, filtered for CTI relevance, deduplicated, tagged by likely affected industry and threat category, and dynamically filterable.",
  dateModified: generatedAt,
  numberOfItems: dedupedLatestItems.length,
  itemListElement: dedupedLatestItems.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    item: {
      "@type": "Article",
      headline: item.title || "Untitled item",
      url: item.link || item.url || "",
      datePublished: item.published || "",
      author: item.author || "",
      publisher: item.source || "",
      articleSection: getThreatCategory(item).label,
      description: stripHtml(item.summary || ""),
      keywords: [
        ...getKeywords(item),
        getThreatCategory(item).label,
        ...getIndustryTags(item).map((industry) => industry.label)
      ].join(", ")
    }
  }))
};

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Wolfram Threatstream Feed</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Curated English-language cyber threat intelligence feed. Last 7 days only. CTI-relevant items only. Deduplicated and dynamically filterable by threat category, industry, and source cohort.">
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

    button {
      font: inherit;
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
    .status-panel h2 {
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
      display: block;
      text-align: left;
      width: 100%;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.045);
      border-radius: 18px;
      padding: 16px;
      color: var(--text);
      cursor: pointer;
      transition:
        transform 140ms ease,
        border-color 140ms ease,
        background 140ms ease;
    }

    .cohort-card:hover,
    .cohort-card.active {
      transform: translateY(-2px);
      border-color: rgba(107, 231, 255, 0.45);
      background: rgba(107, 231, 255, 0.07);
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

    .filter-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
      margin: 18px 0 20px;
    }

    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin: 8px 0 10px;
    }

    .filter-chip,
    .threat-tag,
    .industry-tag {
      border: 1px solid rgba(107, 231, 255, 0.28);
      background: rgba(107, 231, 255, 0.08);
      color: #c9f6ff;
      border-radius: 999px;
      padding: 7px 10px;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      cursor: pointer;
    }

    .filter-chip span {
      color: var(--accent);
      margin-left: 5px;
    }

    .filter-chip:hover,
    .filter-chip.active,
    .threat-tag:hover,
    .industry-tag:hover {
      border-color: rgba(107, 231, 255, 0.58);
      background: rgba(107, 231, 255, 0.16);
    }

    .threat-tag {
      border-color: rgba(120, 170, 255, 0.32);
      background: rgba(120, 170, 255, 0.1);
      color: #d8e6ff;
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

    .feed-line[hidden] {
      display: none;
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

    .status-panel h3 {
      margin: 22px 0 10px;
      letter-spacing: -0.02em;
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
      <div class="eyebrow">Strategic Cyber Threat Intelligence Feed</div>
      <h1>Wolfram Threatstream Feed</h1>
      <p class="subtitle">
        Curated English-language cyber threat intelligence insights from the last ${LOOKBACK_DAYS} days. Items are filtered for CTI relevance, aggressively deduplicated, tagged by threat category and likely affected industry, and dynamically assembled by filter.
      </p>

      <div class="stats" aria-label="Feed status summary">
        <div class="stat">
          <strong>${escapeHtml(dedupedLatestItems.length)}</strong>
          <span>Deduplicated CTI items from last ${LOOKBACK_DAYS} days</span>
        </div>
        <div class="stat">
          <strong>${escapeHtml(totalSources)}</strong>
          <span>Configured English-language sources</span>
        </div>
        <div class="stat">
          <strong>${escapeHtml(okSources)}</strong>
          <span>Healthy sources</span>
        </div>
      </div>
    </header>

    <nav class="utility-links" aria-label="Feed navigation">
      <a class="button-link" href="./feed.json" ${externalLinkAttrs()}>Raw JSON feed</a>
      <a class="button-link" href="#top-insights">Top 10 Breaches and Threat Insights</a>
      <a class="button-link" href="#source-cohorts">Source Cohorts</a>
      <a class="button-link" href="#article-corpus">Article Corpus</a>
      <a class="button-link" href="#source-health">Source health</a>
    </nav>

    <section class="insights-panel" id="top-insights">
      <h2>Top 10 Breaches and Threat Insights</h2>
      <p class="panel-intro">
        These items are selected from the last ${LOOKBACK_DAYS} days only, filtered for breach activity, active exploitation, malware, intrusion activity, vulnerability exploitation, credential theft, ransomware, phishing, or other concrete threat signal. Product announcements, positioning posts, launch content, partnerships, webinars, and generic platform messaging are excluded.
      </p>
      <div class="insight-list">
        ${topInsights.map(buildInsight).join("")}
      </div>
    </section>

    <section class="panel" id="source-cohorts">
      <h2>Source Cohorts</h2>
      <p class="panel-intro">
        Source cohorts describe where the signal came from. Click a tile to assemble the matching deduplicated articles below. Cohorts are ingestion lanes, not the article taxonomy.
      </p>
      <div class="cohort-grid">
        ${cohortCards}
      </div>
    </section>

    ${articleCorpus}

    ${parseErrorBlock}

    <footer>
      <p>
        This page is generated from <code>docs/feed.json</code>. The rendered HTML is designed for human review,
        search indexing, and M365 Agent Builder knowledge ingestion. The rendered page is English-only, limited to the last ${LOOKBACK_DAYS} days, CTI-filtered, deduplicated, industry-tagged, threat-categorized, and dynamically filterable.
      </p>
      <p>
        Generated at: ${escapeHtml(formatDate(generatedAt))}
      </p>
    </footer>
  </main>

  <script>
    const filterButtons = Array.from(document.querySelectorAll("[data-filter-type][data-filter-key]"));
    const feedItems = Array.from(document.querySelectorAll("#dynamic-feed-lines .feed-line"));
    const activeFilterLabel = document.getElementById("active-filter-label");

    function labelForButton(button) {
      if (!button) {
        return "All";
      }

      return button.textContent.replace(/\\s+\\d+$/, "").trim();
    }

    function applyFilter(type, key, button) {
      let visibleCount = 0;

      for (const item of feedItems) {
        const itemThreatCategory = item.dataset.threatCategory || "";
        const itemCohort = item.dataset.category || "";
        const itemIndustries = (item.dataset.industries || "").split(" ").filter(Boolean);

        const shouldShow =
          type === "all" ||
          (type === "threat" && itemThreatCategory === key) ||
          (type === "industry" && itemIndustries.includes(key)) ||
          (type === "cohort" && itemCohort === key);

        item.hidden = !shouldShow;

        if (shouldShow) {
          visibleCount++;
        }
      }

      for (const candidate of filterButtons) {
        candidate.classList.remove("active");
      }

      for (const candidate of filterButtons) {
        if (candidate.dataset.filterType === type && candidate.dataset.filterKey === key) {
          candidate.classList.add("active");
        }
      }

      if (activeFilterLabel) {
        const label = labelForButton(button);

        activeFilterLabel.textContent =
          type === "all"
            ? "Showing all deduplicated CTI items from the last ${LOOKBACK_DAYS} days."
            : \`Showing \${visibleCount} deduplicated item\${visibleCount === 1 ? "" : "s"} for \${label}.\`;
      }

      const corpus = document.getElementById("article-corpus");

      if (corpus) {
        corpus.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    for (const button of filterButtons) {
      button.addEventListener("click", () => {
        applyFilter(button.dataset.filterType, button.dataset.filterKey, button);
      });
    }
  </script>
</body>
</html>`;

fs.writeFileSync(outputPath, html);

console.log(`Generated ${outputPath}`);
console.log(`Rendered ${dedupedLatestItems.length} deduplicated CTI items from the last ${LOOKBACK_DAYS} days.`);
console.log(`Selected ${topInsights.length} unique breach/threat insights.`);
console.log(`Mapped items across ${industryGroups.length} industry groupings.`);
console.log(`Mapped items across ${threatCategoryGroups.length} threat categories.`);
console.log(`Mapped items across ${sourceCohortGroups.length} source cohorts.`);
console.log(`Filtered out ${languageFilteredOutCount} items by language/source rules.`);
console.log(`Filtered out ${dateFilteredOutCount} items outside the date window.`);
console.log(`Filtered out ${ctiFilteredOutCount} non-CTI items.`);
console.log(`Removed ${dedupeFilteredOutCount} duplicate or near-duplicate items.`);
console.log(`Detected ${parseErrors.length} source warnings.`);

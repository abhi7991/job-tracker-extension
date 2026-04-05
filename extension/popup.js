"use strict";

// ── Sheets API ────────────────────────────────────────────────────────────────

async function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

async function sheetsRequest(token, method, path, body = null) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets${path}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function getNextRowNumber(token, spreadsheetId, sheetName) {
  const range = encodeURIComponent(`${sheetName}!A:A`);
  const data = await sheetsRequest(
    token, "GET",
    `/${spreadsheetId}/values/${range}`
  );
  return (data.values?.length ?? 0) + 1;
}

async function appendRow(token, spreadsheetId, sheetName, job) {
  const nextRow = await getNextRowNumber(token, spreadsheetId, sheetName);

  // Column order: Company | Role | Date Applied | Link | Status | Location |
  //               Salary  | Contact Info | Notes | Resume Version | Days Since App
  const row = [
    job.company,
    job.role,
    job.dateApplied,
    job.link,
    job.status,
    job.location,
    job.salary,
    job.contact,
    job.notes,
    job.resume,
    `=TODAY()-C${nextRow}+1`,   // Days Since App — auto-updates daily
  ];

  const range = encodeURIComponent(`${sheetName}!A:K`);
  await sheetsRequest(
    token, "POST",
    `/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { values: [row] }
  );
}

// ── Page data extraction ───────────────────────────────────────────────────────

/**
 * Injected into the job posting page.
 * Priority: JSON-LD JobPosting schema → site-specific selectors → OG/title fallback.
 * Must be a plain function (no closures over outer scope) — it runs in page context.
 */
function extractJobDataFromPage() {
  const q  = (sel)        => document.querySelector(sel);
  const qt = (sel)        => q(sel)?.textContent?.trim() ?? "";
  const qc = (sel, attr)  => q(sel)?.getAttribute(attr)?.trim() ?? "";

  // ── 1. JSON-LD (schema.org/JobPosting) ──────────────────────────────────────
  // Used by: Indeed, LinkedIn (partially), Greenhouse, Lever, Workday, Recruitee, etc.
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const raw  = JSON.parse(script.textContent);
      const jobs = [raw, ...(raw["@graph"] ?? [])].filter(
        (n) => n?.["@type"] === "JobPosting" || n?.["@type"]?.includes?.("JobPosting")
      );
      if (!jobs.length) continue;
      const j = jobs[0];

      const company  = j.hiringOrganization?.name ?? j.hiringOrganization ?? "";
      const role     = j.title ?? "";

      // Location: jobLocation can be an array or object
      const locNode  = Array.isArray(j.jobLocation) ? j.jobLocation[0] : j.jobLocation;
      const addr     = locNode?.address ?? {};
      const remote   = j.jobLocationType === "TELECOMMUTE" ? "Remote" : "";
      const city     = addr.addressLocality ?? "";
      const region   = addr.addressRegion  ?? "";
      const country  = addr.addressCountry ?? "";
      const jobLocation = remote
        || [city, region, country].filter(Boolean).join(", ")
        || qt('[class*="location"]') || "";

      // Salary
      let salary = "";
      const sal = j.baseSalary;
      if (sal) {
        const v = sal.value ?? sal;
        const cur = sal.currency ?? "";
        if (v.minValue && v.maxValue) {
          const fmt = (n) =>
            n >= 1000 ? `${cur}${Math.round(n / 1000)}k` : `${cur}${n}`;
          salary = `${fmt(v.minValue)}–${fmt(v.maxValue)}`;
          if (v.unitText) salary += `/${v.unitText.toLowerCase().replace("year","yr").replace("hour","hr")}`;
        } else if (v.value) {
          salary = `${cur}${v.value}`;
        }
      }

      if (role || company) return { company, role, location: jobLocation, salary };
    } catch (_) {}
  }

  // ── 2. Site-specific selectors ───────────────────────────────────────────────
  const host = window.location.hostname;

  if (host.includes("linkedin.com")) {
    return {
      company:  qt('.top-card-layout__second-subline .topcard__org-name-link') ||
                qt('[class*="topcard__org-name"]') ||
                qt('[class*="company-name"]'),
      role:     qt('.top-card-layout__title') || qt('h1[class*="job-title"]') || qt('h1'),
      location: qt('[class*="topcard__flavor--bullet"]') || qt('[class*="job-location"]'),
      salary:   qt('[class*="salary"]') || qt('[class*="compensation"]'),
    };
  }

  if (host.includes("indeed.com")) {
    return {
      company:  qc('[data-testid="inlineHeader-companyName"] a', "aria-label") ||
                qt('[data-testid="inlineHeader-companyName"]'),
      role:     qt('[data-testid="jobsearch-JobInfoHeader-title"] span') ||
                qt('h1[class*="jobsearch"]'),
      location: qt('[data-testid="job-location"]') || qt('[data-testid="inlineHeader-companyLocation"]'),
      salary:   qt('[id="salaryInfoAndJobType"] span') || qt('[class*="salary-snippet"]'),
    };
  }

  if (host.includes("glassdoor.com")) {
    return {
      company:  qt('[data-test="employer-name"]') || qt('[class*="EmployerProfile__name"]'),
      role:     qt('[data-test="job-title"]')      || qt('[class*="JobCard__jobTitle"]') || qt('h1'),
      location: qt('[data-test="location"]')       || qt('[class*="location"]'),
      salary:   qt('[data-test="salary-estimate"]')|| qt('[class*="SalaryEstimate"]'),
    };
  }

  if (host.includes("lever.co")) {
    return {
      company:  qc('meta[property="og:site_name"]', "content") || qt('[class*="company-name"]'),
      role:     qt('.posting-headline h2') || qt('h2') || qt('h1'),
      location: qt('.posting-categories .location') || qt('[class*="location"]'),
      salary:   qt('[class*="compensation"]') || qt('[class*="salary"]'),
    };
  }

  if (host.includes("greenhouse.io") || host.includes("boards.greenhouse")) {
    return {
      company:  qc('meta[property="og:site_name"]', "content"),
      role:     qt('.app-title') || qt('#header h1') || qt('h1'),
      location: qt('.location') || qt('[class*="location"]'),
      salary:   qt('[class*="salary"]') || qt('[class*="compensation"]'),
    };
  }

  if (host.includes("workday.com")) {
    return {
      company:  qt('[data-automation-id="company"]') || qt('[class*="company"]'),
      role:     qt('[data-automation-id="jobPostingHeader"]') || qt('h2') || qt('h1'),
      location: qt('[data-automation-id="locations"]') || qt('[class*="location"]'),
      salary:   qt('[data-automation-id="salary"]') || "",
    };
  }

  if (host.includes("ashbyhq.com")) {
    return {
      company:  qc('meta[property="og:site_name"]', "content"),
      role:     qt('h1') || qt('[class*="job-title"]'),
      location: qt('[class*="location"]') || qt('[class*="Location"]'),
      salary:   qt('[class*="compensation"]') || qt('[class*="salary"]'),
    };
  }

  // ── 3. Generic OG / title fallback ──────────────────────────────────────────
  const getMeta = (prop) =>
    q(`meta[property="${prop}"]`)?.content ||
    q(`meta[name="${prop}"]`)?.content || "";

  const ogTitle    = getMeta("og:title");
  const ogSiteName = getMeta("og:site_name");
  const pageTitle  = document.title;
  const raw        = ogTitle || pageTitle;

  // Parse "Role at Company | Site" or "Role - Company"
  const clean    = raw.split(/\s*[|｜]\s*/)[0].trim();
  const atMatch  = clean.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) return { company: atMatch[2].trim(), role: atMatch[1].trim(), location: "", salary: "" };

  const parts = clean.split(/\s*[-–—]\s*/);
  const role  = parts[0]?.trim() ?? "";
  const co    = parts[1]?.trim() ?? ogSiteName ?? "";

  // Try to find any salary-like text on the page
  const bodyText   = document.body.innerText;
  const salMatch   = bodyText.match(/[\$£€][\d,]+[kK]?\s*(?:[-–]\s*[\$£€]?[\d,]+[kK]?)?(?:\s*\/?\s*(?:yr|year|hr|hour))?/);

  return {
    company:  co,
    role,
    location: qt('[class*="location"]') || qt('[class*="Location"]') || "",
    salary:   salMatch?.[0]?.trim() ?? "",
  };
}

async function getTabData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return {};

  let data = {};
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractJobDataFromPage,
    });
    if (results?.[0]?.result) data = results[0].result;
  } catch (_) {
    // chrome:// or restricted pages — silently ignore
  }

  // Sanitize — strip leftover HTML entities or excess whitespace
  const clean = (s) => (s ?? "").replace(/\s+/g, " ").replace(/&amp;/g, "&").trim();

  return {
    url:      tab.url   ?? "",
    company:  clean(data.company),
    role:     clean(data.role),
    location: clean(data.location),
    salary:   clean(data.salary),
  };
}

// ── Config ────────────────────────────────────────────────────────────────────

function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      { spreadsheetId: "", sheetName: "Sheet1" },
      resolve
    );
  });
}

function saveConfig(spreadsheetId, sheetName) {
  return new Promise((resolve) =>
    chrome.storage.sync.set({ spreadsheetId, sheetName }, resolve)
  );
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function showToast(elId, message, type) {
  const el = document.getElementById(elId);
  el.textContent = message;
  el.className = type; // "success" | "error"
  el.style.display = "block";
  if (type === "success") setTimeout(() => (el.style.display = "none"), 3000);
}

function setLoading(on) {
  const btn     = document.getElementById("btnLog");
  const text    = document.getElementById("btnText");
  const spinner = document.getElementById("spinner");
  btn.disabled          = on;
  spinner.style.display = on ? "block" : "none";
  text.textContent      = on ? "Adding…" : "Log Application";
}

function todayISO() {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD (HTML date input format)
}

function isoToSheet(iso) {
  // Convert YYYY-MM-DD → MM/DD/YYYY for Google Sheets
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  const config = await loadConfig();

  // ── Populate form with current tab data ──
  document.getElementById("dateApplied").value = todayISO();

  // Show extraction in progress
  const btnLog = document.getElementById("btnLog");
  const btnText = document.getElementById("btnText");
  btnLog.disabled = true;
  btnText.textContent = "Reading page…";

  const tabData = await getTabData();

  document.getElementById("link").value     = tabData.url      || "";
  document.getElementById("company").value  = tabData.company  || "";
  document.getElementById("role").value     = tabData.role     || "";
  document.getElementById("location").value = tabData.location || "";
  document.getElementById("salary").value   = tabData.salary   || "";

  btnLog.disabled     = false;
  btnText.textContent = "Log Application";

  // ── Settings gear ──
  document.getElementById("btnSettings").addEventListener("click", () => {
    document.getElementById("cfgSheetId").value   = config.spreadsheetId || "";
    document.getElementById("cfgSheetName").value = config.sheetName || "Sheet1";
    showView("viewSettings");
  });

  document.getElementById("btnSettingsCancel").addEventListener("click", () => {
    showView("viewMain");
  });

  document.getElementById("btnSettingsSave").addEventListener("click", async () => {
    const id   = document.getElementById("cfgSheetId").value.trim();
    const name = document.getElementById("cfgSheetName").value.trim() || "Sheet1";
    if (!id) {
      showToast("settingsToast", "Spreadsheet ID is required.", "error");
      return;
    }
    await saveConfig(id, name);
    config.spreadsheetId = id;
    config.sheetName     = name;
    showToast("settingsToast", "Saved!", "success");
    setTimeout(() => showView("viewMain"), 800);
  });

  // ── Log button ──
  document.getElementById("btnLog").addEventListener("click", async () => {
    const spreadsheetId = config.spreadsheetId?.trim();
    if (!spreadsheetId) {
      showToast("toast", "Set your Spreadsheet ID in Settings first.", "error");
      return;
    }

    const company = document.getElementById("company").value.trim();
    const role    = document.getElementById("role").value.trim();
    if (!company || !role) {
      showToast("toast", "Company and Role are required.", "error");
      return;
    }

    const job = {
      company,
      role,
      dateApplied: isoToSheet(document.getElementById("dateApplied").value || todayISO()),
      link:        document.getElementById("link").value.trim(),
      status:      document.getElementById("status").value,
      location:    document.getElementById("location").value.trim(),
      salary:      document.getElementById("salary").value.trim(),
      contact:     document.getElementById("contact").value.trim(),
      notes:       document.getElementById("notes").value.trim(),
      resume:      document.getElementById("resume").value.trim(),
    };

    setLoading(true);
    try {
      const token = await getAuthToken();
      await appendRow(token, spreadsheetId, config.sheetName, job);
      showToast("toast", `Logged "${role}" at ${company}`, "success");

      // Clear editable fields, keep URL/date for next entry
      ["company", "role", "location", "salary", "contact", "notes", "resume"].forEach(
        (id) => (document.getElementById(id).value = "")
      );
      document.getElementById("status").value = "Applied";
    } catch (err) {
      console.error(err);
      showToast("toast", `Error: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  });
});

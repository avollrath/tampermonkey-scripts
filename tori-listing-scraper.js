// ==UserScript==
// @name         Tori.fi Listing Scraper
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Scrapes all listings from Tori.fi search results pages into a table with CSV export.
// @author       You
// @match        https://*.tori.fi/*
// @grant        none
// ==/UserScript==

(function () {
  const BUTTON_ID = "tori-scraper-button";
  const OVERLAY_ID = "tori-scraper-overlay";

  const isSearchPage =
    window.location.pathname.includes("/forsale/search") ||
    (
      window.location.pathname.includes("recommerce/forsale") &&
      !window.location.pathname.includes("/item/")
    );

  if (!isSearchPage) return;
  if (document.getElementById(BUTTON_ID)) return;

  function parseListingsFrom(doc) {
    const listings = [];

    doc.querySelectorAll("article.sf-search-ad").forEach((a) => {
      const nameEl = a.querySelector("h2");
      const name = nameEl
        ? nameEl.textContent.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
        : "";

      if (!name) return;

      let price = "";
      const priceDiv = a.querySelector(".font-bold.whitespace-nowrap");

      if (priceDiv) {
        const span = priceDiv.querySelector("span");
        if (span) {
          price = span.textContent
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
      }

      if (!price) {
        a.querySelectorAll("span").forEach((s) => {
          if (!price && /\d/.test(s.textContent) && s.textContent.includes("€")) {
            price = s.textContent.replace(/\u00a0/g, " ").trim();
          }
        });
      }

      let make = "";
      const makeEl = a.querySelector(".flex.flex-wrap.mt-8 span");
      if (makeEl) make = makeEl.textContent.trim();

      let link = "";
      const linkEl = a.querySelector("a.sf-search-ad-link");

      if (linkEl) {
        const href = linkEl.getAttribute("href");
        if (href) {
          link = new URL(href, "https://www.tori.fi").toString();
        }
      }

      listings.push({ name, make, price, link });
    });

    return listings;
  }

  async function fetchDocument(url) {
    const res = await fetch(url, {
      credentials: "include",
      headers: { Accept: "text/html" },
    });

    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);

    const html = await res.text();
    return new DOMParser().parseFromString(html, "text/html");
  }

  function buildPageUrlFromRawUrl(rawUrl, page) {
    const [pathAndQuery, hash = ""] = rawUrl.split("#");
    const [base, query = ""] = pathAndQuery.split("?");

    const params = query
      .split("&")
      .filter(Boolean)
      .filter((part) => !part.startsWith("page="));

    if (page > 1) params.unshift(`page=${page}`);

    return `${base}?${params.join("&")}${hash ? `#${hash}` : ""}`;
  }

  async function scrapeAllPages(button) {
    const allListings = [];
    const seen = new Set();
    const rawStartUrl = window.location.href;
    let emptyOrDuplicatePages = 0;
    const maxPages = 40;
    let scrapedPages = 0;

    for (let page = 1; page <= maxPages; page++) {
      button.textContent = `⏳ Scraping page ${page}...`;

      const currentDoc = page === 1
        ? document
        : await fetchDocument(buildPageUrlFromRawUrl(rawStartUrl, page));

      const listings = parseListingsFrom(currentDoc);
      if (listings.length === 0) break;

      scrapedPages = page;
      let newItemsOnPage = 0;

      listings.forEach((listing) => {
        const key = listing.link || `${listing.name}-${listing.price}`;
        if (!seen.has(key)) {
          seen.add(key);
          allListings.push(listing);
          newItemsOnPage++;
        }
      });

      if (newItemsOnPage === 0) {
        emptyOrDuplicatePages++;
      } else {
        emptyOrDuplicatePages = 0;
      }

      if (emptyOrDuplicatePages >= 2) break;

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return { listings: allListings, pages: scrapedPages };
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showToast(msg) {
    const t = document.getElementById("ts-toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1800);
  }

  function buildOverlay(listings, pages) {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;

    overlay.innerHTML = `
      <style>
        #tori-scraper-overlay {
          position: fixed;
          inset: 0;
          z-index: 2147483646;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(4px);
          font-family: 'DM Mono', monospace, sans-serif;
          animation: ts-fade-in 0.2s ease;
        }
        @keyframes ts-fade-in { from { opacity: 0; } to { opacity: 1; } }
        #ts-modal {
          background: #141414;
          border: 1px solid #2e2e2e;
          border-radius: 14px;
          width: min(860px, 94vw);
          max-height: 88vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 40px 80px rgba(0,0,0,0.6);
          animation: ts-slide-up 0.2s ease;
        }
        @keyframes ts-slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        #ts-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #2e2e2e;
          background: #1a1a1a;
          flex-shrink: 0;
        }
        #ts-header-left { display: flex; align-items: center; gap: 10px; }
        #ts-title { font-size: 15px; font-weight: 700; color: #f0f0f0; letter-spacing: -0.3px; }
        .ts-badge { background: #22c55e22; color: #22c55e; border: 1px solid #22c55e44; border-radius: 20px; padding: 2px 10px; font-size: 11px; }
        .ts-page-badge { background: #d3082a22; color: #ff3854; border: 1px solid #d3082a44; border-radius: 20px; padding: 2px 10px; font-size: 11px; }
        #ts-header-right { display: flex; gap: 8px; align-items: center; }
        .ts-btn { background: #242424; color: #f0f0f0; border: 1px solid #3a3a3a; border-radius: 7px; padding: 7px 14px; font-size: 12px; font-family: inherit; cursor: pointer; transition: all 0.15s; }
        .ts-btn:hover { border-color: #d3082a; color: #ff3854; }
        .ts-btn-close { background: none; border: none; color: #666; font-size: 20px; cursor: pointer; line-height: 1; padding: 4px 8px; border-radius: 6px; transition: color 0.15s; }
        .ts-btn-close:hover { color: #f0f0f0; }
        #ts-tabs { display: flex; border-bottom: 1px solid #2e2e2e; background: #1a1a1a; flex-shrink: 0; padding: 0 20px; }
        .ts-tab { padding: 10px 16px; font-size: 12px; cursor: pointer; color: #666; border-bottom: 2px solid transparent; transition: all 0.15s; user-select: none; }
        .ts-tab:hover { color: #f0f0f0; }
        .ts-tab.active { color: #ff3854; border-bottom-color: #d3082a; }
        #ts-body { overflow-y: auto; flex: 1; }
        #ts-table-view { display: block; }
        #ts-text-view { display: none; padding: 20px; }
        table.ts-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .ts-table thead { background: #1e1e1e; position: sticky; top: 0; z-index: 1; }
        .ts-table th { text-align: left; padding: 10px 16px; color: #555; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500; border-bottom: 1px solid #2e2e2e; }
        .ts-table td { padding: 9px 16px; border-bottom: 1px solid #1e1e1e; vertical-align: middle; color: #d0d0d0; }
        .ts-table tr:hover td { background: rgba(255,255,255,0.02); }
        .ts-table tr:last-child td { border-bottom: none; }
        .ts-num { color: #444; font-size: 10px; width: 32px; }
        .ts-name { font-weight: 600; color: #efefef; max-width: 320px; }
        .ts-name a { color: inherit; text-decoration: none; }
        .ts-name a:hover { color: #ff3854; }
        .ts-make span { background: #1e1e1e; border: 1px solid #2e2e2e; border-radius: 4px; padding: 1px 7px; font-size: 10px; color: #888; }
        .ts-price { color: #22c55e; white-space: nowrap; font-weight: 500; }
        .ts-dash { color: #333; }
        #ts-textarea { width: 100%; min-height: 340px; background: #0f0f0f; border: 1px solid #2e2e2e; border-radius: 8px; padding: 16px; color: #d0d0d0; font-family: 'DM Mono', monospace, sans-serif; font-size: 12px; line-height: 1.8; resize: vertical; outline: none; box-sizing: border-box; }
        #ts-footer { padding: 10px 20px; border-top: 1px solid #2e2e2e; background: #1a1a1a; font-size: 11px; color: #444; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; }
        .ts-toast { position: absolute; bottom: 60px; right: 20px; background: #22c55e; color: #000; font-weight: 700; font-size: 12px; padding: 8px 16px; border-radius: 8px; opacity: 0; transform: translateY(6px); transition: all 0.2s; pointer-events: none; }
        .ts-toast.show { opacity: 1; transform: translateY(0); }
      </style>

      <div id="ts-modal">
        <div id="ts-header">
          <div id="ts-header-left">
            <span id="ts-title">📋 Tori Listings</span>
            <span class="ts-badge">${listings.length} items</span>
            <span class="ts-page-badge">Scraped ${pages} page${pages === 1 ? "" : "s"}</span>
          </div>
          <div id="ts-header-right">
            <button class="ts-btn" id="ts-copy-csv">Copy CSV</button>
            <button class="ts-btn" id="ts-copy-text">Copy Text</button>
            <button class="ts-btn-close" id="ts-close">✕</button>
          </div>
        </div>
        <div id="ts-tabs">
          <div class="ts-tab active" data-view="table">Table</div>
          <div class="ts-tab" data-view="text">Plain Text</div>
        </div>
        <div id="ts-body">
          <div id="ts-table-view">
            <table class="ts-table">
              <thead>
                <tr>
                  <th class="ts-num">#</th>
                  <th>Name</th>
                  <th>Make</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                ${listings.map((l, i) => `
                  <tr>
                    <td class="ts-num">${i + 1}</td>
                    <td class="ts-name">${l.link ? `<a href="${esc(l.link)}" target="_blank" rel="noopener noreferrer">${esc(l.name)}</a>` : esc(l.name)}</td>
                    <td class="ts-make">${l.make ? `<span>${esc(l.make)}</span>` : `<span class="ts-dash">-</span>`}</td>
                    <td class="ts-price">${esc(l.price) || '<span class="ts-dash">-</span>'}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          <div id="ts-text-view">
            <textarea id="ts-textarea" readonly>${listings.map((l, i) =>
              `${i + 1}. ${l.name}${l.make ? " [" + l.make + "]" : ""}, ${l.price || "n/a"}${l.link ? ", " + l.link : ""}`
            ).join("\n")}</textarea>
          </div>
        </div>
        <div id="ts-footer">
          <span>${listings.length} listings, ${pages} page${pages === 1 ? "" : "s"}, tori.fi</span>
          <span style="color:#333">Tori Listing Scraper</span>
        </div>
        <div class="ts-toast" id="ts-toast"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById("ts-close").addEventListener("click", () => overlay.remove());

    overlay.querySelectorAll(".ts-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        overlay.querySelectorAll(".ts-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const view = tab.dataset.view;
        document.getElementById("ts-table-view").style.display = view === "table" ? "block" : "none";
        document.getElementById("ts-text-view").style.display = view === "text" ? "block" : "none";
      });
    });

    document.getElementById("ts-copy-csv").addEventListener("click", () => {
      const rows = [["#", "Name", "Make", "Price", "URL"]];
      listings.forEach((l, i) => rows.push([i + 1, l.name, l.make, l.price, l.link]));
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      navigator.clipboard.writeText(csv).then(() => showToast("CSV copied!"));
    });

    document.getElementById("ts-copy-text").addEventListener("click", () => {
      const text = listings.map((l, i) =>
        `${i + 1}. ${l.name}${l.make ? " [" + l.make + "]" : ""}, ${l.price || "n/a"}${l.link ? ", " + l.link : ""}`
      ).join("\n");
      navigator.clipboard.writeText(text).then(() => showToast("Copied!"));
    });

    const escHandler = (e) => {
      if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", escHandler); }
    };
    document.addEventListener("keydown", escHandler);
  }

  function createButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.textContent = "📋 Scrape Listings";

    Object.assign(button.style, {
      position: "fixed",
      left: "20px",
      bottom: "20px",
      zIndex: "2147483645",
      padding: "14px 18px",
      borderRadius: "14px",
      border: "none",
      background: "linear-gradient(135deg, #611a24, #d3082a)",
      color: "#fff",
      fontSize: "14px",
      fontWeight: "700",
      cursor: "pointer",
      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
      transition: "all 0.2s ease",
      fontFamily: "'Syne', system-ui, sans-serif",
      letterSpacing: "-0.2px",
    });

    button.addEventListener("mouseenter", () => {
      if (button.disabled) return;
      button.style.transform = "translateY(-2px)";
      button.style.boxShadow = "0 14px 40px rgba(0,0,0,0.45)";
    });

    button.addEventListener("mouseleave", () => {
      button.style.transform = "translateY(0)";
      button.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    });

    button.addEventListener("click", async () => {
      button.disabled = true;
      button.style.opacity = "0.75";
      button.style.cursor = "wait";

      try {
        const { listings, pages } = await scrapeAllPages(button);

        if (listings.length === 0) {
          button.textContent = "⚠ No listings found";
          setTimeout(() => { button.textContent = "📋 Scrape Listings"; }, 2000);
          return;
        }

        buildOverlay(listings, pages);
      } catch (error) {
        console.error("Tori scraper failed:", error);
        button.textContent = "⚠ Scrape failed";
        setTimeout(() => { button.textContent = "📋 Scrape Listings"; }, 2000);
      } finally {
        button.disabled = false;
        button.style.opacity = "1";
        button.style.cursor = "pointer";
        if (!button.textContent.includes("No listings") && !button.textContent.includes("failed")) {
          button.textContent = "📋 Scrape Listings";
        }
      }
    });

    document.body.appendChild(button);
  }

  // Handle SPA navigation — re-check if we're on a search page after route changes
  function checkAndInit() {
    const onSearch =
      window.location.pathname.includes("/forsale/search") ||
      (window.location.pathname.includes("recommerce/forsale") &&
        !window.location.pathname.includes("/item/"));

    if (onSearch) {
      setTimeout(createButton, 500);
    } else {
      const btn = document.getElementById(BUTTON_ID);
      if (btn) btn.remove();
    }
  }

  const _pushState = history.pushState.bind(history);
  history.pushState = function (...args) { _pushState(...args); checkAndInit(); };

  const _replaceState = history.replaceState.bind(history);
  history.replaceState = function (...args) { _replaceState(...args); checkAndInit(); };

  window.addEventListener('popstate', checkAndInit);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createButton);
  } else {
    setTimeout(createButton, 500);
  }
})();
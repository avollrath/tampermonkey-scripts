// ==UserScript==
// @name         Tori.fi Deal Hunter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Evaluates Tori.fi listings with the Deal Hunter GPT.
// @author       You
// @match        https://*.tori.fi/recommerce/forsale/item/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_ID = "deal-hunter-evaluate-button";
  const CUSTOM_GPT_URL = "https://chatgpt.com/g/g-69f6f772324881918d188e23520ee624-tori-deal-hunter";

  function clean(text = "") {
    return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function findInAllShadows(root, selector) {
    const direct = root.querySelector(selector);
    if (direct) return direct;
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) {
        const found = findInAllShadows(el.shadowRoot, selector);
        if (found) return found;
      }
    }
    return null;
  }

  function queryAll(root, selector) {
    const direct = [...root.querySelectorAll(selector)];
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) direct.push(...queryAll(el.shadowRoot, selector));
    }
    return direct;
  }

  function getText(selector) {
    const el = findInAllShadows(document, selector);
    return el ? clean(el.textContent) : "";
  }

  function findTitle() { return getText('[data-testid="object-title"]') || getText("h1"); }
  function findPrice() { return getText(".h2"); }
  function findDescription() { return getText('[data-testid="description"]'); }
  function findLocation() { return getText('[data-testid="object-address"]'); }
  function findShipping() { return getText('[aria-hidden="false"]'); }
  function findSeller() { return getText('a[href^="/profile/ads"]'); }
  function findMeta() { return getText('[data-testid="object-info"]'); }

  function findCondition() {
    const badges = queryAll(document, "section[aria-label='Lisätietoja'] span p");
    return badges.map((p) => clean(p.textContent)).filter(Boolean).join(" | ");
  }

  function findAdId() {
    const el = findInAllShadows(document, "[data-decodedadid]");
    return el ? el.getAttribute("data-decodedadid") : "";
  }

  function buildOutput() {
    const title = findTitle();
    const price = findPrice();
    const chatTitle = `Evaluate: ${title || "Tori listing"}${price ? `, ${price}` : ""}`;

    return `${chatTitle}

Please evaluate this Tori listing as a flipping deal. Answer in English. If the deal score is under 6/10 or the verdict is Skip, use the shortened bad-deal format and do not include seller messages unless I ask.

URL:
${window.location.href}

Title:
${title || "Not found"}

Price:
${price || "Not found"}

Condition / Details:
${findCondition() || "Not found"}

Location:
${findLocation() || "Not found"}

Shipping / ToriDiili:
${findShipping() || "Not found"}

Description:
${findDescription() || "Not found"}

Seller:
${findSeller() || "Not found"}

Meta:
${findMeta() || "Not found"}

Ad ID:
${findAdId() || "Not found"}`;
  }

  function showToast(msg, color = '#22c55e') {
    const existing = document.getElementById('dh-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'dh-toast';
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '80px',
      right: '20px',
      background: color,
      color: '#000',
      fontWeight: '700',
      fontSize: '13px',
      padding: '10px 18px',
      borderRadius: '10px',
      zIndex: '9999999',
      opacity: '0',
      transform: 'translateY(6px)',
      transition: 'all 0.2s ease',
      fontFamily: 'system-ui, sans-serif',
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
    });
    toast.textContent = msg;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(6px)';
      setTimeout(() => toast.remove(), 200);
    }, 2500);
  }

  function createButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.textContent = "🚀 Evaluate with Deal Hunter";

    Object.assign(button.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      zIndex: "999999",
      padding: "14px 18px",
      borderRadius: "14px",
      border: "none",
      background: "linear-gradient(135deg, #611a24, #d3082a)",
      color: "#fff",
      fontSize: "14px",
      fontWeight: "700",
      cursor: "pointer",
      boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      transition: "all 0.2s ease",
      fontFamily: "system-ui, sans-serif",
    });

    button.addEventListener("mouseenter", () => {
      button.style.transform = "translateY(-2px)";
      button.style.boxShadow = "0 14px 40px rgba(0,0,0,0.3)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.transform = "translateY(0)";
      button.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
    });

    button.addEventListener("click", async () => {
      const prompt = buildOutput();

      try {
        await navigator.clipboard.writeText(prompt);
        showToast('✅ Prompt copied — paste it in ChatGPT!');
      } catch (e) {
        showToast('⚠ Could not copy — see console', '#f59e0b');
        console.log('[Deal Hunter] Prompt:\n', prompt);
      }

      button.textContent = "🚀 Opening Deal Hunter...";
      window.open(CUSTOM_GPT_URL, "_blank");

      setTimeout(() => {
        button.textContent = "🚀 Evaluate with Deal Hunter";
      }, 1600);
    });

    document.body.appendChild(button);
  }

  // Handle SPA navigation to item pages
  function checkAndInit() {
    const onItemPage = window.location.pathname.includes('/recommerce/forsale/item/');
    if (onItemPage) {
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

  setTimeout(createButton, 500);
})();
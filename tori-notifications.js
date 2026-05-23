// ==UserScript==
// @name         Tori.fi Notification Sound Alerter
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  Plays a sound when a new Tori.fi notification or message appears.
// @author       You
// @match        https://*.tori.fi/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function findInAllShadows(root, selector) {
        const direct = root.querySelector(selector);
        if (direct) return direct;
        for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) {
                const found = findInAllShadows(el.shadowRoot, selector);
                if (found) return found;
            }
        }
        return null;
    }

    // --- Audio ---
    const BEEP_URL = 'https://cdn.pixabay.com/audio/2026/03/02/audio_a2a2855a9f.mp3';
    const audio = new Audio(BEEP_URL);
    audio.volume = 1.0;

    function playAlertSound() {
        audio.currentTime = 0;
        audio.play().catch(e => console.warn('[Tori Alert] Playback error:', e));
    }

    // --- Notification bubble ---
    let notifWasShowing = false;
    let notifObserver = null;

    function checkNotification() {
        const bubble = findInAllShadows(document, 'notification-bubble');
        const isShowing = bubble ? bubble.hasAttribute('show') : false;
        if (isShowing && !notifWasShowing) {
            console.log('[Tori Alert] New notification!');
            playAlertSound();
        }
        notifWasShowing = isShowing;
    }

    function attachNotifObserver() {
        const bubble = findInAllShadows(document, 'notification-bubble');
        if (!bubble || notifObserver) return;
        notifObserver = new MutationObserver(() => checkNotification());
        notifObserver.observe(bubble, { attributes: true, attributeFilter: ['show'] });
        console.log('[Tori Alert] Notification observer attached.');
        checkNotification();
    }

    // --- Messages ---
    let prevMessageCount = 0;
    let messageObserver = null;
    let finnTopbarAttrObserver = null;

    function getMessageCount() {
        const finnTopbar = document.querySelector('finn-topbar');
        if (finnTopbar) {
            const val = parseInt(finnTopbar.getAttribute('messaging-unread-count') || '0', 10);
            if (!isNaN(val)) return val;
        }
        const icon = findInAllShadows(document, 'messaging-icon');
        if (icon) {
            const val = parseInt(icon.getAttribute('count') || '0', 10);
            if (!isNaN(val)) return val;
        }
        return 0;
    }

    function checkMessages() {
        const count = getMessageCount();
        if (count > prevMessageCount) {
            console.log(`[Tori Alert] New message(s)! count=${count}`);
            playAlertSound();
        }
        prevMessageCount = count;
    }

    function attachMessageObserver() {
        const finnTopbar = document.querySelector('finn-topbar');
        if (finnTopbar && !finnTopbarAttrObserver) {
            finnTopbarAttrObserver = new MutationObserver(() => checkMessages());
            finnTopbarAttrObserver.observe(finnTopbar, {
                attributes: true,
                attributeFilter: ['messaging-unread-count'],
            });
            console.log('[Tori Alert] finn-topbar message observer attached.');
            prevMessageCount = getMessageCount();
        }
        const icon = findInAllShadows(document, 'messaging-icon');
        if (icon && !messageObserver) {
            messageObserver = new MutationObserver(() => checkMessages());
            messageObserver.observe(icon, { attributes: true, attributeFilter: ['count'] });
            console.log('[Tori Alert] messaging-icon observer attached.');
        }
    }

    // --- Status indicator ---
    // Fixed position hardcoded next to the Tori logo (top-left of the 49px header).
    // Avoids all shadow root injection and getBoundingClientRect timing issues.
    function injectStatusIcon() {
        if (document.getElementById('tori-alerter-status')) return;

        if (!document.getElementById('tori-alerter-styles')) {
            const style = document.createElement('style');
            style.id = 'tori-alerter-styles';
            style.textContent = `
                @keyframes toriPulse {
                    0%   { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.8); }
                    70%  { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(46, 204, 113, 0); }
                    100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(46, 204, 113, 0); }
                }
                #tori-alerter-status {
                    position: fixed;
                    /* Header is 49px tall; logo SVG is ~31px.
                       Logo starts at ~16px from left on desktop. */
                    top: 19px;
                    left: 92px;
                    z-index: 2147483647;
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background-color: #2ecc71;
                    box-shadow: 0 0 8px #2ecc71;
                    animation: toriPulse 2s infinite ease-in-out;
                    cursor: help;
                }
            `;
            document.head.appendChild(style);
        }

        const dot = document.createElement('div');
        dot.id = 'tori-alerter-status';
        dot.title = 'Tori Alerter Active';
        document.body.appendChild(dot);
        console.log('[Tori Alert] Status indicator injected.');
    }

    // --- Shadow root observer ---
    let observedShadowRoot = null;

    function startRootObserver() {
        const finnTopbar = document.querySelector('finn-topbar');
        if (!finnTopbar?.shadowRoot) { setTimeout(startRootObserver, 300); return; }
        if (observedShadowRoot === finnTopbar.shadowRoot) return;
        observedShadowRoot = finnTopbar.shadowRoot;

        new MutationObserver(() => {
            if (!notifObserver || !findInAllShadows(document, 'notification-bubble')) {
                notifObserver = null;
                attachNotifObserver();
            }
            if (!messageObserver || !findInAllShadows(document, 'messaging-icon')) {
                messageObserver = null;
                attachMessageObserver();
            }
        }).observe(finnTopbar.shadowRoot, { childList: true, subtree: true });

        console.log('[Tori Alert] Shadow root observer started.');
    }

    // --- Light DOM observer ---
    let lightDomObserver = null;

    function startLightDomObserver() {
        if (lightDomObserver) return;
        lightDomObserver = new MutationObserver(() => startRootObserver());
        lightDomObserver.observe(document.body, { childList: true, subtree: true });
        console.log('[Tori Alert] Light DOM observer started.');
    }

    // Polling fallback every 2s
    setInterval(() => {
        attachNotifObserver();
        attachMessageObserver();
        injectStatusIcon();
        checkNotification();
        checkMessages();
        startRootObserver();
    }, 2000);

    // --- SPA navigation ---
    function onNavigate() {
        console.log('[Tori Alert] Navigation detected, re-initialising.');
        notifObserver = null;
        messageObserver = null;
        finnTopbarAttrObserver = null;
        observedShadowRoot = null;
        const old = document.getElementById('tori-alerter-status');
        if (old) old.remove();
        setTimeout(init, 1200);
    }

    window.addEventListener('popstate', onNavigate);

    const _pushState = history.pushState.bind(history);
    history.pushState = function (...args) { _pushState(...args); onNavigate(); };

    const _replaceState = history.replaceState.bind(history);
    history.replaceState = function (...args) { _replaceState(...args); onNavigate(); };

    // --- Init ---
    function init() {
        const finnTopbar = document.querySelector('finn-topbar');
        if (!finnTopbar) { setTimeout(init, 300); return; }

        attachMessageObserver();

        if (!finnTopbar.shadowRoot) { setTimeout(init, 300); return; }

        const logoLink = findInAllShadows(document, 'a[data-automation-id="frontpage-link"]');
        if (!logoLink) { setTimeout(init, 300); return; }

        console.log('[Tori Alert] Initialising — nav ready.');
        injectStatusIcon();
        attachNotifObserver();
        startRootObserver();
        startLightDomObserver();
    }

    if (document.body) { init(); } else { window.addEventListener('DOMContentLoaded', init); }
})();
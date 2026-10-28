// Basic consent mode: do not contact Google until analytics is accepted.
(() => {
    'use strict';
    const measurementId = 'G-ECX1QTM93L';
    const consentKey = 'scrumAnalyticsConsent';
    let started = false;
    const readConsent = () => { try { return localStorage.getItem(consentKey); } catch { return null; } };
    const safeLocation = () => location.origin + (location.pathname.startsWith('/room/') ? '/room/' : '/');
    function start() {
        if (started) return;
        started = true;
        window['ga-disable-' + measurementId] = false;
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('consent', 'default', {
            analytics_storage: 'granted', ad_storage: 'denied',
            ad_user_data: 'denied', ad_personalization: 'denied'
        });
        window.gtag('js', new Date());
        window.gtag('config', measurementId, {
            send_page_view: false,
            allow_google_signals: false,
            allow_ad_personalization_signals: false,
            page_location: safeLocation(), page_referrer: '',
            page_title: 'Scrum Poker'
        });
        window.gtag('event', 'page_view', { page_location: safeLocation(), page_referrer: '', page_title: 'Scrum Poker' });
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
        document.head.appendChild(script);
    }
    function setConsent(accepted) {
        try { localStorage.setItem(consentKey, accepted ? 'granted' : 'denied'); } catch { /* Keep the choice for this page. */ }
        document.getElementById('analytics-consent').hidden = true;
        if (accepted) start();
        else {
            window['ga-disable-' + measurementId] = true;
            if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' });
            // Remove first-party Analytics cookies after withdrawal.
            for (const cookie of document.cookie.split(';')) {
                const name = cookie.split('=')[0].trim();
                if (!/^_ga(?:_|$)/.test(name)) continue;
                const domains = ['', location.hostname, '.' + location.hostname];
                const parts = location.hostname.split('.');
                while (parts.length > 2) { parts.shift(); domains.push('.' + parts.join('.')); }
                for (const domain of domains) document.cookie = name + '=; Max-Age=0; path=/' + (domain ? '; domain=' + domain : '');
            }
        }
    }
    window.addEventListener('DOMContentLoaded', () => {
        const banner = document.createElement('section');
        banner.id = 'analytics-consent';
        banner.setAttribute('aria-label', 'Analytics preferences');
        banner.className = 'analytics-consent';
        banner.innerHTML = '<p>Help improve Scrum Poker with optional analytics cookies. <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">Privacy details</a></p><button type="button" data-choice="accept">Allow</button> <button type="button" data-choice="reject">No thanks</button>';
        banner.querySelector('[data-choice="accept"]').addEventListener('click', () => setConsent(true));
        banner.querySelector('[data-choice="reject"]').addEventListener('click', () => setConsent(false));
        const mountBanner = () => (document.querySelector('#gameSection:not(.d-none)') || document.querySelector('.join-container') || document.body).appendChild(banner);
        mountBanner();
        const preferences = document.createElement('button');
        preferences.type = 'button';
        preferences.textContent = 'Privacy';
        preferences.setAttribute('aria-label', 'Analytics preferences');
        preferences.className = 'analytics-preferences';
        preferences.addEventListener('click', () => { mountBanner(); banner.hidden = false; banner.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
        document.body.appendChild(preferences);
        const choice = readConsent();
        banner.hidden = choice !== null;
        if (choice === 'granted') start();
    });
})();

// GA4 page views with analytics cookies; no injected interface.
(() => {
    'use strict';
    const measurementId = 'G-ECX1QTM93L';
    let started = false;
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
    // Usage events carry no room names, user names or other identifiers.
    window.trackGameStart = () => {
        if (typeof window.gtag === 'function') window.gtag('event', 'game_start', { page_location: safeLocation() });
    };
    start();
})();

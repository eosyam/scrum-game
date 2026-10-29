// GA4 page views and privacy-bounded usage events with analytics cookies; no injected interface.
// Nothing is sent from localhost.
(() => {
    'use strict';
    const measurementId = 'G-ECX1QTM93L';
    let started = false;
    const safeLocation = () => location.origin + (location.pathname.startsWith('/room/') ? '/room/' : '/');
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    function start() {
        if (started || isLocal) return;
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
    // Usage events carry no room names, user names or other identifiers. Each event has an
    // allowlist of params with enumerated values; anything else is dropped before gtag sees it.
    const events = {
        game_start: {},
        join_room: { role: ['master', 'participant'] },
        join_error: { reason: ['room_full', 'room_limit', 'name_taken', 'other'] },
        vote_cast: {},
        votes_revealed: { participant_bucket: ['1', '2-4', '5-9', '10+'] },
        round_reset: {},
        reaction_sent: {},
        nudge_sent: {},
        break_request: {},
        question_raised: {},
        story_updated: {}
    };
    window.trackBucket = (count) => count >= 10 ? '10+' : count >= 5 ? '5-9' : count >= 2 ? '2-4' : '1';
    window.track = (name, params) => {
        const schema = Object.prototype.hasOwnProperty.call(events, name) ? events[name] : null;
        if (!schema || typeof window.gtag !== 'function') return;
        const clean = { page_location: safeLocation() };
        for (const key of Object.keys(schema)) {
            if (params && schema[key].includes(params[key])) clean[key] = params[key];
        }
        window.gtag('event', name, clean);
    };
    window.trackGameStart = () => window.track('game_start');
    start();
})();

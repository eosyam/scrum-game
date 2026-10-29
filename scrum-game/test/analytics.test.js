const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
    const nodes = [];
    const document = {
        head: { appendChild(node) { nodes.push(node); } },
        createElement(tag) { assert.equal(tag, 'script'); return {}; }
    };
    const window = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../analytics.js'), 'utf8'), {
        window, document,
        location: { origin: 'https://example.com', pathname: '/room/private-team', search: '?email=secret@example.com', hash: '#private' }
    });
    return { window, nodes, commands: window.dataLayer.map(args => Array.from(args)) };
}

test('GA loads with analytics storage enabled and no interface injection', () => {
    const app = setup();
    assert.equal(app.nodes.length, 1);
    assert.equal(app.nodes[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-ECX1QTM93L');
    const consent = app.commands.find(args => args[0] === 'consent')[2];
    assert.equal(consent.analytics_storage, 'granted');
    for (const key of ['ad_storage', 'ad_user_data', 'ad_personalization']) assert.equal(consent[key], 'denied');
});

test('page views exclude room identifiers and advertising signals', () => {
    const app = setup();
    const config = app.commands.find(args => args[0] === 'config')[2];
    assert.equal(config.page_location, 'https://example.com/room/');
    assert.equal(config.page_referrer, '');
    assert.equal(config.allow_google_signals, false);
    assert.equal(config.allow_ad_personalization_signals, false);
    assert.equal(app.commands.filter(args => args[0] === 'event' && args[1] === 'page_view').length, 1);
    assert.ok(!JSON.stringify(app.commands).includes('private-team'));
    assert.ok(!JSON.stringify(app.commands).includes('secret@example.com'));
});

test('game_start event carries no room identifiers', () => {
    const app = setup();
    app.window.trackGameStart();
    const events = app.window.dataLayer.map(args => Array.from(args)).filter(args => args[0] === 'event' && args[1] === 'game_start');
    assert.equal(events.length, 1);
    assert.equal(events[0][2].page_location, 'https://example.com/room/');
    assert.ok(!JSON.stringify(events).includes('private-team'));
});

test('Nodemailer upgrade can still compose the feedback email', async () => {
    const transport = require('nodemailer').createTransport({ streamTransport: true, buffer: true });
    const result = await transport.sendMail({ from: 'sender@example.com', to: 'owner@example.com', subject: 'Feedback', html: '<p>Safe feedback</p>' });
    assert.match(result.message.toString(), /Safe feedback/);
});

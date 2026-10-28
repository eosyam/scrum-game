const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(choice) {
    const nodes = [], listeners = {}, handlers = {};
    const banner = {
        setAttribute() {}, hidden: false,
        querySelector(selector) { return { addEventListener(event, handler) { handlers[selector] = handler; } }; }
    };
    const document = {
        cookie: '',
        querySelector() { return null; },
        head: { appendChild(node) { nodes.push(node); } },
        body: { appendChild() {} },
        createElement(tag) { return tag === 'section' ? banner : { addEventListener() {}, setAttribute() {} }; },
        getElementById() { return banner; }
    };
    const window = { addEventListener(event, handler) { listeners[event] = handler; } };
    const context = {
        window, document,
        localStorage: { getItem() { return choice; }, setItem(key, value) { choice = value; } },
        location: { origin: 'https://example.com', pathname: '/room/private-team', hostname: 'example.com', search: '?email=secret@example.com', hash: '#private' }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../analytics.js'), 'utf8'), context);
    listeners.DOMContentLoaded();
    return { window, nodes, handlers, banner };
}

test('Google is never loaded before consent or after rejection', () => {
    for (const choice of [null, 'denied']) {
        const app = setup(choice);
        assert.equal(app.nodes.length, 0);
        assert.equal(app.window.dataLayer, undefined);
        app.handlers['[data-choice="reject"]']();
        assert.equal(app.nodes.length, 0);
    }
});

test('accepted analytics removes room identifiers and disables advertising', () => {
    const app = setup(null);
    app.handlers['[data-choice="accept"]']();
    assert.equal(app.nodes.length, 1);
    assert.match(app.nodes[0].src, /G-ECX1QTM93L/);
    const commands = app.window.dataLayer.map(args => Array.from(args));
    const config = commands.find(args => args[0] === 'config')[2];
    assert.equal(config.page_location, 'https://example.com/room/');
    assert.equal(config.page_referrer, '');
    assert.equal(config.allow_google_signals, false);
    assert.equal(config.allow_ad_personalization_signals, false);
    assert.ok(!JSON.stringify(commands).includes('private-team'));
    assert.ok(!JSON.stringify(commands).includes('secret@example.com'));
    app.handlers['[data-choice="reject"]']();
    assert.equal(app.window['ga-disable-G-ECX1QTM93L'], true);
});

test('Nodemailer upgrade can still compose the feedback email', async () => {
    const transport = require('nodemailer').createTransport({ streamTransport: true, buffer: true });
    const result = await transport.sendMail({ from: 'sender@example.com', to: 'owner@example.com', subject: 'Feedback', html: '<p>Safe feedback</p>' });
    assert.match(result.message.toString(), /Safe feedback/);
});

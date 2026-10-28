const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: client } = require('socket.io-client');
const { server, io } = require('../index');
let base;
const clients = [];
const delay = () => new Promise(resolve => setTimeout(resolve, 80));
const event = (socket, name) => Promise.race([
    once(socket, name),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Missing ' + name)), 2000); timer.unref(); })
]);
async function connect() {
    const socket = client(base, { transports: ['websocket'], reconnection: false });
    clients.push(socket);
    await event(socket, 'connect');
    return socket;
}
async function join(socket, room, name, isMaster = false, resumeToken) {
    const response = event(socket, 'joinedRoom');
    socket.emit('joinRoom', { room, name, isMaster, resumeToken });
    return (await response)[0];
}
before(async () => {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { clients.forEach(socket => socket.disconnect()); await new Promise(resolve => io.close(resolve)); });

test('only browser assets are public', async () => {
    for (const path of ['/index.js', '/package.json', '/package-lock.json', '/index.html.backup', '/node_modules/express/package.json', '/.env']) {
        assert.equal((await fetch(base + path)).status, 404, path);
    }
    for (const path of ['/', '/index.css', '/room/example', '/health']) assert.equal((await fetch(base + path)).status, 200, path);
});

test('feedback requires admin authentication and renders injected markup as text', async () => {
    delete process.env.FEEDBACK_ADMIN_TOKEN;
    assert.equal((await fetch(base + '/api/feedbacks')).status, 404);
    process.env.FEEDBACK_ADMIN_TOKEN = 'test-only-secret';
    assert.equal((await fetch(base + '/feedbacks')).status, 401);
    assert.equal((await fetch(base + '/api/feedbacks')).status, 401);
    const post = body => fetch(base + '/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    for (const rating of [-1, 0, 6, 1e10, '5', {}]) assert.equal((await post({ rating, message: 'test' })).status, 400);
    assert.equal((await post(null)).status, 400);
    assert.equal((await post({ rating: 5, message: '<img src=x onerror=alert(1)>', email: '<svg onload=alert(1)>', room: '<script>alert(1)</script>' })).status, 200);
    const headers = { authorization: 'Basic ' + Buffer.from('admin:test-only-secret').toString('base64') };
    const data = await (await fetch(base + '/api/feedbacks', { headers })).json();
    assert.equal(data.feedbacks.length, 1);
    for (const key of ['email', 'message', 'room']) assert.ok(!data.feedbacks[0][key].includes('<'));
    assert.equal((await fetch(base + '/feedbacks', { headers })).status, 200);
});

test('malformed events and prototype room names do not crash the server', async () => {
    const socket = await connect();
    for (const name of ['joinRoom', 'vote', 'updateStory', 'sendReaction', 'autoAway']) {
        socket.emit(name); socket.emit(name, null); socket.emit(name, {});
    }
    await join(socket, '__proto__', 'safe', true);
    assert.equal((await fetch(base + '/health')).status, 200);
});

test('names cannot hijack sessions, master role is server-owned, and tokens stay private', async () => {
    const master = await connect(), attacker = await connect();
    const original = await join(master, 'identity', 'Owner', true);
    const rejected = event(attacker, 'joinError');
    attacker.emit('joinRoom', { room: 'identity', name: 'Owner', isMaster: true });
    await rejected;
    const usersPromise = event(master, 'updateUsers');
    assert.equal((await join(attacker, 'identity', 'Attacker', true)).isMaster, false);
    const [users] = await usersPromise;
    assert.ok(!JSON.stringify(users).includes(original.resumeToken));
    const restored = await connect();
    assert.equal((await join(restored, 'identity', 'Owner', false, original.resumeToken)).isMaster, true);
    assert.equal(io.sockets.sockets.get(master.id).data.room, undefined);
});

test('votes stay hidden over the wire until reveal; outsiders cannot mutate rooms', async () => {
    const master = await connect(), voter = await connect(), outsider = await connect();
    await join(master, 'voting', 'Master', true);
    await join(voter, 'voting', 'Voter');
    await join(outsider, 'other', 'Other', true);
    let update = event(master, 'updateUsers');
    voter.emit('vote', { room: 'voting', vote: '13' });
    let [users] = await update;
    assert.equal(users[voter.id].vote, 'voted');
    outsider.emit('resetVotes', 'voting');
    outsider.emit('a', 'voting');
    voter.emit('resetVotes', 'voting');
    await delay();
    const revealed = event(voter, 'updateVotes');
    master.emit('showVotes', 'voting');
    [users] = await revealed;
    assert.equal(users[voter.id].vote, '13');
    update = event(master, 'hideVotes');
    voter.emit('vote', { room: 'voting', vote: '8' });
    [users] = await update;
    assert.equal(users[voter.id].vote, 'voted');
    const reset = event(voter, 'votesReset');
    master.emit('resetVotes', 'voting');
    [users] = await reset;
    assert.equal(users[voter.id].vote, null);
});

test('a room name cannot subscribe to private socket messages', async () => {
    const owner = await connect(), attacker = await connect();
    await join(owner, 'private', 'Owner', true);
    await join(attacker, owner.id, 'Attacker');
    let leaked = false;
    attacker.on('privateTest', () => { leaked = true; });
    io.to(owner.id).emit('privateTest');
    await delay();
    assert.equal(leaked, false);
});

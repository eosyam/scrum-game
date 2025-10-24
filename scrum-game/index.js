require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    pingTimeout: 60000,      // 60 saniye cevap yoksa disconnect
    pingInterval: 25000,     // Her 25 saniyede sunucu ping gönderir
    connectTimeout: 45000,   // Bağlantı timeout'u
    upgradeTimeout: 30000,   // WebSocket upgrade timeout'u
});

let rooms = {};
let disconnectTimers = {}; // Track disconnect timers for 5-minute grace period
let feedbacks = []; // In-memory feedback storage

const PORT = process.env.PORT || 3000;
const AWAY_GRACE_PERIOD = 5 * 60 * 1000; // 5 minutes in milliseconds

app.use(express.json()); // Parse JSON request bodies
app.use(express.static(path.join(__dirname, '/')));

io.on('connection', (socket) => {

    function encodeHTML(str) {
        str = String(str);
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function isWithinRange(number, average, tolerance) {
        return number >= average - tolerance && number <= average + tolerance;
    }

    socket.on('joinRoom', ({ room, name, isMaster, avatar }) => {

        room = encodeHTML(room);
        name = encodeHTML(name);
        avatar = encodeHTML(avatar || '👤');

        socket.join(room);
        if (!rooms[room]) rooms[room] = { master: null, users: {}, votesRevealed: false };

        // Check if user with same name exists (reconnection scenario)
        let existingUserId = null;
        let existingUserData = null;

        for (let userId in rooms[room].users) {
            if (rooms[room].users[userId].name === name) {
                existingUserId = userId;
                existingUserData = rooms[room].users[userId];
                break;
            }
        }

        // If reconnecting, restore previous state and cancel disconnect timer
        if (existingUserId && existingUserData) {
            // Cancel disconnect timer if exists
            if (disconnectTimers[existingUserId]) {
                clearTimeout(disconnectTimers[existingUserId]);
                delete disconnectTimers[existingUserId];
            }

            // Remove old user entry
            delete rooms[room].users[existingUserId];

            // Restore state with new socket ID
            rooms[room].users[socket.id] = {
                ...existingUserData,
                socketId: socket.id, // Add socket ID
                isAway: false, // User is back, clear away status
                isMaster: isMaster,
                avatar: avatar // Update avatar on reconnection
            };

            console.log(`User ${name} reconnected to room ${room}`);
        } else {
            // New user joining
            rooms[room].users[socket.id] = {
                name,
                vote: null,
                requestBreak: false,
                hasQuestion: false,
                isAway: false,
                isMaster: isMaster,
                avatar: avatar,
                socketId: socket.id // Add socket ID
            };
        }

        if (isMaster) {
            rooms[room].master = socket.id;
        }

        io.to(room).emit('updateUsers', rooms[room].users);
    });

    socket.on('vote', ({ room, vote }) => {

        room = encodeHTML(room);
        vote = encodeHTML(vote);

        if (rooms[room] && rooms[room].users[socket.id]) {
            rooms[room].users[socket.id].vote = vote;

            // If votes were revealed and someone changes their vote, hide votes on all clients
            if (rooms[room].votesRevealed) {
                rooms[room].votesRevealed = false;
                // Send hideVotes event to all clients to hide votes but keep the vote data
                io.to(room).emit('hideVotes', rooms[room].users);
            } else {
                // Normal vote update
                io.to(room).emit('updateUsers', rooms[room].users);
            }
        }
    });


    socket.on('showVotes', (room) => {

        room = encodeHTML(room);

        if (rooms[room] && socket.id === rooms[room].master) {

            // Mark votes as revealed
            rooms[room].votesRevealed = true;

            const users = rooms[room].users;
            let totalVotes = 0;
            let validVotes = []; // Numeric votes only (excluding coffee, away, null)

            // Collect valid numeric votes (exclude Scrum Master)
            for (const userId in users) {
                if (users.hasOwnProperty(userId)) {
                    const user = users[userId];
                    const vote = user.vote;
                    const isAway = user.isAway;
                    const isMaster = user.isMaster;
                    // Check if vote is numeric, not away, not coffee, and not from Scrum Master
                    if (!isNaN(vote) && vote !== null && vote !== '' && !isAway && vote !== '☕' && !isMaster) {
                        const numericVote = Number(vote);
                        validVotes.push(numericVote);
                        totalVotes++;
                    }
                }
            }

            // Calculate statistics
            let average = 0;
            let mostCommon = 0;
            let consensus = 0;

            if (validVotes.length > 0) {
                // Calculate average
                const sum = validVotes.reduce((a, b) => a + b, 0);
                average = (sum / validVotes.length).toFixed(1);

                // Calculate most common vote (mode)
                const voteCounts = {};
                validVotes.forEach(vote => {
                    voteCounts[vote] = (voteCounts[vote] || 0) + 1;
                });

                // Find the most common vote(s)
                const maxCount = Math.max(...Object.values(voteCounts));
                const mostCommonVotes = Object.keys(voteCounts).filter(vote => voteCounts[vote] === maxCount);

                // If there's a tie, show all tied values
                if (mostCommonVotes.length === 1) {
                    mostCommon = mostCommonVotes[0];
                } else {
                    mostCommon = mostCommonVotes.join(', ');
                }

                // Calculate consensus (percentage of most common vote)
                consensus = Math.round((maxCount / validVotes.length) * 100);
            }

            // Send statistics to client
            const statistics = {
                average: average || '-',
                median: mostCommon || '-',
                consensus: validVotes.length > 0 ? `${consensus}%` : '-'
            };

            io.to(room).emit('updateVotes', rooms[room].users, totalVotes, statistics);
        }
    });

    socket.on('pulseDetect', (room) => {
        io.to(room).emit('pulseDetected'); 
    });

    socket.on('a', (room) => {

        room = encodeHTML(room);

        if (rooms[room]) {
            for (let userId in rooms[room].users) {
                rooms[room].users[userId].vote = null;
            }
            io.to(room).emit('a', rooms[room].users);
        }

    });

    socket.on('disconnect', () => {
        for (let room in rooms) {
            if (rooms[room].users[socket.id]) {
                const user = rooms[room].users[socket.id];

                // Mark user as away immediately
                rooms[room].users[socket.id].isAway = true;
                io.to(room).emit('updateUsers', rooms[room].users);

                console.log(`User ${user.name} disconnected from room ${room}, starting 5-min grace period`);

                // Set 5-minute timer before removing user
                disconnectTimers[socket.id] = setTimeout(() => {
                    console.log(`Grace period expired for ${user.name}, removing from room ${room}`);

                    // Check if user still exists and hasn't reconnected
                    if (rooms[room] && rooms[room].users[socket.id]) {
                        delete rooms[room].users[socket.id];
                        io.to(room).emit('updateUsers', rooms[room].users);
                    }

                    // Clean up timer reference
                    delete disconnectTimers[socket.id];
                }, AWAY_GRACE_PERIOD);
            }
        }
    });


    socket.on('resetVotes', (room) => {

        room = encodeHTML(room);

        if (rooms[room]) {
            rooms[room].votesRevealed = false;
            for (let userId in rooms[room].users) {
                rooms[room].users[userId].vote = null;
            }
            io.to(room).emit('votesReset', rooms[room].users);
        }
    });

    socket.on('breakRequest', ({ room, requestBreak }) => {

        room = encodeHTML(room);

        if (rooms[room] && rooms[room].users[socket.id]) {
            rooms[room].users[socket.id].requestBreak = requestBreak;
            io.to(room).emit('updateUsers', rooms[room].users);
        }
    });

    socket.on('question', ({ room, hasQuestion }) => {

        room = encodeHTML(room);

        if (rooms[room] && rooms[room].users[socket.id]) {
            rooms[room].users[socket.id].hasQuestion = hasQuestion;
            io.to(room).emit('updateUsers', rooms[room].users);
        }
    });

    socket.on('autoAway', ({ room, isAway }) => {

        room = encodeHTML(room);

        if (rooms[room] && rooms[room].users[socket.id]) {
            rooms[room].users[socket.id].isAway = isAway;
            io.to(room).emit('updateUsers', rooms[room].users);
        }
    });

    socket.on('sendVibration', ({ room, targetSocketId }) => {

        room = encodeHTML(room);
        targetSocketId = encodeHTML(targetSocketId);

        // Check if sender is Scrum Master
        if (rooms[room] && rooms[room].master === socket.id) {
            // Send vibration to specific user
            io.to(targetSocketId).emit('receiveVibration', {
                from: socket.id,
                room: room
            });
            console.log(`Scrum Master sent vibration to ${targetSocketId} in room ${room}`);
        } else {
            console.log(`Unauthorized vibration attempt by ${socket.id} in room ${room}`);
        }
    });

});

// Feedback endpoint
app.post('/api/feedback', async (req, res) => {
    const { rating, email, message, timestamp, room } = req.body;

    // Log feedback to console immediately
    console.log('=== NEW FEEDBACK RECEIVED ===');
    console.log('Timestamp:', timestamp);
    console.log('Rating:', rating, '/ 5 stars');
    console.log('Email:', email);
    console.log('Room:', room);
    console.log('Message:', message);
    console.log('============================\n');

    // Store feedback in memory
    const feedbackEntry = {
        id: feedbacks.length + 1,
        timestamp,
        rating,
        email,
        room,
        message
    };

    feedbacks.push(feedbackEntry);
    console.log(`✅ Feedback stored (Total: ${feedbacks.length} feedbacks)\n`);

    // Return success immediately
    res.status(200).json({ success: true, message: 'Feedback received and stored' });

    // Send email via Web3Forms (non-blocking)
    if (process.env.WEB3FORMS_KEY) {
        setTimeout(async () => {
            try {
                console.log('📧 Sending email via Web3Forms...');

                const stars = '⭐'.repeat(rating);
                const formattedMessage = `
New Scrum Poker Feedback Received!

${stars} Rating: ${rating} / 5 stars

📧 Contact Email: ${email}
🏠 Room: ${room}
🕐 Timestamp: ${new Date(timestamp).toLocaleString()}

💬 Message:
${message}

---
Sent from Scrum Poker Feedback System
                `.trim();

                const response = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        access_key: process.env.WEB3FORMS_KEY,
                        subject: `Scrum Poker Feedback - ${rating} ⭐ stars`,
                        from_name: 'Scrum Poker Feedback',
                        email: email,
                        message: formattedMessage
                    })
                });

                const result = await response.json();

                if (result.success) {
                    console.log('✅ Email sent successfully via Web3Forms');
                } else {
                    console.error('❌ Web3Forms error:', result.message);
                }
            } catch (error) {
                console.error('❌ Error sending email:', error.message);
            }
        }, 0);
    } else {
        console.log('⚠️ WEB3FORMS_KEY not set - skipping email send\n');
    }
});

// GET endpoint to view all feedbacks (JSON API)
app.get('/api/feedbacks', (req, res) => {
    res.json({
        success: true,
        total: feedbacks.length,
        feedbacks: feedbacks
    });
});

// HTML page to view feedbacks
app.get('/feedbacks', (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Feedback Dashboard - Scrum Poker</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: white;
            text-align: center;
            margin-bottom: 30px;
            font-size: 2.5rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
        }
        .stats {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            display: flex;
            justify-content: space-around;
            flex-wrap: wrap;
        }
        .stat-item {
            text-align: center;
            padding: 10px 20px;
        }
        .stat-number {
            font-size: 2rem;
            font-weight: bold;
            color: #667eea;
        }
        .stat-label {
            color: #666;
            margin-top: 5px;
        }
        .warning {
            background: #fff3cd;
            border: 2px solid #ffc107;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            color: #856404;
            text-align: center;
        }
        .feedback-card {
            background: white;
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            transition: transform 0.2s;
        }
        .feedback-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 12px rgba(0,0,0,0.15);
        }
        .feedback-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 2px solid #f0f0f0;
        }
        .rating {
            font-size: 1.5rem;
        }
        .timestamp {
            color: #999;
            font-size: 0.9rem;
        }
        .feedback-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 15px;
        }
        .info-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .info-label {
            font-weight: 600;
            color: #667eea;
        }
        .feedback-message {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
            white-space: pre-wrap;
            line-height: 1.6;
        }
        .no-feedbacks {
            text-align: center;
            padding: 60px 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .no-feedbacks-icon {
            font-size: 4rem;
            margin-bottom: 20px;
        }
        .no-feedbacks-text {
            color: #666;
            font-size: 1.2rem;
        }
        .refresh-btn {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: #667eea;
            color: white;
            border: none;
            padding: 15px 25px;
            border-radius: 50px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            transition: all 0.3s;
        }
        .refresh-btn:hover {
            background: #5568d3;
            transform: scale(1.05);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📬 Feedback Dashboard</h1>

        <div class="warning">
            ⚠️ Note: Feedbacks are stored in memory and will be cleared on server restart
        </div>

        <div class="stats">
            <div class="stat-item">
                <div class="stat-number" id="total-count">0</div>
                <div class="stat-label">Total Feedbacks</div>
            </div>
            <div class="stat-item">
                <div class="stat-number" id="avg-rating">0.0</div>
                <div class="stat-label">Average Rating</div>
            </div>
        </div>

        <div id="feedbacks-container"></div>
    </div>

    <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>

    <script>
        async function loadFeedbacks() {
            try {
                const response = await fetch('/api/feedbacks');
                const data = await response.json();

                document.getElementById('total-count').textContent = data.total;

                if (data.feedbacks.length > 0) {
                    const avgRating = (data.feedbacks.reduce((sum, f) => sum + f.rating, 0) / data.feedbacks.length).toFixed(1);
                    document.getElementById('avg-rating').textContent = avgRating;

                    const container = document.getElementById('feedbacks-container');
                    container.innerHTML = data.feedbacks
                        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                        .map(feedback => {
                            const stars = '⭐'.repeat(feedback.rating);
                            const date = new Date(feedback.timestamp).toLocaleString();

                            return \`
                                <div class="feedback-card">
                                    <div class="feedback-header">
                                        <div class="rating">\${stars}</div>
                                        <div class="timestamp">\${date}</div>
                                    </div>
                                    <div class="feedback-info">
                                        <div class="info-item">
                                            <span class="info-label">📧 Email:</span>
                                            <span>\${feedback.email}</span>
                                        </div>
                                        <div class="info-item">
                                            <span class="info-label">🏠 Room:</span>
                                            <span>\${feedback.room}</span>
                                        </div>
                                    </div>
                                    <div class="feedback-message">
                                        💬 \${feedback.message}
                                    </div>
                                </div>
                            \`;
                        }).join('');
                } else {
                    document.getElementById('feedbacks-container').innerHTML = \`
                        <div class="no-feedbacks">
                            <div class="no-feedbacks-icon">📭</div>
                            <div class="no-feedbacks-text">No feedbacks yet</div>
                        </div>
                    \`;
                }
            } catch (error) {
                console.error('Error loading feedbacks:', error);
            }
        }

        loadFeedbacks();
    </script>
</body>
</html>
    `;
    res.send(html);
});

server.listen(PORT, () => {
    console.log('Server listening on port 3000');
    console.log('\n📋 Feedback System: Active');
    console.log('   📊 View feedbacks dashboard: /feedbacks');
    console.log('   📡 API endpoint: /api/feedbacks');

    if (process.env.WEB3FORMS_KEY) {
        console.log('   📧 Email notifications: Enabled (Web3Forms)');
    } else {
        console.log('   ⚠️  Email notifications: Disabled (WEB3FORMS_KEY not set)');
    }

    console.log('   💾 Storage: In-memory (reset on server restart)\n');
});

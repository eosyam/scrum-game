require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const nodemailer = require('nodemailer');

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

const PORT = process.env.PORT || 3000;
const AWAY_GRACE_PERIOD = 5 * 60 * 1000; // 5 minutes in milliseconds

// Email configuration (Gmail SMTP)
// To use this, you need to:
// 1. Enable 2-factor authentication on your Gmail account
// 2. Generate an "App Password" from Google Account settings
// 3. Set EMAIL_USER and EMAIL_PASS environment variables or replace the values below
const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'eray.buykor@gmail.com',  // Replace with your email
        pass: process.env.EMAIL_PASS || ''  // Replace with your App Password (NOT your regular password!)
    }
});

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

    // Log feedback to console
    console.log('=== NEW FEEDBACK RECEIVED ===');
    console.log('Timestamp:', timestamp);
    console.log('Rating:', rating, '/ 5 stars');
    console.log('Email:', email);
    console.log('Room:', room);
    console.log('Message:', message);
    console.log('============================\n');

    // Send email to eray.buykor@gmail.com
    const mailOptions = {
        from: process.env.EMAIL_USER || 'eray.buykor@gmail.com',
        to: 'eray.buykor@gmail.com',
        subject: `Scrum Poker Feedback - ${rating} ⭐ stars`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f7fa; border-radius: 10px;">
                <h2 style="color: #667eea; border-bottom: 3px solid #667eea; padding-bottom: 10px;">📬 New Scrum Poker Feedback</h2>

                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 10px 0;"><strong>⭐ Rating:</strong> ${rating} / 5 stars</p>
                    <p style="margin: 10px 0;"><strong>📧 Email:</strong> ${email}</p>
                    <p style="margin: 10px 0;"><strong>🏠 Room:</strong> ${room}</p>
                    <p style="margin: 10px 0;"><strong>🕐 Timestamp:</strong> ${new Date(timestamp).toLocaleString()}</p>
                </div>

                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #48bb78; margin-top: 0;">💬 Message:</h3>
                    <p style="white-space: pre-wrap; line-height: 1.6;">${message}</p>
                </div>

                <p style="color: #718096; font-size: 12px; text-align: center; margin-top: 20px;">
                    Sent from Scrum Poker Feedback System
                </p>
            </div>
        `
    };

    try {
        const info = await emailTransporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully:', info.response);
        res.status(200).json({ success: true, message: 'Feedback received and email sent' });
    } catch (error) {
        console.error('❌ Error sending email:', error.message);
        // Still return success to user even if email fails (feedback is logged)
        res.status(200).json({ success: true, message: 'Feedback received (email pending)' });
    }
});

server.listen(PORT, () => {
    console.log('Server listening on port 3000');
});

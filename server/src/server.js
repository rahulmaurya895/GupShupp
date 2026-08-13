const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e8
});

// Rate limiting middleware
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 200,
    message: { error: "Rate limit exceeded. Please try again later." }
});
app.use(apiLimiter);
app.use(express.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gupshupp";
mongoose.connect(MONGO_URI)
    .then(() => console.log(`🚀 [Database] Connected to MongoDB Successfully`))
    .catch((err) => console.log(`❌ [Database Connection Error]: ${err.message}`));

// Schemas
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
    room: { type: String, required: true, index: true },
    sender: { type: String, required: true },
    text: { type: String, required: true },
    time: { type: String },
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// Base Status Route
app.get('/', (req, res) => {
    res.json({
        status: "Online",
        app: "GupShupp Realtime Chat & Auth Engine",
        database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
        activeConnections: io.engine.clientsCount
    });
});

// Auth Routes
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: "Username and password required" });
        }
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Username already exists" });
        }

        const newUser = new User({ username, password });
        await newUser.save();
        console.log(`👤 [Auth] New user registered: ${username}`);
        res.json({ success: true, message: "User registered successfully", username });
    } catch (err) {
        console.error("Register error:", err);
        res.status(500).json({ success: false, message: "Server error during registration" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid username or password" });
        }

        console.log(`🔑 [Auth] User logged in: ${username}`);
        res.json({ success: true, message: "Login successful", username });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, message: "Server error during login" });
    }
});

// Socket.io Real-Time Engine
io.on('connection', (socket) => {
    console.log(`🔌 [Socket Connected] ID: ${socket.id}`);

    // Join a room / group
    socket.on('join_room', async ({ room, username }) => {
        if (!room) return;
        socket.join(room);
        console.log(`👥 [Room Join] ${username || 'Anonymous'} joined room: "${room}" (Socket: ${socket.id})`);

        try {
            // Load persistent chat history for this specific room
            const history = await Message.find({ room })
                .sort({ timestamp: 1 })
                .limit(50)
                .lean();
            
            socket.emit('load_history', history);
        } catch (err) {
            console.error(`Error loading history for room ${room}:`, err);
        }

        // Notify other room members
        if (username) {
            socket.to(room).emit('receive_message', {
                room,
                sender: 'System',
                text: `${username} joined the chat 👋`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isSystem: true
            });
        }
    });

    // Send a message in a room
    socket.on('send_message', async (msgData) => {
        const { room, sender, text, time } = msgData;
        if (!room || !text) return;

        const messageTime = time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        try {
            // Save to MongoDB
            const newMessage = new Message({
                room,
                sender,
                text,
                time: messageTime,
                timestamp: new Date()
            });
            const saved = await newMessage.save();

            const broadcastData = {
                _id: saved._id,
                room,
                sender,
                text,
                time: messageTime
            };

            // Broadcast to other peers in the room
            socket.to(room).emit('receive_message', broadcastData);
        } catch (err) {
            console.error("Failed to save message to MongoDB:", err);
            // Even if DB fails, still broadcast in real-time
            socket.to(room).emit('receive_message', { room, sender, text, time: messageTime });
        }
    });

    // Leave a room
    socket.on('leave_room', ({ room, username }) => {
        if (!room) return;
        socket.leave(room);
        console.log(`👋 [Room Leave] ${username} left room: "${room}"`);
        if (username) {
            socket.to(room).emit('receive_message', {
                room,
                sender: 'System',
                text: `${username} left the chat`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isSystem: true
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ [Socket Disconnected] ID: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`==========================================`);
    console.log(`🚀 GupShupp BACKEND SERVER RUNNING on Port ${PORT}`);
    console.log(`==========================================`);
});

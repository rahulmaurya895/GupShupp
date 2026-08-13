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

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 200,
    message: { error: "Rate limit exceeded." }
});
app.use(apiLimiter);
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gupshupp";
mongoose.connect(MONGO_URI)
    .then(() => console.log(`?? [Database] Connected to MongoDB Successfully`))
    .catch((err) => console.log(`? [Database Connection Error]: ${err}`));

// User Schema for Authentication
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Message Schema
const messageSchema = new mongoose.Schema({
    text: String,
    sender: String,
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

app.get('/', (req, res) => {
    res.json({
        status: "Online",
        app: "GupShupp Auth & Database Engine",
        database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected"
    });
});

// Authentication Routes: Register & Login
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: "Username and password required" });
        
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ success: false, message: "Username already exists" });

        const newUser = new User({ username, password });
        await newUser.save();
        console.log(`?? [Auth] New user registered: ${username}`);
        res.json({ success: true, message: "User registered successfully", username });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error during registration" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) return res.status(400).json({ success: false, message: "Invalid username or password" });

        console.log(`?? [Auth] User logged in: ${username}`);
        res.json({ success: true, message: "Login successful", username });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error during login" });
    }
});

io.on('connection', (socket) => {
    console.log(`?? [Auth Hub] Client Connected: ${socket.id}`);

    Message.find().sort({ timestamp: 1 }).limit(50).then((history) => {
        socket.emit('load_history', history);
    }).catch(err => console.log("Error loading history:", err));

    socket.on('send_secure_message', async (encryptedData) => {
        try {
            const newMessage = new Message({ text: encryptedData, sender: 'peer' });
            await newMessage.save();
        } catch (err) {
            console.log("Failed to save message:", err);
        }
        socket.broadcast.emit('receive_secure_message', encryptedData);
    });

    socket.on('ask_ai_assistant', (promptData) => {
        setTimeout(() => {
            const aiReply = {
                id: Date.now().toString(),
                text: `?? GupShupp Auth AI: Analyzed -> "${promptData.text}"`,
                sender: 'ai',
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            socket.emit('receive_ai_response', aiReply);
        }, 800);
    });

    socket.on('send_media_message', async (mediaData) => {
        try {
            const newMedia = new Message({ text: mediaData.text, sender: mediaData.sender });
            await newMedia.save();
        } catch (err) {
            console.log("Failed to save media:", err);
        }
        socket.broadcast.emit('receive_media_message', mediaData);
    });

    socket.on('disconnect', () => {
        console.log(`?? [Auth Hub] Client Disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`==========================================`);
    console.log(`?? GupShupp SERVER WITH AUTH LIVE on Port ${PORT}`);
    console.log(`==========================================`);
});

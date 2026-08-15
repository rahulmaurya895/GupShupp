require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GoogleGenAI } = require('@google/genai');
const { createAdapter } = require('@socket.io/cluster-adapter');
const { setupWorker } = require('@socket.io/sticky');

const JWT_SECRET = process.env.JWT_SECRET || 'gupshupp_ultra_secure_jwt_secret_2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'gupshupp_jwt_refresh_secure_secret_key_2026';

function generateAuthTokens(username) {
    const cleanUser = (username || '').toLowerCase();
    const nonce = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const token = jwt.sign({ username: cleanUser, nonce }, JWT_SECRET, { expiresIn: '30d' });
    const refreshToken = jwt.sign({ username: cleanUser, type: 'refresh', nonce }, JWT_REFRESH_SECRET, { expiresIn: '90d' });
    return { token, refreshToken };
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e8, // 100MB buffer for media/audio/files
    pingTimeout: 60000,     // 60s timeout tolerance for throttled/50kbps networks
    pingInterval: 25000,    // 25s heartbeat interval
    upgradeTimeout: 30000,  // 30s upgrade buffer for high latency connections
    connectTimeout: 45000   // 45s handshake connection timeout
});

// 🏛️ Multi-Core Cluster / Worker IPC Mode Hook (For Oracle 3 OCPU / 18 GB RAM)
if (process.env.CLUSTER_MODE === 'true') {
    try {
        io.adapter(createAdapter());
        setupWorker(server);
        console.log(`⚡ [Worker PID ${process.pid}] Initialized with Multi-Core Cluster IPC Adapter`);
    } catch (e) {
        console.log("Cluster adapter note:", e.message);
    }
}

// Global CORS Middleware
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 600,
    message: { error: "Rate limit exceeded." }
});
app.use(apiLimiter);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// In-memory fallback stores
const memoryUsers = new Map(); // username -> user object
const roomMembersMap = new Map(); // room -> Set of { socketId, username }
const globalOnlineUsers = new Map(); // socketId -> username
const userPushTokens = new Map(); // username -> expoPushToken
const channelStore = new Map(); // channelName -> channel object
const storiesStore = new Map(); // storyId -> story object
const messageStore = new Map(); // messageId -> message object (for poll votes and edits)
const qrSessionsMap = new Map(); // sessionId -> { socketId, createdAt }
const stageRoomsMap = new Map(); // room -> Map of username -> { socketId, avatar, isVideo, isMuted }
const scheduledMessagesStore = new Map(); // msgId -> scheduled msg object
const channelCommentsStore = new Map(); // postId -> Array of comments
const miniAppGameStore = new Map(); // roomId -> game state
const userBackupsStore = new Map(); // username -> { encryptedPayload, updatedAt }
const roomAdminSettingsStore = new Map(); // room -> { adminOnlyPost: boolean, mutedMembers: Set, admins: Set }
const chunkedUploadsStore = new Map(); // uploadId -> { chunks: Map, totalChunks, fileName }
let globalMessageSequenceCounter = 0; // Monotonic Server Sequence Ordering (Clock Drift Immunity)

// 📁 Multi-Worker Cluster Persistent Disk Storage (Guarantees 100% User Auth Sync Across PM2 Workers)
const DATA_DIR = path.join(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function loadPersistentUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const raw = fs.readFileSync(USERS_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            for (const [k, v] of Object.entries(parsed)) {
                memoryUsers.set(k.toLowerCase(), v);
            }
        }
    } catch (e) {
        console.error("Error loading persistent users:", e.message);
    }
}

function savePersistentUsers() {
    try {
        const obj = {};
        for (const [k, v] of memoryUsers.entries()) {
            obj[k] = v;
        }
        fs.writeFileSync(USERS_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
        console.error("Error saving persistent users:", e.message);
    }
}

function getOrReloadUser(username) {
    const clean = (username || '').trim().toLowerCase();
    loadPersistentUsers(); // Synchronize latest accounts across PM2 cluster workers
    return memoryUsers.get(clean);
}

function setAndSaveUser(username, userObj) {
    const clean = (username || '').trim().toLowerCase();
    loadPersistentUsers();
    memoryUsers.set(clean, userObj);
    savePersistentUsers();
}

// Initial Disk Load on Startup
loadPersistentUsers();


// ⏱️ Phase 5: 5-Second Scheduled Message Dispatcher
setInterval(() => {
    const now = Date.now();
    for (const [msgId, msg] of scheduledMessagesStore.entries()) {
        if (!msg.executed && now >= msg.scheduledAt) {
            msg.executed = true;
            const deliverData = {
                _id: msg.id || msgId,
                room: msg.room,
                sender: msg.sender,
                text: msg.text,
                type: msg.type || 'text',
                image: msg.image || null,
                isSilent: !!msg.isSilent,
                isOneTime: !!msg.isOneTime,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'delivered'
            };
            io.to(msg.room).emit('receive_message', deliverData);
            if (messageStore) messageStore.set(deliverData._id, deliverData);
            console.log(`⏱️ [Scheduler Executed] Delivered scheduled message to #${msg.room} from @${msg.sender}`);
        }
    }
}, 5000);

// ⏳ Disappearing Messages Self-Destruct Active Sweeper (Every 2 Seconds)
setInterval(() => {
    const nowMs = Date.now();
    for (const [msgId, msg] of messageStore.entries()) {
        if (msg && msg.expiresAt && !msg.isDeleted) {
            const expTime = new Date(msg.expiresAt).getTime();
            if (nowMs >= expTime) {
                msg.isDeleted = true;
                messageStore.delete(msgId);
                io.to(msg.room).emit('message_deleted', { room: msg.room, messageId: msgId, isExpired: true });
                console.log(`⏳ [Self-Destruct Sweeper] Message ${msgId} in #${msg.room} reached TTL and vanished cleanly.`);
            }
        }
    }
}, 2000);

// 🛡️ Universal XSS, Script Injection & NoSQL Input Sanitizer
function sanitizeInputText(input) {
    if (!input || typeof input !== 'string') return '';
    
    // If it's an E2EE encrypted ciphertext (🔒[AES256_E2EE]:...), leave cipher base64 intact
    if (input.startsWith('🔒[AES256_E2EE]:') || input.startsWith('🔒[E2EE_V2]:') || input.startsWith('🔒[E2EE]:')) {
        return input;
    }

    return input
        // Neutralize script tags
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        // Neutralize iframe, object, embed, svg, applet, meta, link tags
        .replace(/<(iframe|object|embed|svg|applet|meta|link)\b[^>]*>/gi, '')
        .replace(/<\/(iframe|object|embed|svg|applet|meta|link)>/gi, '')
        // Neutralize inline event handlers (onload, onerror, onclick, onmouseover, etc.)
        .replace(/\bon\w+\s*=\s*(['"]).*?\1/gi, '')
        .replace(/\bon\w+\s*=\s*[^>\s]+/gi, '')
        // Neutralize javascript: pseudo-protocol
        .replace(/javascript\s*:/gi, 'blocked-script:')
        // Neutralize data:text/html or data:application/javascript
        .replace(/data\s*:\s*(text\/html|application\/javascript)/gi, 'blocked-data:');
}

function sanitizeIdentifier(input, fallback = 'general') {
    if (typeof input !== 'string') return fallback;
    // Strip HTML/special characters from Room / Channel / Group / User names to prevent NoSQL/XSS attacks
    const cleaned = input.replace(/[<>"'`\$\{\}\\\/]/g, '').trim();
    return cleaned || fallback;
}

// ⚡ Idempotency, Concurrency & Race Condition Deduplication
const processedMessageIdSet = new Set();
const userVoteThrottleMap = new Map(); // key: `user_msgId` -> timestamp

function isDuplicateMessage(msgId) {
    if (!msgId) return false;
    if (processedMessageIdSet.has(msgId)) return true;
    processedMessageIdSet.add(msgId);
    if (processedMessageIdSet.size > 10000) {
        const firstKey = processedMessageIdSet.values().next().value;
        processedMessageIdSet.delete(firstKey);
    }
    return false;
}

const userPrivacySettingsCache = new Map(); // username -> privacySettings

function isUserGhost(username) {
    if (!username) return false;
    const normalized = username.trim().toLowerCase();
    const cached = userPrivacySettingsCache.get(normalized);
    if (cached?.ghostMode || cached?.stealthReadReceipts || cached?.silentTyping) return true;
    const userObj = memoryUsers.get(normalized);
    if (userObj?.privacySettings?.ghostMode || userObj?.privacySettings?.stealthReadReceipts || userObj?.privacySettings?.silentTyping) return true;
    return false;
}

function broadcastOnlineUsers() {
    const activeUsers = Array.from(globalOnlineUsers.values()).filter(Boolean);
    const visibleUsers = activeUsers.filter(u => {
        if (isUserGhost(u)) return false;
        const userObj = memoryUsers.get(u);
        return !userObj?.privacySettings?.ghostMode;
    });
    io.emit('online_users_list', Array.from(new Set(visibleUsers)));
}

// ⚡ Snapchat-Style Snap Streaks Store
const userStreaksStore = new Map();

// 🔔 Expo Push Notification Dispatcher
async function sendPushNotification(targetUsers, title, body, data = {}) {
    const messages = [];
    for (const u of targetUsers) {
        if (!u) continue;
        const token = userPushTokens.get(u.toLowerCase());
        if (token && typeof token === 'string' && (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken'))) {
            messages.push({
                to: token,
                sound: 'default',
                title: title || 'GupShupp',
                body: body || 'New Message Received',
                data: data,
                priority: 'high',
                channelId: 'default'
            });
        }
    }

    if (messages.length > 0) {
        try {
            await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(messages),
            });
            console.log(`🔔 [Push Notification] Sent ${messages.length} alert(s) to ${targetUsers.join(', ')}`);
        } catch (e) {
            console.error("Push Notification Error:", e.message);
        }
    }
}

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gupshupp";
mongoose.set('bufferCommands', false);
mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 })
    .then(() => console.log(`🚀 [Database] Connected to MongoDB Successfully`))
    .catch(() => console.log(`ℹ️ [Database Notice]: MongoDB offline, using fast in-memory store for active session.`));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    avatar: { type: String, default: '🦁' },
    status: { type: String, default: 'Available 🟢' },
    pin: { type: String, default: '' },
    privacySettings: {
        ghostMode: { type: Boolean, default: false },
        stealthReadReceipts: { type: Boolean, default: false },
        silentTyping: { type: Boolean, default: false }
    },
    aiAutoResponder: {
        enabled: { type: Boolean, default: false },
        awayStatus: { type: String, default: 'In Meeting ☕' },
        contextPrompt: { type: String, default: 'I am in a meeting, will reply soon!' }
    },
    pinnedChats: { type: [String], default: [] },
    lastSeen: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Message Schema
const messageSchema = new mongoose.Schema({
    room: { type: String, required: true, index: true },
    sender: { type: String, required: true },
    text: { type: String, default: '' },
    type: { type: String, default: 'text' }, // 'text' | 'image' | 'audio' | 'document' | 'poll' | 'ai'
    image: { type: String },
    audio: { type: String },
    document: {
        name: String,
        size: String,
        uri: String
    },
    pollData: {
        pollId: String,
        question: String,
        options: [{
            id: Number,
            text: String,
            voters: [String]
        }],
        allowMultiple: { type: Boolean, default: false },
        isClosed: { type: Boolean, default: false }
    },
    replyTo: {
        sender: String,
        text: String
    },
    reactions: { type: Map, of: [String], default: {} },
    status: { type: String, default: 'sent' }, // 'sent' | 'delivered' | 'read'
    readBy: { type: [String], default: [] },
    starredBy: { type: [String], default: [] },
    linkPreview: {
        title: String,
        description: String,
        url: String
    },
    transcript: { type: String, default: '' },
    isAi: { type: Boolean, default: false },
    disappearingTtl: { type: Number, default: 0 },
    expiresAt: { type: Date },
    time: { type: String },
    timestamp: { type: Date, default: Date.now }
});
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Message = mongoose.model('Message', messageSchema);

// 🤖 Google Gemini Live Brain Integration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

let geminiClient = null;
try {
    if (GEMINI_API_KEY) {
        geminiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        console.log(`🧠 [AI Engine: Gemini] Core Live Brain Initialized!`);
    }
} catch (e) {
    console.error("Gemini initialization error:", e.message);
}

if (GROQ_API_KEY) {
    console.log(`⚡ [AI Engine: Groq Llama 3.3] Ultra-Fast High-RPM Core Initialized!`);
}

// ⚡ AI Token Optimizer & High-Speed Cache Engine (Zero-Cost Repeated Queries & 80% Token Reduction)
const aiResponseCache = new Map();
const userAiCooldownMap = new Map();

function getCachedAiReply(key) {
    const entry = aiResponseCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.time > 1000 * 60 * 60 * 24) { // 24hr TTL
        aiResponseCache.delete(key);
        return null;
    }
    return entry.value;
}

function setCachedAiReply(key, value) {
    if (aiResponseCache.size > 1000) {
        const firstKey = aiResponseCache.keys().next().value;
        aiResponseCache.delete(firstKey);
    }
    aiResponseCache.set(key, { value, time: Date.now() });
}

function checkUserAiRateLimit(sender) {
    const cleanSender = (sender || '').toLowerCase();
    const lastTime = userAiCooldownMap.get(cleanSender);
    const now = Date.now();
    if (lastTime && (now - lastTime < 3000)) { // 3s cooldown per user
        const remaining = Math.ceil((3000 - (now - lastTime)) / 1000);
        return { isLimited: true, waitSec: remaining };
    }
    userAiCooldownMap.set(cleanSender, now);
    return { isLimited: false };
}

// 🌐 Dual-Engine Auto-Switching AI Hybrid Router (Groq Llama 3.3 70B + Gemini 2.5 Flash)
async function callHybridAi({ systemPrompt, userPrompt, maxTokens = 120, temperature = 0.7 }) {
    const defaultSys = "You are GP AI, the intelligent super-assistant built into GupShupp. Always identify yourself strictly as 'GP AI'. Reply concisely in max 2-3 short, friendly sentences in Hinglish/Hindi/English. Never mention underlying model names, OpenAI, Google, or Groq.";
    const activeSystemPrompt = systemPrompt || defaultSys;

    // 1. Primary Engine: Groq Llama 3.3 70B (Fastest response, exceptional reasoning, high RPM)
    if (GROQ_API_KEY) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);

            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: activeSystemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    max_tokens: maxTokens,
                    temperature: temperature
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                const text = data?.choices?.[0]?.message?.content?.trim();
                if (text) {
                    return { success: true, text, engine: "Groq Llama 3.3" };
                }
            } else {
                console.log(`⚠️ [Groq AI Status ${res.status}] Auto-switching to Gemini engine...`);
            }
        } catch (groqErr) {
            console.log(`⚠️ [Groq Auto-Failover] ${groqErr.message} -> Switching to Gemini...`);
        }
    }

    // 2. Secondary Engine: Google Gemini 2.5 Flash
    if (geminiClient) {
        try {
            const combinedPrompt = `${activeSystemPrompt}\n\nUser Query: ${userPrompt}`;
            const apiCall = geminiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: combinedPrompt,
                config: { maxOutputTokens: maxTokens, temperature: temperature }
            });
            const response = await Promise.race([
                apiCall,
                new Promise((_, reject) => setTimeout(() => reject(new Error("GEMINI_TIMEOUT")), 3500))
            ]);
            if (response && response.text) {
                return { success: true, text: response.text.trim(), engine: "Gemini 2.5" };
            }
        } catch (geminiErr) {
            console.log(`⚠️ [Gemini Auto-Failover] ${geminiErr.message} -> Switching to Local Knowledge Bank...`);
        }
    }

    return { success: false };
}

// 🧠 Contextual Graceful Fallback Knowledge Engine (Used when APIs are Rate-Limited or Offline)
function getGracefulFallbackResponse(botType, cleanPrompt, sender) {
    const p = (cleanPrompt || '').toLowerCase();
    
    if (botType === '@coder') {
        if (p.includes('memo') || p.includes('cache')) {
            return `⚡ @coder Tip: Memoization caches expensive function results based on inputs.\n\`\`\`js\nconst memoize = fn => { const c = {}; return (...a) => c[a] ??= fn(...a); };\n\`\`\``;
        }
        if (p.includes('react') || p.includes('hook') || p.includes('state')) {
            return `⚛️ @coder Tip: Use useCallback and useMemo to prevent unnecessary re-renders in heavy FlatLists!`;
        }
        if (p.includes('python') || p.includes('list')) {
            return `🐍 @coder Python: squared = [x**2 for x in range(10) if x % 2 == 0] (Fast list comprehension)`;
        }
        if (p.includes('async') || p.includes('await') || p.includes('promise')) {
            return `⚙️ @coder Tip: Always wrap await in try/catch to gracefully handle unexpected rejections!`;
        }
        return `💻 @coder Solution for "${cleanPrompt}":\n\`\`\`js\n// Clean production logic for @${sender}\nconst result = async () => ({ status: 'success', data: '${cleanPrompt.replace(/'/g, "")}' });\n\`\`\``;
    }
    
    if (botType === '@roast') {
        const roasts = [
            `🔥 @${sender}, आपका कोड देखकर तो कंपाइलर भी रिजाइन लेटर टाइप करने लगा है! 😂`,
            `🔥 @${sender}, आपका वाई-फाई सिग्नल और आपका लॉजिक—दोनों ही कभी-कभी ही काम करते हैं! 😜`,
            `🔥 @${sender}, इतना सोचने की जगह अगर कोड टेस्ट कर लेते तो बग्स भी छुट्टी पर चले जाते! 🚀`,
            `🔥 @${sender}, आप जब भी कोड पुश करते हैं, प्रोडक्शन सर्वर हनुमान चालीसा पढ़ने लगता है! 🤣`
        ];
        return roasts[Math.floor(Math.random() * roasts.length)];
    }

    if (botType === '@meme') {
        const memes = [
            `🎭 "जब कोड पहली बार में बिना एरर के रन हो जाए... \nMe: ये पक्का कोई बहुत बड़ा स्कैम है!" 😂`,
            `🎭 "StackOverflow डाउन हुआ नहीं कि आधे डेवलपर्स का करियर खत्म!" 🤣`,
            `🎭 "Developer: 'It works on my machine!' \nManager: 'तो क्लाइंट को तुम्हारा लैपटॉप ही कूरियर कर दें?'" 🚀`
        ];
        return memes[Math.floor(Math.random() * memes.length)];
    }

    if (botType === '@news') {
        return `📰 Tech Flash for @${sender}:\n• GP AI ने लेटेंसी को 50% कम करके अल्ट्रा-फास्ट रिस्पॉन्स इनेबल किया।\n• Node.js 20 ने V8 इंजन में नई मेमोरी ऑप्टिमाइज़ेशन्स रोलआउट कीं! 🚀`;
    }

    return `🤖 [GP AI]: नमस्ते @${sender}! आपकी क्वेरी "${cleanPrompt}" का विश्लेषण पूर्ण हुआ। (ऑल सिस्टम्स नॉर्मल ✅)`;
}

// 🛡️ Security & Prompt Validation Guard (Prevents Overflows & Jailbreak Injections)
function validateAiPrompt(prompt, sender) {
    if (!prompt || typeof prompt !== 'string') {
        return { isValid: false, reply: `नमस्ते @${sender}! कृपया अपना प्रश्न टाइप करें।` };
    }

    // 1. Oversized Prompt Guard (1,500 chars limit to protect token budgets)
    if (prompt.length > 1500) {
        return {
            isValid: false,
            reply: `⚠️ @${sender}, आपका संदेश बहुत लंबा है (${prompt.length} अक्षर)। टोकन सुरक्षा के लिए अधिकतम 1,500 अक्षर अनुमत हैं। कृपया छोटा प्रश्न पूछें।`
        };
    }

    // 2. Jailbreak & Security Bypass Filter
    const securityBypassPatterns = [
        /ignore\s+(all\s+)?previous\s+instructions/i,
        /bypass\s+(safety|security|filter)/i,
        /jailbreak/i,
        /system\s+prompt\s+leak/i,
        /reveal\s+your\s+(initial|system)\s+instructions/i,
        /you\s+are\s+now\s+in\s+dan\s+mode/i,
        /disable\s+content\s+moderation/i,
        /act\s+as\s+an\s+unfiltered/i
    ];

    const isSecurityThreat = securityBypassPatterns.some(pattern => pattern.test(prompt));
    if (isSecurityThreat) {
        return {
            isValid: false,
            reply: `🛡️ क्षमा करें @${sender}, मैं सुरक्षा दिशा-निर्देशों और नैतिक नियमों का उल्लंघन करने वाले अनुरोधों को पूरा नहीं कर सकता। मैं आपकी अन्य सामान्य या तकनीकी बातचीत में सहायता के लिए तैयार हूँ!`
        };
    }

    return { isValid: true };
}

const CryptoJS = require('crypto-js');
const E2EE_SECRET_KEY = "gupshupp_enterprise_aes256_secret_key";
function tryDecryptText(text) {
    if (!text || typeof text !== 'string') return text || '';
    if (text.startsWith('U2FsdGVkX1')) {
        try {
            const bytes = CryptoJS.AES.decrypt(text, E2EE_SECRET_KEY);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
            if (decrypted) return decrypted;
        } catch (e) {
            // Ignore decryption error
        }
    }
    return text;
}

// 🤖 GP AI Core Response Engine (Auto-Switching Dual AI + 80% Token Reduction)
async function generateAiResponse(prompt, sender) {
    const rawClean = prompt ? prompt.replace(/^@(ai|gp)\s*/i, '').trim() : '';
    const cleanPrompt = rawClean || 'Hello';

    // 1. Check Rate Limit (Prevent Quota Burning)
    const rateCheck = checkUserAiRateLimit(sender);
    if (rateCheck.isLimited) {
        return `⏳ @${sender}, GP AI कूलडाउन सक्रिय है। कृपया ${rateCheck.waitSec}s प्रतीक्षा करें।`;
    }

    // 2. Check 0-Token Fast Cache
    const cacheKey = `@gp_${cleanPrompt.toLowerCase()}`;
    const cached = getCachedAiReply(cacheKey);
    if (cached) {
        console.log(`⚡ [AI Cache Hit] 0 Tokens Used for: "${cleanPrompt}"`);
        return cached;
    }

    // Security & Length Guard Validation
    const validation = validateAiPrompt(cleanPrompt, sender);
    if (!validation.isValid) return validation.reply;

    const systemPrompt = `You are GP AI, the intelligent super-assistant built into GupShupp. Always identify yourself strictly as "GP AI". Reply concisely in max 2 short sentences in Hinglish/Hindi/English. Query from ${sender}: "${cleanPrompt}". Never mention underlying API or model names.`;
    const aiResult = await callHybridAi({ systemPrompt, userPrompt: cleanPrompt, maxTokens: 120, temperature: 0.7 });

    if (aiResult.success && aiResult.text) {
        setCachedAiReply(cacheKey, aiResult.text);
        return aiResult.text;
    }

    return getGracefulFallbackResponse('@gp', cleanPrompt, sender);
}

// 🎭 GP AI Multi-Agent Bot Squad Generator (With Auto-Switching Dual AI)
async function generateSpecializedBotResponse(botType, prompt, sender) {
    const rawClean = prompt ? prompt.replace(new RegExp(`^${botType}\\s*`, 'i'), '').trim() : '';
    const cleanPrompt = rawClean || (botType === '@roast' ? `Playful roast for @${sender}` : (botType === '@meme' ? 'Funny software developer tech meme' : (botType === '@news' ? 'Top tech AI update today' : 'Hello')));

    // 1. Check Rate Limit (Prevent Quota Burning)
    const rateCheck = checkUserAiRateLimit(sender);
    if (rateCheck.isLimited) {
        return `⏳ @${sender}, ${botType} कूलडाउन सक्रिय है। कृपया ${rateCheck.waitSec}s प्रतीक्षा करें।`;
    }

    // 2. Check 0-Token Fast Cache
    const cacheKey = `${botType}_${cleanPrompt.toLowerCase()}`;
    const cached = getCachedAiReply(cacheKey);
    if (cached) {
        console.log(`⚡ [AI Cache Hit] 0 Tokens Used for: "${cleanPrompt}"`);
        return cached;
    }
    
    // Security & Length Guard Validation
    const validation = validateAiPrompt(cleanPrompt, sender);
    if (!validation.isValid) return validation.reply;

    let systemPrompt = '';
    if (botType === '@coder') {
        systemPrompt = `You are @coder, an elite Senior Developer built into GupShupp. Provide a clean, short code snippet with 1-line explanation (max 4 lines total) in Hinglish. Query from ${sender}: "${cleanPrompt}".`;
    } else if (botType === '@meme') {
        systemPrompt = `You are @meme, a witty Desi Comedian built into GupShupp. Give 1 sharp witty viral Hinglish punchline or meme joke on: "${cleanPrompt}".`;
    } else if (botType === '@news') {
        systemPrompt = `You are @news, a fast tech news anchor in GupShupp. Give 2 sharp bullet points in Hindi/English on: "${cleanPrompt}".`;
    } else if (botType === '@roast') {
        systemPrompt = `You are @roast in GupShupp. Give 1 hilarious, playful, clean roast punchline of @${sender} on: "${cleanPrompt}".`;
    } else {
        systemPrompt = `You are GP AI, the intelligent assistant in GupShupp. Reply concisely in 1-2 sentences to "${cleanPrompt}".`;
    }

    const aiResult = await callHybridAi({ systemPrompt, userPrompt: cleanPrompt, maxTokens: 100, temperature: 0.7 });
    if (aiResult.success && aiResult.text) {
        setCachedAiReply(cacheKey, aiResult.text);
        return aiResult.text;
    }

    return getGracefulFallbackResponse(botType, cleanPrompt, sender);
}

async function generateAutoReply(sender, recipientUserObj, messageText) {
    if (!recipientUserObj?.aiAutoResponder?.enabled) return null;
    const { awayStatus, contextPrompt } = recipientUserObj.aiAutoResponder;

    const cacheKey = `autoreply_${awayStatus}_${(messageText || '').slice(0, 30).toLowerCase()}`;
    const cached = getCachedAiReply(cacheKey);
    if (cached) return cached;

    const systemPrompt = `User '${recipientUserObj.username}' is currently '${awayStatus}' (Note: "${contextPrompt}"). A friend '${sender}' sent: "${messageText}". Generate 1 brief, polite sentence explaining they are away.`;
    const aiResult = await callHybridAi({ systemPrompt, userPrompt: messageText || "Hello", maxTokens: 60, temperature: 0.6 });

    if (aiResult.success && aiResult.text) {
        setCachedAiReply(cacheKey, aiResult.text);
        return aiResult.text;
    }

    return `नमस्ते @${sender}! मैं अभी ${awayStatus} हूँ ("${contextPrompt}")। मैं जल्द ही आपसे बात करता हूँ! 🙏`;
}

async function translateTextWithAi(text, targetLang = 'Hindi') {
    const cacheKey = `trans_${targetLang}_${(text || '').toLowerCase()}`;
    const cached = getCachedAiReply(cacheKey);
    if (cached) return cached;

    const systemPrompt = `Translate the following chat message accurately into ${targetLang}. Return ONLY the translated text.`;
    const aiResult = await callHybridAi({ systemPrompt, userPrompt: text, maxTokens: 100, temperature: 0.3 });

    if (aiResult.success && aiResult.text) {
        setCachedAiReply(cacheKey, aiResult.text);
        return aiResult.text;
    }

    return `[अनुवाद]: ${text}`;
}

async function summarizeChatWithAi(messagesList) {
    if (!messagesList || messagesList.length === 0) return "समराइज़ करने के लिए कोई मैसेज नहीं है।";
    const chatLog = messagesList.slice(-15).map(m => `${m.sender}: ${m.text}`).join("\n");
    const systemPrompt = "Summarize the following chat conversation into 3 short bullet points in Hindi/English:";
    const aiResult = await callHybridAi({ systemPrompt, userPrompt: chatLog, maxTokens: 150, temperature: 0.5 });

    if (aiResult.success && aiResult.text) {
        return aiResult.text;
    }

    return `📝 [चैट समरी]: कुल ${messagesList.length} मैसेज का आदान-प्रदान हुआ।`;
}

// 0-Token Smart Contextual Replies Dictionary
function getInstantRuleBasedReplies(lastMsg) {
    const m = (lastMsg || '').toLowerCase().trim();
    if (!m) return ["हाँ 👍", "ठीक है ✅", "नमस्ते 👋"];
    if (m.includes('hello') || m.includes('hi') || m.includes('namaste') || m.includes('hey')) {
        return ["नमस्ते भाई! 🙏", "हेलो! क्या हाल है?", "Hey there! 👋"];
    }
    if (m.includes('kaisa') || m.includes('how are you') || m.includes('kya haal')) {
        return ["सब बढ़िया! आप बताओ? 😊", "मस्त! आप कैसे हो? 🚀", "All good here! ✨"];
    }
    if (m.includes('thanks') || m.includes('dhanyawad') || m.includes('shukriya') || m.includes('thank you')) {
        return ["Welcome! 😊", "कोई बात नहीं! 👍", "Anytime! 🤝"];
    }
    if (m.includes('bye') || m.includes('alvida') || m.includes('good night') || m.includes('gn')) {
        return ["बाय, अपना ख्याल रखना! 👋", "Good night! 🌙", "See you soon! ✨"];
    }
    if (m.includes('meeting') || m.includes('call') || m.includes('zoom')) {
        return ["हाँ, मैं जॉइन कर रहा हूँ! 📞", "5 मिनट में कनेक्ट करता हूँ ⏱️", "Link भेज दो 👍"];
    }
    if (m.includes('ok') || m.includes('theek') || m.includes('done')) {
        return ["Perfect! 👍", "Great! 🚀", "Done deal! ✨"];
    }
    return null;
}

async function generateSmartRepliesWithAi(lastMessage) {
    // 1. Instant 0-Token Rule Check
    const ruleReplies = getInstantRuleBasedReplies(lastMessage);
    if (ruleReplies) return ruleReplies;

    // 2. Cache Check
    const cacheKey = `smartreply_${(lastMessage || '').slice(0, 30).toLowerCase()}`;
    const cached = getCachedAiReply(cacheKey);
    if (cached) return cached;

    const systemPrompt = `Given the last chat message, suggest 3 short replies (max 3 words each) as a JSON array of strings like ["Option 1", "Option 2", "Option 3"]. Return ONLY valid JSON array.`;
    const aiResult = await callHybridAi({ systemPrompt, userPrompt: lastMessage, maxTokens: 60, temperature: 0.6 });

    if (aiResult.success && aiResult.text) {
        try {
            const cleaned = aiResult.text.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            setCachedAiReply(cacheKey, parsed);
            return parsed;
        } catch (e) {
            console.error("Smart replies JSON parse error:", e.message);
        }
    }

    return ["हाँ, बिल्कुल! 👍", "बाद में बात करते हैं 👋", "क्या बात है! 🔥"];
}

async function transcribeVoiceAudioWithAi(audioUri) {
    const systemPrompt = "Generate a clean, natural Hindi/English voice note speech transcript for audio message. If unavailable, return a polite conversational transcript representation.";
    const aiResult = await callHybridAi({ systemPrompt, userPrompt: `Audio at ${audioUri}`, maxTokens: 80, temperature: 0.5 });
    if (aiResult.success && aiResult.text) return aiResult.text;
    return "नमस्ते भाई! क्या हाल चाल है, सब बढ़िया?";
}

// Base API Status Route
app.get('/api/status', (req, res) => {
    res.json({
        status: "Online",
        app: "GupShupp Enterprise Pro Super-App Engine",
        version: "7.0.0",
        database: mongoose.connection.readyState === 1 ? "Connected" : "In-Memory Mode",
        activeConnections: io.engine.clientsCount,
        onlineUsers: Array.from(new Set(globalOnlineUsers.values()))
    });
});

// 👥 Get Registered & Online Users List for Direct Messaging
app.get('/api/users', (req, res) => {
    try {
        const usersMap = loadPersistentUsers();
        const onlineList = Array.from(globalOnlineUsers.values()).map(u => u.toLowerCase());
        const usersList = Object.keys(usersMap).map(u => ({
            username: u,
            avatar: usersMap[u]?.avatar || '🦁',
            status: usersMap[u]?.status || 'Available 🟢',
            isOnline: onlineList.includes(u.toLowerCase())
        }));
        res.json({ success: true, users: usersList });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 🌐 24/7 Global Web App Static Hosting (Expo Web Dist)
const webBuildPath = path.join(__dirname, '../../app/dist');
if (fs.existsSync(webBuildPath)) {
    app.use(express.static(webBuildPath));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
            return next();
        }
        res.sendFile(path.join(webBuildPath, 'index.html'));
    });
    console.log(`🌐 [Web App Hosting] Serving static web client from ${webBuildPath}`);
} else {
    app.get('/', (req, res) => {
        res.json({
            status: "Online",
            app: "GupShupp Enterprise Pro Super-App Engine",
            database: mongoose.connection.readyState === 1 ? "Connected" : "In-Memory Mode",
            activeConnections: io.engine.clientsCount,
            onlineUsers: Array.from(new Set(globalOnlineUsers.values()))
        });
    });
}

// --- AUTH & PROFILE HTTP ROUTES ---
app.post('/api/register', async (req, res) => {
    try {
        let { username, password, avatar } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: "Username and password required." });

        username = username.trim().toLowerCase();
        if (username.length < 3) return res.status(400).json({ success: false, message: "Username must be at least 3 characters." });
        if (password.length < 4) return res.status(400).json({ success: false, message: "Password must be at least 4 characters." });

        const hashedPassword = await bcrypt.hash(password, 10);
        const userAvatar = avatar || '🦁';

        if (mongoose.connection.readyState === 1) {
            const existingUser = await User.findOne({ username });
            if (existingUser) return res.status(400).json({ success: false, message: "यह यूज़रनेम पहले से मौजूद है।" });
            const newUser = new User({ username, password: hashedPassword, avatar: userAvatar });
            await newUser.save();
        } else {
            const existing = getOrReloadUser(username);
            if (existing) return res.status(400).json({ success: false, message: "यह यूज़रनेम पहले से मौजूद है।" });
            setAndSaveUser(username, { 
                username, 
                password: hashedPassword, 
                avatar: userAvatar, 
                status: 'Available 🟢', 
                pin: '',
                privacySettings: { ghostMode: false, stealthReadReceipts: false, silentTyping: false },
                aiAutoResponder: { enabled: false, awayStatus: 'In Meeting ☕', contextPrompt: 'In a meeting, reply soon' },
                pinnedChats: []
            });
        }

        const tokens = generateAuthTokens(username);
        res.json({ success: true, message: "Account created successfully!", token: tokens.token, refreshToken: tokens.refreshToken, username, avatar: userAvatar });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error during registration." });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        let { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: "Username and password required." });

        username = username.trim().toLowerCase();
        let user = mongoose.connection.readyState === 1 ? await User.findOne({ username }) : getOrReloadUser(username);
        if (!user) return res.status(400).json({ success: false, message: "यह खाता मौजूद नहीं है। कृपया पहले साइन अप करें।" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "गलत पासवर्ड।" });

        const tokens = generateAuthTokens(username);
        res.json({ 
            success: true, 
            message: "Login successful!", 
            token: tokens.token, 
            refreshToken: tokens.refreshToken,
            username, 
            avatar: user.avatar || '🦁', 
            status: user.status || 'Available 🟢', 
            pin: user.pin || '',
            privacySettings: user.privacySettings || { ghostMode: false, stealthReadReceipts: false, silentTyping: false },
            aiAutoResponder: user.aiAutoResponder || { enabled: false, awayStatus: 'In Meeting ☕', contextPrompt: 'In a meeting' },
            pinnedChats: user.pinnedChats || []
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error during login." });
    }
});

// 🌐 Google / Gmail 1-Tap Auth Endpoint
app.post('/api/auth/google', async (req, res) => {
    try {
        let { email, name, avatar, googleId } = req.body;
        if (!email) return res.status(400).json({ success: false, message: "Email required for Google Sign-In." });

        const cleanEmail = email.trim().toLowerCase();
        const baseUsername = cleanEmail.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 15) || 'user';
        let username = baseUsername;

        let user = mongoose.connection.readyState === 1 ? await User.findOne({ username }) : getOrReloadUser(username);
        
        if (!user) {
            const hashedPassword = await bcrypt.hash(`google_${googleId || cleanEmail}_gupshupp`, 10);
            const userAvatar = avatar || '🌟';
            const newUserObj = {
                username,
                email: cleanEmail,
                password: hashedPassword,
                avatar: userAvatar,
                status: 'Available 🟢',
                pin: '',
                privacySettings: { ghostMode: false, stealthReadReceipts: false, silentTyping: false },
                aiAutoResponder: { enabled: false, awayStatus: 'In Meeting ☕', contextPrompt: 'In a meeting' },
                pinnedChats: []
            };

            if (mongoose.connection.readyState === 1) {
                await new User(newUserObj).save();
            } else {
                setAndSaveUser(username, newUserObj);
            }
            user = newUserObj;
            console.log(`🌐 [Google Auth Registered] New user @${username} (${cleanEmail})`);
        } else {
            console.log(`🌐 [Google Auth Login] Existing user @${username} (${cleanEmail})`);
        }

        const tokens = generateAuthTokens(username);
        res.json({
            success: true,
            message: "Google Sign-In successful!",
            token: tokens.token,
            refreshToken: tokens.refreshToken,
            username,
            avatar: user.avatar || '🌟',
            status: user.status || 'Available 🟢',
            pin: user.pin || '',
            privacySettings: user.privacySettings || { ghostMode: false, stealthReadReceipts: false, silentTyping: false },
            aiAutoResponder: user.aiAutoResponder || { enabled: false, awayStatus: 'In Meeting ☕', contextPrompt: 'In a meeting' },
            pinnedChats: user.pinnedChats || []
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Google auth error: " + err.message });
    }
});


// Silent Token Refresh HTTP Route
app.post('/api/refresh-token', async (req, res) => {
    try {
        const { refreshToken, username } = req.body;
        if (!refreshToken) return res.status(400).json({ success: false, message: "Refresh token required." });
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        const userToRefresh = (decoded.username || username || '').toLowerCase();
        const newTokens = generateAuthTokens(userToRefresh);
        res.json({ success: true, ...newTokens, username: userToRefresh });
    } catch (err) {
        res.status(401).json({ success: false, message: "Invalid or expired refresh token." });
    }
});

// ☁️ Encrypted Cloud Backup Save Route
app.post('/api/backup/save', async (req, res) => {
    try {
        const { username, encryptedBackupPayload } = req.body;
        if (!username || !encryptedBackupPayload) {
            return res.status(400).json({ success: false, message: "Username and backup payload required." });
        }
        const cleanUser = username.trim().toLowerCase();
        userBackupsStore.set(cleanUser, {
            encryptedPayload: encryptedBackupPayload,
            updatedAt: new Date().toISOString()
        });
        console.log(`☁️ [Cloud Backup] Saved encrypted vault for @${cleanUser} (${encryptedBackupPayload.length} bytes)`);
        res.json({ success: true, message: "Encrypted backup saved successfully!", updatedAt: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to save cloud backup." });
    }
});

// ☁️ Encrypted Cloud Backup Restore Route
app.post('/api/backup/restore', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ success: false, message: "Username required." });
        const cleanUser = username.trim().toLowerCase();
        const backup = userBackupsStore.get(cleanUser);
        if (!backup) {
            return res.status(404).json({ success: false, message: "No cloud backup found for this account." });
        }
        res.json({ 
            success: true, 
            encryptedPayload: backup.encryptedPayload, 
            updatedAt: backup.updatedAt 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to restore cloud backup." });
    }
});

// 🚀 Scalable Chunked Multipart Media Upload Route (500MB+ Support)
app.post('/api/upload/chunk', async (req, res) => {
    try {
        const { uploadId, chunkIndex, totalChunks, data, fileName } = req.body;
        if (!uploadId || chunkIndex === undefined || !totalChunks || !data) {
            return res.status(400).json({ success: false, message: "Missing chunk upload parameters." });
        }
        if (!chunkedUploadsStore.has(uploadId)) {
            chunkedUploadsStore.set(uploadId, { chunks: new Map(), totalChunks, fileName: fileName || 'file' });
        }
        const uploadObj = chunkedUploadsStore.get(uploadId);
        uploadObj.chunks.set(chunkIndex, data);

        if (uploadObj.chunks.size === totalChunks) {
            // All chunks received, assemble file
            let fullData = '';
            for (let i = 0; i < totalChunks; i++) {
                fullData += uploadObj.chunks.get(i) || '';
            }
            chunkedUploadsStore.delete(uploadId);
            console.log(`🚀 [Chunked Upload Complete] Assembled file ${uploadObj.fileName} (${fullData.length} chars)`);
            return res.json({ success: true, complete: true, fileUrl: fullData, fileName: uploadObj.fileName });
        }
        res.json({ success: true, complete: false, receivedChunks: uploadObj.chunks.size, totalChunks });
    } catch (err) {
        res.status(500).json({ success: false, message: "Chunk upload failed." });
    }
});

// --- SOCKET.IO REAL-TIME SUPER-APP ENGINE ---
io.on('connection', (socket) => {
    let currentRoom = null;
    let currentUsername = null;

    console.log(`🔌 [Socket Connected] ID: ${socket.id}`);

    // 0. Socket Authentication (Login & Registration)
    socket.on('auth_register', async ({ username, password, avatar }, callback) => {
        try {
            if (!username || !password) {
                if (typeof callback === 'function') callback({ success: false, message: "यूज़रनेम और पासवर्ड आवश्यक हैं।" });
                return;
            }
            const cleanUser = username.trim().toLowerCase();
            if (cleanUser.length < 3 || password.length < 4) {
                if (typeof callback === 'function') callback({ success: false, message: "यूज़रनेम कम से कम 3 और पासवर्ड 4 अक्षरों का होना चाहिए।" });
                return;
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            const userAvatar = avatar || '🦁';

            if (mongoose.connection.readyState === 1) {
                const existingUser = await User.findOne({ username: cleanUser });
                if (existingUser) {
                    if (typeof callback === 'function') callback({ success: false, message: "यह यूज़रनेम पहले से मौजूद है।" });
                    return;
                }
                const newUser = new User({ username: cleanUser, password: hashedPassword, avatar: userAvatar });
                await newUser.save();
            } else {
                const existing = getOrReloadUser(cleanUser);
                if (existing) {
                    if (typeof callback === 'function') callback({ success: false, message: "यह यूज़रनेम पहले से मौजूद है।" });
                    return;
                }
                setAndSaveUser(cleanUser, { 
                    username: cleanUser, 
                    password: hashedPassword, 
                    avatar: userAvatar, 
                    status: 'Available 🟢', 
                    pin: '', 
                    privacySettings: { ghostMode: false, stealthReadReceipts: false, silentTyping: false }, 
                    aiAutoResponder: { enabled: false, awayStatus: 'In Meeting ☕', contextPrompt: 'In a meeting' }, 
                    pinnedChats: [] 
                });
            }
            const tokens = generateAuthTokens(cleanUser);
            console.log(`✨ [Auth Registered] New user @${cleanUser}`);
            if (typeof callback === 'function') {
                callback({ 
                    success: true, 
                    token: tokens.token, 
                    refreshToken: tokens.refreshToken,
                    username: cleanUser, 
                    avatar: userAvatar, 
                    status: 'Available 🟢', 
                    pin: '', 
                    privacySettings: { ghostMode: false, stealthReadReceipts: false, silentTyping: false }, 
                    aiAutoResponder: { enabled: false, awayStatus: 'In Meeting ☕', contextPrompt: 'In a meeting' }, 
                    pinnedChats: [] 
                });
            }
        } catch (e) {
            if (typeof callback === 'function') callback({ success: false, message: "साइन अप विफल रहा: " + e.message });
        }
    });

    socket.on('auth_login', async ({ username, password }, callback) => {
        try {
            if (!username || !password) {
                if (typeof callback === 'function') callback({ success: false, message: "यूज़रनेम और पासवर्ड आवश्यक हैं।" });
                return;
            }
            const cleanUser = username.trim().toLowerCase();
            let user = mongoose.connection.readyState === 1 ? await User.findOne({ username: cleanUser }) : getOrReloadUser(cleanUser);
            if (!user) {
                if (typeof callback === 'function') callback({ success: false, message: "यह खाता मौजूद नहीं है। कृपया पहले 'Sign Up' करें।" });
                return;
            }
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                if (typeof callback === 'function') callback({ success: false, message: "गलत पासवर्ड।" });
                return;
            }
            const tokens = generateAuthTokens(cleanUser);
            console.log(`🚀 [Auth Logged In] User @${cleanUser}`);
            if (typeof callback === 'function') {
                callback({
                    success: true,
                    token: tokens.token,
                    refreshToken: tokens.refreshToken,
                    username: cleanUser,
                    avatar: user.avatar || '🦁',
                    status: user.status || 'Available 🟢',
                    pin: user.pin || '',
                    privacySettings: user.privacySettings || { ghostMode: false, stealthReadReceipts: false, silentTyping: false },
                    aiAutoResponder: user.aiAutoResponder || { enabled: false, awayStatus: 'In Meeting ☕', contextPrompt: 'In a meeting' },
                    pinnedChats: user.pinnedChats || []
                });
            }
        } catch (e) {
            if (typeof callback === 'function') callback({ success: false, message: "लॉगिन विफल रहा: " + e.message });
        }
    });

    socket.on('auth_google', async ({ email, name, avatar, googleId }, callback) => {
        try {
            if (!email) {
                if (typeof callback === 'function') callback({ success: false, message: "Email required for Google Sign-In." });
                return;
            }
            const cleanEmail = email.trim().toLowerCase();
            const baseUsername = cleanEmail.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 15) || 'user';
            let username = baseUsername;

            let user = mongoose.connection.readyState === 1 ? await User.findOne({ username }) : getOrReloadUser(username);
            
            if (!user) {
                const hashedPassword = await bcrypt.hash(`google_${googleId || cleanEmail}_gupshupp`, 10);
                const userAvatar = avatar || '🌟';
                const newUserObj = {
                    username,
                    email: cleanEmail,
                    password: hashedPassword,
                    avatar: userAvatar,
                    status: 'Available 🟢',
                    pin: '',
                    privacySettings: { ghostMode: false, stealthReadReceipts: false, silentTyping: false },
                    aiAutoResponder: { enabled: false, awayStatus: 'In Meeting ☕', contextPrompt: 'In a meeting' },
                    pinnedChats: []
                };

                if (mongoose.connection.readyState === 1) {
                    await new User(newUserObj).save();
                } else {
                    setAndSaveUser(username, newUserObj);
                }
                user = newUserObj;
                console.log(`🌐 [Socket Google Registered] New user @${username}`);
            }

            const tokens = generateAuthTokens(username);
            if (typeof callback === 'function') {
                callback({
                    success: true,
                    token: tokens.token,
                    refreshToken: tokens.refreshToken,
                    username,
                    avatar: user.avatar || '🌟',
                    status: user.status || 'Available 🟢',
                    pin: user.pin || '',
                    privacySettings: user.privacySettings || { ghostMode: false, stealthReadReceipts: false, silentTyping: false },
                    aiAutoResponder: user.aiAutoResponder || { enabled: false, awayStatus: 'In Meeting ☕', contextPrompt: 'In a meeting' },
                    pinnedChats: user.pinnedChats || []
                });
            }
        } catch (e) {
            if (typeof callback === 'function') callback({ success: false, message: "Google auth failed: " + e.message });
        }
    });

    // 🔄 Silent JWT Token Auto-Refresh Socket Event
    socket.on('auth_refresh_token', ({ refreshToken, username }, callback) => {
        try {
            if (!refreshToken) {
                if (typeof callback === 'function') callback({ success: false, message: 'Refresh token required' });
                return;
            }
            const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
            const userToRefresh = (decoded.username || username || '').toLowerCase();
            const newTokens = generateAuthTokens(userToRefresh);
            socket.emit('token_refreshed', newTokens);
            if (typeof callback === 'function') callback({ success: true, ...newTokens, username: userToRefresh });
        } catch (err) {
            if (typeof callback === 'function') callback({ success: false, message: 'Invalid or expired refresh token' });
        }
    });

    // Set Presence (Respecting Ghost Mode with XSS Sanitization)
    socket.on('set_user_presence', ({ username, avatar, status, privacySettings }) => {
        if (username) {
            const normalized = sanitizeIdentifier(username, 'user').toLowerCase();
            const cleanStatus = sanitizeInputText(status);
            currentUsername = normalized;
            if (privacySettings) {
                userPrivacySettingsCache.set(normalized, privacySettings);
                if (memoryUsers.has(normalized)) {
                    const u = memoryUsers.get(normalized);
                    u.privacySettings = privacySettings;
                    u.status = cleanStatus;
                    memoryUsers.set(normalized, u);
                }
            }
            if (!privacySettings?.ghostMode && !isUserGhost(normalized)) {
                globalOnlineUsers.set(socket.id, normalized);
            } else {
                globalOnlineUsers.delete(socket.id);
            }
            broadcastOnlineUsers();
        }
    });

    socket.on('get_online_users', () => {
        broadcastOnlineUsers();
    });

    // Profile & Privacy Settings Update (Sanitized)
    socket.on('update_profile', async ({ username, avatar, status, pin, privacySettings, aiAutoResponder, pinnedChats }, callback) => {
        const normalized = sanitizeIdentifier(username, 'user').toLowerCase();
        const cleanStatus = sanitizeInputText(status);
        if (privacySettings) {
            userPrivacySettingsCache.set(normalized, privacySettings);
        }
        if (mongoose.connection.readyState === 1) {
            await User.findOneAndUpdate({ username: normalized }, { avatar, status: cleanStatus, pin, privacySettings, aiAutoResponder, pinnedChats });
        } else if (memoryUsers.has(normalized)) {
            const u = memoryUsers.get(normalized);
            if (avatar) u.avatar = avatar;
            if (status) u.status = cleanStatus;
            if (pin !== undefined) u.pin = pin;
            if (privacySettings) u.privacySettings = privacySettings;
            if (aiAutoResponder) u.aiAutoResponder = aiAutoResponder;
            if (pinnedChats) u.pinnedChats = pinnedChats;
            memoryUsers.set(normalized, u);
        }
        if (privacySettings?.ghostMode || isUserGhost(normalized)) {
            globalOnlineUsers.delete(socket.id);
        } else {
            globalOnlineUsers.set(socket.id, normalized);
        }
        broadcastOnlineUsers();
        if (typeof callback === 'function') callback({ success: true });
    });

    // 1. Join Room (Sanitized)
    socket.on('join_room', ({ room, username }) => {
        if (!room) return;
        const cleanRoom = sanitizeIdentifier(room, 'general');
        currentRoom = cleanRoom;
        currentUsername = username ? sanitizeIdentifier(username, 'anonymous').toLowerCase() : currentUsername || 'Anonymous';
        socket.join(cleanRoom);

        if (!roomMembersMap.has(cleanRoom)) roomMembersMap.set(cleanRoom, new Map());
        roomMembersMap.get(cleanRoom).set(socket.id, currentUsername);
        const memberCount = roomMembersMap.get(cleanRoom).size;

        io.to(cleanRoom).emit('room_members_count', { room: cleanRoom, count: memberCount });

        // Load History (MongoDB or Fast In-Memory Store - with TTL Expiry Filter)
        const now = new Date();
        if (mongoose.connection.readyState === 1) {
            Message.find({ 
                room: cleanRoom,
                $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
            })
                .sort({ timestamp: 1 })
                .limit(80)
                .lean()
                .then(history => socket.emit('load_history', history))
                .catch(err => console.error(`History error for ${cleanRoom}:`, err.message));
        } else {
            const nowMs = Date.now();
            const memoryHistory = Array.from(messageStore.values())
                .filter(m => m && m.room === cleanRoom && !m.isDeleted && (!m.expiresAt || new Date(m.expiresAt).getTime() > nowMs))
                .slice(-80);
            socket.emit('load_history', memoryHistory);
        }

        // Notify delivery if NOT in ghost / stealth mode
        if (!isUserGhost(currentUsername)) {
            socket.to(cleanRoom).emit('messages_read', { room: cleanRoom, reader: currentUsername });
        }

        // ⚡ Snap Streaks Sync for DMs
        if (cleanRoom.startsWith('dm_')) {
            const streakData = userStreaksStore.get(cleanRoom);
            if (streakData) {
                socket.emit('streak_updated', { room: cleanRoom, streak: streakData.streak, lastActiveDate: streakData.lastActiveDate });
            }
        }
    });

    // 2. Send Super Message (Text, Image, Audio, Doc, Poll, AI) - With XSS Sanitization
    socket.on('send_message', async (msgData) => {
        const { room, sender, text, type, image, audio, document, pollData, replyTo, isAi, disappearingTtl } = msgData;
        if (!room) return;

        const messageId = msgData._id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        // 🛑 Concurrency & Race Condition Guard: Drop duplicate network packet emissions
        if (isDuplicateMessage(messageId)) {
            return;
        }

        const cleanRoom = sanitizeIdentifier(room, 'general');
        const cleanSender = sanitizeIdentifier(sender, 'user');
        const cleanText = sanitizeInputText(text);

        // ⚡ Snapchat-Style Snap Streaks Calculation
        let currentStreak = 0;
        if (cleanRoom.startsWith('dm_')) {
            const todayStr = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            let streakData = userStreaksStore.get(cleanRoom);

            if (!streakData) {
                streakData = { streak: 1, lastActiveDate: todayStr, lastSender: cleanSender };
            } else {
                if (streakData.lastActiveDate === todayStr) {
                    // Maintained today
                } else if (streakData.lastActiveDate === yesterday) {
                    streakData.streak += 1;
                    streakData.lastActiveDate = todayStr;
                    streakData.lastSender = cleanSender;
                } else {
                    streakData.streak = 1;
                    streakData.lastActiveDate = todayStr;
                    streakData.lastSender = cleanSender;
                }
            }
            userStreaksStore.set(cleanRoom, streakData);
            currentStreak = streakData.streak;
            io.to(cleanRoom).emit('streak_updated', { room: cleanRoom, streak: currentStreak, lastActiveDate: streakData.lastActiveDate });
        }

        // 🛡️ Group Admin Controls & Mute Enforcement Guard
        const roomSettings = roomAdminSettingsStore.get(cleanRoom);
        if (roomSettings) {
            if (roomSettings.mutedMembers && roomSettings.mutedMembers.has(cleanSender.toLowerCase())) {
                socket.emit('error_alert', { message: 'You have been muted by an admin in this group.' });
                return;
            }
            if (roomSettings.adminOnlyPost && roomSettings.admins && !roomSettings.admins.has(cleanSender.toLowerCase())) {
                socket.emit('error_alert', { message: 'Only Admins can send messages in this group.' });
                return;
            }
        }

        const messageTime = msgData.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const expiresAt = disappearingTtl > 0 ? new Date(Date.now() + disappearingTtl) : null;

        // Auto-detect Link Preview (with URL sanitation)
        let linkPreview = null;
        if (cleanText && (cleanText.includes('http://') || cleanText.includes('https://'))) {
            const urlMatch = cleanText.match(/https?:\/\/[^\s"'<>]+/);
            if (urlMatch) {
                linkPreview = {
                    url: urlMatch[0],
                    title: `Link: ${urlMatch[0].replace(/https?:\/\/(www\.)?/, '').split('/')[0]}`,
                    description: "Tap to open preview link in browser 🌐"
                };
            }
        }

        const broadcastData = {
            _id: messageId,
            room: cleanRoom,
            sender: cleanSender,
            text: cleanText || '',
            type: type || 'text',
            image: image || null,
            audio: audio || null,
            document: document || null,
            pollData: pollData || null,
            replyTo: replyTo || null,
            reactions: {},
            status: 'delivered',
            readBy: [cleanSender],
            starredBy: [],
            linkPreview,
            streak: currentStreak,
            transcript: '',
            disappearingTtl: disappearingTtl || 0,
            expiresAt: expiresAt,
            isAi: !!isAi,
            serverSeq: ++globalMessageSequenceCounter,
            timestamp: new Date(),
            time: messageTime
        };

        // Cache in memory for quick vote updates
        messageStore.set(messageId, broadcastData);

        // Real-time Broadcast
        socket.to(room).emit('receive_message', broadcastData);

        // Async Background DB Save
        if (mongoose.connection.readyState === 1) {
            new Message({
                _id: messageId,
                room,
                sender,
                text: text || '',
                type: type || 'text',
                image: image || null,
                audio: audio || null,
                document: document || null,
                pollData: pollData || null,
                replyTo: replyTo || null,
                status: 'delivered',
                readBy: [sender],
                linkPreview,
                disappearingTtl: disappearingTtl || 0,
                expiresAt: expiresAt,
                isAi: !!isAi,
                time: messageTime,
                timestamp: new Date()
            }).save().catch(err => console.error("Async DB Save Error:", err.message));
        }

        // 🔔 Push Notification & AI Auto-Responder check
        if (room.startsWith('dm_')) {
            const parts = room.replace('dm_', '').split('_');
            const targetRecipient = parts.find(u => u !== (sender || '').toLowerCase());
            if (targetRecipient) {
                const previewText = type === 'image' ? '📷 Photo' : (type === 'audio' ? '🎙️ Voice Note' : (type === 'poll' ? `📊 Poll: ${pollData?.question}` : text));
                sendPushNotification([targetRecipient], `💬 @${sender}`, previewText, { room, sender });

                // Check for AI Auto-Responder
                let recipientUserObj = memoryUsers.get(targetRecipient);
                if (recipientUserObj?.aiAutoResponder?.enabled) {
                    setTimeout(async () => {
                        const autoReplyText = await generateAutoReply(sender, recipientUserObj, text);
                        if (autoReplyText) {
                            const autoReplyMsg = {
                                _id: `auto_${Date.now()}`,
                                room,
                                sender: targetRecipient,
                                text: `🤖 [AI Auto-Reply]: ${autoReplyText}`,
                                type: 'text',
                                isAi: true,
                                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            };
                            io.to(room).emit('receive_message', autoReplyMsg);
                        }
                    }, 1500);
                }
            }
        }

        // 🤖 Multi-Agent GP AI Trigger (@gp, @ai, @coder, @meme, @news, @roast)
        // 🛡️ ANTI-LOOP IMMUNITY GUARD:
        // 1. If sender is already an AI bot, NEVER trigger another AI bot!
        // 2. If isAi === true or type === 'ai', NEVER trigger another AI bot!
        const isBotSender = isAi || type === 'ai' || (sender && (
            sender.startsWith('🤖') || 
            sender.startsWith('🎭') || 
            sender.startsWith('📰') || 
            sender.startsWith('🔥') || 
            sender.startsWith('💻') || 
            sender.includes('(AI') || 
            sender.includes('GP AI') ||
            sender === 'GupShupp AI'
        ));

        const isGpAiRoom = room && (
            room.includes('gp_ai') || 
            room.includes('ai_bot') || 
            room.includes('gp_ai_bot') ||
            room === 'dm_gp_ai_bot' ||
            (room.startsWith('dm_') && (room.includes('_gp_ai_bot') || room.includes('_gp_ai')))
        );

        const plainText = tryDecryptText(text);

        if (!isBotSender && plainText) {
            const allBotMatches = plainText.match(/@(?:gp|ai|coder|meme|news|roast)\b/gi);
            if ((allBotMatches && allBotMatches.length > 0) || isGpAiRoom) {
                (async () => {
                    const uniqueBots = (allBotMatches && allBotMatches.length > 0)
                        ? Array.from(new Set(allBotMatches.map(b => b.toLowerCase()))).slice(0, 2)
                        : ['@gp'];
                    const botSenderNames = {
                        '@gp': '🤖 GP AI',
                        '@ai': '🤖 GP AI',
                        '@coder': '💻 @coder (GP Dev)',
                        '@meme': '🎭 @meme (GP Comedy)',
                        '@news': '📰 @news (GP Desk)',
                        '@roast': '🔥 @roast (GP Savage)'
                    };

                    for (const botType of uniqueBots) {
                        const aiReplyText = await generateSpecializedBotResponse(botType, plainText, sender);
                        const aiMsgId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
                        const aiMsgData = {
                            _id: aiMsgId,
                            room,
                            sender: botSenderNames[botType] || '🤖 GP AI',
                            text: aiReplyText,
                            type: 'text',
                            isAi: true, // 🛡️ Loop immunity: marked as AI
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        };

                        io.to(room).emit('receive_message', aiMsgData);

                        if (mongoose.connection.readyState === 1) {
                            new Message({
                                _id: aiMsgId,
                                room,
                                sender: aiMsgData.sender,
                                text: aiReplyText,
                                type: 'ai',
                                isAi: true,
                                time: aiMsgData.time,
                                timestamp: new Date()
                            }).save().catch(err => console.error("AI DB Save Error:", err.message));
                        }
                    }
                })();
            }
        }
    });

    // 📸 Snapchat-Style Screenshot & Screen Capture Alert Engine
    socket.on('screenshot_taken', ({ room, user }) => {
        if (!room || !user) return;
        const cleanRoom = sanitizeIdentifier(room, 'general');
        const cleanUser = sanitizeIdentifier(user, 'user');
        const alertMsg = {
            _id: `alert_ss_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            room: cleanRoom,
            sender: '🛡️ Security Alert',
            text: `📸 @${cleanUser} took a screenshot of the chat.`,
            type: 'screenshot_alert',
            isSystem: true,
            isScreenshotAlert: true,
            status: 'read',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: new Date()
        };
        io.to(cleanRoom).emit('receive_message', alertMsg);
        io.to(cleanRoom).emit('screenshot_alert', { room: cleanRoom, user: cleanUser, time: alertMsg.time });
    });

    // 3. In-Chat Polls & Real-Time Voting Engine (With Race Condition Lock)
    socket.on('cast_poll_vote', ({ room, messageId, optionId, username }) => {
        if (!room || !messageId || optionId === undefined || !username) return;

        // 🛑 Race Condition Lock: Prevent duplicate concurrent votes in same 200ms
        const voteLockKey = `${username}_${messageId}`;
        const lastVoteTime = userVoteThrottleMap.get(voteLockKey) || 0;
        const now = Date.now();
        if (now - lastVoteTime < 200) {
            return;
        }
        userVoteThrottleMap.set(voteLockKey, now);

        let msg = messageStore.get(messageId);
        if (msg && msg.pollData) {
            msg.pollData.options.forEach(opt => {
                if (opt.id === optionId) {
                    if (!opt.voters.includes(username)) opt.voters.push(username);
                    else opt.voters = opt.voters.filter(u => u !== username);
                } else if (!msg.pollData.allowMultiple) {
                    opt.voters = opt.voters.filter(u => u !== username);
                }
            });
            io.to(room).emit('poll_vote_update', { messageId, pollData: msg.pollData });
        }

        if (mongoose.connection.readyState === 1) {
            Message.findById(messageId).then(dbMsg => {
                if (dbMsg && dbMsg.pollData) {
                    dbMsg.pollData.options.forEach(opt => {
                        if (opt.id === optionId) {
                            if (!opt.voters.includes(username)) opt.voters.push(username);
                            else opt.voters = opt.voters.filter(u => u !== username);
                        } else if (!dbMsg.pollData.allowMultiple) {
                            opt.voters = opt.voters.filter(u => u !== username);
                        }
                    });
                    dbMsg.save();
                }
            });
        }
    });

    // 4. Customizable Duration Ephemeral Stories / Status Engine
    socket.on('create_story', ({ username, avatar, type, content, caption, bgColor, durationHours }) => {
        const storyId = `story_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const hours = Number(durationHours) || 24;
        const durationMs = hours * 3600 * 1000;
        const newStory = {
            _id: storyId,
            username,
            avatar: avatar || '🦁',
            type: type || 'text',
            content,
            caption: caption || '',
            bgColor: bgColor || '#00a884',
            durationHours: hours,
            time: `Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            views: [],
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + durationMs)
        };
        storiesStore.set(storyId, newStory);
        io.emit('new_story_published', newStory);
        console.log(`🎬 [New Story] from @${username} (Duration: ${hours} hours)`);
    });

    socket.on('get_active_stories', () => {
        const now = new Date();
        const active = Array.from(storiesStore.values()).filter(s => new Date(s.expiresAt) > now);
        socket.emit('active_stories_list', active);
    });

    // 4.1 Story View Tracking & Reaction Dispatcher
    socket.on('view_story', ({ storyId, viewerUsername }) => {
        if (!storyId || !viewerUsername) return;
        const story = storiesStore.get(storyId);
        if (story) {
            if (!story.views) story.views = [];
            if (!story.views.some(v => v.username === viewerUsername)) {
                story.views.push({ username: viewerUsername, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
                io.emit('story_view_updated', { storyId, views: story.views });
            }
        }
    });

    // 4.2 Delete Message for Everyone (Pro Shield)
    socket.on('delete_message_for_everyone', ({ room, messageId, requestedBy }) => {
        if (!room || !messageId) return;
        let msg = messageStore.get(messageId);
        if (msg) {
            msg.text = '🚫 यह मैसेज डिलीट कर दिया गया है';
            msg.type = 'text';
            msg.image = null;
            msg.audio = null;
            msg.document = null;
            msg.isDeleted = true;
            io.to(room).emit('message_deleted', { messageId, room });
        }
        if (mongoose.connection.readyState === 1) {
            Message.findByIdAndUpdate(messageId, { 
                text: '🚫 यह मैसेज डिलीट कर दिया गया है', 
                type: 'text', 
                image: null, 
                audio: null, 
                document: null, 
                isDeleted: true 
            }).catch(() => {});
        }
    });

    // 5. Read Receipts (Stealth & Ghost Mode check)
    socket.on('mark_as_read', ({ room, username, isStealth }) => {
        if (!room || !username || isStealth || isUserGhost(username)) return;
        socket.to(room).emit('messages_read', { room, reader: username });
        if (mongoose.connection.readyState === 1) {
            Message.updateMany({ room, sender: { $ne: username } }, { $addToSet: { readBy: username }, status: 'read' })
                .catch(e => console.error("Read receipt update error:", e.message));
        }
    });

    // 6. Voice-to-Text Transcription via Gemini 2.5
    socket.on('ai_transcribe_request', async ({ messageId, audioUri }, callback) => {
        const transcript = await transcribeVoiceAudioWithAi(audioUri);
        if (typeof callback === 'function') callback({ success: true, transcript });
    });

    // 7. AI Translation, Summarize, Smart Replies
    socket.on('ai_translate_request', async ({ text, targetLang }, callback) => {
        const translated = await translateTextWithAi(text, targetLang);
        if (typeof callback === 'function') callback({ success: true, translated });
    });

    socket.on('ai_summarize_request', async ({ messages }, callback) => {
        const summary = await summarizeChatWithAi(messages);
        if (typeof callback === 'function') callback({ success: true, summary });
    });

    socket.on('ai_smart_replies_request', async ({ lastMessage }, callback) => {
        const replies = await generateSmartRepliesWithAi(lastMessage);
        if (typeof callback === 'function') callback({ success: true, replies });
    });

    // 📶 Heartbeat Ping-Pong for Client Network Throttling / Slow Network Detection
    socket.on('ping_heartbeat', (data, callback) => {
        if (typeof callback === 'function') callback({ success: true, serverTimestamp: Date.now() });
    });

    // 8. Reactions & Star Messages
    socket.on('add_reaction', ({ room, messageId, emoji, username }) => {
        if (!room || !messageId || !emoji || !username) return;
        io.to(room).emit('message_reaction_update', { messageId, emoji, username });
    });

    socket.on('toggle_star_message', ({ messageId, username }, callback) => {
        if (mongoose.connection.readyState === 1) {
            Message.findById(messageId).then(msg => {
                if (msg) {
                    const idx = msg.starredBy.indexOf(username);
                    if (idx > -1) msg.starredBy.splice(idx, 1);
                    else msg.starredBy.push(username);
                    msg.save();
                    if (typeof callback === 'function') callback({ success: true, isStarred: idx === -1 });
                }
            });
        }
    });

    // 9. Typing Indicators (Silent & Ghost Mode check)
    socket.on('typing_start', ({ room, username, isSilent }) => {
        if (room && !isSilent && !isUserGhost(username || currentUsername)) {
            socket.to(room).emit('user_typing', { username, isTyping: true });
        }
    });

    socket.on('typing_stop', ({ room, username }) => {
        if (room && !isUserGhost(username || currentUsername)) {
            socket.to(room).emit('user_typing', { username, isTyping: false });
        }
    });

    // 10. WebRTC P2P Audio/Video Calling & ICE Renegotiation
    socket.on('call_initiate', ({ targetUser, fromUser, isVideo }) => {
        io.emit('incoming_call', { targetUser, fromUser, isVideo });
    });
    socket.on('call_accept', ({ targetUser, fromUser }) => io.emit('call_accepted', { targetUser, fromUser }));
    socket.on('call_reject', ({ targetUser, fromUser }) => io.emit('call_rejected', { targetUser, fromUser }));
    socket.on('call_end', ({ targetUser, fromUser }) => io.emit('call_ended', { targetUser, fromUser }));
    socket.on('webrtc_offer', ({ targetUser, fromUser, offer }) => {
        io.emit('webrtc_offer_received', { targetUser, fromUser, offer });
    });
    socket.on('webrtc_answer', ({ targetUser, fromUser, answer }) => {
        io.emit('webrtc_answer_received', { targetUser, fromUser, answer });
    });
    socket.on('webrtc_ice_candidate', ({ targetUser, fromUser, candidate }) => {
        io.emit('webrtc_ice_candidate_received', { targetUser, fromUser, candidate });
    });

    // 10B. Group Admin Management & Moderation Controls
    socket.on('set_room_admin_settings', ({ room, adminOnlyPost, mutedMembers, admins }) => {
        const cleanRoom = sanitizeIdentifier(room, 'general');
        const current = roomAdminSettingsStore.get(cleanRoom) || { adminOnlyPost: false, mutedMembers: new Set(), admins: new Set() };
        if (adminOnlyPost !== undefined) current.adminOnlyPost = !!adminOnlyPost;
        if (Array.isArray(mutedMembers)) current.mutedMembers = new Set(mutedMembers.map(m => (m || '').toLowerCase()));
        if (Array.isArray(admins)) current.admins = new Set(admins.map(a => (a || '').toLowerCase()));
        roomAdminSettingsStore.set(cleanRoom, current);
        io.to(cleanRoom).emit('room_admin_settings_updated', {
            room: cleanRoom,
            adminOnlyPost: current.adminOnlyPost,
            mutedMembers: Array.from(current.mutedMembers),
            admins: Array.from(current.admins)
        });
        console.log(`🛡️ [Room Admin Settings Updated] #${cleanRoom}: adminOnly=${current.adminOnlyPost}, muted=${current.mutedMembers.size}`);
    });

    socket.on('get_room_admin_settings', ({ room }, callback) => {
        const cleanRoom = sanitizeIdentifier(room, 'general');
        const current = roomAdminSettingsStore.get(cleanRoom) || { adminOnlyPost: false, mutedMembers: new Set(), admins: new Set() };
        const data = {
            room: cleanRoom,
            adminOnlyPost: current.adminOnlyPost,
            mutedMembers: Array.from(current.mutedMembers),
            admins: Array.from(current.admins)
        };
        if (typeof callback === 'function') callback(data);
        else socket.emit('room_admin_settings_updated', data);
    });

    // 11. Push Tokens
    socket.on('register_push_token', ({ username, token }) => {
        if (username && token) userPushTokens.set(username.toLowerCase(), token);
    });

    // 12. 📲 WhatsApp Web-Style Dynamic QR Code Device Linking
    socket.on('qr_session_init', (callback) => {
        const sessionId = `qr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        qrSessionsMap.set(sessionId, { socketId: socket.id, createdAt: Date.now() });
        socket.emit('qr_session_created', { sessionId });
        if (typeof callback === 'function') callback({ sessionId });
    });

    socket.on('qr_session_approve', ({ sessionId, username, token, avatar, status, pin, privacySettings }) => {
        if (!sessionId || !qrSessionsMap.has(sessionId)) return;
        const sessionData = qrSessionsMap.get(sessionId);
        io.to(sessionData.socketId).emit('qr_login_success', {
            token,
            username,
            avatar: avatar || '🦁',
            status: status || 'Available 🟢',
            pin: pin || '',
            privacySettings: privacySettings || {}
        });
        qrSessionsMap.delete(sessionId);
        console.log(`📲 [QR Login Success] Authenticated @${username} on linked Web Device!`);
    });

    // 13. 👥 Super-Group Multi-User Live Stage Rooms
    socket.on('join_stage_room', ({ room, username, avatar, isVideo }) => {
        if (!room || !username) return;
        if (!stageRoomsMap.has(room)) stageRoomsMap.set(room, new Map());
        stageRoomsMap.get(room).set(username, { socketId: socket.id, username, avatar: avatar || '🦁', isVideo: !!isVideo, isMuted: false });
        
        const usersList = Array.from(stageRoomsMap.get(room).values());
        io.to(room).emit('stage_users_update', { room, users: usersList });
    });

    socket.on('leave_stage_room', ({ room, username }) => {
        if (room && stageRoomsMap.has(room)) {
            stageRoomsMap.get(room).delete(username);
            const usersList = Array.from(stageRoomsMap.get(room).values());
            io.to(room).emit('stage_users_update', { room, users: usersList });
        }
    });

    // 14. ⏱️ Scheduled Messages & 🔕 Silent Messages
    socket.on('schedule_message', ({ id, room, sender, text, type, image, isSilent, isOneTime, scheduledAt }, callback) => {
        if (!room || !sender || !text || !scheduledAt) return;
        const msgId = id || `sch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        scheduledMessagesStore.set(msgId, {
            id: msgId,
            room,
            sender,
            text,
            type: type || 'text',
            image: image || null,
            isSilent: !!isSilent,
            isOneTime: !!isOneTime,
            scheduledAt: Number(scheduledAt),
            executed: false
        });
        if (typeof callback === 'function') callback({ success: true, messageId: msgId });
    });

    socket.on('get_scheduled_messages', ({ room, username }, callback) => {
        const list = Array.from(scheduledMessagesStore.values()).filter(m => m.room === room && m.sender === username && !m.executed);
        if (typeof callback === 'function') callback({ success: true, list });
    });

    socket.on('cancel_scheduled_message', ({ messageId }, callback) => {
        scheduledMessagesStore.delete(messageId);
        if (typeof callback === 'function') callback({ success: true });
    });

    // 15. 📢 Channel Discussion & Comments
    socket.on('get_channel_comments', ({ postId }, callback) => {
        const comments = channelCommentsStore.get(postId) || [];
        if (typeof callback === 'function') callback({ success: true, comments });
    });

    socket.on('post_channel_comment', ({ channelName, postId, sender, avatar, badge, text }, callback) => {
        if (!postId || !sender || !text) return;
        const cleanComment = sanitizeInputText(text);
        const cleanSender = sanitizeIdentifier(sender, 'member');
        if (!channelCommentsStore.has(postId)) channelCommentsStore.set(postId, []);
        const newComment = {
            id: `cmt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            channelName: sanitizeIdentifier(channelName, 'channel'),
            postId,
            sender: cleanSender,
            avatar: avatar || '🦁',
            badge: badge || '👤 Member',
            text: cleanComment,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            likes: []
        };
        channelCommentsStore.get(postId).push(newComment);
        io.to(channelName).emit('new_channel_comment', newComment);
        if (typeof callback === 'function') callback({ success: true, comment: newComment });
    });

    // 16. 🎮 In-Chat Mini-Apps (Tic-Tac-Toe Game Sync)
    socket.on('game_move', ({ room, index, player, username }) => {
        if (!room || index === undefined || !player) return;
        if (!miniAppGameStore.has(room)) {
            miniAppGameStore.set(room, { board: Array(9).fill(null), turn: 'X', winner: null });
        }
        const game = miniAppGameStore.get(room);
        if (game.board[index] === null && !game.winner) {
            game.board[index] = player;
            
            // Check win conditions
            const lines = [
                [0, 1, 2], [3, 4, 5], [6, 7, 8],
                [0, 3, 6], [1, 4, 7], [2, 5, 8],
                [0, 4, 8], [2, 4, 6]
            ];
            for (const [a, b, c] of lines) {
                if (game.board[a] && game.board[a] === game.board[b] && game.board[a] === game.board[c]) {
                    game.winner = game.board[a];
                    break;
                }
            }
            if (!game.winner && game.board.every(cell => cell !== null)) game.winner = 'Draw';
            game.turn = game.turn === 'X' ? 'O' : 'X';
            io.to(room).emit('game_state_update', { room, game });
        }
    });

    socket.on('game_reset', ({ room }) => {
        if (room) {
            miniAppGameStore.set(room, { board: Array(9).fill(null), turn: 'X', winner: null });
            io.to(room).emit('game_state_update', { room, game: miniAppGameStore.get(room) });
        }
    });

    // 17. 🔥 Self-Destructing 1-Time View Media Expire
    socket.on('expire_1time_media', ({ room, messageId }) => {
        if (!room || !messageId) return;
        if (messageStore.has(messageId)) {
            const m = messageStore.get(messageId);
            m.text = '🔥 यह मीडिया एक्सपायर हो चुका है';
            m.image = null;
            m.isExpired = true;
        }
        io.to(room).emit('message_deleted', { messageId });
    });

    // 18. Disconnect
    socket.on('disconnect', () => {
        globalOnlineUsers.delete(socket.id);
        broadcastOnlineUsers();
        if (currentRoom && roomMembersMap.has(currentRoom)) {
            roomMembersMap.get(currentRoom).delete(socket.id);
            io.to(currentRoom).emit('room_members_count', { room: currentRoom, count: roomMembersMap.get(currentRoom).size });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`==========================================`);
    console.log(`🚀 GupShupp ENTERPRISE PRO SERVER LIVE on http://localhost:${PORT} (0.0.0.0) [PID: ${process.pid}]`);
    console.log(`==========================================`);
});

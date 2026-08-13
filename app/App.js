import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  FlatList, SafeAreaView, StatusBar, KeyboardAvoidingView, 
  Platform, ActivityIndicator, Image, ImageBackground, Modal, ScrollView, Animated,
  Keyboard, Linking
} from 'react-native';
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

// Safe Platform-Specific Notification Manager
let Notifications = null;
let Device = null;
if (Platform.OS !== 'web') {
  try {
    Notifications = require('expo-notifications');
    Device = require('expo-device');
    if (Notifications && Notifications.setNotificationHandler) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    }
  } catch (e) {}
}

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web' || !Notifications) return null;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'GupShupp Messages',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#128C7E',
        sound: 'default',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync().catch(() => null);
    return tokenData?.data || null;
  } catch (e) {
    return null;
  }
}

// 🌐 Backend Server Host Config
const LOCAL_PC_IP = "10.128.7.140";
const ORACLE_CLOUD_IP = "140.238.225.236";
const USE_ORACLE_CLOUD = false;

const SERVER_HOST = USE_ORACLE_CLOUD ? ORACLE_CLOUD_IP : (Platform.OS === 'web' ? 'localhost' : LOCAL_PC_IP);
const BASE_URL = `http://${SERVER_HOST}:3000`;
const SOCKET_URL = BASE_URL;

const socket = io(SOCKET_URL, { 
  transports: ['websocket', 'polling'],
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});

// Universal Safe Storage Helper
const Storage = {
  getItem: async (key) => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      if (AsyncStorage && typeof AsyncStorage.getItem === 'function') {
        return await AsyncStorage.getItem(key);
      }
    } catch (e) {}
    return null;
  },
  setItem: async (key, value) => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
      if (AsyncStorage && typeof AsyncStorage.setItem === 'function') {
        await AsyncStorage.setItem(key, value);
      }
    } catch (e) {}
  },
  removeItem: async (key) => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
      if (AsyncStorage && typeof AsyncStorage.removeItem === 'function') {
        await AsyncStorage.removeItem(key);
      }
    } catch (e) {}
  }
};

// 🔒 E2EE Symmetric Encryption Cipher
const E2EE_KEY = 42;
const encryptText = (text) => {
  if (!text) return '';
  let encrypted = '';
  for (let i = 0; i < text.length; i++) {
    encrypted += String.fromCharCode(text.charCodeAt(i) ^ E2EE_KEY);
  }
  return '🔒[E2EE]:' + encodeURIComponent(encrypted);
};

const decryptText = (cipher) => {
  if (!cipher) return '';
  if (!cipher.startsWith('🔒[E2EE]:')) return cipher;
  try {
    const raw = decodeURIComponent(cipher.replace('🔒[E2EE]:', ''));
    let decrypted = '';
    for (let i = 0; i < raw.length; i++) {
      decrypted += String.fromCharCode(raw.charCodeAt(i) ^ E2EE_KEY);
    }
    return decrypted;
  } catch (e) {
    return cipher;
  }
};

export default function App() {
  // 🌙 AMOLED Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // 🧭 Navigation & Auth State
  const [screen, setScreen] = useState('LOADING'); // 'LOADING' | 'PIN_LOCK' | 'AUTH' | 'HOME' | 'CHAT'
  const [authTab, setAuthTab] = useState('LOGIN'); // 'LOGIN' | 'SIGNUP'
  const [currentUser, setCurrentUser] = useState('');
  const [userAvatar, setUserAvatar] = useState('🦁');
  const [userStatus, setUserStatus] = useState('Available 🟢');
  const [userPin, setUserPin] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // 👻 Ghost Mode & Privacy Settings
  const [ghostMode, setGhostMode] = useState(false);
  const [stealthRead, setStealthRead] = useState(false);
  const [silentTyping, setSilentTyping] = useState(false);

  // 🤖 AI Auto-Responder Settings
  const [aiAutoResponderEnabled, setAiAutoResponderEnabled] = useState(false);
  const [awayStatus, setAwayStatus] = useState('In Meeting ☕');
  const [awayContextPrompt, setAwayContextPrompt] = useState('In a meeting, reply politely and take note!');

  // 🗂️ Smart Chat Folders: 'ALL' | 'UNREAD' | 'DM' | 'GROUPS' | 'CHANNELS'
  const [chatFolder, setChatFolder] = useState('ALL');
  const [pinnedChats, setPinnedChats] = useState(['tech']);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [recentChats, setRecentChats] = useState([
    { id: 'tech', title: '#tech', type: 'group', lastMsg: 'AI-पावर्ड सुपर ग्रुप चालू है 🚀', time: '1:45 AM', unread: 2, avatar: '🤖' },
    { id: 'friends', title: '#friends', type: 'group', lastMsg: 'चल आज शाम को मिलते हैं!', time: '1:30 AM', unread: 0, avatar: '🎉' },
    { id: 'gaming', title: '#gaming', type: 'group', lastMsg: 'BGMI टूर्नामेंट आज रात 9 बजे!', time: 'Yesterday', unread: 0, avatar: '🎮' }
  ]);

  // 🎬 Customizable Duration Ephemeral Stories / Status Tray
  const [stories, setStories] = useState([
    { _id: 's1', username: 'GupShupp AI', avatar: '🤖', type: 'text', content: 'GupShupp 3.0 PRO Live! 🎉 सभी 10 प्रीमियम फीचर्स अब 100% फ्री!', bgColor: '#00a884', durationHours: 24, views: [] },
  ]);
  const [activeStoryModal, setActiveStoryModal] = useState(null); // story object
  const [showCreateStoryModal, setShowCreateStoryModal] = useState(false);
  const [newStoryText, setNewStoryText] = useState('');
  const [newStoryBgColor, setNewStoryBgColor] = useState('#00a884');
  const [newStoryDurationHours, setNewStoryDurationHours] = useState(24);
  const [storyReplyInput, setStoryReplyInput] = useState('');
  const [showStoryViewers, setShowStoryViewers] = useState(false);

  // Channels
  const [channels, setChannels] = useState([
    { name: 'tech_updates', description: 'Tech News, AI & Coding Updates 🚀', creator: 'admin', subscribersCount: 64 },
    { name: 'announcements', description: 'Official GupShupp Feature Releases 📢', creator: 'admin', subscribersCount: 180 }
  ]);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);

  // 📱 Active Chat State
  const [activeRoom, setActiveRoom] = useState('');
  const [chatTitle, setChatTitle] = useState('');
  const [isDirectChat, setIsDirectChat] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [activeMembersCount, setActiveMembersCount] = useState(1);
  const [typingUser, setTypingUser] = useState('');

  // 🔍 In-Chat Message Search
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 📊 In-Chat Interactive Polls
  const [showCreatePollModal, setShowCreatePollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['Option 1', 'Option 2']);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);

  // 🤖 AI Co-Pilot Features (Gemini 2.5)
  const [aiSmartReplies, setAiSmartReplies] = useState([]);
  const [aiSummaryModal, setAiSummaryModal] = useState(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [translatedMessages, setTranslatedMessages] = useState({});
  const [transcribedAudioMap, setTranscribedAudioMap] = useState({});

  // 🔄 Quoted Reply & Reactions
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [selectedMessageForAction, setSelectedMessageForAction] = useState(null);
  const [selectedImageModal, setSelectedImageModal] = useState(null);
  const [audioSpeedMap, setAudioSpeedMap] = useState({});

  // ⏳ Disappearing Messages (0 = off, 3600000 = 1h, 86400000 = 24h)
  const [disappearingTtl, setDisappearingTtl] = useState(0);
  const [showDisappearingModal, setShowDisappearingModal] = useState(false);

  // 🎙️ Voice Notes
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef(null);

  // 📞 WebRTC HD Calling
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isPiPMinimized, setIsPiPMinimized] = useState(false);
  const callTimerRef = useRef(null);

  // 🎨 Dynamic Chat Wallpapers: 'amoled' | 'doodle' | 'emerald' | 'slate'
  const [chatWallpaper, setChatWallpaper] = useState('amoled');
  const [showWallpaperModal, setShowWallpaperModal] = useState(false);
  const [isHdMediaMode, setIsHdMediaMode] = useState(false);
  const [slowModeCooldown, setSlowModeCooldown] = useState(0);

  // 📲 WhatsApp Web-Style QR Code Session
  const [webQrSessionId, setWebQrSessionId] = useState('');
  const [showLinkedDevicesModal, setShowLinkedDevicesModal] = useState(false);
  const [qrCodeToScanInput, setQrCodeToScanInput] = useState('');

  // 👥 Super-Group Live Stage Rooms
  const [activeStageRoom, setActiveStageRoom] = useState(null); // room name
  const [stageUsers, setStageUsers] = useState([]);
  const [isStageMuted, setIsStageMuted] = useState(false);
  const [isStageVideoOn, setIsStageVideoOn] = useState(false);

  // 📂 Shared Media & Docs Vault Modal
  const [showSharedMediaVault, setShowSharedMediaVault] = useState(false);
  const [mediaVaultTab, setMediaVaultTab] = useState('MEDIA'); // 'MEDIA' | 'DOCS' | 'LINKS'

  // ⏱️ Phase 5: Scheduled & Silent Messages
  const [showSendOptionsModal, setShowSendOptionsModal] = useState(false);
  
  // 📢 Phase 5: Channel Comments & Discussion Threads
  const [activeChannelPostForComments, setActiveChannelPostForComments] = useState(null);
  const [channelComments, setChannelComments] = useState([]);
  const [newChannelCommentText, setNewChannelCommentText] = useState('');

  // 🎮 Phase 5: Mini-Apps & Interactive Games Platform
  const [showMiniAppModal, setShowMiniAppModal] = useState(false);
  const [miniAppTab, setMiniAppTab] = useState('GAMES'); // 'GAMES' | 'DICE' | 'CALC'
  const [tictactoeGame, setTictactoeGame] = useState({ board: Array(9).fill(null), turn: 'X', winner: null });
  const [diceResult, setDiceResult] = useState(null);
  const [coinResult, setCoinResult] = useState(null);
  const [calcBillTotal, setCalcBillTotal] = useState('');
  const [calcPeopleCount, setCalcPeopleCount] = useState('2');

  // 🔥 Phase 5: Self-Destructing 1-Time Media
  const [isOneTimeMediaMode, setIsOneTimeMediaMode] = useState(false);
  const [activeOneTimePhoto, setActiveOneTimePhoto] = useState(null); // { image, messageId, remainingSec: 5 }

  // ⭐ Phase 5: Telegram VIP Profile Badges
  const [userVipBadge, setUserVipBadge] = useState('⭐ VIP');

  // 🌐 Phase 5: Live Translation Header Bar
  const [isLiveTranslateActive, setIsLiveTranslateActive] = useState(false);
  const [liveTranslateLang, setLiveTranslateLang] = useState('Hindi');

  // Home Bottom Tabs: 'CHATS' | 'GROUPS' | 'CHANNELS' | 'PROFILE'
  const [bottomNav, setBottomNav] = useState('CHATS');

  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // 🎨 Phase 6: Neo-Gen Signature Appearance Studio State
  const [activeThemeId, setActiveThemeId] = useState('CYBER'); // 'CYBER' | 'GOLD' | 'SUNSET' | 'MATRIX' | 'FROST'
  const [bubbleGeometry, setBubbleGeometry] = useState('PILL'); // 'PILL' | 'SQUIRCLE' | 'ANGULAR'
  const [fontSizeScale, setFontSizeScale] = useState('STANDARD'); // 'COMPACT' | 'STANDARD' | 'LARGE'
  const [customWallpaperUri, setCustomWallpaperUri] = useState(null);
  const [showAppearanceStudioModal, setShowAppearanceStudioModal] = useState(false);

  const THEME_PALETTES = {
    CYBER: {
      id: 'CYBER',
      name: '⚡ Cyber Neon',
      bg: '#080c14',
      surface: '#0f172a',
      card: '#1e293b',
      border: '#334155',
      text: '#f8fafc',
      textMuted: '#94a3b8',
      accent: '#00f0ff',
      accentLight: '#38bdf8',
      accentSecondary: '#8b5cf6',
      bubbleMine: '#0284c7',
      bubbleOther: '#1e293b',
      bubbleAi: '#082f49',
      aiBorder: '#00f0ff',
      headerBg: '#0b1120',
      inputBg: '#0f172a',
      navBg: 'rgba(15, 23, 42, 0.95)',
      glow: '#00f0ff'
    },
    GOLD: {
      id: 'GOLD',
      name: '👑 Obsidian Gold',
      bg: '#0a0a0a',
      surface: '#141414',
      card: '#1f1f1f',
      border: '#2e2e2e',
      text: '#fef3c7',
      textMuted: '#a3a3a3',
      accent: '#f59e0b',
      accentLight: '#fbbf24',
      accentSecondary: '#d97706',
      bubbleMine: '#78350f',
      bubbleOther: '#1f1f1f',
      bubbleAi: '#451a03',
      aiBorder: '#f59e0b',
      headerBg: '#121212',
      inputBg: '#141414',
      navBg: 'rgba(20, 20, 20, 0.95)',
      glow: '#f59e0b'
    },
    SUNSET: {
      id: 'SUNSET',
      name: '🔥 Sunset Vaporwave',
      bg: '#12071a',
      surface: '#1c0d29',
      card: '#29143b',
      border: '#3d1d57',
      text: '#fce7f3',
      textMuted: '#d8b4fe',
      accent: '#f43f5e',
      accentLight: '#fb7185',
      accentSecondary: '#fb923c',
      bubbleMine: '#9f1239',
      bubbleOther: '#29143b',
      bubbleAi: '#4c0519',
      aiBorder: '#f43f5e',
      headerBg: '#170924',
      inputBg: '#1c0d29',
      navBg: 'rgba(28, 13, 41, 0.95)',
      glow: '#f43f5e'
    },
    MATRIX: {
      id: 'MATRIX',
      name: '🟢 Matrix Cyber',
      bg: '#03120b',
      surface: '#072014',
      card: '#0d3321',
      border: '#174a32',
      text: '#d1fae5',
      textMuted: '#6ee7b7',
      accent: '#10b981',
      accentLight: '#34d399',
      accentSecondary: '#059669',
      bubbleMine: '#065f46',
      bubbleOther: '#0d3321',
      bubbleAi: '#022c22',
      aiBorder: '#10b981',
      headerBg: '#051b10',
      inputBg: '#072014',
      navBg: 'rgba(7, 32, 20, 0.95)',
      glow: '#10b981'
    },
    FROST: {
      id: 'FROST',
      name: '💎 Frost Sapphire',
      bg: '#f1f5f9',
      surface: '#ffffff',
      card: '#e2e8f0',
      border: '#cbd5e1',
      text: '#0f172a',
      textMuted: '#64748b',
      accent: '#2563eb',
      accentLight: '#3b82f6',
      accentSecondary: '#60a5fa',
      bubbleMine: '#2563eb',
      bubbleOther: '#ffffff',
      bubbleAi: '#eff6ff',
      aiBorder: '#2563eb',
      headerBg: '#ffffff',
      inputBg: '#e2e8f0',
      navBg: 'rgba(255, 255, 255, 0.95)',
      glow: '#2563eb'
    }
  };

  const theme = THEME_PALETTES[activeThemeId] || THEME_PALETTES.CYBER;

  const getBubbleRadius = () => {
    if (bubbleGeometry === 'PILL') return 22;
    if (bubbleGeometry === 'ANGULAR') return 6;
    return 14; // SQUIRCLE
  };

  const getFontSize = () => {
    if (fontSizeScale === 'COMPACT') return 13;
    if (fontSizeScale === 'LARGE') return 18;
    return 15; // STANDARD
  };

  // Custom Gallery Wallpaper Picker
  const pickCustomWallpaperFromGallery = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        alert('वॉलपेपर सेट करने के लिए गैलरी परमिशन आवश्यक है।');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
        base64: true
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const base64Uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setCustomWallpaperUri(base64Uri);
        await Storage.setItem('@gupshupp_custom_wallpaper', base64Uri);
        alert('🎉 कस्टम गैलरी वॉलपेपर सफलतापूर्वक सेट हो गया!');
      }
    } catch (e) {
      alert('वॉलपेपर सेलेक्ट करने में समस्या आई।');
    }
  };

  const removeCustomWallpaper = async () => {
    setCustomWallpaperUri(null);
    await Storage.removeItem('@gupshupp_custom_wallpaper');
    alert('वॉलपेपर डिफॉल्ट थीम पर रीसेट कर दिया गया।');
  };

  // 1. Initial Session Check & Settings Loading
  useEffect(() => {
    const init = async () => {
      try {
        const savedTheme = await Storage.getItem('@gupshupp_theme');
        if (savedTheme !== null) setIsDarkMode(savedTheme === 'dark');

        const savedActiveTheme = await Storage.getItem('@gupshupp_active_theme');
        if (savedActiveTheme) setActiveThemeId(savedActiveTheme);

        const savedBubbleGeo = await Storage.getItem('@gupshupp_bubble_geometry');
        if (savedBubbleGeo) setBubbleGeometry(savedBubbleGeo);

        const savedFontScale = await Storage.getItem('@gupshupp_font_scale');
        if (savedFontScale) setFontSizeScale(savedFontScale);

        const savedCustomWall = await Storage.getItem('@gupshupp_custom_wallpaper');
        if (savedCustomWall) setCustomWallpaperUri(savedCustomWall);

        const savedToken = await Storage.getItem('@gupshupp_token');
        const savedUser = await Storage.getItem('@gupshupp_user');
        const savedPin = await Storage.getItem('@gupshupp_pin');
        const savedAvatar = await Storage.getItem('@gupshupp_avatar');
        const savedStatus = await Storage.getItem('@gupshupp_status');
        const savedGhost = await Storage.getItem('@gupshupp_ghost');
        const savedPinned = await Storage.getItem('@gupshupp_pinned');
        const savedWallpaper = await Storage.getItem('@gupshupp_wallpaper');

        if (savedAvatar) setUserAvatar(savedAvatar);
        if (savedStatus) setUserStatus(savedStatus);
        if (savedPin) setUserPin(savedPin);
        if (savedGhost) setGhostMode(savedGhost === 'true');
        if (savedPinned) setPinnedChats(JSON.parse(savedPinned));
        if (savedWallpaper) setChatWallpaper(savedWallpaper);

        if (savedToken && savedUser) {
          setAuthToken(savedToken);
          setCurrentUser(savedUser);
          socket.emit('set_user_presence', { 
            username: savedUser, 
            avatar: savedAvatar || '🦁', 
            status: savedStatus || 'Available 🟢',
            privacySettings: { ghostMode: savedGhost === 'true' }
          });
          
          if (savedPin) setScreen('PIN_LOCK');
          else setScreen('HOME');
        } else {
          setScreen('AUTH');
        }
      } catch (e) {
        setScreen('AUTH');
      }
    };
    init();
  }, []);

  // 2. Socket Connectivity & Global Event Listeners
  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      setIsConnected(true);
      if (currentUser) {
        socket.emit('set_user_presence', { 
          username: currentUser, 
          avatar: userAvatar, 
          status: userStatus,
          privacySettings: { ghostMode }
        });
        registerForPushNotificationsAsync().then((token) => {
          if (token) socket.emit('register_push_token', { username: currentUser, token });
        });
      }
      socket.emit('get_online_users');
      socket.emit('get_channels_list');
      socket.emit('get_active_stories');
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('receive_message', (data) => {
      setMessages((prev) => [...prev, data]);

      // Update Recent Chats snippet
      setRecentChats((prev) => {
        const title = data.room.startsWith('dm_') ? `@${data.sender}` : `#${data.room}`;
        const existingIdx = prev.findIndex(c => c.id === data.room);
        const snippet = data.type === 'image' ? '📷 Photo' : (data.type === 'audio' ? '🎙️ Voice Note' : (data.type === 'poll' ? `📊 Poll: ${data.pollData?.question}` : decryptText(data.text)));
        const newEntry = {
          id: data.room,
          title,
          type: data.room.startsWith('dm_') ? 'dm' : 'group',
          lastMsg: snippet,
          time: data.time || 'Just now',
          unread: (existingIdx > -1 ? prev[existingIdx].unread : 0) + (data.sender !== currentUser ? 1 : 0),
          avatar: data.isAi ? '🤖' : (data.room.startsWith('dm_') ? '👤' : '👥')
        };
        if (existingIdx > -1) {
          const updated = [...prev];
          updated.splice(existingIdx, 1);
          return [newEntry, ...updated];
        }
        return [newEntry, ...prev];
      });

      // Push Notification trigger
      if (data && !data.isSystem && data.sender !== currentUser && Platform.OS !== 'web') {
        const decryptedBody = decryptText(data.text);
        Notifications.scheduleNotificationAsync({
          content: {
            title: `💬 @${data.sender}`,
            body: data.type === 'image' ? '📷 Photo' : (data.type === 'audio' ? '🎙️ Voice Note' : decryptedBody),
            sound: 'default',
            data: { room: data.room, sender: data.sender }
          },
          trigger: null,
        }).catch(() => {});
      }

      // Fetch AI Smart Replies if message is for me
      if (data.sender !== currentUser && !data.isSystem && data.type === 'text') {
        socket.emit('ai_smart_replies_request', { lastMessage: decryptText(data.text) }, (res) => {
          if (res?.success && Array.isArray(res.replies)) setAiSmartReplies(res.replies);
        });
      }
    });

    socket.on('load_history', (history) => {
      if (Array.isArray(history)) setMessages(history);
      setIsLoadingHistory(false);
    });

    socket.on('messages_read', ({ reader }) => {
      setMessages((prev) => prev.map(m => ({ ...m, status: 'read', readBy: [...(m.readBy || []), reader] })));
    });

    socket.on('poll_vote_update', ({ messageId, pollData }) => {
      setMessages((prev) => prev.map(m => m._id === messageId ? { ...m, pollData } : m));
    });

    socket.on('message_reaction_update', ({ messageId, emoji, username }) => {
      setMessages((prev) => prev.map((msg) => {
        if (msg._id === messageId) {
          const updatedReactions = { ...(msg.reactions || {}) };
          if (!updatedReactions[emoji]) updatedReactions[emoji] = [];
          if (!updatedReactions[emoji].includes(username)) updatedReactions[emoji].push(username);
          return { ...msg, reactions: updatedReactions };
        }
        return msg;
      }));
    });

    socket.on('story_view_updated', ({ storyId, views }) => {
      setStories((prev) => prev.map(s => s._id === storyId ? { ...s, views } : s));
      setActiveStoryModal((prev) => prev && prev._id === storyId ? { ...prev, views } : prev);
    });

    socket.on('message_deleted', ({ messageId }) => {
      setMessages((prev) => prev.map(m => m._id === messageId ? { ...m, text: '🚫 यह मैसेज डिलीट कर दिया गया है', type: 'text', image: null, audio: null, document: null } : m));
    });

    socket.on('room_members_count', ({ count }) => setActiveMembersCount(count || 1));
    socket.on('online_users_list', (users) => { if (Array.isArray(users)) setOnlineUsers(users); });
    socket.on('channels_list', (chanList) => { if (Array.isArray(chanList) && chanList.length > 0) setChannels(chanList); });
    socket.on('user_typing', ({ username, isTyping }) => setTypingUser(isTyping ? username : ''));

    socket.on('incoming_call', ({ targetUser, fromUser, isVideo }) => {
      if (currentUser && targetUser.toLowerCase() === currentUser.toLowerCase()) setIncomingCall({ fromUser, isVideo });
    });

    socket.on('call_accepted', ({ targetUser, fromUser }) => {
      if (currentUser && (fromUser.toLowerCase() === currentUser.toLowerCase() || targetUser.toLowerCase() === currentUser.toLowerCase())) {
        setActiveCall({ targetUser: fromUser === currentUser ? targetUser : fromUser, isVideo: false, duration: 0 });
        setIncomingCall(null);
      }
    });

    socket.on('call_rejected', () => { setIncomingCall(null); setActiveCall(null); });
    socket.on('call_ended', () => { setIncomingCall(null); setActiveCall(null); });

    // Phase 4 & 5 Socket Listeners
    socket.on('qr_session_created', ({ sessionId }) => setWebQrSessionId(sessionId));
    socket.on('qr_login_success', (res) => {
      onAuthSuccess(res.token, res.username, res.avatar, res.status, res.pin, res.privacySettings, res.aiAutoResponder, res.pinnedChats);
    });
    socket.on('stage_users_update', ({ room, users }) => {
      if (Array.isArray(users)) setStageUsers(users);
    });
    socket.on('new_channel_comment', (comment) => {
      setChannelComments((prev) => [...prev, comment]);
    });
    socket.on('game_state_update', ({ game }) => {
      if (game) setTictactoeGame(game);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('receive_message');
      socket.off('load_history');
      socket.off('messages_read');
      socket.off('poll_vote_update');
      socket.off('message_reaction_update');
      socket.off('active_stories_list');
      socket.off('new_story_published');
      socket.off('room_members_count');
      socket.off('online_users_list');
      socket.off('channels_list');
      socket.off('user_typing');
      socket.off('incoming_call');
      socket.off('call_accepted');
      socket.off('call_rejected');
      socket.off('call_ended');
      socket.off('qr_session_created');
      socket.off('qr_login_success');
      socket.off('stage_users_update');
      socket.off('new_channel_comment');
      socket.off('game_state_update');
    };
  }, [currentUser, ghostMode]);

  // Call duration counter
  useEffect(() => {
    if (activeCall) {
      callTimerRef.current = setInterval(() => setCallDuration((p) => p + 1), 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      setCallDuration(0);
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [activeCall]);

  // ⌨️ Keyboard Auto-Scroll & Viewport Synchronization
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onKeyboardShow = () => {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    };

    const subShow = Keyboard.addListener(showEvent, onKeyboardShow);
    const subHide = Keyboard.addListener(hideEvent, () => {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  // Anti-Spam Slow Mode Countdown Timer
  useEffect(() => {
    let timer;
    if (slowModeCooldown > 0) {
      timer = setInterval(() => setSlowModeCooldown((p) => (p > 0 ? p - 1 : 0)), 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [slowModeCooldown]);

  // 🔥 Phase 5: 1-Time View Photo Countdown & Self-Destruction
  useEffect(() => {
    let timer;
    if (activeOneTimePhoto && activeOneTimePhoto.remainingSec > 0) {
      timer = setInterval(() => {
        setActiveOneTimePhoto((prev) => {
          if (!prev) return null;
          if (prev.remainingSec <= 1) {
            socket.emit('expire_1time_media', { room: activeRoom, messageId: prev.messageId });
            return null;
          }
          return { ...prev, remainingSec: prev.remainingSec - 1 };
        });
      }, 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [activeOneTimePhoto, activeRoom]);

  const toggleTheme = async () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    await Storage.setItem('@gupshupp_theme', next ? 'dark' : 'light');
  };

  const handleUnlockPin = () => {
    if (enteredPin === userPin) {
      setEnteredPin('');
      setPinError('');
      setScreen('HOME');
    } else {
      setPinError('गलत पिन! कृपया सही 4-अंकों का पिन दर्ज करें।');
    }
  };

  const onAuthSuccess = async (token, username, avatar, status, pin, priv, autoResp, pinned) => {
    setAuthToken(token);
    setCurrentUser(username);
    if (avatar) setUserAvatar(avatar);
    if (status) setUserStatus(status);
    if (pin) setUserPin(pin);
    if (priv?.ghostMode !== undefined) setGhostMode(priv.ghostMode);
    if (pinned) setPinnedChats(pinned);

    await Storage.setItem('@gupshupp_token', token);
    await Storage.setItem('@gupshupp_user', username);
    if (avatar) await Storage.setItem('@gupshupp_avatar', avatar);
    if (status) await Storage.setItem('@gupshupp_status', status);
    if (pin) await Storage.setItem('@gupshupp_pin', pin);

    socket.emit('set_user_presence', { 
      username, 
      avatar: avatar || '🦁', 
      status: status || 'Available 🟢',
      privacySettings: { ghostMode: priv?.ghostMode || false }
    });
    setScreen('HOME');
    setAuthUsername('');
    setAuthPassword('');
    setAuthError('');
  };

  const handleAuthSubmit = async () => {
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError('कृपया यूज़रनेम और पासवर्ड दोनों दर्ज करें।');
      return;
    }
    setIsAuthenticating(true);
    setAuthError('');

    if (!socket.connected) {
      socket.connect();
    }

    const endpoint = authTab === 'LOGIN' ? 'login' : 'register';
    const payload = { username: authUsername.trim(), password: authPassword.trim(), avatar: userAvatar };

    let handled = false;

    // 1. Try Fast Socket Auth
    socket.emit(authTab === 'LOGIN' ? 'auth_login' : 'auth_register', payload, async (res) => {
      if (handled) return;
      if (res && res.success) {
        handled = true;
        setIsAuthenticating(false);
        onAuthSuccess(res.token, res.username, res.avatar, res.status, res.pin, res.privacySettings, res.aiAutoResponder, res.pinnedChats);
        return;
      }
      
      // 2. Fallback to HTTP REST Auth
      try {
        const response = await fetch(`${BASE_URL}/api/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        handled = true;
        setIsAuthenticating(false);
        if (data && data.success) {
          onAuthSuccess(data.token, data.username, data.avatar, data.status, data.pin, data.privacySettings, data.aiAutoResponder, data.pinnedChats);
        } else {
          setAuthError(data?.message || res?.message || 'लॉगिन / साइन अप विफल रहा।');
        }
      } catch (err) {
        handled = true;
        setIsAuthenticating(false);
        setAuthError(res?.message || 'सर्वर से कनेक्ट नहीं हो सका। कृपया नेटवर्क चेक करें।');
      }
    });

    // Safety timeout fallback
    setTimeout(async () => {
      if (!handled) {
        try {
          const response = await fetch(`${BASE_URL}/api/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await response.json();
          handled = true;
          setIsAuthenticating(false);
          if (data && data.success) {
            onAuthSuccess(data.token, data.username, data.avatar, data.status, data.pin, data.privacySettings, data.aiAutoResponder, data.pinnedChats);
          } else {
            setAuthError(data?.message || 'लॉगिन विफल रहा।');
          }
        } catch (e) {
          handled = true;
          setIsAuthenticating(false);
        }
      }
    }, 2000);
  };

  const handleLogout = async () => {
    await Storage.removeItem('@gupshupp_token');
    await Storage.removeItem('@gupshupp_user');
    setAuthToken('');
    setCurrentUser('');
    setScreen('AUTH');
  };

  // Join 1-on-1 Chat
  const startDirectChat = (otherUser) => {
    if (!currentUser || !otherUser) return;
    const sortedUsers = [currentUser.toLowerCase(), otherUser.toLowerCase()].sort();
    const dmRoom = `dm_${sortedUsers[0]}_${sortedUsers[1]}`;
    
    setActiveRoom(dmRoom);
    setChatTitle(`@${otherUser}`);
    setIsDirectChat(true);
    setMessages([]);
    setIsLoadingHistory(true);
    setAiSmartReplies([]);
    setIsSearchActive(false);
    setSearchQuery('');
    setScreen('CHAT');
    socket.emit('join_room', { room: dmRoom, username: currentUser });
  };

  // Join Group Room
  const joinGroupRoom = (roomName) => {
    if (!roomName.trim()) return;
    const cleanRoom = roomName.trim().replace(/^#/, '');
    setActiveRoom(cleanRoom);
    setChatTitle(`#${cleanRoom}`);
    setIsDirectChat(false);
    setMessages([]);
    setIsLoadingHistory(true);
    setAiSmartReplies([]);
    setIsSearchActive(false);
    setSearchQuery('');
    setScreen('CHAT');
    socket.emit('join_room', { room: cleanRoom, username: currentUser });
  };

  // Send Message
  const sendMessage = (type = 'text', payload = {}) => {
    if (type === 'text' && !message.trim()) return;

    const messageTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isAiTrigger = type === 'text' && message.trim().startsWith('@ai');
    const processedText = isAiTrigger ? message : encryptText(message);
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    const newMsgData = {
      _id: msgId,
      room: activeRoom,
      sender: currentUser,
      vipBadge: userVipBadge,
      text: type === 'text' ? processedText : (payload.caption || ''),
      type: type,
      image: payload.image || null,
      audio: payload.audio || null,
      document: payload.document || null,
      pollData: payload.pollData || null,
      replyTo: replyingToMessage ? { sender: replyingToMessage.sender, text: decryptText(replyingToMessage.text) } : null,
      reactions: {},
      status: 'sent',
      readBy: [currentUser],
      starredBy: [],
      transcript: '',
      disappearingTtl: disappearingTtl,
      isAi: isAiTrigger,
      isSilent: !!payload.isSilent,
      isOneTime: !!payload.isOneTime,
      isHd: !!payload.isHd,
      time: messageTime
    };

    setMessages((prev) => [...prev, newMsgData]);
    socket.emit('send_message', newMsgData);

    setMessage('');
    setReplyingToMessage(null);
    setAiSmartReplies([]);
    socket.emit('typing_stop', { room: activeRoom, username: currentUser });

    // Trigger Anti-Spam Slow Mode for non-DM rooms
    if (!isDirectChat) setSlowModeCooldown(5);

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Media Picker (Lossless HD & 1-Time Self-Destruct View)
  const pickAndSendImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        alert('फोटो भेजने के लिए गैलरी परमिशन आवश्यक है।');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: isHdMediaMode ? 1.0 : 0.7,
        base64: true
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const base64Uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
        sendMessage('image', {
          image: base64Uri,
          caption: isOneTimeMediaMode ? '🔥 1-Time Photo' : (isHdMediaMode ? '💎 HD Photo' : '📷 Photo'),
          isHd: isHdMediaMode,
          isOneTime: isOneTimeMediaMode
        });
      }
    } catch (e) {
      alert('फोटो सेलेक्ट करने में समस्या आई।');
    }
  };

  // Document Picker
  const pickAndSendDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        sendMessage('document', {
          document: { name: file.name, size: `${sizeMb} MB`, uri: file.uri }
        });
      }
    } catch (e) {
      alert('डॉक्युमेंट सेलेक्ट करने में समस्या आई।');
    }
  };

  // Voice Note Recording
  const startAudioRecording = () => {
    setIsRecordingAudio(true);
    setRecordingSeconds(0);
    recordingTimerRef.current = setInterval(() => setRecordingSeconds((p) => p + 1), 1000);
  };

  const stopAndSendAudioRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecordingAudio(false);
    const durationStr = `${Math.floor(recordingSeconds / 60)}:${(recordingSeconds % 60).toString().padStart(2, '0')}`;
    sendMessage('audio', { audio: 'voice_note_stream', caption: `🎙️ Voice Note (${durationStr || '0:03'})` });
    setRecordingSeconds(0);
  };

  const cancelAudioRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecordingAudio(false);
    setRecordingSeconds(0);
  };

  // 📊 Create Poll
  const handleCreatePoll = () => {
    if (!pollQuestion.trim()) return;
    const validOpts = pollOptions.filter(o => o.trim()).map((text, idx) => ({ id: idx, text, voters: [] }));
    if (validOpts.length < 2) {
      alert('कम से कम 2 विकल्प (Options) जोड़ें।');
      return;
    }
    sendMessage('poll', {
      caption: `📊 Poll: ${pollQuestion}`,
      pollData: {
        pollId: `poll_${Date.now()}`,
        question: pollQuestion.trim(),
        options: validOpts,
        allowMultiple: pollAllowMultiple,
        isClosed: false
      }
    });
    setShowCreatePollModal(false);
    setPollQuestion('');
    setPollOptions(['Option 1', 'Option 2']);
  };

  // 📊 Cast Poll Vote
  const handleCastVote = (messageId, optionId) => {
    socket.emit('cast_poll_vote', {
      room: activeRoom,
      messageId,
      optionId,
      username: currentUser
    });
  };

  // 📝 Transcribe Voice Note via Gemini
  const handleTranscribeVoice = (messageId, audioUri) => {
    socket.emit('ai_transcribe_request', { messageId, audioUri }, (res) => {
      if (res?.success && res.transcript) {
        setTranscribedAudioMap(prev => ({ ...prev, [messageId]: res.transcript }));
      }
    });
  };

  // 🎬 Publish Customizable Duration Story
  const handlePublishStory = () => {
    if (!newStoryText.trim()) return;
    socket.emit('create_story', {
      username: currentUser,
      avatar: userAvatar,
      type: 'text',
      content: newStoryText.trim(),
      bgColor: newStoryBgColor,
      durationHours: newStoryDurationHours
    });
    setShowCreateStoryModal(false);
    setNewStoryText('');
    setNewStoryDurationHours(24);
  };

  // 📌 Pin / Unpin Chat
  const togglePinChat = async (chatId) => {
    let updated;
    if (pinnedChats.includes(chatId)) updated = pinnedChats.filter(c => c !== chatId);
    else updated = [...pinnedChats, chatId];
    setPinnedChats(updated);
    await Storage.setItem('@gupshupp_pinned', JSON.stringify(updated));
    socket.emit('update_profile', { username: currentUser, pinnedChats: updated });
  };

  // 👻 Toggle Ghost Mode
  const handleToggleGhostMode = async () => {
    const next = !ghostMode;
    setGhostMode(next);
    await Storage.setItem('@gupshupp_ghost', next ? 'true' : 'false');
    socket.emit('update_profile', { 
      username: currentUser, 
      privacySettings: { ghostMode: next, stealthReadReceipts: stealthRead, silentTyping } 
    });
    alert(next ? '👻 घोस्ट मोड एक्टिव! अब आप बिना ऑनलाइन दिखे चैट कर सकते हैं।' : 'घोस्ट मोड बंद किया गया।');
  };

  // Calling Controls
  const initiateCall = (isVideo = false) => {
    if (!isDirectChat) return;
    const targetUser = chatTitle.replace('@', '');
    socket.emit('call_initiate', { targetUser, fromUser: currentUser, isVideo });
    setActiveCall({ targetUser, isVideo, duration: 0 });
    setIsPiPMinimized(false);
  };

  const acceptCall = () => {
    if (!incomingCall) return;
    socket.emit('call_accept', { targetUser: incomingCall.fromUser, fromUser: currentUser });
    setActiveCall({ targetUser: incomingCall.fromUser, isVideo: incomingCall.isVideo, duration: 0 });
    setIncomingCall(null);
  };

  const rejectCall = () => {
    if (!incomingCall) return;
    socket.emit('call_reject', { targetUser: incomingCall.fromUser, fromUser: currentUser });
    setIncomingCall(null);
  };

  const endCall = () => {
    if (activeCall) {
      socket.emit('call_end', { targetUser: activeCall.targetUser, fromUser: currentUser });
      setActiveCall(null);
    }
  };

  // Filter Recent Chats by Folder
  const filteredRecentChats = recentChats.filter((chat) => {
    if (chatFolder === 'UNREAD') return chat.unread > 0;
    if (chatFolder === 'DM') return chat.type === 'dm';
    if (chatFolder === 'GROUPS') return chat.type === 'group';
    return true;
  }).sort((a, b) => {
    const aPinned = pinnedChats.includes(a.id);
    const bPinned = pinnedChats.includes(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });

  // Filter Active Messages
  const visibleMessages = messages.filter((msg) => {
    if (msg.expiresAt && new Date(msg.expiresAt) <= new Date()) return false;
    if (isSearchActive && searchQuery.trim()) {
      const dec = decryptText(msg.text).toLowerCase();
      const q = searchQuery.toLowerCase();
      return dec.includes(q) || (msg.sender && msg.sender.toLowerCase().includes(q));
    }
    return true;
  });

  // --- 0. PIN LOCK SCREEN ---
  if (screen === 'PIN_LOCK') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
        <View style={styles.centerContainer}>
          <Text style={styles.lockIconLarge}>🔒</Text>
          <Text style={[styles.pinLockTitle, { color: theme.text }]}>GupShupp सुरक्षा पिन</Text>
          <Text style={[styles.pinLockSub, { color: theme.textMuted }]}>ऐप अनलॉक करने के लिए अपना 4-अंकों का पिन दर्ज करें</Text>

          <View style={styles.pinDotsRow}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.pinDot, { borderColor: theme.accentLight, backgroundColor: enteredPin.length > i ? theme.accentLight : 'transparent' }]} />
            ))}
          </View>

          {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}

          <View style={styles.numericKeypad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'].map((key, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.keypadBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => {
                  if (key === 'C') setEnteredPin('');
                  else if (key === '✓') handleUnlockPin();
                  else if (enteredPin.length < 4) setEnteredPin(prev => prev + key);
                }}
              >
                <Text style={[styles.keypadText, { color: theme.text }]}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- 1. AUTH SCREEN ---
  if (screen === 'AUTH') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.headerBg} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
          <View style={styles.authHeader}>
            <Text style={styles.logoIcon}>💬</Text>
            <Text style={[styles.logoText, { color: theme.accentLight }]}>GupShupp</Text>
            <Text style={[styles.tagline, { color: theme.textMuted }]}>AI-पावर्ड प्राइवेसी सुपर-मैसेंजर 3.0 PRO</Text>
          </View>

          <View style={[styles.authCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.tabBar, { backgroundColor: theme.card }]}>
              <TouchableOpacity 
                style={[styles.tabButton, authTab === 'LOGIN' && { backgroundColor: theme.accent }]} 
                onPress={() => { setAuthTab('LOGIN'); setAuthError(''); }}
              >
                <Text style={[styles.tabText, authTab === 'LOGIN' ? styles.activeTabText : { color: theme.textMuted }]}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.tabButton, authTab === 'SIGNUP' && { backgroundColor: theme.accent }]} 
                onPress={() => { setAuthTab('SIGNUP'); setAuthError(''); }}
              >
                <Text style={[styles.tabText, authTab === 'SIGNUP' ? styles.activeTabText : { color: theme.textMuted }]}>Sign Up</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.tabButton, authTab === 'QR' && { backgroundColor: theme.accent }]} 
                onPress={() => { 
                  setAuthTab('QR'); 
                  setAuthError(''); 
                  socket.emit('qr_session_init', (res) => {
                    if (res?.sessionId) setWebQrSessionId(res.sessionId);
                  });
                }}
              >
                <Text style={[styles.tabText, authTab === 'QR' ? styles.activeTabText : { color: theme.textMuted }]}>📲 QR Web</Text>
              </TouchableOpacity>
            </View>

            {authError ? <Text style={styles.errorBanner}>{authError}</Text> : null}

            {authTab === 'QR' ? (
              <View style={{ alignItems: 'center', paddingVertical: 14 }}>
                <Text style={[styles.qrTitle, { color: theme.text }]}>📲 WhatsApp Web-Style Instant Login</Text>
                <Text style={[styles.qrSub, { color: theme.textMuted }]}>अपने मोबाइल में GupShupp ➔ Profile ➔ Linked Devices से यह कोड अप्रूव करें:</Text>
                <View style={[styles.qrBox, { borderColor: theme.accentLight, backgroundColor: theme.card }]}>
                  <Text style={styles.qrIconEmoji}>📱</Text>
                  <Text style={[styles.qrSessionCode, { color: theme.accentLight }]}>{webQrSessionId || 'Connecting...'}</Text>
                  <Text style={[styles.qrWaitingText, { color: theme.textMuted }]}>⏳ मोबाइल से अप्रूवल का इंतज़ार...</Text>
                </View>
                <TouchableOpacity 
                  style={[styles.refreshQrBtn, { borderColor: theme.border }]} 
                  onPress={() => {
                    socket.emit('qr_session_init', (res) => {
                      if (res?.sessionId) setWebQrSessionId(res.sessionId);
                    });
                  }}
                >
                  <Text style={[styles.refreshQrText, { color: theme.accentLight }]}>🔄 नया QR कोड जनरेट करें</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>यूज़रनेम (Username)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                    placeholder="उदा. rahul, aman"
                    placeholderTextColor={theme.textMuted}
                    value={authUsername}
                    onChangeText={setAuthUsername}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.label, { color: theme.text }]}>पासवर्ड (Password)</Text>
                  <View style={[styles.passwordWrapper, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                    <TextInput
                      style={[styles.passwordInput, { color: theme.text }]}
                      placeholder="अपना पासवर्ड डालें"
                      placeholderTextColor={theme.textMuted}
                      value={authPassword}
                      onChangeText={setAuthPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                      <Text style={styles.eyeBtnText}>{showPassword ? "🙈 Hide" : "👁️ Show"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity 
                  style={[styles.primaryBtn, { backgroundColor: theme.accentLight }]} 
                  onPress={handleAuthSubmit} 
                  disabled={isAuthenticating}
                >
                  {isAuthenticating ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text style={styles.primaryBtnText}>
                      {authTab === 'LOGIN' ? 'लॉगिन करें 🚀' : 'नया खाता बनाएं ✨'}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // --- 2. HOME SCREEN ---
  if (screen === 'HOME') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.headerBg} />
        
        {/* Main Header with Ghost Mode Badge */}
        <View style={[styles.homeHeader, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.headerAvatarEmoji}>{userAvatar}</Text>
            <View style={{ marginLeft: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.headerLogo, { color: theme.accentLight }]}>GupShupp</Text>
                {ghostMode && <Text style={styles.ghostBadge}>👻 GHOST</Text>}
              </View>
              <Text style={[styles.welcomeUser, { color: theme.textMuted }]}>@{currentUser} • <Text style={{ color: theme.accentLight }}>{userStatus}</Text></Text>
            </View>
          </View>
          <View style={styles.headerActionRow}>
            <TouchableOpacity style={[styles.iconCircleBtn, { backgroundColor: theme.border }]} onPress={handleToggleGhostMode}>
              <Text style={styles.iconCircleText}>{ghostMode ? '👻' : '👁️'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconCircleBtn, { backgroundColor: theme.border }]} onPress={toggleTheme}>
              <Text style={styles.iconCircleText}>{isDarkMode ? '☀️' : '🌙'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 🎬 24h Ephemeral Stories / Status Tray */}
        <View style={[styles.storiesContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesScroll}>
            {/* Add Story Circle */}
            <TouchableOpacity style={styles.storyCircleBox} onPress={() => setShowCreateStoryModal(true)}>
              <View style={[styles.addStoryRing, { borderColor: theme.accentLight }]}>
                <Text style={styles.storyAvatarEmoji}>{userAvatar}</Text>
                <View style={[styles.addStoryPlusBadge, { backgroundColor: theme.accentLight }]}>
                  <Text style={styles.addStoryPlusText}>+</Text>
                </View>
              </View>
              <Text style={[styles.storyUserName, { color: theme.text }]} numberOfLines={1}>Your Story</Text>
            </TouchableOpacity>

            {/* Friends Stories */}
            {stories.map((st, idx) => (
              <TouchableOpacity 
                key={idx} 
                style={styles.storyCircleBox} 
                onPress={() => {
                  socket.emit('view_story', { storyId: st._id, viewerUsername: currentUser });
                  setActiveStoryModal(st);
                }}
              >
                <View style={[styles.storyRing, { borderColor: theme.accentLight }]}>
                  <Text style={styles.storyAvatarEmoji}>{st.avatar}</Text>
                </View>
                <Text style={[styles.storyUserName, { color: theme.text }]} numberOfLines={1}>@{st.username}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* 🗂️ Smart Chat Folders Bar */}
        <View style={[styles.folderTabsBar, { backgroundColor: theme.surface }]}>
          {[
            { id: 'ALL', label: 'All' },
            { id: 'UNREAD', label: 'Unread 🔴' },
            { id: 'DM', label: '1-on-1 💬' },
            { id: 'GROUPS', label: 'Groups 👥' }
          ].map((f) => (
            <TouchableOpacity 
              key={f.id} 
              style={[styles.folderTabItem, chatFolder === f.id && { backgroundColor: theme.accent }]}
              onPress={() => setChatFolder(f.id)}
            >
              <Text style={[styles.folderTabLabel, chatFolder === f.id ? { color: '#ffffff', fontWeight: '800' } : { color: theme.textMuted }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Home Content Body */}
        <ScrollView style={styles.homeContent}>
          {bottomNav === 'CHATS' && (
              {/* Recent Conversations List */}
              <Text style={[styles.sectionHeading, { color: theme.text }]}>💬 चैट्स (Conversations)</Text>

              {/* ☁️ Phase 5: Telegram Saved Messages (Personal Cloud) */}
              <TouchableOpacity 
                activeOpacity={0.85}
                style={[styles.savedMessagesRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                onPress={() => {
                  const savedRoom = `saved_messages_${currentUser.toLowerCase()}`;
                  setActiveRoom(savedRoom);
                  setChatTitle(`☁️ Saved Messages`);
                  setIsDirectChat(true);
                  setMessages([]);
                  setIsLoadingHistory(true);
                  setAiSmartReplies([]);
                  setIsSearchActive(false);
                  setSearchQuery('');
                  setScreen('CHAT');
                  socket.emit('join_room', { room: savedRoom, username: currentUser });
                }}
              >
                <View style={[styles.savedMessagesIconBox, { backgroundColor: theme.accent }]}>
                  <Text style={styles.savedMessagesIcon}>☁️</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={styles.chatTitleRow}>
                    <Text style={[styles.recentChatTitle, { color: theme.text, fontWeight: '900' }]}>Saved Messages</Text>
                    <Text style={[styles.savedBadge, { color: theme.accentLight }]}>Cloud 🔒</Text>
                  </View>
                  <Text style={[styles.recentChatSnippet, { color: theme.textMuted }]}>पर्सनल नोट्स, लिंक्स, कोड और फाइल्स वॉल्ट</Text>
                </View>
              </TouchableOpacity>

              {filteredRecentChats.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>इस फोल्डर में कोई चैट नहीं है।</Text>
                </View>
              ) : (
                filteredRecentChats.map((chat, idx) => {
                  const isPinned = pinnedChats.includes(chat.id);
                  return (
                    <TouchableOpacity 
                      key={idx} 
                      activeOpacity={0.85}
                      onLongPress={() => togglePinChat(chat.id)}
                      style={[styles.recentChatRow, { backgroundColor: theme.surface, borderColor: isPinned ? theme.accentLight : theme.border }]}
                      onPress={() => chat.type === 'dm' ? startDirectChat(chat.title.replace('@', '')) : joinGroupRoom(chat.title)}
                    >
                      <View style={styles.chatAvatarBox}>
                        <Text style={styles.chatAvatarEmoji}>{chat.avatar}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={styles.chatTitleRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {isPinned && <Text style={styles.pinIcon}>📌</Text>}
                            <Text style={[styles.recentChatTitle, { color: theme.text }]}>{chat.title}</Text>
                          </View>
                          <Text style={[styles.recentChatTime, { color: theme.textMuted }]}>{chat.time}</Text>
                        </View>
                        <View style={styles.chatSnippetRow}>
                          <Text style={[styles.recentChatSnippet, { color: theme.textMuted }]} numberOfLines={1}>{chat.lastMsg}</Text>
                          {chat.unread > 0 && (
                            <View style={[styles.unreadBadge, { backgroundColor: theme.accentLight }]}>
                              <Text style={styles.unreadCount}>{chat.unread}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {bottomNav === 'GROUPS' && (
            <View style={styles.tabContentContainer}>
              <Text style={[styles.sectionHeading, { color: theme.text }]}>🔥 कम्युनिटी सुपर-ग्रुप्स (Discord-Style)</Text>
              {[
                { name: 'tech', desc: 'AI, React Native, Full-Stack & Python 🚀', members: 42, icon: '💻' },
                { name: 'friends', desc: 'Chill & Hangout Group 🎉', members: 28, icon: '🍕' },
                { name: 'gaming', desc: 'Esports, BGMI, Valorant & Streamers 🎮', members: 64, icon: '🕹️' }
              ].map((grp, i) => (
                <View key={i} style={[styles.superGroupCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.groupCardHeader}>
                    <Text style={styles.superGroupIcon}>{grp.icon}</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.superGroupName, { color: theme.text }]}>#{grp.name}</Text>
                      <Text style={[styles.superGroupMembers, { color: theme.textMuted }]}>👥 {grp.members} मेंबर्स • 👑 Verified</Text>
                    </View>
                    <TouchableOpacity style={[styles.joinGroupBtn, { backgroundColor: theme.accentLight }]} onPress={() => joinGroupRoom(grp.name)}>
                      <Text style={styles.joinGroupBtnText}>Join 🚪</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.superGroupDesc, { color: theme.textMuted }]}>{grp.desc}</Text>
                </View>
              ))}
            </View>
          )}

          {bottomNav === 'CHANNELS' && (
            <View style={styles.tabContentContainer}>
              <View style={styles.channelHeaderRow}>
                <Text style={[styles.sectionHeading, { color: theme.text }]}>📢 ब्रॉडकास्ट चैनल्स</Text>
                <TouchableOpacity style={[styles.createChanBtn, { backgroundColor: theme.accent }]} onPress={() => setShowCreateChannelModal(true)}>
                  <Text style={styles.createChanBtnText}>+ नया चैनल</Text>
                </TouchableOpacity>
              </View>

              {channels.map((chan, idx) => (
                <View key={idx} style={[styles.channelCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.channelHeader}>
                    <Text style={styles.channelIcon}>📢</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.channelName, { color: theme.text }]}>@{chan.name}</Text>
                      <Text style={[styles.channelSubscribers, { color: theme.textMuted }]}>👥 {chan.subscribersCount} सब्सक्राइबर्स • Admin: @{chan.creator}</Text>
                    </View>
                  </View>
                  <Text style={[styles.channelDesc, { color: theme.textMuted }]}>{chan.description}</Text>
                  <TouchableOpacity style={[styles.viewChannelBtn, { backgroundColor: theme.border }]} onPress={() => joinGroupRoom(`channel_${chan.name}`)}>
                    <Text style={[styles.viewChannelBtnText, { color: theme.accentLight }]}>चैनल देखें ➔</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {bottomNav === 'PROFILE' && (
            <View style={styles.tabContentContainer}>
              {/* Profile Studio Card */}
              <View style={[styles.profileStudioCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={styles.profileBigAvatar}>{userAvatar}</Text>
                <Text style={[styles.profileUsername, { color: theme.text }]}>@{currentUser}</Text>
                <Text style={[styles.profileStatusText, { color: theme.accentLight }]}>{userStatus}</Text>
              </View>

              {/* Ghost Mode Privacy Toggle */}
              <View style={[styles.privacyBox, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 16 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.privacyTitle, { color: theme.text }]}>👻 घोस्ट मोड (Ghost Mode)</Text>
                  <Text style={[styles.privacySub, { color: theme.textMuted }]}>ऑनलाइन स्टेटस, टाइपिंग और ब्लू टिक्स छिपाएं</Text>
                </View>
                <TouchableOpacity style={[styles.toggleSwitch, { backgroundColor: ghostMode ? theme.accentLight : theme.border }]} onPress={handleToggleGhostMode}>
                  <Text style={styles.toggleSwitchText}>{ghostMode ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>

              {/* AI Auto-Responder Toggle */}
              <View style={[styles.privacyBox, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 12 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.privacyTitle, { color: theme.text }]}>🤖 AI Auto-Responder (Away Mode)</Text>
                  <Text style={[styles.privacySub, { color: theme.textMuted }]}>जब आप बिजी हों तो Gemini AI ऑटो-रिप्लाई दे</Text>
                </View>
                <TouchableOpacity 
                  style={[styles.toggleSwitch, { backgroundColor: aiAutoResponderEnabled ? theme.accentLight : theme.border }]} 
                  onPress={() => {
                    const nxt = !aiAutoResponderEnabled;
                    setAiAutoResponderEnabled(nxt);
                    socket.emit('update_profile', { username: currentUser, aiAutoResponder: { enabled: nxt, awayStatus, contextPrompt: awayContextPrompt } });
                  }}
                >
                  <Text style={styles.toggleSwitchText}>{aiAutoResponderEnabled ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>

              {/* 📲 Linked Devices (WhatsApp Web QR Link) */}
              <View style={[styles.privacyBox, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 12 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.privacyTitle, { color: theme.text }]}>🔗 लिंक्ड डिवाइसेज (Linked Devices)</Text>
                  <Text style={[styles.privacySub, { color: theme.textMuted }]}>पीसी / वेब पर 1-क्लिक में लॉगिन करें</Text>
                </View>
                <TouchableOpacity 
                  style={[styles.pinToggleBtn, { backgroundColor: theme.accent }]}
                  onPress={() => setShowLinkedDevicesModal(true)}
                >
                  <Text style={styles.pinToggleBtnText}>लिंक करें 📲</Text>
                </TouchableOpacity>
              </View>

              {/* Avatar Selector Studio */}
              <Text style={[styles.sectionHeading, { color: theme.text, marginTop: 20 }]}>🎨 3D अवतार चुनें</Text>
              <View style={styles.avatarPickerRow}>
                {['🦁', '👑', '🚀', '⚡', '🤖', '🦊', '🕶️', '💎'].map((av, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={[styles.avatarChoiceBtn, { backgroundColor: theme.card, borderColor: userAvatar === av ? theme.accentLight : 'transparent' }]}
                    onPress={async () => {
                      setUserAvatar(av);
                      await Storage.setItem('@gupshupp_avatar', av);
                      socket.emit('update_profile', { username: currentUser, avatar: av });
                    }}
                  >
                    <Text style={styles.avatarChoiceEmoji}>{av}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ⭐ Phase 5: Telegram VIP Profile Badges Selector */}
              <Text style={[styles.sectionHeading, { color: theme.text, marginTop: 20 }]}>⭐ Telegram VIP प्रोफाइल बैज</Text>
              <View style={styles.vipBadgeRow}>
                {[
                  { id: '⭐ VIP', name: 'VIP Star', color: '#f59e0b' },
                  { id: '💎 Diamond', name: 'Diamond Pro', color: '#38bdf8' },
                  { id: '🔥 Flame', name: 'Flame Legend', color: '#ef4444' },
                  { id: '⚡ Neon', name: 'Neon Cyber', color: '#a855f7' },
                  { id: '👑 Imperial', name: 'Imperial', color: '#10b981' }
                ].map((bg, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.vipBadgeChoiceBtn, { backgroundColor: theme.card, borderColor: userVipBadge === bg.id ? bg.color : theme.border }]}
                    onPress={async () => {
                      setUserVipBadge(bg.id);
                      await Storage.setItem('@gupshupp_vip_badge', bg.id);
                    }}
                  >
                    <Text style={[styles.vipBadgeChoiceText, { color: bg.color }]}>{bg.id}</Text>
                    {userVipBadge === bg.id && <Text style={{ fontSize: 10, color: bg.color, fontWeight: '900', marginLeft: 4 }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Security PIN Lock */}
              <Text style={[styles.sectionHeading, { color: theme.text, marginTop: 20 }]}>🔒 ऐप सुरक्षा पिन</Text>
              <View style={[styles.pinConfigBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.pinConfigText, { color: theme.textMuted }]}>
                  {userPin ? '🔒 4-अंकों का पिन एक्टिव है' : '🔓 कोई पिन सेट नहीं है'}
                </Text>
                <TouchableOpacity 
                  style={[styles.pinToggleBtn, { backgroundColor: userPin ? '#ef4444' : theme.accent }]}
                  onPress={async () => {
                    if (userPin) {
                      setUserPin('');
                      await Storage.setItem('@gupshupp_pin', '');
                      socket.emit('update_profile', { username: currentUser, pin: '' });
                    } else {
                      const newP = prompt('4 अंकों का सुरक्षा पिन सेट करें:');
                      if (newP && newP.length === 4) {
                        setUserPin(newP);
                        await Storage.setItem('@gupshupp_pin', newP);
                        socket.emit('update_profile', { username: currentUser, pin: newP });
                      }
                    }
                  }}
                >
                  <Text style={styles.pinToggleBtnText}>{userPin ? 'पिन हटाएं' : 'पिन सेट करें'}</Text>
                </TouchableOpacity>
              </View>

              {/* 🎨 Phase 6: Neo-Gen Signature Appearance Studio */}
              <Text style={[styles.sectionHeading, { color: theme.text, marginTop: 20 }]}>🎨 Neo-Gen अपीयरेंस & डिज़ाइन स्टूडियो</Text>
              <View style={[styles.appearanceStudioCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                
                {/* 1. Theme Palette Selector */}
                <Text style={[styles.appearanceSubHeading, { color: theme.text }]}>🌈 सिग्नेचर नियॉन थीम चुनें</Text>
                <View style={styles.themePaletteGrid}>
                  {Object.values(THEME_PALETTES).map((pal) => (
                    <TouchableOpacity
                      key={pal.id}
                      style={[styles.themeChoiceCard, { backgroundColor: pal.bg, borderColor: activeThemeId === pal.id ? pal.accent : pal.border }]}
                      onPress={async () => {
                        setActiveThemeId(pal.id);
                        await Storage.setItem('@gupshupp_active_theme', pal.id);
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.themeSwatchDot, { backgroundColor: pal.accent }]} />
                        <Text style={[styles.themeChoiceName, { color: pal.text }]}>{pal.name}</Text>
                      </View>
                      {activeThemeId === pal.id && <Text style={{ color: pal.accent, fontWeight: '900', fontSize: 12 }}>Active ✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 2. Bubble Geometry */}
                <Text style={[styles.appearanceSubHeading, { color: theme.text, marginTop: 14 }]}>💬 चैट बबल का आकार (Bubble Shape)</Text>
                <View style={styles.bubbleShapeRow}>
                  {[
                    { id: 'PILL', label: '💊 Neo-Pill' },
                    { id: 'SQUIRCLE', label: '◽ Squircle' },
                    { id: 'ANGULAR', label: '📐 Angular' }
                  ].map((shape) => (
                    <TouchableOpacity
                      key={shape.id}
                      style={[styles.bubbleShapeBtn, { backgroundColor: theme.card, borderColor: bubbleGeometry === shape.id ? theme.accent : theme.border }]}
                      onPress={async () => {
                        setBubbleGeometry(shape.id);
                        await Storage.setItem('@gupshupp_bubble_geometry', shape.id);
                      }}
                    >
                      <Text style={[styles.bubbleShapeText, { color: bubbleGeometry === shape.id ? theme.accent : theme.text }]}>{shape.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 3. Typography Font Scale */}
                <Text style={[styles.appearanceSubHeading, { color: theme.text, marginTop: 14 }]}>🔠 टेक्स्ट फॉन्ट साइज (Font Scaling)</Text>
                <View style={styles.bubbleShapeRow}>
                  {[
                    { id: 'COMPACT', label: 'छोटा (13px)' },
                    { id: 'STANDARD', label: 'मानक (15px)' },
                    { id: 'LARGE', label: 'बड़ा (18px)' }
                  ].map((scale) => (
                    <TouchableOpacity
                      key={scale.id}
                      style={[styles.bubbleShapeBtn, { backgroundColor: theme.card, borderColor: fontSizeScale === scale.id ? theme.accent : theme.border }]}
                      onPress={async () => {
                        setFontSizeScale(scale.id);
                        await Storage.setItem('@gupshupp_font_scale', scale.id);
                      }}
                    >
                      <Text style={[styles.bubbleShapeText, { color: fontSizeScale === scale.id ? theme.accent : theme.text }]}>{scale.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 4. Custom Gallery Photo Wallpaper */}
                <Text style={[styles.appearanceSubHeading, { color: theme.text, marginTop: 14 }]}>🖼️ कस्टम चैट वॉलपेपर (Gallery Photos)</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  <TouchableOpacity 
                    style={[styles.primaryBtn, { backgroundColor: theme.accent, flex: 1 }]}
                    onPress={pickCustomWallpaperFromGallery}
                  >
                    <Text style={[styles.primaryBtnText, { color: '#000000' }]}>📁 गैलरी से फोटो लगाएं</Text>
                  </TouchableOpacity>
                  {customWallpaperUri && (
                    <TouchableOpacity 
                      style={[styles.removeWallBtn, { backgroundColor: '#ef4444' }]}
                      onPress={removeCustomWallpaper}
                    >
                      <Text style={{ color: '#ffffff', fontWeight: '800' }}>✕ हटाएं</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 5. Live Interactive Preview */}
                <View style={[styles.appearancePreviewCard, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 16 }]}>
                  <Text style={[styles.previewLabel, { color: theme.textMuted }]}>👀 लाइव प्रीव्यू (Live Preview):</Text>
                  <View style={[styles.previewBubbleMine, { backgroundColor: theme.bubbleMine, borderRadius: getBubbleRadius(), alignSelf: 'flex-end', marginTop: 6 }]}>
                    <Text style={{ color: '#ffffff', fontSize: getFontSize() }}>यह मेरा नया सिग्नेचर GupShupp लुक है! ✨</Text>
                  </View>
                  <View style={[styles.previewBubbleOther, { backgroundColor: theme.bubbleOther, borderRadius: getBubbleRadius(), alignSelf: 'flex-start', marginTop: 6 }]}>
                    <Text style={{ color: theme.text, fontSize: getFontSize() }}>वाह! यह डिज़ाइन बहुत ही प्रीमियम लग रहा है 🔥</Text>
                  </View>
                </View>

              </View>

              <TouchableOpacity style={[styles.logoutBtnFull, { backgroundColor: '#ef4444', marginTop: 24 }]} onPress={handleLogout}>
                <Text style={styles.logoutBtnFullText}>लॉगआउट करें (Logout) ➔</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Floating WhatsApp-Style Status Button */}
        <TouchableOpacity 
          activeOpacity={0.85}
          style={[styles.floatingStatusFab, { backgroundColor: theme.accent }]}
          onPress={() => setShowCreateStoryModal(true)}
        >
          <Text style={[styles.floatingStatusFabText, { color: '#000000' }]}>✍️ + स्टेटस लगाएं</Text>
        </TouchableOpacity>

        {/* 4 Bottom Navigation Tabs - Floating Glass Style */}
        <View style={[styles.neoFloatingNavBar, { backgroundColor: theme.navBg, borderColor: theme.border }]}>
          {[
            { id: 'CHATS', icon: '💬', label: 'चैट्स' },
            { id: 'GROUPS', icon: '👥', label: 'ग्रुप्स' },
            { id: 'CHANNELS', icon: '📢', label: 'चैनल्स' },
            { id: 'PROFILE', icon: '👤', label: 'प्रोफाइल' }
          ].map((tab) => {
            const isActive = bottomNav === tab.id;
            return (
              <TouchableOpacity key={tab.id} style={[styles.bottomNavItem, isActive && { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16 }]} onPress={() => setBottomNav(tab.id)}>
                <Text style={styles.bottomNavIcon}>{tab.icon}</Text>
                <Text style={[styles.bottomNavLabel, isActive ? { color: theme.accent, fontWeight: '900' } : { color: theme.textMuted }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Modal: Create Customizable Duration Story */}
        <Modal visible={showCreateStoryModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>🎬 नया स्टेटस / स्टोरी लगाएं</Text>
              <TextInput
                style={[styles.input, { backgroundColor: newStoryBgColor, color: '#ffffff', borderColor: theme.border, marginTop: 14, height: 90, fontWeight: '700' }]}
                placeholder="अपनी स्टोरी में क्या लिखना चाहते हैं?"
                placeholderTextColor="rgba(255,255,255,0.7)"
                value={newStoryText}
                onChangeText={setNewStoryText}
                multiline
              />
              
              {/* Color Palette */}
              <View style={styles.colorPaletteRow}>
                {['#00a884', '#0284c7', '#8b5cf6', '#ef4444', '#f59e0b', '#000000'].map((c, i) => (
                  <TouchableOpacity key={i} style={[styles.colorCircle, { backgroundColor: c }]} onPress={() => setNewStoryBgColor(c)} />
                ))}
              </View>

              {/* ⏱️ Customizable Duration Selector */}
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 8 }}>
                ⏱️ स्टोरी कब तक दिखे (Expiry Duration):
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { h: 1, label: '⚡ 1 घंटा' },
                  { h: 6, label: '⏳ 6 घंटे' },
                  { h: 12, label: '🕐 12 घंटे' },
                  { h: 24, label: '📅 24 घंटे (Standard)' },
                  { h: 48, label: '🌟 48 घंटे (2 Days)' }
                ].map((dur) => (
                  <TouchableOpacity
                    key={dur.h}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: newStoryDurationHours === dur.h ? theme.accentLight : theme.border,
                      backgroundColor: newStoryDurationHours === dur.h ? 'rgba(0,168,132,0.2)' : theme.card
                    }}
                    onPress={() => setNewStoryDurationHours(dur.h)}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: newStoryDurationHours === dur.h ? theme.accentLight : theme.textMuted }}>
                      {dur.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={[styles.modalBtnCancel, { backgroundColor: theme.border }]} onPress={() => setShowCreateStoryModal(false)}>
                  <Text style={[styles.modalBtnCancelText, { color: theme.text }]}>रद्द करें</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtnConfirm, { backgroundColor: theme.accentLight }]} onPress={handlePublishStory}>
                  <Text style={styles.modalBtnConfirmText}>स्टोरी शेयर करें 🚀</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal: Fullscreen Story Viewer */}
        <Modal visible={!!activeStoryModal} transparent animationType="fade">
          <View style={[styles.storyViewerOverlay, { backgroundColor: activeStoryModal?.bgColor || '#00a884' }]}>
            <TouchableOpacity style={styles.closeStoryBtn} onPress={() => { setActiveStoryModal(null); setShowStoryViewers(false); }}>
              <Text style={styles.closeStoryText}>✕</Text>
            </TouchableOpacity>
            {/* Story Progress Bar */}
            <View style={styles.storyProgressBar}>
              <View style={styles.storyProgressFill} />
            </View>
            <View style={styles.storyUserHeader}>
              <Text style={styles.storyViewerAvatar}>{activeStoryModal?.avatar}</Text>
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.storyViewerName}>@{activeStoryModal?.username}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' }}>
                  {activeStoryModal?.time || 'Just now'}
                </Text>
              </View>
            </View>
            <View style={styles.storyCenterContent}>
              <Text style={styles.storyBodyText}>{activeStoryModal?.content}</Text>
            </View>

            {/* Bottom Section: My Story Views OR Friend Story Reply */}
            {activeStoryModal?.username === currentUser ? (
              <TouchableOpacity 
                style={styles.storyViewsBottomBar}
                onPress={() => setShowStoryViewers(true)}
              >
                <Text style={styles.storyViewsText}>👁️ {activeStoryModal?.views?.length || 0} व्यूज (Viewers देखें ➔)</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.storyReplyBottomBar}>
                {/* Quick Emoji Reactions */}
                <View style={styles.storyQuickEmojiRow}>
                  {['❤️', '🔥', '😂', '👏', '😍'].map((em, idx) => (
                    <TouchableOpacity 
                      key={idx} 
                      style={styles.storyEmojiTouch}
                      onPress={() => {
                        const targetUser = activeStoryModal.username;
                        const sorted = [currentUser.toLowerCase(), targetUser.toLowerCase()].sort();
                        const dmRoom = `dm_${sorted[0]}_${sorted[1]}`;
                        socket.emit('send_message', {
                          room: dmRoom,
                          sender: currentUser,
                          text: encryptText(`Story Reaction: ${em}`),
                          type: 'text',
                          replyTo: { sender: targetUser, text: activeStoryModal.content }
                        });
                        alert(`Reacted ${em} to @${targetUser}!`);
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>{em}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {/* Text Reply Input */}
                <View style={styles.storyInputRow}>
                  <TextInput
                    style={styles.storyReplyTextInput}
                    placeholder="स्टोरी पर रिप्लाई भेजें..."
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    value={storyReplyInput}
                    onChangeText={setStoryReplyInput}
                  />
                  <TouchableOpacity 
                    style={styles.storyReplySendBtn}
                    onPress={() => {
                      if (!storyReplyInput.trim()) return;
                      const targetUser = activeStoryModal.username;
                      const sorted = [currentUser.toLowerCase(), targetUser.toLowerCase()].sort();
                      const dmRoom = `dm_${sorted[0]}_${sorted[1]}`;
                      socket.emit('send_message', {
                        room: dmRoom,
                        sender: currentUser,
                        text: encryptText(storyReplyInput.trim()),
                        type: 'text',
                        replyTo: { sender: targetUser, text: activeStoryModal.content }
                      });
                      setStoryReplyInput('');
                      alert(`रिप्लाई @${targetUser} को भेजा गया! 🚀`);
                    }}
                  >
                    <Text style={{ color: '#000000', fontWeight: '900', fontSize: 13 }}>➤</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </Modal>

        {/* Modal: Story Viewers List */}
        <Modal visible={showStoryViewers} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>👁️ स्टोरी व्यूअर्स ({activeStoryModal?.views?.length || 0})</Text>
              <ScrollView style={{ maxHeight: 220, marginVertical: 12 }}>
                {!activeStoryModal?.views || activeStoryModal.views.length === 0 ? (
                  <Text style={{ color: theme.textMuted, textAlign: 'center', padding: 14 }}>अभी तक किसी ने नहीं देखा</Text>
                ) : (
                  activeStoryModal.views.map((v, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                      <Text style={{ color: theme.text, fontWeight: '700' }}>@{v.username}</Text>
                      <Text style={{ color: theme.textMuted, fontSize: 12 }}>{v.time}</Text>
                    </View>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.accentLight }]} onPress={() => setShowStoryViewers(false)}>
                <Text style={styles.primaryBtnText}>बंद करें</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Modal: Create Channel */}
        <Modal visible={showCreateChannelModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>📢 नया ब्रॉडकास्ट चैनल बनाएं</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border, marginTop: 12 }]}
                placeholder="चैनल का नाम (उदा. cricket_news)"
                placeholderTextColor={theme.textMuted}
                value={newChannelName}
                onChangeText={setNewChannelName}
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border, marginTop: 12, height: 80 }]}
                placeholder="चैनल का विवरण / डिस्क्रिप्शन..."
                placeholderTextColor={theme.textMuted}
                value={newChannelDesc}
                onChangeText={setNewChannelDesc}
                multiline
              />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={[styles.modalBtnCancel, { backgroundColor: theme.border }]} onPress={() => setShowCreateChannelModal(false)}>
                  <Text style={[styles.modalBtnCancelText, { color: theme.text }]}>रद्द करें</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalBtnConfirm, { backgroundColor: theme.accentLight }]} 
                  onPress={() => {
                    socket.emit('create_channel', { name: newChannelName.trim(), description: newChannelDesc.trim(), creator: currentUser }, (res) => {
                      if (res?.success) {
                        setShowCreateChannelModal(false);
                        setNewChannelName('');
                        setNewChannelDesc('');
                      }
                    });
                  }}
                >
                  <Text style={styles.modalBtnConfirmText}>चैनल बनाएं 🚀</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // --- 3. CHAT SCREEN ---
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.headerBg} />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : (Platform.OS === 'android' ? 'height' : undefined)} 
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        style={{ flex: 1 }}
      >
        
        {/* Chat Header */}
        <View style={[styles.chatHeader, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => { socket.emit('leave_room', { room: activeRoom, username: currentUser }); setScreen('HOME'); }}>
            <Text style={[styles.backBtnText, { color: theme.accentLight }]}>‹</Text>
          </TouchableOpacity>
          <View style={styles.chatTitleBlock}>
            <Text style={[styles.chatTitleText, { color: theme.text }]}>{chatTitle}</Text>
            <View style={styles.chatSubTitleRow}>
              <Text style={[styles.chatSubTitleText, { color: theme.textMuted }]}>
                {isDirectChat ? (ghostMode ? '👻 Incognito' : '🔒 E2EE Direct') : `👥 ${activeMembersCount} in Room`}
              </Text>
              {disappearingTtl > 0 && <Text style={styles.disappearingBadge}> ⏱️ {disappearingTtl === 3600000 ? '1h' : '24h'}</Text>}
            </View>
          </View>

          {/* Action Icons in Header */}
          <View style={styles.chatHeaderActions}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setIsSearchActive(!isSearchActive)}>
              <Text style={styles.headerIconText}>🔍</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => {
              setIsGeneratingSummary(true);
              const cleanList = messages.slice(-25).map(m => ({ sender: m.sender, text: decryptText(m.text) }));
              socket.emit('ai_summarize_request', { messages: cleanList }, (res) => {
                setIsGeneratingSummary(false);
                if (res?.success) setAiSummaryModal(res.summary);
              });
            }}>
              <Text style={styles.headerIconText}>📝</Text>
            </TouchableOpacity>
            {isDirectChat && (
              <>
                <TouchableOpacity style={styles.headerIconBtn} onPress={() => initiateCall(false)}>
                  <Text style={styles.headerIconText}>📞</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.headerIconBtn} onPress={() => initiateCall(true)}>
                  <Text style={styles.headerIconText}>📹</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowSharedMediaVault(true)}>
              <Text style={styles.headerIconText}>📂</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowWallpaperModal(true)}>
              <Text style={styles.headerIconText}>🎨</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowDisappearingModal(true)}>
              <Text style={styles.headerIconText}>⏱️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 🎙️ Group Live Stage Banner */}
        {!isDirectChat && (
          <TouchableOpacity 
            style={[styles.stageBanner, { backgroundColor: theme.card, borderColor: theme.accentLight }]}
            onPress={() => {
              setActiveStageRoom(activeRoom);
              socket.emit('join_stage_room', { room: activeRoom, username: currentUser, avatar: userAvatar, isVideo: isStageVideoOn });
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.liveGreenDot} />
              <Text style={[styles.stageBannerTitle, { color: theme.text }]}>🎙️ Group Live Stage ({stageUsers.length} in room)</Text>
            </View>
            <Text style={[styles.stageJoinText, { color: theme.accentLight }]}>Join ➔</Text>
          </TouchableOpacity>
        )}

        {/* 🌐 Phase 5: Live Real-Time Auto-Translation Ambient Bar */}
        <View style={[styles.liveTranslateBar, { backgroundColor: isLiveTranslateActive ? '#0284c7' : theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}
            onPress={() => setIsLiveTranslateActive(!isLiveTranslateActive)}
          >
            <Text style={{ fontSize: 13 }}>🌐</Text>
            <Text style={[styles.liveTranslateText, { color: isLiveTranslateActive ? '#ffffff' : theme.text }]}>
              Auto-Translate to {liveTranslateLang}: <Text style={{ fontWeight: '900' }}>{isLiveTranslateActive ? 'ON 🟢' : 'OFF ⚪'}</Text>
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.langSwitchBtn, { backgroundColor: isLiveTranslateActive ? 'rgba(255,255,255,0.2)' : theme.card }]}
            onPress={() => setLiveTranslateLang(liveTranslateLang === 'Hindi' ? 'English' : 'Hindi')}
          >
            <Text style={{ color: isLiveTranslateActive ? '#ffffff' : theme.accentLight, fontSize: 11, fontWeight: '800' }}>
              {liveTranslateLang === 'Hindi' ? '🇮🇳 HI' : '🇬🇧 EN'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* In-Chat Search Bar */}
        {isSearchActive && (
          <View style={[styles.searchBarContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <TextInput
              style={[styles.searchBarInput, { backgroundColor: theme.inputBg, color: theme.text }]}
              placeholder="मैसेज खोजें..."
              placeholderTextColor={theme.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            <TouchableOpacity onPress={() => { setIsSearchActive(false); setSearchQuery(''); }}>
              <Text style={[styles.closeSearchText, { color: theme.accentLight }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Message List */}
        {isLoadingHistory ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={[styles.loadingHistoryText, { color: theme.textMuted }]}>चैट लोड हो रही है...</Text>
          </View>
        ) : (
          <ImageBackground 
            source={customWallpaperUri ? { uri: customWallpaperUri } : null} 
            style={{ 
              flex: 1, 
              backgroundColor: chatWallpaper === 'emerald' ? '#041c18' : (chatWallpaper === 'slate' ? '#111827' : (chatWallpaper === 'doodle' ? '#0b141a' : theme.bg)) 
            }} 
            resizeMode="cover"
          >
            <View style={{ flex: 1, backgroundColor: customWallpaperUri ? 'rgba(0,0,0,0.65)' : 'transparent' }}>
              <FlatList
                ref={flatListRef}
                data={visibleMessages}
                keyExtractor={(item, index) => item._id || index.toString()}
                style={{ flex: 1 }}
                contentContainerStyle={styles.messageList}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
                renderItem={({ item }) => {
                  const isMine = item.sender === currentUser;
                  const isAiSender = item.sender === '🤖 GupShupp AI' || (item.isAi && item.sender !== currentUser);
                  const decryptedText = decryptText(item.text);
                  const isStarred = item.starredBy && item.starredBy.includes(currentUser);
                  const translatedText = translatedMessages[item._id];
                  const transcribedText = transcribedAudioMap[item._id];

                  // AI Assistant Message Bubble
                  if (isAiSender) {
                    return (
                      <View style={[styles.aiBubbleWrapper, { backgroundColor: theme.bubbleAi, borderColor: theme.aiBorder, borderRadius: getBubbleRadius() }]}>
                        <View style={styles.aiHeader}>
                          <Text style={styles.aiRobotEmoji}>🤖</Text>
                          <Text style={styles.aiTitle}>GupShupp AI (Gemini 2.5)</Text>
                        </View>
                        <Text style={[styles.aiMessageText, { color: theme.text, fontSize: getFontSize() }]}>{decryptedText}</Text>
                        <Text style={styles.aiTimestamp}>{item.time}</Text>
                      </View>
                    );
                  }

                  return (
                    <TouchableOpacity 
                      activeOpacity={0.85}
                      onLongPress={() => setSelectedMessageForAction(item)}
                      style={[styles.messageRow, isMine ? styles.myRow : styles.otherRow]}
                    >
                      <View style={[
                        styles.bubble, 
                        isMine ? { backgroundColor: theme.bubbleMine } : { backgroundColor: theme.bubbleOther },
                        { borderRadius: getBubbleRadius() }
                      ]}>
                        {!isMine && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Text style={[styles.senderName, { color: theme.accentLight, marginBottom: 0 }]}>@{item.sender}</Text>
                            {item.vipBadge && <Text style={{ fontSize: 10, fontWeight: '800' }}>{item.vipBadge}</Text>}
                            {!isDirectChat && (
                              <Text style={{ fontSize: 9, fontWeight: '800', color: (item.sender === 'admin' || item.sender === 'rahul') ? '#f59e0b' : '#38bdf8', backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                                {(item.sender === 'admin' || item.sender === 'rahul') ? '👑 Admin' : '👤 Member'}
                              </Text>
                            )}
                          </View>
                        )}

                        {/* Quoted Reply Context */}
                        {item.replyTo && (
                          <View style={[styles.quotedReplyBox, { borderLeftColor: theme.accentLight }]}>
                            <Text style={styles.quotedReplySender}>@{item.replyTo.sender}</Text>
                            <Text style={styles.quotedReplyText} numberOfLines={1}>{item.replyTo.text}</Text>
                          </View>
                        )}

                        {/* 📊 Interactive Poll Bubble */}
                        {item.type === 'poll' && item.pollData && (
                          <View style={styles.pollBubbleContainer}>
                            <Text style={[styles.pollQuestionText, { color: theme.text }]}>📊 {item.pollData.question}</Text>
                            <View style={styles.pollOptionsContainer}>
                              {item.pollData.options.map((opt, i) => {
                                const totalVotes = item.pollData.options.reduce((sum, o) => sum + (o.voters?.length || 0), 0);
                                const optVotes = opt.voters?.length || 0;
                                const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                                const hasVoted = opt.voters?.includes(currentUser);

                                return (
                                  <TouchableOpacity 
                                    key={i} 
                                    style={[styles.pollOptionRow, { backgroundColor: theme.card, borderColor: hasVoted ? theme.accentLight : theme.border }]}
                                    onPress={() => handleCastVote(item._id, opt.id)}
                                  >
                                    <View style={[styles.pollProgressFill, { width: `${pct}%`, backgroundColor: hasVoted ? 'rgba(0,168,132,0.3)' : 'rgba(255,255,255,0.08)' }]} />
                                    <Text style={[styles.pollOptionLabel, { color: theme.text }]}>{opt.text}</Text>
                                    <Text style={[styles.pollOptionPercent, { color: theme.accentLight }]}>{pct}% ({optVotes})</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        )}

                        {/* Image Message with 💎 HD Badge or 🔥 1-Time View */}
                        {item.type === 'image' && item.image && (
                          item.isOneTime ? (
                            <TouchableOpacity 
                              style={[styles.oneTimeMediaBox, { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: '#ef4444' }]}
                              onPress={() => setActiveOneTimePhoto({ image: item.image, messageId: item._id, remainingSec: 5 })}
                            >
                              <Text style={{ fontSize: 28 }}>🔥</Text>
                              <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={{ color: '#ef4444', fontWeight: '900', fontSize: 13 }}>1-Time View Photo (5s)</Text>
                                <Text style={{ color: theme.textMuted, fontSize: 11 }}>टैप करके 5 सेकंड के लिए देखें</Text>
                              </View>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity onPress={() => setSelectedImageModal(item.image)} style={{ position: 'relative' }}>
                              <Image source={{ uri: item.image }} style={styles.chatImageThumbnail} resizeMode="cover" />
                              {item.isHd && (
                                <View style={styles.hdBadgeOnImage}>
                                  <Text style={styles.hdBadgeText}>💎 HD</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          )
                        )}

                        {/* Voice Note Message with Speed & Transcription */}
                        {item.type === 'audio' && (
                          <View style={{ marginVertical: 4 }}>
                            <View style={styles.voiceNoteBox}>
                              <TouchableOpacity style={[styles.playPauseBtn, { backgroundColor: theme.accentLight }]}>
                                <Text style={styles.playPauseIcon}>▶️</Text>
                              </TouchableOpacity>
                              <View style={styles.waveformContainer}>
                                {[30, 60, 40, 80, 50, 90, 40, 70, 45, 60].map((h, i) => (
                                  <View key={i} style={[styles.waveBar, { height: h * 0.25, backgroundColor: theme.accentLight }]} />
                                ))}
                              </View>
                              <TouchableOpacity 
                                style={styles.speedBtn}
                                onPress={() => {
                                  const cur = audioSpeedMap[item._id] || '1.0x';
                                  const nxt = cur === '1.0x' ? '1.5x' : (cur === '1.5x' ? '2.0x' : '1.0x');
                                  setAudioSpeedMap(prev => ({ ...prev, [item._id]: nxt }));
                                }}
                              >
                                <Text style={[styles.speedBtnText, { color: theme.accentLight }]}>{audioSpeedMap[item._id] || '1.0x'}</Text>
                              </TouchableOpacity>
                            </View>
                            {/* 📝 Voice Transcription Button */}
                            <TouchableOpacity style={styles.transcribeBtn} onPress={() => handleTranscribeVoice(item._id, item.audio)}>
                              <Text style={styles.transcribeBtnText}>📝 Transcribe (टेक्स्ट में पढ़ें)</Text>
                            </TouchableOpacity>
                            {transcribedText && (
                              <View style={[styles.transcribedCard, { backgroundColor: theme.card }]}>
                                <Text style={styles.transcribedText}>{transcribedText}</Text>
                              </View>
                            )}
                          </View>
                        )}

                        {/* Document Message */}
                        {item.type === 'document' && item.document && (
                          <View style={[styles.documentCard, { backgroundColor: theme.surface }]}>
                            <Text style={styles.docIcon}>📄</Text>
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={[styles.docName, { color: theme.text }]} numberOfLines={1}>{item.document.name}</Text>
                              <Text style={[styles.docSize, { color: theme.textMuted }]}>{item.document.size}</Text>
                            </View>
                            <Text style={[styles.docDownload, { color: theme.accentLight }]}>Open ➔</Text>
                          </View>
                        )}

                        {/* Rich Link Preview */}
                        {item.linkPreview && (
                          <View style={[styles.linkPreviewCard, { backgroundColor: theme.surface }]}>
                            <Text style={[styles.linkTitle, { color: theme.accentLight }]}>{item.linkPreview.title}</Text>
                            <Text style={[styles.linkDesc, { color: theme.textMuted }]}>{item.linkPreview.description}</Text>
                            <Text style={styles.linkUrl}>{item.linkPreview.url}</Text>
                          </View>
                        )}

                        {/* Text Message */}
                        {item.type === 'text' && decryptedText ? (
                          <Text style={[styles.messageText, { color: isMine && activeThemeId === 'FROST' ? '#ffffff' : theme.text, fontSize: getFontSize() }]}>
                            {decryptedText}
                          </Text>
                        ) : null}

                    {/* Translated Text Preview */}
                    {translatedText && (
                      <View style={[styles.translatedBox, { backgroundColor: theme.card }]}>
                        <Text style={styles.translatedTag}>🌐 AI अनुवाद:</Text>
                        <Text style={[styles.translatedContent, { color: theme.text }]}>{translatedText}</Text>
                      </View>
                    )}

                    {/* Meta Row: Lock + Star + Time + Double Ticks */}
                    <View style={styles.metaRow}>
                      {isStarred && <Text style={styles.starIcon}>⭐</Text>}
                      <Text style={[styles.lockIcon, { color: theme.textMuted }]}>🔒</Text>
                      <Text style={[styles.timestamp, { color: theme.textMuted }]}>{item.time}</Text>
                      {isMine && (
                        <Text style={[styles.tickIcon, item.status === 'read' ? { color: '#38bdf8' } : { color: theme.textMuted }]}>
                          {item.status === 'read' ? '✓✓' : (item.status === 'delivered' ? '✓✓' : '✓')}
                        </Text>
                      )}
                    </View>

                    {/* Reactions */}
                    {item.reactions && Object.keys(item.reactions).length > 0 && (
                      <View style={styles.reactionsRow}>
                        {Object.entries(item.reactions).map(([emoji, users], idx) => (
                          <View key={idx} style={[styles.reactionPill, { backgroundColor: theme.card }]}>
                            <Text style={styles.reactionEmoji}>{emoji}</Text>
                            <Text style={[styles.reactionCount, { color: theme.text }]}>{users.length}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* AI Smart Replies Chips */}
        {aiSmartReplies.length > 0 && (
          <View style={styles.smartRepliesBar}>
            {aiSmartReplies.map((reply, idx) => (
              <TouchableOpacity 
                key={idx} 
                style={[styles.smartReplyChip, { backgroundColor: theme.card, borderColor: theme.accentLight }]}
                onPress={() => { sendMessage('text', { text: reply }); setAiSmartReplies([]); }}
              >
                <Text style={[styles.smartReplyText, { color: theme.text }]}>💡 {reply}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Typing Banner */}
        {typingUser ? (
          <View style={[styles.typingBar, { backgroundColor: theme.surface }]}>
            <Text style={[styles.typingText, { color: theme.accentLight }]}>{typingUser} टाइप कर रहे हैं... ✍️</Text>
          </View>
        ) : null}

        {/* Quoted Reply Banner */}
        {replyingToMessage && (
          <View style={[styles.replyingBar, { backgroundColor: theme.card, borderLeftColor: theme.accentLight }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.replyingToUser, { color: theme.accentLight }]}>@{replyingToMessage.sender} को जवाब दे रहे हैं:</Text>
              <Text style={[styles.replyingPreview, { color: theme.textMuted }]} numberOfLines={1}>{decryptText(replyingToMessage.text)}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingToMessage(null)}>
              <Text style={[styles.cancelReplyBtn, { color: theme.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Multi-Agent AI Squad Selector Bar */}
        <View style={[styles.aiBotSquadBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 4 }}>
            {[
              { tag: '@ai', label: '🤖 @ai (General)' },
              { tag: '@coder', label: '💻 @coder (Dev)' },
              { tag: '@meme', label: '🎭 @meme (Comedy)' },
              { tag: '@news', label: '📰 @news (Desk)' },
              { tag: '@roast', label: '🔥 @roast (Savage)' }
            ].map((bot, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.aiBotChip, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => setMessage(`${bot.tag} `)}
              >
                <Text style={[styles.aiBotChipText, { color: theme.accentLight }]}>{bot.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Anti-Spam Slow Mode Banner */}
        {slowModeCooldown > 0 && (
          <View style={[styles.slowModeBanner, { backgroundColor: '#fef3c7', borderColor: '#f59e0b' }]}>
            <Text style={styles.slowModeText}>⏳ Anti-Spam Slow Mode: कृपया {slowModeCooldown}s प्रतीक्षा करें...</Text>
          </View>
        )}

        {/* Input Bar */}
        {isRecordingAudio ? (
          <View style={[styles.recordingBar, { backgroundColor: '#ef4444' }]}>
            <Text style={styles.recordingText}>🔴 रिकॉर्ड हो रहा है: {recordingSeconds}s</Text>
            <TouchableOpacity onPress={cancelAudioRecording} style={styles.cancelRecBtn}>
              <Text style={styles.cancelRecText}>✕ Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={stopAndSendAudioRecording} style={styles.sendRecBtn}>
              <Text style={styles.sendRecText}>Send ➔</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.inputBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <TouchableOpacity style={styles.attachBtn} onPress={pickAndSendImage}>
              <Text style={styles.attachIcon}>📷</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.hdToggleChip, { backgroundColor: isHdMediaMode ? theme.accentLight : theme.card, borderColor: theme.border }]} 
              onPress={() => setIsHdMediaMode(!isHdMediaMode)}
            >
              <Text style={[styles.hdToggleText, { color: isHdMediaMode ? '#000000' : theme.textMuted }]}>
                {isHdMediaMode ? '💎 HD' : 'SD'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.hdToggleChip, { backgroundColor: isOneTimeMediaMode ? '#ef4444' : theme.card, borderColor: theme.border }]} 
              onPress={() => setIsOneTimeMediaMode(!isOneTimeMediaMode)}
            >
              <Text style={[styles.hdToggleText, { color: isOneTimeMediaMode ? '#ffffff' : theme.textMuted }]}>
                {isOneTimeMediaMode ? '🔥 1-Time' : '🔥'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachBtn} onPress={pickAndSendDocument}>
              <Text style={styles.attachIcon}>📎</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachBtn} onPress={() => setShowCreatePollModal(true)}>
              <Text style={styles.attachIcon}>📊</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachBtn} onPress={() => setShowMiniAppModal(true)}>
              <Text style={styles.attachIcon}>🎮</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.chatInput, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
              placeholder={slowModeCooldown > 0 ? `प्रतीक्षा करें (${slowModeCooldown}s)...` : "मैसेज लिखें या @ai सवाल पूछें..."}
              placeholderTextColor={theme.textMuted}
              value={message}
              editable={slowModeCooldown === 0}
              onFocus={() => {
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
              }}
              onChangeText={(txt) => {
                setMessage(txt);
                if (!ghostMode && !silentTyping) socket.emit('typing_start', { room: activeRoom, username: currentUser });
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(() => socket.emit('typing_stop', { room: activeRoom, username: currentUser }), 1500);
              }}
              multiline
            />
            {message.trim() ? (
              <TouchableOpacity 
                style={[styles.sendBtn, { backgroundColor: slowModeCooldown > 0 ? '#64748b' : theme.accentLight }]} 
                onPress={() => sendMessage('text')}
                onLongPress={() => setShowSendOptionsModal(true)}
                disabled={slowModeCooldown > 0}
              >
                <Text style={styles.sendBtnText}>{slowModeCooldown > 0 ? `${slowModeCooldown}s` : '➤'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.micBtn, { backgroundColor: theme.accent }]} onPress={startAudioRecording}>
                <Text style={styles.micIcon}>🎙️</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Modal: Dynamic Chat Wallpapers Studio */}
        <Modal visible={showWallpaperModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>🎨 डायनामिक चैट वॉलपेपर्स स्टूडियो</Text>
              <Text style={[styles.modalSub, { color: theme.textMuted }]}>अपनी पसंद का बैकग्राउंड थीम चुनें:</Text>
              <View style={{ gap: 10, marginVertical: 10 }}>
                {[
                  { id: 'amoled', name: '⬛ AMOLED Pure Black', desc: '100% बैटरी सेवर पिच ब्लैक', color: '#000000' },
                  { id: 'emerald', name: '🌿 Emerald Night', desc: 'क्लासिक डार्क एमराल्ड थीम', color: '#041c18' },
                  { id: 'slate', name: '🌌 Midnight Slate', desc: 'मॉडर्न कार्बन स्लेट थीम', color: '#111827' },
                  { id: 'doodle', name: '📜 Classic Doodle Pattern', desc: 'व्हाट्सएप जैसा पैटर्न', color: '#0b141a' }
                ].map((wp) => (
                  <TouchableOpacity
                    key={wp.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: chatWallpaper === wp.id ? theme.accentLight : theme.border,
                      backgroundColor: wp.color
                    }}
                    onPress={async () => {
                      setChatWallpaper(wp.id);
                      await Storage.setItem('@gupshupp_wallpaper', wp.id);
                      setShowWallpaperModal(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>{wp.name}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>{wp.desc}</Text>
                    </View>
                    {chatWallpaper === wp.id && <Text style={{ color: theme.accentLight, fontWeight: '900' }}>✓ Active</Text>}
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.accentLight }]} onPress={() => setShowWallpaperModal(false)}>
                <Text style={styles.primaryBtnText}>बंद करें</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Modal: Create Poll */}
        <Modal visible={showCreatePollModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>📊 नया वोटिंग पोल बनाएं</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border, marginTop: 12 }]}
                placeholder="प्रश्न पूछें (उदा. कल की मीटिंग कितने बजे?)"
                placeholderTextColor={theme.textMuted}
                value={pollQuestion}
                onChangeText={setPollQuestion}
              />
              {pollOptions.map((opt, i) => (
                <TextInput
                  key={i}
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border, marginTop: 8 }]}
                  placeholder={`विकल्प ${i + 1}`}
                  placeholderTextColor={theme.textMuted}
                  value={opt}
                  onChangeText={(val) => {
                    const updated = [...pollOptions];
                    updated[i] = val;
                    setPollOptions(updated);
                  }}
                />
              ))}
              <TouchableOpacity 
                style={[styles.addOptionBtn, { borderColor: theme.border }]} 
                onPress={() => setPollOptions(prev => [...prev, `Option ${prev.length + 1}`])}
              >
                <Text style={[styles.addOptionText, { color: theme.accentLight }]}>+ और विकल्प जोड़ें</Text>
              </TouchableOpacity>

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={[styles.modalBtnCancel, { backgroundColor: theme.border }]} onPress={() => setShowCreatePollModal(false)}>
                  <Text style={[styles.modalBtnCancelText, { color: theme.text }]}>रद्द करें</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtnConfirm, { backgroundColor: theme.accentLight }]} onPress={handleCreatePoll}>
                  <Text style={styles.modalBtnConfirmText}>पोल भेजें 🚀</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal: Message Actions */}
        <Modal visible={!!selectedMessageForAction} transparent animationType="fade">
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedMessageForAction(null)}>
            <View style={[styles.reactionModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.reactionModalTitle, { color: theme.textMuted }]}>रिएक्शन चुनें (Reactions):</Text>
              <View style={styles.emojiGrid}>
                {['❤️', '😂', '👍', '🔥', '😮', '😢', '🙏'].map((emoji, idx) => (
                  <TouchableOpacity key={idx} style={styles.emojiTouch} onPress={() => {
                    socket.emit('add_reaction', { room: activeRoom, messageId: selectedMessageForAction._id, emoji, username: currentUser });
                    setSelectedMessageForAction(null);
                  }}>
                    <Text style={styles.reactionBigEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.actionOptionsList}>
                <TouchableOpacity 
                  style={[styles.actionOptionItem, { backgroundColor: theme.card }]}
                  onPress={() => { setReplyingToMessage(selectedMessageForAction); setSelectedMessageForAction(null); }}
                >
                  <Text style={[styles.actionOptionText, { color: theme.text }]}>↩️ रिप्लाई करें (Reply)</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionOptionItem, { backgroundColor: theme.card }]}
                  onPress={() => {
                    const raw = decryptText(selectedMessageForAction.text);
                    socket.emit('ai_translate_request', { text: raw, targetLang: 'Hindi' }, (res) => {
                      if (res?.success) setTranslatedMessages(p => ({ ...p, [selectedMessageForAction._id]: res.translated }));
                    });
                    setSelectedMessageForAction(null);
                  }}
                >
                  <Text style={[styles.actionOptionText, { color: theme.accentLight }]}>🌐 AI अनुवाद करें (Translate to Hindi)</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionOptionItem, { backgroundColor: theme.card }]}
                  onPress={() => {
                    socket.emit('toggle_star_message', { messageId: selectedMessageForAction._id, username: currentUser });
                    setMessages(prev => prev.map(m => m._id === selectedMessageForAction._id ? {
                      ...m,
                      starredBy: (m.starredBy || []).includes(currentUser) 
                        ? m.starredBy.filter(u => u !== currentUser) 
                        : [...(m.starredBy || []), currentUser]
                    } : m));
                    setSelectedMessageForAction(null);
                  }}
                >
                  <Text style={[styles.actionOptionText, { color: '#f59e0b' }]}>⭐ स्टार / बुकमार्क (Star Message)</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionOptionItem, { backgroundColor: '#fee2e2' }]}
                  onPress={() => {
                    socket.emit('delete_message_for_everyone', {
                      room: activeRoom,
                      messageId: selectedMessageForAction._id,
                      requestedBy: currentUser
                    });
                    setMessages(prev => prev.map(m => m._id === selectedMessageForAction._id ? {
                      ...m,
                      text: '🚫 यह मैसेज डिलीट कर दिया गया है',
                      type: 'text',
                      image: null,
                      audio: null,
                      document: null
                    } : m));
                    setSelectedMessageForAction(null);
                  }}
                >
                  <Text style={[styles.actionOptionText, { color: '#dc2626', fontWeight: '800' }]}>🗑️ सबके लिए डिलीट करें (Delete for Everyone)</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Modal: AI Chat Summary */}
        <Modal visible={!!aiSummaryModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>📝 GupShupp AI चैट समरी (Gemini 2.5)</Text>
              <ScrollView style={{ maxHeight: 240, marginVertical: 14 }}>
                <Text style={[styles.summaryContentText, { color: theme.text }]}>{aiSummaryModal}</Text>
              </ScrollView>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.accentLight }]} onPress={() => setAiSummaryModal(null)}>
                <Text style={styles.primaryBtnText}>समझ आ गया 👍</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Modal: Disappearing Messages */}
        <Modal visible={showDisappearingModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>⏱️ गायब होने वाले मैसेज (Disappearing)</Text>
              <Text style={[styles.modalSub, { color: theme.textMuted }]}>नए मैसेज तय समय के बाद चैट से अपने आप गायब हो जाएंगे।</Text>
              <TouchableOpacity 
                style={[styles.disappearingOption, disappearingTtl === 86400000 && { borderColor: theme.accentLight, borderWidth: 2 }]}
                onPress={() => { setDisappearingTtl(86400000); setShowDisappearingModal(false); }}
              >
                <Text style={[styles.disappearingOptionText, { color: theme.text }]}>24 घंटे (24 Hours) ⏳</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.disappearingOption, disappearingTtl === 3600000 && { borderColor: theme.accentLight, borderWidth: 2 }]}
                onPress={() => { setDisappearingTtl(3600000); setShowDisappearingModal(false); }}
              >
                <Text style={[styles.disappearingOptionText, { color: theme.text }]}>1 घंटा (1 Hour) ⚡</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.disappearingOption, disappearingTtl === 0 && { borderColor: theme.accentLight, borderWidth: 2 }]}
                onPress={() => { setDisappearingTtl(0); setShowDisappearingModal(false); }}
              >
                <Text style={[styles.disappearingOptionText, { color: theme.text }]}>बंद (Off) ❌</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Modal: Fullscreen Image Preview */}
        <Modal visible={!!selectedImageModal} transparent animationType="fade">
          <View style={styles.fullscreenImageOverlay}>
            <TouchableOpacity style={styles.closeImageBtn} onPress={() => setSelectedImageModal(null)}>
              <Text style={styles.closeImageText}>✕</Text>
            </TouchableOpacity>
            {selectedImageModal && <Image source={{ uri: selectedImageModal }} style={styles.fullscreenImage} resizeMode="contain" />}
          </View>
        </Modal>

        {/* Modal: Incoming Call Overlay */}
        {incomingCall && (
          <Modal visible={true} transparent animationType="slide">
            <View style={styles.callModalOverlay}>
              <View style={[styles.callCard, { backgroundColor: theme.surface }]}>
                <Text style={styles.callAvatar}>👤</Text>
                <Text style={[styles.callerName, { color: theme.text }]}>@{incomingCall.fromUser}</Text>
                <Text style={[styles.callStatus, { color: theme.accentLight }]}>
                  {incomingCall.isVideo ? '📹 इनकमिंग वीडियो कॉल...' : '📞 इनकमिंग वॉइस कॉल...'}
                </Text>
                <View style={styles.callBtnRow}>
                  <TouchableOpacity style={[styles.callActionCircle, { backgroundColor: '#ef4444' }]} onPress={rejectCall}>
                    <Text style={styles.callActionIcon}>🔴</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.callActionCircle, { backgroundColor: '#22c55e' }]} onPress={acceptCall}>
                    <Text style={styles.callActionIcon}>🟢</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* Active Call UI (Fullscreen & PiP Mode) */}
        {activeCall && !isPiPMinimized && (
          <Modal visible={true} transparent animationType="fade">
            <View style={[styles.activeCallContainer, { backgroundColor: theme.bg }]}>
              <TouchableOpacity style={styles.pipBtn} onPress={() => setIsPiPMinimized(true)}>
                <Text style={styles.pipBtnText}>🗗 Minimize</Text>
              </TouchableOpacity>
              <Text style={styles.activeCallAvatar}>👤</Text>
              <Text style={[styles.activeCallerName, { color: theme.text }]}>@{activeCall.targetUser}</Text>
              <Text style={[styles.activeCallDuration, { color: theme.accentLight }]}>
                {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, '0')}
              </Text>
              
              <View style={styles.callControlRow}>
                <TouchableOpacity 
                  style={[styles.callControlBtn, { backgroundColor: isMuted ? '#ef4444' : theme.card }]}
                  onPress={() => setIsMuted(!isMuted)}
                >
                  <Text style={styles.callControlIcon}>{isMuted ? '🔇' : '🎙️'}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.callControlBtn, { backgroundColor: isSpeakerOn ? theme.accent : theme.card }]}
                  onPress={() => setIsSpeakerOn(!isSpeakerOn)}
                >
                  <Text style={styles.callControlIcon}>🔊</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.callControlBtn, { backgroundColor: '#ef4444' }]} onPress={endCall}>
                  <Text style={styles.callControlIcon}>⏹️</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

        {/* Floating PiP Call Banner */}
        {activeCall && isPiPMinimized && (
          <TouchableOpacity style={[styles.floatingPipBanner, { backgroundColor: theme.accent }]} onPress={() => setIsPiPMinimized(false)}>
            <Text style={styles.floatingPipText}>📞 Call with @{activeCall.targetUser} ({Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, '0')})</Text>
            <TouchableOpacity onPress={endCall} style={styles.pipEndBtn}>
              <Text style={styles.pipEndText}>End 🔴</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        {/* Modal: Linked Devices (WhatsApp Web QR Approval) */}
        <Modal visible={showLinkedDevicesModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>🔗 लिंक्ड डिवाइसेज (Linked Devices)</Text>
              <Text style={[styles.modalSub, { color: theme.textMuted }]}>पीसी स्क्रीन पर दिखने वाला सेशन कोड यहां डालें या अप्रूव करें:</Text>
              
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border, marginVertical: 12 }]}
                placeholder="उदा. qr_172350... (Web QR Code)"
                placeholderTextColor={theme.textMuted}
                value={qrCodeToScanInput}
                onChangeText={setQrCodeToScanInput}
                autoCapitalize="none"
              />

              <TouchableOpacity 
                style={[styles.primaryBtn, { backgroundColor: theme.accentLight }]}
                onPress={() => {
                  if (!qrCodeToScanInput.trim()) {
                    alert('कृपया पीसी का QR कोड दर्ज करें');
                    return;
                  }
                  socket.emit('qr_session_approve', {
                    sessionId: qrCodeToScanInput.trim(),
                    username: currentUser,
                    token: authToken,
                    avatar: userAvatar,
                    status: userStatus,
                    pin: userPin,
                    privacySettings: { ghostMode }
                  });
                  alert('✅ पीसी पर डिवाइस सफलतापूर्वक लिंक हो गया!');
                  setShowLinkedDevicesModal(false);
                  setQrCodeToScanInput('');
                }}
              >
                <Text style={styles.primaryBtnText}>डिवाइस लिंक अप्रूव करें 📲</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.addOptionBtn, { borderColor: theme.border, marginTop: 12 }]} onPress={() => setShowLinkedDevicesModal(false)}>
                <Text style={[styles.addOptionText, { color: theme.textMuted }]}>बंद करें</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Modal: Super-Group Live Stage Room (Discord/Zoom Grid) */}
        <Modal visible={!!activeStageRoom} transparent animationType="fade">
          <View style={[styles.stageModalContainer, { backgroundColor: theme.bg }]}>
            <View style={[styles.stageHeader, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
              <View>
                <Text style={[styles.stageRoomTitle, { color: theme.text }]}>🎙️ Stage: #{activeStageRoom}</Text>
                <Text style={[styles.stageRoomSub, { color: theme.accentLight }]}>🟢 Live ({stageUsers.length} active speakers)</Text>
              </View>
              <TouchableOpacity 
                style={[styles.stageLeaveBtn, { backgroundColor: '#ef4444' }]}
                onPress={() => {
                  socket.emit('leave_stage_room', { room: activeStageRoom, username: currentUser });
                  setActiveStageRoom(null);
                }}
              >
                <Text style={styles.stageLeaveText}>Leave 🔴</Text>
              </TouchableOpacity>
            </View>

            {/* Speaker Grid (Up to 6 tiles) */}
            <ScrollView contentContainerStyle={styles.stageGrid}>
              {stageUsers.map((user, idx) => (
                <View key={idx} style={[styles.stageTile, { backgroundColor: theme.card, borderColor: user.username === currentUser ? theme.accentLight : theme.border }]}>
                  <Text style={styles.stageTileAvatar}>{user.avatar || '🦁'}</Text>
                  <Text style={[styles.stageTileName, { color: theme.text }]}>@{user.username}</Text>
                  <View style={styles.stageTileStatusRow}>
                    <Text style={styles.stageTileMic}>{user.isMuted ? '🔇' : '🎙️'}</Text>
                    {user.isVideo && <Text style={styles.stageTileCam}>📹</Text>}
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Bottom Controls */}
            <View style={[styles.stageBottomBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
              <TouchableOpacity 
                style={[styles.stageControlBtn, { backgroundColor: isStageMuted ? '#ef4444' : theme.card }]}
                onPress={() => setIsStageMuted(!isStageMuted)}
              >
                <Text style={styles.stageControlIcon}>{isStageMuted ? '🔇' : '🎙️'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.stageControlBtn, { backgroundColor: isStageVideoOn ? theme.accentLight : theme.card }]}
                onPress={() => setIsStageVideoOn(!isStageVideoOn)}
              >
                <Text style={styles.stageControlIcon}>{isStageVideoOn ? '📹' : '📷'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.stageControlBtn, { backgroundColor: theme.card }]}
                onPress={() => alert('✋ आपने स्टेज पर हाथ उठाया है (Hand Raised)!')}
              >
                <Text style={styles.stageControlIcon}>✋</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Modal: Shared Media & Docs Vault (Gallery) */}
        <Modal visible={showSharedMediaVault} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.vaultModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>📂 शेयर्ड मीडिया & फाइल्स वॉल्ट</Text>
              
              {/* Tabs: Media | Docs | Links */}
              <View style={[styles.tabBar, { backgroundColor: theme.card, marginVertical: 12 }]}>
                {['MEDIA', 'DOCS', 'LINKS'].map((tab) => (
                  <TouchableOpacity 
                    key={tab} 
                    style={[styles.tabButton, mediaVaultTab === tab && { backgroundColor: theme.accent }]}
                    onPress={() => setMediaVaultTab(tab)}
                  >
                    <Text style={[styles.tabText, mediaVaultTab === tab ? styles.activeTabText : { color: theme.textMuted }]}>
                      {tab === 'MEDIA' ? '📷 Media' : (tab === 'DOCS' ? '📄 Docs' : '🔗 Links')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tab 1: Photos Grid */}
              {mediaVaultTab === 'MEDIA' && (
                <ScrollView contentContainerStyle={styles.vaultMediaGrid}>
                  {messages.filter(m => m.type === 'image' && m.image).length === 0 ? (
                    <Text style={[styles.emptyVaultText, { color: theme.textMuted }]}>इस चैट में कोई फोटो नहीं है।</Text>
                  ) : (
                    messages.filter(m => m.type === 'image' && m.image).map((m, i) => (
                      <TouchableOpacity key={i} onPress={() => { setSelectedImageModal(m.image); setShowSharedMediaVault(false); }}>
                        <Image source={{ uri: m.image }} style={styles.vaultGridImage} resizeMode="cover" />
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              )}

              {/* Tab 2: Docs List */}
              {mediaVaultTab === 'DOCS' && (
                <ScrollView style={{ maxHeight: 250 }}>
                  {messages.filter(m => m.type === 'document' && m.document).length === 0 ? (
                    <Text style={[styles.emptyVaultText, { color: theme.textMuted }]}>इस चैट में कोई डॉक्यूमेंट नहीं है।</Text>
                  ) : (
                    messages.filter(m => m.type === 'document' && m.document).map((m, i) => (
                      <TouchableOpacity key={i} style={[styles.vaultDocRow, { backgroundColor: theme.card }]} onPress={() => Linking.openURL(m.document.uri)}>
                        <Text style={styles.vaultDocIcon}>📄</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.vaultDocName, { color: theme.text }]} numberOfLines={1}>{m.document.name}</Text>
                          <Text style={[styles.vaultDocSize, { color: theme.textMuted }]}>{(m.document.size / 1024).toFixed(1)} KB • @{m.sender}</Text>
                        </View>
                        <Text style={{ color: theme.accentLight }}>डाउनलोड ⬇️</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              )}

              {/* Tab 3: Links List */}
              {mediaVaultTab === 'LINKS' && (
                <ScrollView style={{ maxHeight: 250 }}>
                  {messages.filter(m => decryptText(m.text).includes('http')).length === 0 ? (
                    <Text style={[styles.emptyVaultText, { color: theme.textMuted }]}>इस चैट में कोई लिंक शेयर नहीं हुआ है।</Text>
                  ) : (
                    messages.filter(m => decryptText(m.text).includes('http')).map((m, i) => {
                      const txt = decryptText(m.text);
                      const urlMatch = txt.match(/https?:\/\/[^\s]+/);
                      const url = urlMatch ? urlMatch[0] : '';
                      return (
                        <TouchableOpacity key={i} style={[styles.vaultLinkRow, { backgroundColor: theme.card }]} onPress={() => Linking.openURL(url)}>
                          <Text style={styles.vaultLinkIcon}>🌐</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.vaultLinkUrl, { color: '#38bdf8' }]} numberOfLines={1}>{url}</Text>
                            <Text style={[styles.vaultDocSize, { color: theme.textMuted }]}>Sent by @{m.sender} • {m.time}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              )}

              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.accentLight, marginTop: 14 }]} onPress={() => setShowSharedMediaVault(false)}>
                <Text style={styles.primaryBtnText}>बंद करें</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ⏱️ Modal: Send Options (Silent & Scheduled Messages) */}
        <Modal visible={showSendOptionsModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>⏱️ सेंड ऑप्शन्स (Telegram Power)</Text>
              <Text style={[styles.modalSubTitle, { color: theme.textMuted }]}>मैसेज भेजने का तरीका या समय चुनें:</Text>

              {/* Option 1: Normal Send */}
              <TouchableOpacity 
                style={[styles.sendOptionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => {
                  sendMessage('text');
                  setShowSendOptionsModal(false);
                }}
              >
                <Text style={styles.sendOptionIcon}>🚀</Text>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.sendOptionTitle, { color: theme.text }]}>Normal Send (सामान्य भेजें)</Text>
                  <Text style={[styles.sendOptionSub, { color: theme.textMuted }]}>तुरंत नॉर्मल साउंड के साथ डिलीवर करें</Text>
                </View>
              </TouchableOpacity>

              {/* Option 2: Silent Send */}
              <TouchableOpacity 
                style={[styles.sendOptionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => {
                  sendMessage('text', { isSilent: true });
                  setShowSendOptionsModal(false);
                }}
              >
                <Text style={styles.sendOptionIcon}>🔕</Text>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.sendOptionTitle, { color: theme.text }]}>Send Without Sound (साइलेंट सेंड)</Text>
                  <Text style={[styles.sendOptionSub, { color: theme.textMuted }]}>बिना घंटी या वाइब्रेशन के चुपचाप भेजें</Text>
                </View>
              </TouchableOpacity>

              {/* Option 3: Schedule in 10s */}
              <TouchableOpacity 
                style={[styles.sendOptionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => {
                  const targetTime = Date.now() + 10000;
                  socket.emit('schedule_message', {
                    room: activeRoom,
                    sender: currentUser,
                    text: encryptText(message),
                    type: 'text',
                    scheduledAt: targetTime
                  }, (res) => {
                    alert('⏱️ मैसेज 10 सेकंड बाद अपने आप भेजा जाएगा!');
                    setMessage('');
                    setShowSendOptionsModal(false);
                  });
                }}
              >
                <Text style={styles.sendOptionIcon}>⚡</Text>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.sendOptionTitle, { color: theme.accentLight }]}>Schedule: 10 Seconds (Demo)</Text>
                  <Text style={[styles.sendOptionSub, { color: theme.textMuted }]}>10 सेकंड बाद ऑटो-डिलीवर होगा</Text>
                </View>
              </TouchableOpacity>

              {/* Option 4: Schedule in 10 Mins */}
              <TouchableOpacity 
                style={[styles.sendOptionCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => {
                  const targetTime = Date.now() + 600000;
                  socket.emit('schedule_message', {
                    room: activeRoom,
                    sender: currentUser,
                    text: encryptText(message),
                    type: 'text',
                    scheduledAt: targetTime
                  }, (res) => {
                    alert('⏱️ मैसेज 10 मिनट बाद अपने आप भेजा जाएगा!');
                    setMessage('');
                    setShowSendOptionsModal(false);
                  });
                }}
              >
                <Text style={styles.sendOptionIcon}>📅</Text>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.sendOptionTitle, { color: theme.text }]}>Schedule: 10 Minutes बाद</Text>
                  <Text style={[styles.sendOptionSub, { color: theme.textMuted }]}>10 मिनट बाद डिलीवरी</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.modalBtnCancel, { backgroundColor: theme.border, marginTop: 12 }]} onPress={() => setShowSendOptionsModal(false)}>
                <Text style={[styles.modalBtnCancelText, { color: theme.text }]}>रद्द करें</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 📢 Modal: Channel Comments & Discussion Threads */}
        <Modal visible={!!activeChannelPostForComments} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.commentsModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.commentsHeader}>
                <Text style={[styles.commentsTitle, { color: theme.text }]}>💬 चैनल डिस्कशन थ्रेड</Text>
                <TouchableOpacity onPress={() => setActiveChannelPostForComments(null)}>
                  <Text style={{ color: theme.accentLight, fontWeight: '900', fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              </View>

              {activeChannelPostForComments && (
                <View style={[styles.commentPostQuote, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={{ color: theme.accentLight, fontWeight: '800', fontSize: 12 }}>📢 @{activeChannelPostForComments.sender}:</Text>
                  <Text style={{ color: theme.text, fontSize: 13, marginTop: 2 }} numberOfLines={2}>{decryptText(activeChannelPostForComments.text)}</Text>
                </View>
              )}

              {/* Comments List */}
              <ScrollView style={styles.commentsListScroll}>
                {channelComments.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>अभी कोई कमेंट नहीं है। पहले कमेंट करें! ✍️</Text>
                  </View>
                ) : (
                  channelComments.map((c, i) => (
                    <View key={i} style={[styles.commentBubble, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ color: theme.accentLight, fontWeight: '800', fontSize: 12 }}>{c.avatar} @{c.sender}</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 10 }}>{c.time}</Text>
                      </View>
                      <Text style={{ color: theme.text, fontSize: 13, marginTop: 4 }}>{c.text}</Text>
                    </View>
                  ))
                )}
              </ScrollView>

              {/* Add Comment Input */}
              <View style={[styles.commentInputRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.commentTextInput, { color: theme.text }]}
                  placeholder="अपनी राय / कमेंट लिखें..."
                  placeholderTextColor={theme.textMuted}
                  value={newChannelCommentText}
                  onChangeText={setNewChannelCommentText}
                />
                <TouchableOpacity 
                  style={[styles.commentSendBtn, { backgroundColor: theme.accentLight }]}
                  onPress={() => {
                    if (!newChannelCommentText.trim() || !activeChannelPostForComments) return;
                    socket.emit('post_channel_comment', {
                      channelName: activeRoom,
                      postId: activeChannelPostForComments._id,
                      sender: currentUser,
                      avatar: userAvatar,
                      badge: userVipBadge,
                      text: newChannelCommentText.trim()
                    }, (res) => {
                      if (res?.success) setNewChannelCommentText('');
                    });
                  }}
                >
                  <Text style={styles.commentSendBtnText}>➤</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* 🎮 Modal: In-Chat Mini-Apps Platform */}
        <Modal visible={showMiniAppModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.miniAppModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.commentsHeader}>
                <Text style={[styles.commentsTitle, { color: theme.text }]}>🎮 इन-चैट मिनी-ऐप्स & गेम्स</Text>
                <TouchableOpacity onPress={() => setShowMiniAppModal(false)}>
                  <Text style={{ color: theme.accentLight, fontWeight: '900', fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Tabs */}
              <View style={[styles.tabBar, { backgroundColor: theme.card, marginVertical: 10 }]}>
                {[
                  { id: 'GAMES', label: '⭕❌ Tic-Tac-Toe' },
                  { id: 'DICE', label: '🎲 Dice & Coin' },
                  { id: 'CALC', label: '🧮 Split Bill' }
                ].map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.tabButton, miniAppTab === t.id && { backgroundColor: theme.accent }]}
                    onPress={() => setMiniAppTab(t.id)}
                  >
                    <Text style={[styles.tabText, miniAppTab === t.id ? styles.activeTabText : { color: theme.textMuted }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tab 1: Tic-Tac-Toe Game */}
              {miniAppTab === 'GAMES' && (
                <View style={styles.gameContainer}>
                  <Text style={[styles.gameStatusText, { color: theme.accentLight }]}>
                    {tictactoeGame.winner ? (tictactoeGame.winner === 'Draw' ? "🤝 गेम ड्रा हो गया!" : `🎉 विजेता: खिलाड़ी ${tictactoeGame.winner}!`) : `बारी (Turn): खिलाड़ी ${tictactoeGame.turn}`}
                  </Text>
                  <View style={styles.tictactoeBoard}>
                    {tictactoeGame.board.map((cell, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.tictactoeCell, { backgroundColor: theme.card, borderColor: theme.border }]}
                        onPress={() => socket.emit('game_move', { room: activeRoom, index: idx, player: tictactoeGame.turn, username: currentUser })}
                      >
                        <Text style={[styles.tictactoeCellText, { color: cell === 'X' ? '#ef4444' : '#38bdf8' }]}>{cell || ''}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity 
                    style={[styles.gameResetBtn, { backgroundColor: theme.accent }]}
                    onPress={() => socket.emit('game_reset', { room: activeRoom })}
                  >
                    <Text style={styles.gameResetText}>🔄 नया गेम शुरू करें</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Tab 2: Dice & Coin */}
              {miniAppTab === 'DICE' && (
                <View style={styles.toolsContainer}>
                  <View style={[styles.toolCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.toolCardTitle, { color: theme.text }]}>🎲 फेयर डाइस रोलर (1-6)</Text>
                    <Text style={styles.diceLargeText}>{diceResult ? `🎲 ${diceResult}` : '🎲 ?'}</Text>
                    <TouchableOpacity 
                      style={[styles.primaryBtn, { backgroundColor: theme.accentLight, marginTop: 10 }]}
                      onPress={() => {
                        const roll = Math.floor(Math.random() * 6) + 1;
                        setDiceResult(roll);
                        sendMessage('text', { caption: `🎲 डाइस रोल परिणाम: ${roll}` });
                      }}
                    >
                      <Text style={styles.primaryBtnText}>डाइस रोल करें & चैट में शेयर करें 🚀</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.toolCard, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 14 }]}>
                    <Text style={[styles.toolCardTitle, { color: theme.text }]}>🪙 सिक्का उछालें (Coin Flip)</Text>
                    <Text style={styles.diceLargeText}>{coinResult ? (coinResult === 'HEADS' ? '👑 HEADS' : '⚡ TAILS') : '🪙 ?'}</Text>
                    <TouchableOpacity 
                      style={[styles.primaryBtn, { backgroundColor: theme.accent, marginTop: 10 }]}
                      onPress={() => {
                        const flip = Math.random() > 0.5 ? 'HEADS' : 'TAILS';
                        setCoinResult(flip);
                        sendMessage('text', { caption: `🪙 टॉस परिणाम: ${flip}` });
                      }}
                    >
                      <Text style={styles.primaryBtnText}>सिक्का उछालें & चैट में शेयर करें 🚀</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Tab 3: Split Bill Calculator */}
              {miniAppTab === 'CALC' && (
                <View style={styles.calcContainer}>
                  <Text style={[styles.label, { color: theme.text }]}>कुल बिल राशि (₹)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                    placeholder="उदा. 1200"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="numeric"
                    value={calcBillTotal}
                    onChangeText={setCalcBillTotal}
                  />
                  <Text style={[styles.label, { color: theme.text, marginTop: 10 }]}>लोगों की संख्या</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                    placeholder="उदा. 4"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="numeric"
                    value={calcPeopleCount}
                    onChangeText={setCalcPeopleCount}
                  />

                  {calcBillTotal && (
                    <View style={[styles.calcResultBox, { backgroundColor: theme.card, borderColor: theme.accentLight }]}>
                      <Text style={[styles.calcPerPerson, { color: theme.accentLight }]}>
                        प्रति व्यक्ति: ₹{Math.round((parseFloat(calcBillTotal) || 0) / (parseInt(calcPeopleCount) || 1))}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity 
                    style={[styles.primaryBtn, { backgroundColor: theme.accentLight, marginTop: 14 }]}
                    onPress={() => {
                      const perPerson = Math.round((parseFloat(calcBillTotal) || 0) / (parseInt(calcPeopleCount) || 1));
                      sendMessage('text', { caption: `🧮 बिल स्प्लिट: कुल ₹${calcBillTotal} / ${calcPeopleCount} लोग = ₹${perPerson} प्रति व्यक्ति` });
                      setShowMiniAppModal(false);
                    }}
                  >
                    <Text style={styles.primaryBtnText}>चैट में बिल शेयर करें ➔</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* 🔥 Modal: 1-Time Self-Destructing Photo Viewer */}
        <Modal visible={!!activeOneTimePhoto} transparent animationType="fade">
          <View style={[styles.oneTimeViewerOverlay, { backgroundColor: '#000000' }]}>
            <View style={styles.oneTimeTopBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 20 }}>🔥</Text>
                <Text style={styles.oneTimeTopText}>सेल्फ-डिस्ट्रक्टिंग फोटो ({activeOneTimePhoto?.remainingSec}s)</Text>
              </View>
              <TouchableOpacity 
                onPress={() => {
                  socket.emit('expire_1time_media', { room: activeRoom, messageId: activeOneTimePhoto?.messageId });
                  setActiveOneTimePhoto(null);
                }}
              >
                <Text style={{ color: '#ef4444', fontWeight: '900', fontSize: 16 }}>✕ बंद करें</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.oneTimeTimerBar}>
              <View style={[styles.oneTimeTimerFill, { width: `${((activeOneTimePhoto?.remainingSec || 5) / 5) * 100}%` }]} />
            </View>
            {activeOneTimePhoto?.image && (
              <Image source={{ uri: activeOneTimePhoto.image }} style={styles.oneTimeFullImage} resizeMode="contain" />
            )}
          </View>
        </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 12, fontSize: 16, fontWeight: '600' },
  
  // Pin Lock Screen
  lockIconLarge: { fontSize: 60, marginBottom: 16 },
  pinLockTitle: { fontSize: 24, fontWeight: '900' },
  pinLockSub: { fontSize: 13, marginTop: 4, textAlign: 'center', marginBottom: 24 },
  pinDotsRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  pinDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  pinErrorText: { color: '#ef4444', fontSize: 13, marginBottom: 16, textAlign: 'center' },
  numericKeypad: { flexDirection: 'row', flexWrap: 'wrap', width: 260, justifyContent: 'space-between', gap: 14 },
  keypadBtn: { width: 68, height: 68, borderRadius: 34, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  keypadText: { fontSize: 22, fontWeight: '800' },

  // Auth Styles
  authHeader: { alignItems: 'center', marginTop: 40, marginBottom: 20 },
  logoIcon: { fontSize: 50 },
  logoText: { fontSize: 32, fontWeight: '900', letterSpacing: 1 },
  tagline: { fontSize: 13, marginTop: 4 },
  authCard: { marginHorizontal: 24, padding: 20, borderRadius: 16, borderWidth: 1 },
  tabBar: { flexDirection: 'row', borderRadius: 10, padding: 4, marginBottom: 16 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabText: { fontSize: 14, fontWeight: '600' },
  activeTabText: { color: '#ffffff', fontWeight: '800' },
  errorBanner: { backgroundColor: '#fef2f2', color: '#dc2626', padding: 10, borderRadius: 8, marginBottom: 14, fontSize: 13, textAlign: 'center' },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { height: 46, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  passwordWrapper: { flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14 },
  passwordInput: { flex: 1, fontSize: 15 },
  eyeBtn: { padding: 4 },
  eyeBtnText: { fontSize: 12, fontWeight: '700', color: '#3b82f6' },
  primaryBtn: { height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#000000', fontSize: 16, fontWeight: '800' },

  // Home Header & Stories
  homeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerAvatarEmoji: { fontSize: 32 },
  headerLogo: { fontSize: 22, fontWeight: '900' },
  ghostBadge: { fontSize: 10, fontWeight: '900', color: '#a855f7', backgroundColor: 'rgba(168,85,247,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  welcomeUser: { fontSize: 12, marginTop: 1 },
  headerActionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconCircleBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  iconCircleText: { fontSize: 18 },
  storiesContainer: { paddingVertical: 10, borderBottomWidth: 1 },
  storiesScroll: { paddingHorizontal: 14, gap: 14 },
  storyCircleBox: { alignItems: 'center', width: 62 },
  addStoryRing: { position: 'relative', width: 56, height: 56, borderRadius: 28, borderWidth: 2, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b' },
  storyRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 2.5, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1e293b' },
  storyAvatarEmoji: { fontSize: 26 },
  addStoryPlusBadge: { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  addStoryPlusText: { color: '#000000', fontSize: 12, fontWeight: '900' },
  storyUserName: { fontSize: 11, marginTop: 4, textAlign: 'center' },

  // Folders Bar
  folderTabsBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  folderTabItem: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  folderTabLabel: { fontSize: 12, fontWeight: '700' },

  // Home Body & Chats List
  homeContent: { flex: 1, padding: 16 },
  tabContentContainer: { paddingBottom: 60 },
  sectionHeading: { fontSize: 15, fontWeight: '800', marginBottom: 12 },
  recentChatRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  chatAvatarBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center' },
  chatAvatarEmoji: { fontSize: 22 },
  chatTitleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  pinIcon: { fontSize: 12 },
  recentChatTitle: { fontSize: 15, fontWeight: '700' },
  recentChatTime: { fontSize: 11 },
  chatSnippetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },
  recentChatSnippet: { fontSize: 13, flex: 1, marginRight: 8 },
  unreadBadge: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  unreadCount: { color: '#000000', fontSize: 10, fontWeight: '900' },
  superGroupCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  groupCardHeader: { flexDirection: 'row', alignItems: 'center' },
  superGroupIcon: { fontSize: 26 },
  superGroupName: { fontSize: 16, fontWeight: '800' },
  superGroupMembers: { fontSize: 11, marginTop: 2 },
  superGroupDesc: { fontSize: 13, marginTop: 8 },
  joinGroupBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  joinGroupBtnText: { color: '#000000', fontSize: 12, fontWeight: '800' },
  channelHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  createChanBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  createChanBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  channelCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  channelHeader: { flexDirection: 'row', alignItems: 'center' },
  channelIcon: { fontSize: 26 },
  channelName: { fontSize: 16, fontWeight: '800' },
  channelSubscribers: { fontSize: 11, marginTop: 2 },
  channelDesc: { fontSize: 13, marginTop: 8 },
  viewChannelBtn: { marginTop: 10, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  viewChannelBtnText: { fontSize: 13, fontWeight: '700' },
  profileStudioCard: { alignItems: 'center', padding: 20, borderRadius: 16, borderWidth: 1 },
  profileBigAvatar: { fontSize: 64, marginBottom: 8 },
  profileUsername: { fontSize: 20, fontWeight: '900' },
  profileStatusText: { fontSize: 13, marginTop: 2, fontWeight: '700' },
  privacyBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
  privacyTitle: { fontSize: 14, fontWeight: '700' },
  privacySub: { fontSize: 11, marginTop: 2 },
  toggleSwitch: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  toggleSwitchText: { color: '#000000', fontSize: 11, fontWeight: '900' },
  avatarPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  avatarChoiceBtn: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  avatarChoiceEmoji: { fontSize: 26 },
  pinConfigBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1 },
  pinConfigText: { fontSize: 14, fontWeight: '600' },
  pinToggleBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  pinToggleBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  logoutBtnFull: { paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  logoutBtnFullText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },

  // Bottom Navigation Bar
  bottomNavBar: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 8 },
  bottomNavItem: { flex: 1, alignItems: 'center' },
  bottomNavIcon: { fontSize: 20 },
  bottomNavLabel: { fontSize: 11, marginTop: 2 },

  // Chat Screen Styles
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  backBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  backBtnText: { fontSize: 28, fontWeight: '900', lineHeight: 28 },
  chatTitleBlock: { flex: 1, marginLeft: 6 },
  chatTitleText: { fontSize: 16, fontWeight: '800' },
  chatSubTitleRow: { flexDirection: 'row', alignItems: 'center' },
  chatSubTitleText: { fontSize: 11 },
  disappearingBadge: { fontSize: 11, color: '#f59e0b', fontWeight: '700' },
  chatHeaderActions: { flexDirection: 'row', gap: 8 },
  headerIconBtn: { padding: 5 },
  headerIconText: { fontSize: 18 },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  searchBarInput: { flex: 1, height: 38, borderRadius: 8, paddingHorizontal: 10, fontSize: 14 },
  closeSearchText: { marginLeft: 10, fontWeight: '700', fontSize: 13 },
  messageList: { padding: 12 },
  messageRow: { marginVertical: 4, flexDirection: 'row' },
  myRow: { justifyContent: 'flex-end' },
  otherRow: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  senderName: { fontSize: 12, fontWeight: '800', marginBottom: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, gap: 4 },
  starIcon: { fontSize: 10 },
  lockIcon: { fontSize: 10 },
  timestamp: { fontSize: 10 },
  tickIcon: { fontSize: 11, fontWeight: '800' },
  chatImageThumbnail: { width: 220, height: 160, borderRadius: 8, marginBottom: 4 },
  quotedReplyBox: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6, paddingVertical: 2 },
  quotedReplySender: { fontSize: 11, fontWeight: '800', color: '#00a884' },
  quotedReplyText: { fontSize: 12, color: '#8696a0' },

  // Polls in Bubble
  pollBubbleContainer: { marginVertical: 4, width: 220 },
  pollQuestionText: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  pollOptionsContainer: { gap: 6 },
  pollOptionRow: { position: 'relative', overflow: 'hidden', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderRadius: 8, borderWidth: 1 },
  pollProgressFill: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  pollOptionLabel: { fontSize: 13, fontWeight: '700', zIndex: 1 },
  pollOptionPercent: { fontSize: 11, fontWeight: '800', zIndex: 1 },

  // Voice Note & Transcription
  voiceNoteBox: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8 },
  playPauseBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  playPauseIcon: { fontSize: 14 },
  waveformContainer: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  waveBar: { width: 3, borderRadius: 2 },
  speedBtn: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#1e293b' },
  speedBtnText: { fontSize: 10, fontWeight: '900' },
  transcribeBtn: { paddingVertical: 2, marginTop: 2 },
  transcribeBtnText: { fontSize: 11, color: '#38bdf8', fontWeight: '700' },
  transcribedCard: { padding: 8, borderRadius: 6, marginTop: 4 },
  transcribedText: { fontSize: 12, fontStyle: 'italic', color: '#e2e8f0' },

  // Document & Links
  documentCard: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 8, marginVertical: 4 },
  docIcon: { fontSize: 24 },
  docName: { fontSize: 13, fontWeight: '700' },
  docSize: { fontSize: 10 },
  docDownload: { fontSize: 12, fontWeight: '700', marginLeft: 8 },
  linkPreviewCard: { padding: 8, borderRadius: 8, marginVertical: 4 },
  linkTitle: { fontSize: 13, fontWeight: '800' },
  linkDesc: { fontSize: 11, marginTop: 2 },
  linkUrl: { fontSize: 10, color: '#38bdf8', marginTop: 2 },
  translatedBox: { marginTop: 6, padding: 6, borderRadius: 6 },
  translatedTag: { fontSize: 10, color: '#0284c7', fontWeight: '800' },
  translatedContent: { fontSize: 13, fontStyle: 'italic', marginTop: 2 },
  reactionsRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontSize: 10, marginLeft: 2, fontWeight: '700' },

  // AI Bubble
  aiBubbleWrapper: { marginVertical: 6, marginHorizontal: 8, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  aiRobotEmoji: { fontSize: 18 },
  aiTitle: { fontSize: 13, fontWeight: '800', color: '#0284c7', marginLeft: 6 },
  aiMessageText: { fontSize: 14, lineHeight: 21 },
  aiTimestamp: { fontSize: 10, color: '#64748b', textAlign: 'right', marginTop: 4 },
  smartRepliesBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 4, gap: 8 },
  smartReplyChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  smartReplyText: { fontSize: 12, fontWeight: '700' },
  typingBar: { paddingHorizontal: 16, paddingVertical: 4 },
  typingText: { fontSize: 12, fontStyle: 'italic', fontWeight: '600' },
  replyingBar: { flexDirection: 'row', alignItems: 'center', padding: 8, borderLeftWidth: 4 },
  replyingToUser: { fontSize: 12, fontWeight: '800' },
  replyingPreview: { fontSize: 12 },
  cancelReplyBtn: { fontSize: 16, paddingHorizontal: 8 },
  recordingBar: { flexDirection: 'row', alignItems: 'center', padding: 10, justifyContent: 'space-between' },
  recordingText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  cancelRecBtn: { padding: 4 },
  cancelRecText: { color: '#ffffff', fontWeight: '700' },
  sendRecBtn: { backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  sendRecText: { color: '#ef4444', fontWeight: '900' },
  inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderTopWidth: 1 },
  attachBtn: { padding: 6 },
  attachIcon: { fontSize: 20 },
  chatInput: { flex: 1, minHeight: 40, maxHeight: 100, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 6 },
  sendBtnText: { color: '#000000', fontSize: 16, fontWeight: '900' },
  micBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 6 },
  micIcon: { fontSize: 18 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { width: '85%', padding: 20, borderRadius: 16, borderWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSub: { fontSize: 13, marginTop: 4, marginBottom: 14 },
  summaryContentText: { fontSize: 14, lineHeight: 22 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  modalBtnCancel: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  modalBtnCancelText: { fontWeight: '700' },
  modalBtnConfirm: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  modalBtnConfirmText: { color: '#000000', fontWeight: '800' },
  addOptionBtn: { paddingVertical: 8, alignItems: 'center', borderRadius: 8, borderWidth: 1, marginTop: 8 },
  addOptionText: { fontSize: 13, fontWeight: '700' },
  colorPaletteRow: { flexDirection: 'row', gap: 10, marginTop: 12, justifyContent: 'center' },
  colorCircle: { width: 32, height: 32, borderRadius: 16 },
  reactionModalCard: { width: '85%', padding: 16, borderRadius: 16, borderWidth: 1 },
  reactionModalTitle: { fontSize: 12, fontWeight: '700', marginBottom: 10 },
  emojiGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  emojiTouch: { padding: 6 },
  reactionBigEmoji: { fontSize: 26 },
  actionOptionsList: { gap: 6 },
  actionOptionItem: { padding: 12, borderRadius: 8, alignItems: 'center' },
  actionOptionText: { fontSize: 13, fontWeight: '700' },
  disappearingOption: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#334155', marginBottom: 10 },
  disappearingOptionText: { fontSize: 15, fontWeight: '700' },
  fullscreenImageOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeImageBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 },
  closeImageText: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  fullscreenImage: { width: '100%', height: '80%' },
  storyViewerOverlay: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
  closeStoryBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 },
  closeStoryText: { color: '#ffffff', fontSize: 28, fontWeight: '900' },
  storyProgressBar: { position: 'absolute', top: 40, left: 20, right: 20, height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2 },
  storyProgressFill: { width: '100%', height: '100%', backgroundColor: '#ffffff', borderRadius: 2 },
  storyUserHeader: { position: 'absolute', top: 54, left: 20, flexDirection: 'row', alignItems: 'center' },
  storyViewerAvatar: { fontSize: 28 },
  storyViewerName: { color: '#ffffff', fontSize: 16, fontWeight: '800', marginLeft: 8 },
  storyCenterContent: { paddingHorizontal: 20 },
  storyBodyText: { color: '#ffffff', fontSize: 24, fontWeight: '900', textAlign: 'center', lineHeight: 34 },
  callModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  callCard: { width: '80%', padding: 24, borderRadius: 20, alignItems: 'center' },
  callAvatar: { fontSize: 60, marginBottom: 10 },
  callerName: { fontSize: 22, fontWeight: '900' },
  callStatus: { fontSize: 14, marginTop: 4, marginBottom: 24 },
  callBtnRow: { flexDirection: 'row', gap: 40 },
  callActionCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  callActionIcon: { fontSize: 26 },
  activeCallContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pipBtn: { position: 'absolute', top: 50, left: 20, padding: 8 },
  pipBtnText: { color: '#38bdf8', fontSize: 15, fontWeight: '700' },
  activeCallAvatar: { fontSize: 80, marginBottom: 16 },
  activeCallerName: { fontSize: 28, fontWeight: '900' },
  activeCallDuration: { fontSize: 18, marginTop: 8, fontWeight: '700' },
  callControlRow: { flexDirection: 'row', gap: 24, marginTop: 60 },
  callControlBtn: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  callControlIcon: { fontSize: 24 },
  floatingPipBanner: { position: 'absolute', top: 50, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12 },
  floatingPipText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  pipEndBtn: { backgroundColor: '#ef4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  pipEndText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },

  // Story Phase 2 Interactive Styles
  storyViewsBottomBar: { position: 'absolute', bottom: 30, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  storyViewsText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  storyReplyBottomBar: { position: 'absolute', bottom: 20, left: 16, right: 16 },
  storyQuickEmojiRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 10 },
  storyEmojiTouch: { padding: 4 },
  storyInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 24, paddingHorizontal: 14, paddingVertical: 4 },
  storyReplySendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#00a884', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },

  // Phase 3 HD Media & Slow Mode Styles
  hdBadgeOnImage: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  hdBadgeText: { color: '#38bdf8', fontSize: 10, fontWeight: '900' },
  hdToggleChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, marginRight: 4 },
  hdToggleText: { fontSize: 11, fontWeight: '800' },
  slowModeBanner: { paddingVertical: 6, paddingHorizontal: 12, borderTopWidth: 1, alignItems: 'center' },
  slowModeText: { color: '#b45309', fontSize: 12, fontWeight: '800' },

  // Floating Status FAB Button
  floatingStatusFab: { position: 'absolute', bottom: 75, right: 16, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 28, flexDirection: 'row', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 6, zIndex: 99 },
  floatingStatusFabText: { color: '#000000', fontWeight: '900', fontSize: 14 },

  // Phase 4 Styles: QR Login & Web Sync
  qrTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  qrSub: { fontSize: 12, textAlign: 'center', paddingHorizontal: 16, marginBottom: 14 },
  qrBox: { width: '90%', padding: 20, borderRadius: 16, borderWidth: 2, alignItems: 'center', marginVertical: 8 },
  qrIconEmoji: { fontSize: 48, marginBottom: 8 },
  qrSessionCode: { fontSize: 15, fontWeight: '900', letterSpacing: 1.5, textAlign: 'center' },
  qrWaitingText: { fontSize: 11, marginTop: 8 },
  refreshQrBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, marginTop: 12 },
  refreshQrText: { fontSize: 12, fontWeight: '700' },

  // Phase 4 Styles: Super-Group Stage Room
  stageBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1 },
  liveGreenDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' },
  stageBannerTitle: { fontSize: 13, fontWeight: '800' },
  stageJoinText: { fontSize: 12, fontWeight: '800' },
  stageModalContainer: { flex: 1 },
  stageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  stageRoomTitle: { fontSize: 18, fontWeight: '900' },
  stageRoomSub: { fontSize: 12, fontWeight: '700' },
  stageLeaveBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  stageLeaveText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  stageGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 10, justifyContent: 'center' },
  stageTile: { width: '46%', aspectRatio: 1, borderRadius: 16, borderWidth: 2, justifyContent: 'center', alignItems: 'center', padding: 10 },
  stageTileAvatar: { fontSize: 44, marginBottom: 6 },
  stageTileName: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  stageTileStatusRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  stageTileMic: { fontSize: 14 },
  stageTileCam: { fontSize: 14 },
  stageBottomBar: { flexDirection: 'row', justifyContent: 'center', gap: 20, paddingVertical: 14, borderTopWidth: 1 },
  stageControlBtn: { width: 54, height: 54, borderRadius: 27, justifyContent: 'center', alignItems: 'center' },
  stageControlIcon: { fontSize: 22 },

  // Phase 4 Styles: Multi-Agent AI Squad Chips
  aiBotSquadBar: { paddingVertical: 4, borderTopWidth: 1 },
  aiBotChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  aiBotChipText: { fontSize: 11, fontWeight: '800' },

  // Phase 4 Styles: Shared Media & Docs Vault
  vaultModalCard: { width: '90%', maxHeight: '80%', padding: 18, borderRadius: 18, borderWidth: 1 },
  vaultMediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  vaultGridImage: { width: '31%', aspectRatio: 1, borderRadius: 8 },
  emptyVaultText: { textAlign: 'center', paddingVertical: 30, fontSize: 13 },
  vaultDocRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, marginBottom: 6, gap: 8 },
  vaultDocIcon: { fontSize: 24 },
  vaultDocName: { fontSize: 13, fontWeight: '700' },
  vaultDocSize: { fontSize: 11, marginTop: 2 },
  vaultLinkRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, marginBottom: 6, gap: 8 },
  vaultLinkIcon: { fontSize: 20 },
  vaultLinkUrl: { fontSize: 13, fontWeight: '700' },

  // Phase 5 Styles: Telegram Saved Messages & Cloud
  savedMessagesRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  savedMessagesIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  savedMessagesIcon: { fontSize: 22 },
  savedBadge: { fontSize: 11, fontWeight: '800' },

  // Phase 5 Styles: VIP Badges
  vipBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  vipBadgeChoiceBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  vipBadgeChoiceText: { fontSize: 12, fontWeight: '800' },

  // Phase 5 Styles: Live Real-Time Auto-Translator Ambient Bar
  liveTranslateBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, borderBottomWidth: 1 },
  liveTranslateText: { fontSize: 12, fontWeight: '700' },
  langSwitchBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },

  // Phase 5 Styles: 1-Time Self-Destructing Media
  oneTimeMediaBox: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1.5, marginVertical: 4 },
  oneTimeViewerOverlay: { flex: 1, justifyContent: 'space-between', padding: 20 },
  oneTimeTopBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40 },
  oneTimeTopText: { color: '#ffffff', fontWeight: '900', fontSize: 16 },
  oneTimeTimerBar: { height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginVertical: 10 },
  oneTimeTimerFill: { height: '100%', backgroundColor: '#ef4444', borderRadius: 2 },
  oneTimeFullImage: { flex: 1, width: '100%', marginVertical: 20 },

  // Phase 5 Styles: Channel Comments Button
  channelCommentBtn: { marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  channelCommentBtnText: { fontSize: 12, fontWeight: '800' },

  // Phase 5 Styles: Send Options Modal
  sendOptionCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  sendOptionIcon: { fontSize: 24 },
  sendOptionTitle: { fontSize: 14, fontWeight: '800' },
  sendOptionSub: { fontSize: 11, marginTop: 2 },
  modalSubTitle: { fontSize: 12, marginBottom: 12 },

  // Phase 5 Styles: Channel Comments Modal
  commentsModalCard: { width: '90%', maxHeight: '80%', padding: 18, borderRadius: 18, borderWidth: 1 },
  commentsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  commentsTitle: { fontSize: 16, fontWeight: '900' },
  commentPostQuote: { padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  commentsListScroll: { maxHeight: 220, marginBottom: 10 },
  commentBubble: { padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  commentTextInput: { flex: 1, minHeight: 38, fontSize: 13 },
  commentSendBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center', marginLeft: 6 },
  commentSendBtnText: { color: '#000000', fontSize: 15, fontWeight: '900' },

  // Phase 5 Styles: In-Chat Mini-Apps Platform
  miniAppModalCard: { width: '90%', maxHeight: '85%', padding: 18, borderRadius: 18, borderWidth: 1 },
  gameContainer: { alignItems: 'center', paddingVertical: 10 },
  gameStatusText: { fontSize: 15, fontWeight: '900', marginBottom: 12 },
  tictactoeBoard: { width: 240, height: 240, flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  tictactoeCell: { width: 72, height: 72, borderRadius: 12, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  tictactoeCellText: { fontSize: 32, fontWeight: '900' },
  gameResetBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginTop: 16 },
  gameResetText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  toolsContainer: { paddingVertical: 8 },
  toolCard: { padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  calcContainer: { paddingVertical: 8 },
  calcResultBox: { padding: 12, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', marginTop: 12 },
  calcPerPerson: { fontSize: 18, fontWeight: '900' },

  // Phase 6 Styles: Neo-Gen Signature Appearance Studio
  appearanceStudioCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginTop: 8 },
  appearanceSubHeading: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  themePaletteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeChoiceCard: { width: '48%', padding: 10, borderRadius: 12, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  themeSwatchDot: { width: 12, height: 12, borderRadius: 6 },
  themeChoiceName: { fontSize: 11, fontWeight: '800' },
  bubbleShapeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  bubbleShapeBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center', borderWidth: 1.5 },
  bubbleShapeText: { fontSize: 11, fontWeight: '800' },
  removeWallBtn: { paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  appearancePreviewCard: { padding: 12, borderRadius: 12, borderWidth: 1 },
  previewLabel: { fontSize: 11, fontWeight: '700' },
  previewBubbleMine: { maxWidth: '85%', paddingHorizontal: 12, paddingVertical: 8 },
  previewBubbleOther: { maxWidth: '85%', paddingHorizontal: 12, paddingVertical: 8 },
  neoFloatingNavBar: { flexDirection: 'row', marginHorizontal: 14, marginBottom: 10, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 24, borderWidth: 1, elevation: 8, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
  neoBottomNavItem: { flex: 1, alignItems: 'center', paddingVertical: 4 }
});
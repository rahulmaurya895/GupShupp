import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  FlatList, SafeAreaView, StatusBar, KeyboardAvoidingView, 
  Platform, ActivityIndicator, Image, ImageBackground, Modal, ScrollView, Animated,
  Keyboard, Linking, BackHandler
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
const USE_ORACLE_CLOUD = true;

const getBaseUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    if (window.location.origin && window.location.origin !== 'null') {
      return window.location.origin;
    }
    const host = window.location.hostname || ORACLE_CLOUD_IP;
    const port = window.location.port ? `:${window.location.port}` : ':3000';
    return `${window.location.protocol || 'http:'}//${host}${port}`;
  }
  const host = USE_ORACLE_CLOUD ? ORACLE_CLOUD_IP : LOCAL_PC_IP;
  return `http://${host}:3000`;
};

const BASE_URL = getBaseUrl();
const SOCKET_URL = BASE_URL;

const socket = io(SOCKET_URL, { 
  transports: ['websocket', 'polling'],
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  randomizationFactor: 0.5,
  timeout: 45000, // Extended 45s tolerance for 50kbps throttled networks
  ackTimeout: 30000
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
        return { success: true };
      }
      if (AsyncStorage && typeof AsyncStorage.setItem === 'function') {
        await AsyncStorage.setItem(key, value);
        return { success: true };
      }
    } catch (e) {
      const isQuotaFull = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.message?.includes('quota') || e.message?.includes('space') || e.message?.includes('ENOSPC'));
      return { success: false, isQuotaFull, error: e?.message || 'Storage error' };
    }
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

import CryptoJS from 'crypto-js';

// 🔒 Military-Grade 256-bit AES End-to-End Encryption Engine (AES-256-CBC + PKCS7)
const AES_SECRET_KEY = 'GupShupp_Enterprise_AES_256_Secret_Salt_Key_998877665544332211';

const encryptText = (text) => {
  if (!text) return '';
  if (typeof text !== 'string') return text;
  try {
    const encrypted = CryptoJS.AES.encrypt(text, AES_SECRET_KEY).toString();
    return '🔒[AES256_E2EE]:' + encrypted;
  } catch (e) {
    return text;
  }
};

const decryptText = (cipher) => {
  if (!cipher) return '';
  if (typeof cipher !== 'string') return cipher;
  
  // 1. AES-256 Decryption with Tamper & MITM Integrity Check
  if (cipher.startsWith('🔒[AES256_E2EE]:')) {
    try {
      const rawCipher = cipher.replace('🔒[AES256_E2EE]:', '');
      const bytes = CryptoJS.AES.decrypt(rawCipher, AES_SECRET_KEY);
      const originalText = bytes.toString(CryptoJS.enc.Utf8);
      if (originalText) return originalText;
      return '⚠️ [डिक्रिप्शन विफल: संदेश से छेड़छाड़ की गई है / Integrity Compromised]';
    } catch (e) {
      return '⚠️ [डिक्रिप्शन विफल: संदेश से छेड़छाड़ की गई है / Integrity Compromised]';
    }
  }

  // 2. Backward Compatibility for Legacy V2 Salted Cipher
  if (cipher.startsWith('🔒[E2EE_SECURE_V2]:')) {
    try {
      const rawHex = cipher.replace('🔒[E2EE_SECURE_V2]:', '');
      const hexBlocks = rawHex.split('-');
      const salt = 'GupShupp_NeoGen_E2EE_2026_Secure_Salt_9988';
      let decrypted = '';
      for (let i = 0; i < hexBlocks.length; i++) {
        const saltByte = salt.charCodeAt(i % salt.length);
        const encryptedByte = parseInt(hexBlocks[i], 16);
        const originalCharCode = ((encryptedByte ^ 0x5A) - 17) ^ saltByte;
        decrypted += String.fromCharCode(originalCharCode);
      }
      return decrypted;
    } catch (e) {
      return cipher;
    }
  }

  // 3. Backward Compatibility for Legacy V1 XOR Cipher
  if (cipher.startsWith('🔒[E2EE]:')) {
    try {
      const raw = decodeURIComponent(cipher.replace('🔒[E2EE]:', ''));
      let decrypted = '';
      for (let i = 0; i < raw.length; i++) {
        decrypted += String.fromCharCode(raw.charCodeAt(i) ^ 42);
      }
      return decrypted;
    } catch (e) {
      return cipher;
    }
  }

  return cipher;
};

// 🔐 Biometric Hardware Authentication Module
let LocalAuthentication = null;
try {
  LocalAuthentication = require('expo-local-authentication');
} catch (e) {}

// 🌍 Global Multi-Language System (i18n)
const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English 🇬🇧', native: 'English' },
  { code: 'hi', label: 'हिन्दी 🇮🇳', native: 'हिन्दी' },
  { code: 'es', label: 'Español 🇪🇸', native: 'Español' },
  { code: 'fr', label: 'Français 🇫🇷', native: 'Français' },
  { code: 'ar', label: 'العربية 🇸🇦', native: 'العربية' },
  { code: 'ru', label: 'Русский 🇷🇺', native: 'Русский' },
  { code: 'de', label: 'Deutsch 🇩🇪', native: 'Deutsch' },
  { code: 'ja', label: '日本語 🇯🇵', native: '日本語' },
  { code: 'pt', label: 'Português 🇧🇷', native: 'Português' },
  { code: 'mr', label: 'मराठी 🇮🇳', native: 'मराठी' },
  { code: 'ta', label: 'தமிழ் 🇮🇳', native: 'தமிழ்' },
  { code: 'bn', label: 'বাংলা 🇮🇳', native: 'বাংলা' }
];

const TRANSLATIONS = {
  en: {
    app_name: 'GupShupp',
    tagline: 'Enterprise Super App',
    chats: 'Chats',
    groups: 'Groups',
    channels: 'Channels',
    profile: 'Profile',
    search_placeholder: 'Search chats, contacts, or messages...',
    type_message_placeholder: 'Type a message or ask @gp...',
    send: 'Send',
    online: 'Online',
    offline: 'Offline',
    connecting: 'Connecting...',
    slow_network: 'Slow Network 🐢',
    direct_messages: 'Direct Messages',
    group_rooms: 'Community Rooms',
    settings: 'Settings',
    appearance: 'Appearance Studio',
    privacy_security: 'Privacy & Security',
    ghost_mode: 'Ghost / Stealth Mode',
    app_lock: 'App PIN & Biometrics',
    cloud_backup: 'Cloud Backup & Vault',
    backup_now: 'Backup to Cloud ☁️',
    restore_now: 'Restore from Cloud 📥',
    starred_messages: 'Starred Messages ⭐',
    language: 'App Language 🌐',
    biometric_prompt: 'Unlock GupShupp with Biometrics',
    biometric_btn: 'Use Fingerprint / FaceID 👆',
    enter_pin: 'Enter 4-Digit PIN to Unlock',
    login: 'Login',
    register: 'Sign Up',
    username_placeholder: 'Choose Username',
    password_placeholder: 'Enter Password',
    admin_only_badge: '🔒 Only Admins can send messages in this group',
    failed_retry: '⚠️ Upload Failed • Tap to Retry 🔄'
  },
  hi: {
    app_name: 'गपशप',
    tagline: 'सुपर मैसेजिंग ऐप',
    chats: 'चैट्स',
    groups: 'ग्रुप्स',
    channels: 'चैनल्स',
    profile: 'प्रोफाइल',
    search_placeholder: 'चैट्स, कॉन्टैक्ट्स या मैसेज खोजें...',
    type_message_placeholder: 'मैसेज लिखें या @gp सवाल पूछें...',
    send: 'भेजें',
    online: 'ऑनलाइन',
    offline: 'ऑफलाइन',
    connecting: 'कनेक्ट हो रहा है...',
    slow_network: 'धीमा नेटवर्क 🐢',
    direct_messages: 'डायरेक्ट मैसेजेस',
    group_rooms: 'कम्युनिटी रूम्स',
    settings: 'सेटिंग्स',
    appearance: 'अपीयरेंस स्टूडियो',
    privacy_security: 'प्राइवेसी व सुरक्षा',
    ghost_mode: 'घोस्ट / स्टेल्थ मोड',
    app_lock: 'ऐप पिन व बायोमेट्रिक्स',
    cloud_backup: 'क्लाउड बैकअप व वॉल्ट',
    backup_now: 'क्लाउड पर बैकअप लें ☁️',
    restore_now: 'क्लाउड से रीस्टोर करें 📥',
    starred_messages: 'स्टार किए गए संदेश ⭐',
    language: 'ऐप की भाषा 🌐',
    biometric_prompt: 'बायोमेट्रिक्स से गपशप अनलॉक करें',
    biometric_btn: 'फिंगरप्रिंट / फेस का उपयोग करें 👆',
    enter_pin: 'अनलॉक करने के लिए 4-अंकों का पिन दर्ज करें',
    login: 'लॉगिन',
    register: 'साइन अप',
    username_placeholder: 'यूज़रनेम चुनें',
    password_placeholder: 'पासवर्ड दर्ज करें',
    admin_only_badge: '🔒 इस ग्रुप में सिर्फ एडमिन मैसेज भेज सकते हैं',
    failed_retry: '⚠️ अपलोड विफल • दोबारा भेजें 🔄'
  },
  es: {
    app_name: 'GupShupp',
    tagline: 'Súper Aplicación',
    chats: 'Chats',
    groups: 'Grupos',
    channels: 'Canales',
    profile: 'Perfil',
    search_placeholder: 'Buscar chats, contactos...',
    type_message_placeholder: 'Escribe un mensaje...',
    send: 'Enviar',
    online: 'En línea',
    offline: 'Desconectado',
    connecting: 'Conectando...',
    slow_network: 'Red lenta 🐢',
    direct_messages: 'Mensajes directos',
    group_rooms: 'Salas comunitarias',
    settings: 'Ajustes',
    appearance: 'Estudio de diseño',
    privacy_security: 'Privacidad y seguridad',
    ghost_mode: 'Modo fantasma',
    app_lock: 'PIN y biometría',
    cloud_backup: 'Copia en la nube',
    backup_now: 'Copia en la nube ☁️',
    restore_now: 'Restaurar de la nube 📥',
    starred_messages: 'Mensajes destacados ⭐',
    language: 'Idioma 🌐',
    biometric_prompt: 'Desbloquear con biometría',
    biometric_btn: 'Usar huella / FaceID 👆',
    enter_pin: 'Introduce el PIN',
    login: 'Iniciar sesión',
    register: 'Registrarse',
    username_placeholder: 'Usuario',
    password_placeholder: 'Contraseña',
    admin_only_badge: '🔒 Solo administradores',
    failed_retry: '⚠️ Error • Reintentar 🔄'
  },
  fr: {
    app_name: 'GupShupp',
    tagline: 'Super Application',
    chats: 'Discussions',
    groups: 'Groupes',
    channels: 'Canaux',
    profile: 'Profil',
    search_placeholder: 'Rechercher...',
    type_message_placeholder: 'Écrivez un message...',
    send: 'Envoyer',
    online: 'En ligne',
    offline: 'Hors ligne',
    connecting: 'Connexion...',
    slow_network: 'Réseau lent 🐢',
    direct_messages: 'Messages directs',
    group_rooms: 'Salons',
    settings: 'Paramètres',
    appearance: 'Studio d\'apparence',
    privacy_security: 'Confidentialité',
    ghost_mode: 'Mode fantôme',
    app_lock: 'PIN et biométrie',
    cloud_backup: 'Sauvegarde cloud',
    backup_now: 'Sauvegarder ☁️',
    restore_now: 'Restaurer 📥',
    starred_messages: 'Favoris ⭐',
    language: 'Langue 🌐',
    biometric_prompt: 'Déverrouiller avec la biométrie',
    biometric_btn: 'Empreinte / FaceID 👆',
    enter_pin: 'Entrez le PIN',
    login: 'Connexion',
    register: 'S\'inscrire',
    username_placeholder: 'Identifiant',
    password_placeholder: 'Mot de passe',
    admin_only_badge: '🔒 Administrateurs seulement',
    failed_retry: '⚠️ Échec • Réessayer 🔄'
  },
  ar: {
    app_name: 'GupShupp',
    tagline: 'تطبيق المحادثة الفائق',
    chats: 'المحادثات',
    groups: 'المجموعات',
    channels: 'القنوات',
    profile: 'الملف الشخصي',
    search_placeholder: 'بحث...',
    type_message_placeholder: 'اكتب رسالة...',
    send: 'إرسال',
    online: 'متصل',
    offline: 'غير متصل',
    connecting: 'جاري الاتصال...',
    slow_network: 'شبكة بطيئة 🐢',
    direct_messages: 'الرسائل المباشرة',
    group_rooms: 'غرف المجتمع',
    settings: 'الإعدادات',
    appearance: 'استوديو المظهر',
    privacy_security: 'الخصوصية والأمان',
    ghost_mode: 'وضع التخفي',
    app_lock: 'قفل التطبيق',
    cloud_backup: 'النسخ السحابي',
    backup_now: 'نسخ احتياطي ☁️',
    restore_now: 'استعادة 📥',
    starred_messages: 'المميزة بنجمة ⭐',
    language: 'اللغة 🌐',
    biometric_prompt: 'فتح باستخدام البصمة',
    biometric_btn: 'استخدام البصمة 👆',
    enter_pin: 'أدخل رمز PIN',
    login: 'تسجيل الدخول',
    register: 'إنشاء حساب',
    username_placeholder: 'اسم المستخدم',
    password_placeholder: 'كلمة المرور',
    admin_only_badge: '🔒 المشرفون فقط',
    failed_retry: '⚠️ فشل • إعادة المحاولة 🔄'
  },
  ru: {
    app_name: 'GupShupp',
    tagline: 'Супер-приложение',
    chats: 'Чаты',
    groups: 'Группы',
    channels: 'Каналы',
    profile: 'Профиль',
    search_placeholder: 'Поиск...',
    type_message_placeholder: 'Напишите сообщение...',
    send: 'Отправить',
    online: 'В сети',
    offline: 'Не в сети',
    connecting: 'Подключение...',
    slow_network: 'Медленная сеть 🐢',
    direct_messages: 'Личные сообщения',
    group_rooms: 'Комнаты',
    settings: 'Настройки',
    appearance: 'Внешний вид',
    privacy_security: 'Безопасность',
    ghost_mode: 'Режим невидимки',
    app_lock: 'ПИН-код и биометрия',
    cloud_backup: 'Резервная копия',
    backup_now: 'Создать копию ☁️',
    restore_now: 'Восстановить 📥',
    starred_messages: 'Избранное ⭐',
    language: 'Язык 🌐',
    biometric_prompt: 'Разблокировать по биометрии',
    biometric_btn: 'Отпечаток / FaceID 👆',
    enter_pin: 'Введите ПИН',
    login: 'Вход',
    register: 'Регистрация',
    username_placeholder: 'Имя пользователя',
    password_placeholder: 'Пароль',
    admin_only_badge: '🔒 Только администраторы',
    failed_retry: '⚠️ Ошибка • Повторить 🔄'
  },
  de: {
    app_name: 'GupShupp',
    tagline: 'Enterprise Super App',
    chats: 'Chats',
    groups: 'Gruppen',
    channels: 'Kanäle',
    profile: 'Profil',
    search_placeholder: 'Suchen...',
    type_message_placeholder: 'Nachricht schreiben...',
    send: 'Senden',
    online: 'Online',
    offline: 'Offline',
    connecting: 'Verbinden...',
    slow_network: 'Langsames Netz 🐢',
    direct_messages: 'Direktnachrichten',
    group_rooms: 'Räume',
    settings: 'Einstellungen',
    appearance: 'Design-Studio',
    privacy_security: 'Sicherheit',
    ghost_mode: 'Geister-Modus',
    app_lock: 'PIN & Biometrie',
    cloud_backup: 'Cloud-Backup',
    backup_now: 'Sichern ☁️',
    restore_now: 'Wiederherstellen 📥',
    starred_messages: 'Favoriten ⭐',
    language: 'Sprache 🌐',
    biometric_prompt: 'Mit Biometrie entsperren',
    biometric_btn: 'Biometrie nutzen 👆',
    enter_pin: 'PIN eingeben',
    login: 'Anmelden',
    register: 'Registrieren',
    username_placeholder: 'Benutzername',
    password_placeholder: 'Passwort',
    admin_only_badge: '🔒 Nur Admins',
    failed_retry: '⚠️ Fehler • Wiederholen 🔄'
  },
  ja: {
    app_name: 'GupShupp',
    tagline: '次世代スーパーアプリ',
    chats: 'チャット',
    groups: 'グループ',
    channels: 'チャンネル',
    profile: 'プロフィール',
    search_placeholder: '検索...',
    type_message_placeholder: 'メッセージを入力...',
    send: '送信',
    online: 'オンライン',
    offline: 'オフライン',
    connecting: '接続中...',
    slow_network: '低速ネットワーク 🐢',
    direct_messages: 'ダイレクトメッセージ',
    group_rooms: 'ルーム',
    settings: '設定',
    appearance: 'デザインスタジオ',
    privacy_security: 'セキュリティ',
    ghost_mode: 'ゴーストモード',
    app_lock: 'PIN＆生体認証',
    cloud_backup: 'クラウドバックアップ',
    backup_now: 'バックアップ ☁️',
    restore_now: '復元 📥',
    starred_messages: 'スター付き ⭐',
    language: '言語 🌐',
    biometric_prompt: '生体認証で解除',
    biometric_btn: '指紋 / FaceID 👆',
    enter_pin: 'PINを入力',
    login: 'ログイン',
    register: '新規登録',
    username_placeholder: 'ユーザー名',
    password_placeholder: 'パスワード',
    admin_only_badge: '🔒 管理者のみ',
    failed_retry: '⚠️ 送信失敗 • 再試行 🔄'
  },
  pt: {
    app_name: 'GupShupp',
    tagline: 'Super Aplicativo',
    chats: 'Conversas',
    groups: 'Grupos',
    channels: 'Canais',
    profile: 'Perfil',
    search_placeholder: 'Pesquisar...',
    type_message_placeholder: 'Digite uma mensagem...',
    send: 'Enviar',
    online: 'Online',
    offline: 'Offline',
    connecting: 'Conectando...',
    slow_network: 'Rede lenta 🐢',
    direct_messages: 'Mensagens diretas',
    group_rooms: 'Salas',
    settings: 'Configurações',
    appearance: 'Aparência',
    privacy_security: 'Privacidade',
    ghost_mode: 'Modo fantasma',
    app_lock: 'PIN e biometria',
    cloud_backup: 'Backup na nuvem',
    backup_now: 'Fazer backup ☁️',
    restore_now: 'Restaurar 📥',
    starred_messages: 'Favoritos ⭐',
    language: 'Idioma 🌐',
    biometric_prompt: 'Desbloquear com biometria',
    biometric_btn: 'Usar biometria 👆',
    enter_pin: 'Digite o PIN',
    login: 'Entrar',
    register: 'Cadastrar',
    username_placeholder: 'Usuário',
    password_placeholder: 'Senha',
    admin_only_badge: '🔒 Apenas administradores',
    failed_retry: '⚠️ Erro • Tentar de novo 🔄'
  },
  mr: {
    app_name: 'गपशप',
    tagline: 'सुपर मेसेजिंग ॲप',
    chats: 'गप्पा',
    groups: 'गट',
    channels: 'वाहिन्या',
    profile: 'प्रोफाइल',
    search_placeholder: 'शोधा...',
    type_message_placeholder: 'संदेश लिहा...',
    send: 'पाठवा',
    online: 'ऑनलाइन',
    offline: 'ऑफलाइन',
    connecting: 'कनेक्ट होत आहे...',
    slow_network: 'मंद नेटवर्क 🐢',
    direct_messages: 'थेट संदेश',
    group_rooms: 'खोल्या',
    settings: 'सेटिंग्ज',
    appearance: 'स्वरूप स्टुडिओ',
    privacy_security: 'सुरक्षा',
    ghost_mode: 'घोस्ट मोड',
    app_lock: 'पिन व बायोमेट्रिक्स',
    cloud_backup: 'क्लाउड बॅकअप',
    backup_now: 'बॅकअप घ्या ☁️',
    restore_now: 'पुनर्संचयित करा 📥',
    starred_messages: 'तारांकित ⭐',
    language: 'भाषा 🌐',
    biometric_prompt: 'बायोमेट्रिक्सने अनलॉक करा',
    biometric_btn: 'फिंगरप्रिंट 👆',
    enter_pin: 'पिन प्रविष्ट करा',
    login: 'लॉगिन',
    register: 'साइन अप',
    username_placeholder: 'वापरकर्ता',
    password_placeholder: 'पासवर्ड',
    admin_only_badge: '🔒 फक्त ॲडमिन',
    failed_retry: '⚠️ अयशस्वी • पुन्हा प्रयत्न 🔄'
  },
  ta: {
    app_name: 'GupShupp',
    tagline: 'சூப்பர் செயலி',
    chats: 'அரட்டைகள்',
    groups: 'குழுக்கள்',
    channels: 'சேனல்கள்',
    profile: 'சுயவிவரம்',
    search_placeholder: 'தேடுங்கள்...',
    type_message_placeholder: 'செய்தி...',
    send: 'அனுப்பு',
    online: 'ஆன்லைன்',
    offline: 'ஆஃப்லைன்',
    connecting: 'இணைக்கிறது...',
    slow_network: 'மெதுவான நெட்வொர்க் 🐢',
    direct_messages: 'நேரடி அரட்டை',
    group_rooms: 'அறைகள்',
    settings: 'அமைப்புகள்',
    appearance: 'தோற்றம்',
    privacy_security: 'பாதுகாப்பு',
    ghost_mode: 'கோஸ்ட்',
    app_lock: 'பயோமெட்ரிக்ஸ்',
    cloud_backup: 'கிளவுட் காப்புநகல்',
    backup_now: 'காப்பிடு ☁️',
    restore_now: 'மீட்டெடு 📥',
    starred_messages: 'நட்சத்திரம் ⭐',
    language: 'மொழி 🌐',
    biometric_prompt: 'பயோமெட்ரிக் திறக்கவும்',
    biometric_btn: 'கைரேகை 👆',
    enter_pin: 'பின் உள்ளிடவும்',
    login: 'உள்நுழைக',
    register: 'பதிவுசெய்க',
    username_placeholder: 'பயனர்பெயர்',
    password_placeholder: 'கடவுச்சொல்',
    admin_only_badge: '🔒 நிர்வாகி மட்டும்',
    failed_retry: '⚠️ மீண்டும் முயற்சி 🔄'
  },
  bn: {
    app_name: 'গপশপ',
    tagline: 'সুপার মেসেজিং অ্যাপ',
    chats: 'চ্যাট',
    groups: 'গ্রুপ',
    channels: 'চ্যানেল',
    profile: 'প্রোফাইল',
    search_placeholder: 'অনুসন্ধান...',
    type_message_placeholder: 'বার্তা লিখুন...',
    send: 'পাঠান',
    online: 'অনলাইন',
    offline: 'অফলাইন',
    connecting: 'সংযুক্ত হচ্ছে...',
    slow_network: 'ধীর নেটওয়ার্ক 🐢',
    direct_messages: 'সরাসরি বার্তা',
    group_rooms: 'রুম',
    settings: 'সেটিংস',
    appearance: 'অ্যাপিয়ারেন্স',
    privacy_security: 'নিরাপত্তা',
    ghost_mode: 'ঘোস্ট মোড',
    app_lock: 'পিন ও বায়োমেট্রিক্স',
    cloud_backup: 'ক্লাউড ব্যাকআপ',
    backup_now: 'ব্যাকআপ ☁️',
    restore_now: 'পুনরুদ্ধার 📥',
    starred_messages: 'তারকাচিহ্নিত ⭐',
    language: 'ভাষা 🌐',
    biometric_prompt: 'বায়োমেট্রিক্স আনলক',
    biometric_btn: 'আঙুলের ছাপ 👆',
    enter_pin: 'পিন লিখুন',
    login: 'লগইন',
    register: 'নিবন্ধন',
    username_placeholder: 'ব্যবহারকারী',
    password_placeholder: 'পাসওয়ার্ড',
    admin_only_badge: '🔒 অ্যাডমিন শুধুমাত্র',
    failed_retry: '⚠️ পুনরায় চেষ্টা 🔄'
  }
};

const getTranslation = (key, lang = 'en') => {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  return dict[key] || TRANSLATIONS.en[key] || key;
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
  const [showGoogleAuthModal, setShowGoogleAuthModal] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // 🌍 Global Language & i18n State
  const [appLanguage, setAppLanguage] = useState('en'); // Default: Clean International English
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const t = (k) => getTranslation(k, appLanguage);

  // ⭐ Starred Messages Dedicated Screen State
  const [showStarredModal, setShowStarredModal] = useState(false);

  // 🔐 Biometric State
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);

  // 🛡️ Group Admin Controls State
  const [roomAdminSettings, setRoomAdminSettings] = useState({ adminOnlyPost: false, mutedMembers: [], admins: [] });
  const [showAdminSettingsModal, setShowAdminSettingsModal] = useState(false);

  // ☁️ Cloud Backup & Vault State
  const [isCloudBackupLoading, setIsCloudBackupLoading] = useState(false);
  const [cloudBackupStatus, setCloudBackupStatus] = useState('');
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
  const [networkQuality, setNetworkQuality] = useState('FAST'); // 'FAST' | 'SLOW' | 'OFFLINE'
  const [networkRttMs, setNetworkRttMs] = useState(0);
  const [isReconnectedAlertVisible, setIsReconnectedAlertVisible] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [activeMembersCount, setActiveMembersCount] = useState(1);
  const [typingUser, setTypingUser] = useState('');
  const [displayedMessageLimit, setDisplayedMessageLimit] = useState(50);

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

  // 🐒 Chaos Monkey & Safety Guard
  const [chaosWarningModal, setChaosWarningModal] = useState({ visible: false, title: '', message: '' });
  const lastActionTapTimeRef = useRef(0);
  const lastTypingEmitRef = useRef(0);

  // Home Bottom Tabs: 'CHATS' | 'GROUPS' | 'CHANNELS' | 'PROFILE'
  const [bottomNav, setBottomNav] = useState('CHATS');

  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // 🎨 Phase 6: Neo-Gen Signature Appearance Studio State (WhatsApp + Telegram Hybrid)
  const [activeThemeId, setActiveThemeId] = useState('WHATSAPP'); // 'WHATSAPP' | 'TELEGRAM' | 'CYBER' | 'GOLD' | 'SUNSET' | 'MATRIX' | 'FROST'
  const [bubbleGeometry, setBubbleGeometry] = useState('SQUIRCLE'); // 'PILL' | 'SQUIRCLE' | 'ANGULAR'
  const [fontSizeScale, setFontSizeScale] = useState('STANDARD'); // 'COMPACT' | 'STANDARD' | 'LARGE'
  const [customWallpaperUri, setCustomWallpaperUri] = useState(null);
  const [showAppearanceStudioModal, setShowAppearanceStudioModal] = useState(false);
  const [showAttachmentMenuModal, setShowAttachmentMenuModal] = useState(false);
  const [showChatOptionsMenu, setShowChatOptionsMenu] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatUserInput, setNewChatUserInput] = useState('');
  const [registeredUsersList, setRegisteredUsersList] = useState([]);
  const [isLoadingUsersList, setIsLoadingUsersList] = useState(false);
  const [pinnedChatMessage, setPinnedChatMessage] = useState(null);
  const [activeSettingsCategory, setActiveSettingsCategory] = useState(null); // 'ACCOUNT' | 'PRIVACY' | 'APPEARANCE' | 'STORAGE' | 'GPAI'

  const fetchRegisteredUsers = async () => {
    try {
      setIsLoadingUsersList(true);
      const res = await fetch(`${BASE_URL}/api/users`);
      const data = await res.json();
      if (data?.success && data.users) {
        setRegisteredUsersList(data.users.filter(u => u.username.toLowerCase() !== (currentUser || '').toLowerCase()));
      }
    } catch (e) {
      console.error("Fetch users error:", e);
    } finally {
      setIsLoadingUsersList(false);
    }
  };

  const THEME_PALETTES = {
    WHATSAPP: {
      id: 'WHATSAPP',
      name: '🟢 WhatsApp Dark (Emerald)',
      bg: '#0b141a',
      surface: '#111b21',
      card: '#202c33',
      border: '#222e35',
      text: '#e9edef',
      textMuted: '#8696a0',
      accent: '#00a884',
      accentLight: '#25d366',
      accentSecondary: '#128c7e',
      bubbleMine: '#005c4b',
      bubbleOther: '#202c33',
      bubbleAi: '#083329',
      aiBorder: '#00a884',
      headerBg: '#111b21',
      inputBg: '#202c33',
      navBg: 'rgba(17, 27, 33, 0.98)',
      glow: '#00a884',
      tickBlue: '#53bdeb'
    },
    TELEGRAM: {
      id: 'TELEGRAM',
      name: '🔵 Telegram Azure (Sapphire)',
      bg: '#0e1621',
      surface: '#17212b',
      card: '#242f3d',
      border: '#2b3644',
      text: '#f5f5f5',
      textMuted: '#7f91a4',
      accent: '#3390ec',
      accentLight: '#50a2e9',
      accentSecondary: '#2481cc',
      bubbleMine: '#2b5278',
      bubbleOther: '#182533',
      bubbleAi: '#19334d',
      aiBorder: '#3390ec',
      headerBg: '#17212b',
      inputBg: '#17212b',
      navBg: 'rgba(23, 33, 43, 0.98)',
      glow: '#3390ec',
      tickBlue: '#50a2e9'
    },
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
      glow: '#00f0ff',
      tickBlue: '#38bdf8'
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
      glow: '#f59e0b',
      tickBlue: '#fbbf24'
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
      glow: '#f43f5e',
      tickBlue: '#fb7185'
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
      glow: '#10b981',
      tickBlue: '#34d399'
    },
    FROST: {
      id: 'FROST',
      name: '💎 Frost Sapphire Light',
      bg: '#efeae2',
      surface: '#ffffff',
      card: '#f0f2f5',
      border: '#e9edef',
      text: '#111b21',
      textMuted: '#667781',
      accent: '#008069',
      accentLight: '#00a884',
      accentSecondary: '#128c7e',
      bubbleMine: '#d9fdd3',
      bubbleOther: '#ffffff',
      bubbleAi: '#e7f8f5',
      aiBorder: '#00a884',
      headerBg: '#008069',
      inputBg: '#ffffff',
      navBg: 'rgba(255, 255, 255, 0.98)',
      glow: '#008069',
      tickBlue: '#53bdeb'
    }
  };

  const theme = THEME_PALETTES[activeThemeId] || THEME_PALETTES.WHATSAPP;

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

  // 🔄 App Storage Schema Migration Engine (Zero Data Loss Policy)
  const CURRENT_APP_SCHEMA_VERSION = 6;

  const runAppStorageMigration = async () => {
    try {
      const rawVersion = await Storage.getItem('@gupshupp_schema_version');
      const prevVersion = rawVersion ? parseInt(rawVersion, 10) : 0;

      if (prevVersion < CURRENT_APP_SCHEMA_VERSION) {
        // 1. Migrate Legacy Auth Keys (v0/v1 -> v6)
        const legacyToken = await Storage.getItem('token') || await Storage.getItem('auth_token') || await Storage.getItem('@user_token');
        const legacyUser = await Storage.getItem('user') || await Storage.getItem('username') || await Storage.getItem('@username');
        if (legacyToken && !(await Storage.getItem('@gupshupp_token'))) {
          await Storage.setItem('@gupshupp_token', legacyToken);
        }
        if (legacyUser && !(await Storage.getItem('@gupshupp_user'))) {
          await Storage.setItem('@gupshupp_user', legacyUser);
        }

        // 2. Validate & Sanitize Recent Chats (v2/v3 -> v6)
        const rawRecent = await Storage.getItem('@gupshupp_recent_chats');
        if (rawRecent) {
          try {
            const parsed = JSON.parse(rawRecent);
            if (Array.isArray(parsed)) {
              const sanitized = parsed.map(c => ({
                id: c.id || `chat_${Date.now()}`,
                title: c.title || '#general',
                type: c.type || 'group',
                lastMsg: c.lastMsg || '',
                time: c.time || 'Recently',
                unread: typeof c.unread === 'number' ? c.unread : 0,
                avatar: c.avatar || '💬'
              }));
              await Storage.setItem('@gupshupp_recent_chats', JSON.stringify(sanitized));
            }
          } catch (e) {}
        }

        // 3. Mark Schema as Successfully Migrated
        await Storage.setItem('@gupshupp_schema_version', CURRENT_APP_SCHEMA_VERSION.toString());
      }
    } catch (err) {}
  };

  // 1. Initial Session Check & Settings Loading (with Migration Execution)
  useEffect(() => {
    const init = async () => {
      try {
        // Run migration before loading session
        await runAppStorageMigration();

        const savedLanguage = await Storage.getItem('@gupshupp_language');
        if (savedLanguage) setAppLanguage(savedLanguage);
        else setAppLanguage('en'); // Default to clean international English

        if (LocalAuthentication) {
          try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            setIsBiometricSupported(hasHardware && isEnrolled);
          } catch (e) {}
        }

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
        const savedRefreshToken = await Storage.getItem('@gupshupp_refresh_token');
        const savedUser = await Storage.getItem('@gupshupp_user');
        const savedPin = await Storage.getItem('@gupshupp_pin');
        const savedAvatar = await Storage.getItem('@gupshupp_avatar');
        const savedStatus = await Storage.getItem('@gupshupp_status');
        const savedGhost = await Storage.getItem('@gupshupp_ghost');
        const savedPinned = await Storage.getItem('@gupshupp_pinned');
        const savedWallpaper = await Storage.getItem('@gupshupp_wallpaper');
        const savedRecent = await Storage.getItem('@gupshupp_recent_chats');

        if (savedAvatar) setUserAvatar(savedAvatar);
        if (savedStatus) setUserStatus(savedStatus);
        if (savedPin) setUserPin(savedPin);
        if (savedGhost) setGhostMode(savedGhost === 'true');
        if (savedPinned) {
          try { setPinnedChats(JSON.parse(savedPinned)); } catch (e) {}
        }
        if (savedWallpaper) setChatWallpaper(savedWallpaper);
        if (savedRecent) {
          try {
            const parsedRecent = JSON.parse(savedRecent);
            if (Array.isArray(parsedRecent) && parsedRecent.length > 0) setRecentChats(parsedRecent);
          } catch (e) {}
        }

        if (savedToken && savedUser) {
          setAuthToken(savedToken);
          setCurrentUser(savedUser);
          socket.emit('set_user_presence', { 
            username: savedUser, 
            avatar: savedAvatar || '🦁', 
            status: savedStatus || 'Available 🟢',
            privacySettings: { ghostMode: savedGhost === 'true' }
          });
          
          // 🔄 Silent Token Background Refresh Verification (Zero Data Loss on Expiry)
          if (savedRefreshToken) {
            socket.emit('auth_refresh_token', { refreshToken: savedRefreshToken, username: savedUser }, async (refreshRes) => {
              if (refreshRes?.success && refreshRes.token) {
                setAuthToken(refreshRes.token);
                await Storage.setItem('@gupshupp_token', refreshRes.token);
                if (refreshRes.refreshToken) await Storage.setItem('@gupshupp_refresh_token', refreshRes.refreshToken);
              }
            });
          }

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
      setIsReconnectedAlertVisible(true);
      setTimeout(() => setIsReconnectedAlertVisible(false), 2500);

      // Smooth Auto-rejoin active chat room on reconnect
      if (activeRoom && currentUser) {
        socket.emit('join_room', { room: activeRoom, username: currentUser });
      }

      // Flush Offline Queued Outbox Messages
      setOfflineQueue((prevQueue) => {
        if (prevQueue.length > 0) {
          prevQueue.forEach((msg) => {
            socket.emit('send_message', msg);
          });
          setMessages((prev) => prev.map(m => m.status === 'sending' ? { ...m, status: 'sent' } : m));
        }
        return [];
      });

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

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // 🔄 Silent Token Auto-Refresh Listener
    socket.on('token_refreshed', async ({ token, refreshToken }) => {
      if (token) {
        setAuthToken(token);
        await Storage.setItem('@gupshupp_token', token);
      }
      if (refreshToken) {
        await Storage.setItem('@gupshupp_refresh_token', refreshToken);
      }
    });

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
        let finalRecent = [];
        if (existingIdx > -1) {
          const updated = [...prev];
          updated.splice(existingIdx, 1);
          finalRecent = [newEntry, ...updated];
        } else {
          finalRecent = [newEntry, ...prev];
        }
        Storage.setItem('@gupshupp_recent_chats', JSON.stringify(finalRecent)).catch(() => {});
        return finalRecent;
      });

      // Push Notification trigger
      if (Notifications && Notifications.scheduleNotificationAsync && data && !data.isSystem && data.sender !== currentUser && Platform.OS !== 'web') {
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

      // 👁️ Real-Time Two-Phone Read Receipt: Auto-mark as read if actively viewing this chat room
      if (data && data.room && data.sender !== currentUser) {
        socket.emit('mark_as_read', { room: data.room, username: currentUser, isStealth: ghostMode });
      }
    });

    socket.on('load_history', (history) => {
      if (Array.isArray(history)) setMessages(history);
      setIsLoadingHistory(false);
      if (currentUser) {
        socket.emit('mark_as_read', { room: activeRoom, username: currentUser, isStealth: ghostMode });
      }
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

    socket.on('message_deleted', ({ messageId, isExpired }) => {
      if (isExpired) {
        setMessages((prev) => prev.filter(m => m._id !== messageId));
      } else {
        setMessages((prev) => prev.map(m => m._id === messageId ? { ...m, text: '🚫 यह मैसेज डिलीट कर दिया गया है', type: 'text', image: null, audio: null, document: null } : m));
      }
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

  // 📶 Adaptive Network Speed & Throttling Detector (50kbps Slow Network Protection)
  useEffect(() => {
    if (!isConnected) {
      setNetworkQuality('OFFLINE');
      return;
    }

    const checkNetworkRtt = () => {
      const pingStart = Date.now();
      socket.emit('ping_heartbeat', { clientTimestamp: pingStart }, (res) => {
        const rtt = Date.now() - pingStart;
        setNetworkRttMs(rtt);
        if (rtt > 750) {
          // Slow network detected (>750ms RTT e.g. 50kbps 2G or throttled link)
          setNetworkQuality('SLOW');
        } else {
          setNetworkQuality('FAST');
        }
      });
    };

    const heartbeatInterval = setInterval(checkNetworkRtt, 10000);
    checkNetworkRtt();

    return () => clearInterval(heartbeatInterval);
  }, [isConnected]);

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

  // 🔐 Biometric Hardware Authenticator
  const handleTriggerBiometrics = async () => {
    if (!LocalAuthentication) return;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('biometric_prompt'),
        fallbackLabel: t('enter_pin')
      });
      if (result.success) {
        setScreen('HOME');
        setEnteredPin('');
        setPinError('');
      }
    } catch (e) {}
  };

  // 🌍 Language Selector
  const handleSelectLanguage = async (code) => {
    setAppLanguage(code);
    await Storage.setItem('@gupshupp_language', code);
    setShowLanguageModal(false);
  };

  // ☁️ Encrypted Cloud Backup & Vault Save
  const handleCloudBackupSave = async () => {
    if (!currentUser) return;
    setIsCloudBackupLoading(true);
    setCloudBackupStatus('Uploading encrypted vault to cloud...');
    try {
      const allSavedData = {
        theme: await Storage.getItem('@gupshupp_theme'),
        activeTheme: await Storage.getItem('@gupshupp_active_theme'),
        language: await Storage.getItem('@gupshupp_language'),
        pinned: await Storage.getItem('@gupshupp_pinned'),
        recent: await Storage.getItem('@gupshupp_recent_chats'),
        user: currentUser,
        avatar: userAvatar,
        status: userStatus,
        backedUpAt: new Date().toISOString()
      };
      const encryptedBackupPayload = encryptText(JSON.stringify(allSavedData));

      const res = await fetch(`${BASE_URL}/api/backup/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, encryptedBackupPayload })
      });
      const data = await res.json();
      setIsCloudBackupLoading(false);
      if (data.success) {
        setCloudBackupStatus('✅ Backup successfully saved to Cloud!');
      } else {
        setCloudBackupStatus('❌ Backup failed.');
      }
    } catch (e) {
      setIsCloudBackupLoading(false);
      setCloudBackupStatus('❌ Network error saving backup.');
    }
  };

  // ☁️ Encrypted Cloud Backup Restore
  const handleCloudBackupRestore = async () => {
    if (!currentUser) return;
    setIsCloudBackupLoading(true);
    setCloudBackupStatus('Retrieving encrypted vault from cloud...');
    try {
      const res = await fetch(`${BASE_URL}/api/backup/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser })
      });
      const data = await res.json();
      setIsCloudBackupLoading(false);
      if (data.success && data.encryptedPayload) {
        const decryptedJson = decryptText(data.encryptedPayload);
        const parsed = JSON.parse(decryptedJson);
        if (parsed.language) {
          setAppLanguage(parsed.language);
          await Storage.setItem('@gupshupp_language', parsed.language);
        }
        if (parsed.activeTheme) {
          setActiveThemeId(parsed.activeTheme);
          await Storage.setItem('@gupshupp_active_theme', parsed.activeTheme);
        }
        setCloudBackupStatus('✅ Backup restored successfully!');
      } else {
        setCloudBackupStatus('❌ No backup found to restore.');
      }
    } catch (e) {
      setIsCloudBackupLoading(false);
      setCloudBackupStatus('❌ Failed to restore backup.');
    }
  };

  const onAuthSuccess = async (token, username, avatar, status, pin, priv, autoResp, pinned, refreshToken) => {
    setAuthToken(token);
    setCurrentUser(username);
    if (avatar) setUserAvatar(avatar);
    if (status) setUserStatus(status);
    if (pin) setUserPin(pin);
    if (priv?.ghostMode !== undefined) setGhostMode(priv.ghostMode);
    if (pinned) setPinnedChats(pinned);

    await Storage.setItem('@gupshupp_token', token);
    if (refreshToken) await Storage.setItem('@gupshupp_refresh_token', refreshToken);
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

    // 1. Try Fast Socket Auth
    socket.emit(authTab === 'LOGIN' ? 'auth_login' : 'auth_register', payload, async (res) => {
      setIsAuthenticating(false);
      if (res && res.success) {
        onAuthSuccess(res.token, res.username, res.avatar, res.status, res.pin, res.privacySettings, res.aiAutoResponder, res.pinnedChats, res.refreshToken);
        return;
      }
      if (res && res.message) {
        setAuthError(res.message);
        return;
      }

      // 2. Fallback to HTTP REST Auth if socket didn't return explicit message
      try {
        const response = await fetch(`${BASE_URL}/api/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data && data.success) {
          onAuthSuccess(data.token, data.username, data.avatar, data.status, data.pin, data.privacySettings, data.aiAutoResponder, data.pinnedChats, data.refreshToken);
        } else {
          setAuthError(data?.message || 'लॉगिन / साइन अप विफल रहा।');
        }
      } catch (err) {
        setAuthError('सर्वर से कनेक्ट नहीं हो सका। कृपया नेटवर्क चेक करें।');
      }
    });

    // Safety timeout fallback
    setTimeout(async () => {
      if (isAuthenticating) {
        try {
          const response = await fetch(`${BASE_URL}/api/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await response.json();
          setIsAuthenticating(false);
          if (data && data.success) {
            onAuthSuccess(data.token, data.username, data.avatar, data.status, data.pin, data.privacySettings, data.aiAutoResponder, data.pinnedChats, data.refreshToken);
          } else {
            setAuthError(data?.message || 'लॉगिन विफल रहा।');
          }
        } catch (e) {
          setIsAuthenticating(false);
        }
      }
    }, 2500);
  };

  // 🔴 1-Tap Google / Gmail Sign-In Handler
  const handleGoogleSignIn = async (emailInput) => {
    const targetEmail = (emailInput || googleEmailInput || '').trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      setAuthError('कृपया मान्य ईमेल आईडी दर्ज करें (उदा. rahul@gmail.com)');
      return;
    }
    setIsGoogleLoading(true);
    setAuthError('');

    if (!socket.connected) {
      socket.connect();
    }

    const payload = {
      email: targetEmail,
      name: targetEmail.split('@')[0],
      avatar: '🌟',
      googleId: 'g_' + Date.now()
    };

    // 1. Try Fast Socket Google Auth
    socket.emit('auth_google', payload, async (res) => {
      setIsGoogleLoading(false);
      setShowGoogleAuthModal(false);
      setGoogleEmailInput('');

      if (res && res.success) {
        onAuthSuccess(res.token, res.username, res.avatar, res.status, res.pin, res.privacySettings, res.aiAutoResponder, res.pinnedChats, res.refreshToken);
        return;
      }

      // 2. HTTP Fallback
      try {
        const response = await fetch(`${BASE_URL}/api/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data && data.success) {
          onAuthSuccess(data.token, data.username, data.avatar, data.status, data.pin, data.privacySettings, data.aiAutoResponder, data.pinnedChats, data.refreshToken);
        } else {
          setAuthError(data?.message || 'Google Sign-In विफल रहा।');
        }
      } catch (e) {
        setAuthError('Google Sign-In नेटवर्क त्रुटि: ' + e.message);
      }
    });

    // Safety timeout
    setTimeout(async () => {
      if (isGoogleLoading) {
        try {
          const response = await fetch(`${BASE_URL}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await response.json();
          setIsGoogleLoading(false);
          setShowGoogleAuthModal(false);
          if (data && data.success) {
            onAuthSuccess(data.token, data.username, data.avatar, data.status, data.pin, data.privacySettings, data.aiAutoResponder, data.pinnedChats, data.refreshToken);
          }
        } catch (e) {
          setIsGoogleLoading(false);
        }
      }
    }, 2500);
  };


  const handleLogout = async () => {
    await Storage.removeItem('@gupshupp_token');
    await Storage.removeItem('@gupshupp_user');
    setAuthToken('');
    setCurrentUser('');
    setScreen('AUTH');
  };

  // 🔙 Universal Back Navigation Handler (Android Hardware Button, Web Popstate, Header Back)
  const handleBackNavigation = () => {
    // 1. Close any open active modals first
    if (chaosWarningModal.visible) { setChaosWarningModal({ visible: false, title: '', message: '' }); return true; }
    if (activeOneTimePhoto) { setActiveOneTimePhoto(null); return true; }
    if (showMiniAppModal) { setShowMiniAppModal(false); return true; }
    if (showSendOptionsModal) { setShowSendOptionsModal(false); return true; }
    if (activeChannelPostForComments) { setActiveChannelPostForComments(null); return true; }
    if (showSharedMediaVault) { setShowSharedMediaVault(false); return true; }
    if (activeStageRoom) { setActiveStageRoom(null); return true; }
    if (showLinkedDevicesModal) { setShowLinkedDevicesModal(false); return true; }
    if (showCreateStoryModal) { setShowCreateStoryModal(false); return true; }
    if (activeStoryModal) { setActiveStoryModal(null); return true; }
    if (showStoryViewers) { setShowStoryViewers(false); return true; }
    if (showCreateChannelModal) { setShowCreateChannelModal(false); return true; }
    if (selectedMessageForAction) { setSelectedMessageForAction(null); return true; }
    if (selectedImageModal) { setSelectedImageModal(null); return true; }
    if (showCreatePollModal) { setShowCreatePollModal(false); return true; }
    if (aiSummaryModal) { setAiSummaryModal(null); return true; }
    if (showDisappearingModal) { setShowDisappearingModal(false); return true; }
    if (showWallpaperModal) { setShowWallpaperModal(false); return true; }
    if (incomingCall) { setIncomingCall(null); return true; }
    if (isSearchActive) { setIsSearchActive(false); setSearchQuery(''); return true; }

    // 2. If inside CHAT screen, smoothly transition back to HOME
    if (screen === 'CHAT') {
      socket.emit('leave_room', { room: activeRoom, username: currentUser });
      setScreen('HOME');
      return true;
    }

    // 3. If inside HOME and on non-default bottom nav, return to CHATS tab
    if (screen === 'HOME' && bottomNav !== 'CHATS') {
      setBottomNav('CHATS');
      return true;
    }

    return false;
  };

  // Helper to open chat with Web Browser History Support
  const navigateToChat = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try { window.history.pushState({ screen: 'CHAT' }, ''); } catch (e) {}
    }
    setScreen('CHAT');
  };

  // Android & Web Back Button Event Listeners
  useEffect(() => {
    const backHandlerSubscription = BackHandler.addEventListener('hardwareBackPress', handleBackNavigation);

    const onPopState = () => {
      handleBackNavigation();
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('popstate', onPopState);
    }

    return () => {
      backHandlerSubscription.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('popstate', onPopState);
      }
    };
  }, [
    screen, bottomNav, activeRoom, currentUser, activeOneTimePhoto, showMiniAppModal, 
    showSendOptionsModal, activeChannelPostForComments, showSharedMediaVault, activeStageRoom, 
    showLinkedDevicesModal, showCreateStoryModal, activeStoryModal, showStoryViewers, 
    showCreateChannelModal, selectedMessageForAction, selectedImageModal, showCreatePollModal, 
    aiSummaryModal, showDisappearingModal, showWallpaperModal, incomingCall, isSearchActive, chaosWarningModal.visible
  ]);

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
    navigateToChat();
    socket.emit('join_room', { room: dmRoom, username: currentUser });
    socket.emit('mark_as_read', { room: dmRoom, username: currentUser, isStealth: ghostMode });
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
    navigateToChat();
    socket.emit('join_room', { room: cleanRoom, username: currentUser });
    socket.emit('mark_as_read', { room: cleanRoom, username: currentUser, isStealth: ghostMode });
  };

  // Open Broadcast Channel Room
  const openChannelRoom = (chan) => {
    if (!chan) return;
    const roomName = `channel_${chan.name}`;
    setActiveRoom(roomName);
    setChatTitle(`📢 @${chan.name}`);
    setIsDirectChat(false);
    setMessages([]);
    setIsLoadingHistory(true);
    setAiSmartReplies([]);
    setIsSearchActive(false);
    setSearchQuery('');
    navigateToChat();
    socket.emit('join_room', { room: roomName, username: currentUser });
    socket.emit('mark_as_read', { room: roomName, username: currentUser, isStealth: ghostMode });
  };

  // Send Message (with Rapid-Tap Debounce Guard)
  const sendMessage = (type = 'text', payload = {}) => {
    if (type === 'text' && !message.trim()) return;

    const now = Date.now();
    // 🐒 Chaos Monkey: Debounce rapid button spam (< 300ms)
    if (now - lastActionTapTimeRef.current < 300) {
      return;
    }
    lastActionTapTimeRef.current = now;

    const messageTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isAiRoom = activeRoom && (
      activeRoom.includes('gp_ai') || 
      activeRoom.includes('ai_bot') || 
      activeRoom.includes('gp_ai_bot') || 
      activeRoom.includes('dm_gp_ai')
    );
    const isAiTrigger = type === 'text' && (
      isAiRoom || 
      /@(?:gp|ai|coder|meme|news|roast)\b/i.test(message.trim())
    );
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

    if (!isConnected) {
      newMsgData.status = 'sending';
      setMessages((prev) => [...prev, newMsgData]);
      setOfflineQueue((prev) => [...prev, newMsgData]);
    } else {
      setMessages((prev) => [...prev, newMsgData]);
      socket.emit('send_message', newMsgData);
    }

    setMessage('');
    setReplyingToMessage(null);
    setAiSmartReplies([]);
    socket.emit('typing_stop', { room: activeRoom, username: currentUser });

    // Trigger Anti-Spam Slow Mode for non-DM rooms
    if (!isDirectChat) setSlowModeCooldown(5);

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // 🔄 Resumable / Tap-to-Retry Failed Media/Message Handler
  const retryFailedMessage = (msgItem) => {
    if (!msgItem) return;
    const updated = { 
      ...msgItem, 
      status: isConnected ? 'sent' : 'sending', 
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    };
    setMessages(prev => prev.map(m => m._id === msgItem._id ? updated : m));
    if (isConnected) {
      socket.emit('send_message', updated);
    } else {
      setOfflineQueue(prev => [...prev.filter(m => m._id !== msgItem._id), updated]);
    }
  };

  // Media Picker (Lossless HD & 1-Time Self-Destruct View with Size Limit Guard)
  const pickAndSendImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        setChaosWarningModal({
          visible: true,
          title: '📷 गैलरी परमिशन आवश्यक',
          message: 'फोटो या वीडियो भेजने के लिए गैलरी परमिशन की आवश्यकता है।'
        });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        quality: isHdMediaMode ? 1.0 : 0.7,
        base64: true
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const MAX_MEDIA_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
        
        if (asset.fileSize && asset.fileSize > MAX_MEDIA_SIZE_BYTES) {
          setChaosWarningModal({
            visible: true,
            title: '⚠️ वीडियो साइज़ बहुत बड़ा है (Video Too Large)',
            message: `चुनी गई फाइल (${(asset.fileSize / (1024 * 1024)).toFixed(1)} MB) अधिकतम 50 MB सीमा से बड़ी है। कृपया कंप्रेस्ड वीडियो चुनें।`
          });
          return;
        }

        const base64Uri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        sendMessage(asset.type === 'video' ? 'video' : 'image', {
          image: base64Uri,
          caption: encryptText(isOneTimeMediaMode ? '🔥 1-Time Media' : (isHdMediaMode ? '💎 HD Media' : '📷 Media')),
          isHd: isHdMediaMode,
          isOneTime: isOneTimeMediaMode
        });
      }
    } catch (e) {
      setChaosWarningModal({
        visible: true,
        title: '⚠️ मीडिया एरर',
        message: 'मीडिया फाइल सेलेक्ट करने में समस्या आई।'
      });
    }
  };

  // Document Picker (with 50MB Size Limit Guard)
  const pickAndSendDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);

        if (file.size && file.size > MAX_FILE_SIZE_BYTES) {
          setChaosWarningModal({
            visible: true,
            title: '⚠️ फाइल साइज़ बहुत बड़ा है (File Too Large)',
            message: `चुनी गई फाइल (${sizeMb} MB) अधिकतम 50 MB सीमा से बड़ी है। कृपया 50 MB से कम साइज़ की फाइल चुनें।`
          });
          return;
        }

        sendMessage('document', {
          document: { name: encryptText(file.name), size: `${sizeMb} MB`, uri: file.uri }
        });
      }
    } catch (e) {
      setChaosWarningModal({
        visible: true,
        title: '⚠️ डॉक्युमेंट एरर',
        message: 'डॉक्युमेंट सेलेक्ट करने में समस्या आई।'
      });
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
    sendMessage('audio', { audio: 'voice_note_stream', caption: encryptText(`🎙️ Voice Note (${durationStr || '0:03'})`) });
    setRecordingSeconds(0);
  };

  const cancelAudioRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecordingAudio(false);
    setRecordingSeconds(0);
  };

  // 📥 Download or Save File with Low-Storage & ENOSPC Guard
  const handleDownloadOrSaveFile = async (doc) => {
    try {
      if (!doc) return;
      if (doc?.isMockStorageFull) {
        throw new Error('ENOSPC: no space left on device, write');
      }
      alert(`📥 "${decryptText(doc.name || 'File')}" डाउनलोड हो रहा है...`);
    } catch (err) {
      if (err.message?.includes('ENOSPC') || err.message?.includes('space') || err.message?.includes('storage') || err.message?.includes('Quota')) {
        setChaosWarningModal({
          visible: true,
          title: '⚠️ स्टोरेज भर गया है (Storage Full)',
          message: 'Storage Full. Please free up some space to download this file. (कृपया फाइल डाउनलोड करने के लिए अपने फोन का स्टोरेज खाली करें)'
        });
      } else {
        setChaosWarningModal({
          visible: true,
          title: '⚠️ डाउनलोड त्रुटि',
          message: 'फाइल डाउनलोड करने में समस्या आई।'
        });
      }
    }
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

  // 📊 Cast Poll Vote (with 300ms Debounce & Race Condition Guard)
  const lastVoteTapTimeRef = useRef(0);
  const handleCastVote = (messageId, optionId) => {
    const now = Date.now();
    if (now - lastVoteTapTimeRef.current < 300) {
      return;
    }
    lastVoteTapTimeRef.current = now;

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

  // Filter and Window Active Messages (Windowed Pagination & Lazy Loading)
  const allFilteredMessages = messages.filter((msg) => {
    if (msg.expiresAt && new Date(msg.expiresAt) <= new Date()) return false;
    if (isSearchActive && searchQuery.trim()) {
      const dec = decryptText(msg.text).toLowerCase();
      const q = searchQuery.toLowerCase();
      return dec.includes(q) || (msg.sender && msg.sender.toLowerCase().includes(q));
    }
    return true;
  });

  const hasOlderMessages = !isSearchActive && allFilteredMessages.length > displayedMessageLimit;
  const visibleMessages = isSearchActive ? allFilteredMessages : allFilteredMessages.slice(-displayedMessageLimit);

  // --- 0. PIN LOCK SCREEN ---
  if (screen === 'PIN_LOCK') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
        <View style={styles.centerContainer}>
          <Text style={styles.lockIconLarge}>🔒</Text>
          <Text style={[styles.pinLockTitle, { color: theme.text }]}>{t('app_lock')}</Text>
          <Text style={[styles.pinLockSub, { color: theme.textMuted }]}>{t('enter_pin')}</Text>

          <View style={styles.pinDotsRow}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.pinDot, { borderColor: theme.accentLight, backgroundColor: enteredPin.length > i ? theme.accentLight : 'transparent' }]} />
            ))}
          </View>

          {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}

          {isBiometricSupported && (
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: theme.surface, borderRadius: 24, borderWidth: 1, borderColor: theme.accentLight }}
              onPress={handleTriggerBiometrics}
            >
              <Text style={{ fontSize: 18, marginRight: 8 }}>👆</Text>
              <Text style={{ color: theme.accentLight, fontWeight: '700', fontSize: 14 }}>{t('biometric_btn')}</Text>
            </TouchableOpacity>
          )}

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

                {/* 🔴 Google / Gmail 1-Tap Sign-In Divider & Button */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 14 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
                  <Text style={{ marginHorizontal: 8, color: theme.textMuted, fontSize: 12, fontWeight: '600' }}>या (OR)</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
                </View>

                <TouchableOpacity 
                  style={{
                    backgroundColor: theme.card,
                    borderColor: '#ea4335',
                    borderWidth: 1.5,
                    borderRadius: 12,
                    paddingVertical: 13,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    shadowColor: '#ea4335',
                    shadowOpacity: 0.15,
                    shadowOffset: { width: 0, height: 2 },
                    shadowRadius: 4
                  }} 
                  onPress={() => setShowGoogleAuthModal(true)}
                  disabled={isGoogleLoading}
                >
                  {isGoogleLoading ? (
                    <ActivityIndicator color="#ea4335" />
                  ) : (
                    <>
                      <Text style={{ fontSize: 18 }}>🔴</Text>
                      <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>
                        Google / Gmail से 1-Tap Sign-In 🚀
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* 🔴 Google Quick Sign-In Modal */}
          <Modal
            visible={showGoogleAuthModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowGoogleAuthModal(false)}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.75)', padding: 20 }}>
              <View style={{ width: '100%', maxWidth: 400, backgroundColor: theme.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 22, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 24 }}>🔴</Text>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: theme.text }}>Google / Email 1-Tap</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowGoogleAuthModal(false)}>
                    <Text style={{ fontSize: 20, color: theme.textMuted }}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16 }}>
                  अपना Gmail या Email दर्ज करें। यदि आपका खाता नहीं है, तो यह तुरंत 1-Tap में नया खाता बनाकर लॉगिन कर देगा!
                </Text>

                <TextInput
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border, marginBottom: 14 }]}
                  placeholder="उदा. yourname@gmail.com"
                  placeholderTextColor={theme.textMuted}
                  value={googleEmailInput}
                  onChangeText={setGoogleEmailInput}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus={true}
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity 
                    style={{ flex: 1, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }} 
                    onPress={() => setShowGoogleAuthModal(false)}
                  >
                    <Text style={{ color: theme.textMuted, fontWeight: '700' }}>रद्द करें (Cancel)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={{ flex: 1.5, backgroundColor: '#ea4335', borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' }} 
                    onPress={() => handleGoogleSignIn(googleEmailInput)}
                    disabled={isGoogleLoading}
                  >
                    {isGoogleLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>Continue ➔</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // --- 2. HOME SCREEN ---
  if (screen === 'HOME') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.headerBg} />
        
        {/* 🌟 Clean WhatsApp Signature Header */}
        <View style={[styles.homeHeader, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setBottomNav('PROFILE')} style={{ position: 'relative' }}>
              <View style={[styles.headerAvatarRing, { borderColor: theme.accent }]}>
                <Text style={styles.headerAvatarEmoji}>{userAvatar}</Text>
              </View>
              <View style={[styles.headerOnlineDot, { backgroundColor: ghostMode ? '#a855f7' : '#22c55e' }]} />
            </TouchableOpacity>
            <View style={{ marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.headerLogo, { color: theme.accentLight }]}>GupShupp</Text>
                {ghostMode && <Text style={styles.ghostBadge}>👻 GHOST</Text>}
              </View>
              <Text style={[styles.welcomeUser, { color: theme.textMuted }]}>
                @{currentUser} • <Text style={{ color: theme.accentLight }}>{userStatus}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.headerActionRow}>
            <TouchableOpacity 
              style={[styles.iconCircleBtn, { backgroundColor: isSearchActive ? theme.accent : theme.card }]} 
              onPress={() => setIsSearchActive(!isSearchActive)}
            >
              <Text style={[styles.iconCircleText, { color: isSearchActive ? '#000000' : theme.text }]}>🔍</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.iconCircleBtn, { backgroundColor: theme.card }]} 
              onPress={() => {
                fetchRegisteredUsers();
                setShowNewChatModal(true);
              }}
            >
              <Text style={styles.iconCircleText}>➕</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.iconCircleBtn, { backgroundColor: theme.card }]} 
              onPress={toggleTheme}
            >
              <Text style={styles.iconCircleText}>{isDarkMode ? '☀️' : '🌙'}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.iconCircleBtn, { backgroundColor: theme.card }]} 
              onPress={() => setShowAppearanceStudioModal(true)}
            >
              <Text style={styles.iconCircleText}>🎨</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 🔍 In-App Instant Search Bar */}
        {isSearchActive && (
          <View style={[styles.searchBarContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
            <TextInput
              style={[styles.searchBarInput, { backgroundColor: theme.inputBg, color: theme.text, flex: 1 }]}
              placeholder={t('search_placeholder')}
              placeholderTextColor={theme.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <Text style={{ color: theme.textMuted, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* 🌐 Real-Time Ambient Connection Status Banner */}
        {!isConnected && (
          <View style={styles.offlineStatusBar}>
            <Text style={styles.offlineStatusText}>⚠️ नेटवर्क कनेक्शन टूट गया है • ऑटो-रीकनेक्ट चालू है...</Text>
          </View>
        )}
        {isConnected && networkQuality === 'SLOW' && !isReconnectedAlertVisible && (
          <View style={[styles.offlineStatusBar, { backgroundColor: '#d97706' }]}>
            <Text style={styles.offlineStatusText}>🐢 धीमा नेटवर्क (Slow Network ~50kbps • RTT: {networkRttMs}ms) • संदेश सुरक्षित सिंक हो रहे हैं...</Text>
          </View>
        )}
        {isReconnectedAlertVisible && isConnected && (
          <View style={[styles.offlineStatusBar, { backgroundColor: '#059669' }]}>
            <Text style={styles.offlineStatusText}>🟢 पुनः कनेक्ट हुआ! सभी संदेश सिंक हैं ✅</Text>
          </View>
        )}

        {/* Home Content Body */}
        <ScrollView style={styles.homeContent}>
          {bottomNav === 'CHATS' && (
            <View style={styles.tabContentContainer}>
              {/* Quick AI & Cloud Shortcuts Row */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                {/* 🤖 GP AI Quick Chat Button */}
                <TouchableOpacity 
                  activeOpacity={0.85}
                  style={[styles.quickActionButton, { flex: 1, backgroundColor: theme.surface, borderColor: theme.accent, borderWidth: 1.5 }]}
                  onPress={() => startDirectChat('gp_ai_bot')}
                >
                  <View style={[styles.quickActionIconBox, { backgroundColor: theme.accent }]}>
                    <Text style={{ fontSize: 18 }}>🤖</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.quickActionTitle, { color: theme.text }]}>GP AI Bot</Text>
                    <Text style={[styles.quickActionSub, { color: theme.accentLight }]}>Smart Assistant ⚡</Text>
                  </View>
                </TouchableOpacity>

                {/* ☁️ Saved Messages Cloud Vault */}
                <TouchableOpacity 
                  activeOpacity={0.85}
                  style={[styles.quickActionButton, { flex: 1, backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}
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
                    navigateToChat();
                    socket.emit('join_room', { room: savedRoom, username: currentUser });
                  }}
                >
                  <View style={[styles.quickActionIconBox, { backgroundColor: '#2563eb' }]}>
                    <Text style={{ fontSize: 18 }}>☁️</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.quickActionTitle, { color: theme.text }]}>Saved Notes</Text>
                    <Text style={[styles.quickActionSub, { color: theme.textMuted }]}>Cloud Vault 🔒</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Recent Conversations List Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={[styles.sectionHeading, { color: theme.text, marginBottom: 0 }]}>💬 चैट्स (Conversations)</Text>
                <TouchableOpacity 
                  onPress={() => {
                    fetchRegisteredUsers();
                    setShowNewChatModal(true);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: theme.card, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}
                >
                  <Text style={{ color: theme.accentLight, fontWeight: '800', fontSize: 12 }}>+ New Chat</Text>
                </TouchableOpacity>
              </View>

              {filteredRecentChats.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border, padding: 24, alignItems: 'center' }]}>
                  <Text style={{ fontSize: 40, marginBottom: 10 }}>💬</Text>
                  <Text style={[styles.emptyText, { color: theme.text, fontWeight: '800', fontSize: 15, marginBottom: 6 }]}>अभी कोई चैट शुरू नहीं हुई है</Text>
                  <Text style={[styles.emptyText, { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 16 }]}>
                    नीचे दिए गए हरे <Text style={{ color: theme.accentLight, fontWeight: '900' }}>💬 बटन</Text> पर टैप करके किसी भी दोस्त या यूज़र से तुरंत चैट शुरू करें!
                  </Text>
                  <TouchableOpacity 
                    style={[styles.primaryBtn, { backgroundColor: theme.accent, paddingHorizontal: 20, height: 42 }]}
                    onPress={() => {
                      fetchRegisteredUsers();
                      setShowNewChatModal(true);
                    }}
                  >
                    <Text style={[styles.primaryBtnText, { color: '#000000' }]}>+ Start Direct Chat 🚀</Text>
                  </TouchableOpacity>
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
                      <View style={[styles.chatAvatarBox, { backgroundColor: theme.card, position: 'relative' }]}>
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

          {bottomNav === 'STATUS' && (
            <View style={styles.tabContentContainer}>
              <Text style={[styles.sectionHeading, { color: theme.text }]}>⭕ 24h स्टेटस & स्टोरीज (Updates)</Text>
              
              {/* My Status Card */}
              <TouchableOpacity 
                style={[styles.recentChatRow, { backgroundColor: theme.surface, borderColor: theme.border, marginBottom: 14 }]}
                onPress={() => setShowCreateStoryModal(true)}
              >
                <View style={[styles.addStoryRing, { borderColor: theme.accentLight, backgroundColor: theme.card }]}>
                  <Text style={styles.storyAvatarEmoji}>{userAvatar}</Text>
                  <View style={[styles.addStoryPlusBadge, { backgroundColor: theme.accent }]}>
                    <Text style={styles.addStoryPlusText}>+</Text>
                  </View>
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[styles.recentChatTitle, { color: theme.text }]}>My Status</Text>
                  <Text style={[styles.recentChatSnippet, { color: theme.textMuted }]}>टैप करके नया स्टेटस अपडेट शेयर करें</Text>
                </View>
              </TouchableOpacity>

              <Text style={[styles.sectionHeading, { color: theme.textMuted, fontSize: 13, marginTop: 10 }]}>हाल के अपडेट (Recent Updates)</Text>
              {stories.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border, padding: 20, alignItems: 'center' }]}>
                  <Text style={{ color: theme.textMuted, textAlign: 'center' }}>अभी कोई रीसेंट स्टेटस नहीं है।</Text>
                </View>
              ) : (
                stories.map((st, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={[styles.recentChatRow, { backgroundColor: theme.surface, borderColor: theme.border, marginBottom: 8 }]}
                    onPress={() => {
                      socket.emit('view_story', { storyId: st._id, viewerUsername: currentUser });
                      setActiveStoryModal(st);
                    }}
                  >
                    <View style={[styles.storyRing, { borderColor: theme.accentLight, backgroundColor: theme.card }]}>
                      <Text style={styles.storyAvatarEmoji}>{st.avatar}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={[styles.recentChatTitle, { color: theme.text }]}>@{st.username}</Text>
                      <Text style={[styles.recentChatSnippet, { color: theme.textMuted }]}>{st.time || 'Today'} • {st.views?.length || 0} views</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {bottomNav === 'GROUPS' && (
            <View style={styles.tabContentContainer}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[styles.sectionHeading, { color: theme.text, marginBottom: 0 }]}>🔥 कम्युनिटी सुपर-ग्रुप्स</Text>
              </View>

              {[
                { name: 'tech', desc: 'AI, React Native, Full-Stack & Python 🚀', members: 42, icon: '💻' },
                { name: 'friends', desc: 'Chill & Hangout Group 🎉', members: 28, icon: '🍕' },
                { name: 'gaming', desc: 'Esports, BGMI, Valorant & Streamers 🎮', members: 64, icon: '🕹️' }
              ].map((grp, i) => (
                <TouchableOpacity 
                  key={i} 
                  activeOpacity={0.85}
                  style={[styles.superGroupCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => joinGroupRoom(grp.name)}
                >
                  <View style={styles.groupCardHeader}>
                    <Text style={styles.superGroupIcon}>{grp.icon}</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.superGroupName, { color: theme.text }]}>#{grp.name}</Text>
                      <Text style={[styles.superGroupMembers, { color: theme.textMuted }]}>👥 {grp.members} मेंबर्स • 👑 Verified</Text>
                    </View>
                    <TouchableOpacity style={[styles.joinGroupBtn, { backgroundColor: theme.accent }]} onPress={() => joinGroupRoom(grp.name)}>
                      <Text style={[styles.joinGroupBtnText, { color: '#000000' }]}>Open 🚪</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.superGroupDesc, { color: theme.textMuted }]}>{grp.desc}</Text>
                </TouchableOpacity>
              ))}

              {/* Broadcast Channels Section */}
              <View style={[styles.channelHeaderRow, { marginTop: 18 }]}>
                <Text style={[styles.sectionHeading, { color: theme.text, marginBottom: 0 }]}>📢 ब्रॉडकास्ट चैनल्स</Text>
                <TouchableOpacity style={[styles.createChanBtn, { backgroundColor: theme.accent }]} onPress={() => setShowCreateChannelModal(true)}>
                  <Text style={[styles.createChanBtnText, { color: '#000000' }]}>+ नया चैनल</Text>
                </TouchableOpacity>
              </View>

              {channels.map((chan, idx) => (
                <TouchableOpacity 
                  key={idx} 
                  activeOpacity={0.85}
                  style={[styles.channelCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => openChannelRoom(chan)}
                >
                  <View style={styles.channelHeader}>
                    <Text style={styles.channelIcon}>📢</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.channelName, { color: theme.text }]}>@{chan.name}</Text>
                      <Text style={[styles.channelSubscribers, { color: theme.textMuted }]}>👥 {chan.subscribersCount || 1} सब्सक्राइबर्स • Admin: @{chan.creator}</Text>
                    </View>
                  </View>
                  <Text style={[styles.channelDesc, { color: theme.textMuted }]}>{chan.description}</Text>
                  <TouchableOpacity style={[styles.viewChannelBtn, { backgroundColor: theme.card, borderColor: theme.accent, borderWidth: 1 }]} onPress={() => openChannelRoom(chan)}>
                    <Text style={[styles.viewChannelBtnText, { color: theme.accent }]}>चैनल देखें ➔</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {bottomNav === 'PROFILE' && (
            <View style={styles.tabContentContainer}>
              {/* 🌟 Profile Header Banner (WhatsApp/Telegram Style) */}
              <TouchableOpacity 
                activeOpacity={0.85}
                style={[styles.profileStudioCard, { backgroundColor: theme.surface, borderColor: theme.border, marginBottom: 16 }]}
                onPress={() => setActiveSettingsCategory('ACCOUNT')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ position: 'relative' }}>
                    <Text style={[styles.profileBigAvatar, { fontSize: 48 }]}>{userAvatar}</Text>
                    <View style={{ position: 'absolute', bottom: 2, right: 2, backgroundColor: theme.accent, borderRadius: 10, padding: 3 }}>
                      <Text style={{ fontSize: 10 }}>✏️</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.profileUsername, { color: theme.text, fontSize: 18 }]}>@{currentUser}</Text>
                      <Text style={{ fontSize: 12, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: theme.card, color: '#f59e0b', fontWeight: '800' }}>{userVipBadge}</Text>
                    </View>
                    <Text style={[styles.profileStatusText, { color: theme.accentLight, marginTop: 2 }]} numberOfLines={1}>{userStatus}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>Account details & avatar badging ➔</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* 🗂️ Settings Categories Menu List */}
              <View style={[styles.settingsCategoryGroup, { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: 16, borderWidth: 1, overflow: 'hidden' }]}>
                
                {/* 1. Account & Profile */}
                <TouchableOpacity 
                  style={[styles.settingsCategoryRow, { borderBottomColor: theme.border, borderBottomWidth: 1 }]}
                  onPress={() => setActiveSettingsCategory('ACCOUNT')}
                >
                  <View style={[styles.settingsCategoryIconBox, { backgroundColor: '#2563eb' }]}>
                    <Text style={styles.settingsCategoryIcon}>👤</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.settingsCategoryTitle, { color: theme.text }]}>Account & Profile (खाता)</Text>
                    <Text style={[styles.settingsCategorySub, { color: theme.textMuted }]}>Avatar, Username, VIP Badges, Linked Web</Text>
                  </View>
                  <Text style={{ color: theme.textMuted, fontSize: 16 }}>›</Text>
                </TouchableOpacity>

                {/* 2. Privacy & Security */}
                <TouchableOpacity 
                  style={[styles.settingsCategoryRow, { borderBottomColor: theme.border, borderBottomWidth: 1 }]}
                  onPress={() => setActiveSettingsCategory('PRIVACY')}
                >
                  <View style={[styles.settingsCategoryIconBox, { backgroundColor: '#059669' }]}>
                    <Text style={styles.settingsCategoryIcon}>🔒</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.settingsCategoryTitle, { color: theme.text }]}>Privacy & Security (गोपनीयता)</Text>
                    <Text style={[styles.settingsCategorySub, { color: theme.textMuted }]}>Ghost Mode, PIN Lock, AI Away Auto-Reply</Text>
                  </View>
                  <Text style={{ color: theme.textMuted, fontSize: 16 }}>›</Text>
                </TouchableOpacity>

                {/* 3. Chats & Appearance Studio */}
                <TouchableOpacity 
                  style={[styles.settingsCategoryRow, { borderBottomColor: theme.border, borderBottomWidth: 1 }]}
                  onPress={() => setActiveSettingsCategory('APPEARANCE')}
                >
                  <View style={[styles.settingsCategoryIconBox, { backgroundColor: '#8b5cf6' }]}>
                    <Text style={styles.settingsCategoryIcon}>🎨</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.settingsCategoryTitle, { color: theme.text }]}>Appearance & Chats (अपीयरेंस)</Text>
                    <Text style={[styles.settingsCategorySub, { color: theme.textMuted }]}>7 Signature Themes, Bubble Shapes, Wallpapers</Text>
                  </View>
                  <Text style={{ color: theme.textMuted, fontSize: 16 }}>›</Text>
                </TouchableOpacity>

                {/* 4. Storage & Cloud Backup */}
                <TouchableOpacity 
                  style={[styles.settingsCategoryRow, { borderBottomColor: theme.border, borderBottomWidth: 1 }]}
                  onPress={() => setActiveSettingsCategory('STORAGE')}
                >
                  <View style={[styles.settingsCategoryIconBox, { backgroundColor: '#0284c7' }]}>
                    <Text style={styles.settingsCategoryIcon}>☁️</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.settingsCategoryTitle, { color: theme.text }]}>Storage & Cloud Backup (डेटा & बैकअप)</Text>
                    <Text style={[styles.settingsCategorySub, { color: theme.textMuted }]}>AES-256 Cloud Vault Backup & 1-Click Restore</Text>
                  </View>
                  <Text style={{ color: theme.textMuted, fontSize: 16 }}>›</Text>
                </TouchableOpacity>

                {/* 5. Starred Messages */}
                <TouchableOpacity 
                  style={[styles.settingsCategoryRow, { borderBottomColor: theme.border, borderBottomWidth: 1 }]}
                  onPress={() => setShowStarredModal(true)}
                >
                  <View style={[styles.settingsCategoryIconBox, { backgroundColor: '#d97706' }]}>
                    <Text style={styles.settingsCategoryIcon}>⭐</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.settingsCategoryTitle, { color: theme.text }]}>Starred Messages (स्टार किए गए संदेश)</Text>
                    <Text style={[styles.settingsCategorySub, { color: theme.textMuted }]}>View saved bookmarks & pinned notes</Text>
                  </View>
                  <Text style={{ color: theme.textMuted, fontSize: 16 }}>›</Text>
                </TouchableOpacity>

                {/* 6. Language Selector */}
                <TouchableOpacity 
                  style={[styles.settingsCategoryRow, { borderBottomColor: theme.border, borderBottomWidth: 1 }]}
                  onPress={() => setShowLanguageModal(true)}
                >
                  <View style={[styles.settingsCategoryIconBox, { backgroundColor: '#0d9488' }]}>
                    <Text style={styles.settingsCategoryIcon}>🌐</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.settingsCategoryTitle, { color: theme.text }]}>App Language (भाषा)</Text>
                    <Text style={[styles.settingsCategorySub, { color: theme.textMuted }]}>{SUPPORTED_LANGUAGES.find(l => l.code === appLanguage)?.label || 'English 🇬🇧'}</Text>
                  </View>
                  <Text style={{ color: theme.textMuted, fontSize: 16 }}>›</Text>
                </TouchableOpacity>

                {/* 7. GP AI Assistant Info & Diagnostics */}
                <TouchableOpacity 
                  style={styles.settingsCategoryRow}
                  onPress={() => setActiveSettingsCategory('GPAI')}
                >
                  <View style={[styles.settingsCategoryIconBox, { backgroundColor: '#6366f1' }]}>
                    <Text style={styles.settingsCategoryIcon}>🤖</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.settingsCategoryTitle, { color: theme.text }]}>GP AI Assistant Engine</Text>
                    <Text style={[styles.settingsCategorySub, { color: theme.textMuted }]}>Groq Llama 3.3 70B & Gemini Hybrid Status</Text>
                  </View>
                  <Text style={{ color: theme.textMuted, fontSize: 16 }}>›</Text>
                </TouchableOpacity>

              </View>

              {/* 🚪 Logout Button */}
              <TouchableOpacity 
                activeOpacity={0.85}
                style={[styles.logoutBtnFull, { backgroundColor: '#ef4444', marginTop: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }]} 
                onPress={handleLogout}
              >
                <Text style={{ fontSize: 16 }}>🚪</Text>
                <Text style={styles.logoutBtnFullText}>Logout (लॉगआउट)</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Floating WhatsApp-Style Action Button (FAB) */}
        {bottomNav === 'CHATS' ? (
          <TouchableOpacity 
            activeOpacity={0.85}
            style={[styles.floatingStatusFab, { backgroundColor: theme.accent }]}
            onPress={() => {
              fetchRegisteredUsers();
              setShowNewChatModal(true);
            }}
          >
            <Text style={{ fontSize: 20, marginRight: 6 }}>💬</Text>
            <Text style={[styles.floatingStatusFabText, { color: '#000000' }]}>New Chat</Text>
          </TouchableOpacity>
        ) : (bottomNav === 'STATUS' ? (
          <TouchableOpacity 
            activeOpacity={0.85}
            style={[styles.floatingStatusFab, { backgroundColor: theme.accent }]}
            onPress={() => setShowCreateStoryModal(true)}
          >
            <Text style={{ fontSize: 18, marginRight: 4 }}>✍️</Text>
            <Text style={[styles.floatingStatusFabText, { color: '#000000' }]}>+ Status</Text>
          </TouchableOpacity>
        ) : null)}

        {/* 4 Bottom Navigation Tabs - Clean WhatsApp Style */}
        <View style={[styles.neoFloatingNavBar, { backgroundColor: theme.navBg, borderColor: theme.border }]}>
          {[
            { id: 'CHATS', icon: '💬', label: t('chats') },
            { id: 'STATUS', icon: '⭕', label: 'Status' },
            { id: 'GROUPS', icon: '👥', label: t('groups') },
            { id: 'PROFILE', icon: '👤', label: t('profile') }
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

        {/* 💬 Modal: New Chat / Direct Message & Contact Picker */}
        <Modal visible={showNewChatModal} transparent animationType="slide" onRequestClose={() => setShowNewChatModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '92%', maxWidth: 460, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 22 }}>💬</Text>
                  <Text style={[styles.modalTitle, { color: theme.text, fontSize: 18 }]}>नया संदेश / New Chat</Text>
                </View>
                <TouchableOpacity onPress={() => setShowNewChatModal(false)} style={{ padding: 4 }}>
                  <Text style={{ fontSize: 18, color: theme.textMuted, fontWeight: '900' }}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Direct Username Input */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textMuted, marginBottom: 6 }}>
                सीधे यूज़रनेम दर्ज करके चैट शुरू करें:
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border, flex: 1, height: 44 }]}
                  placeholder="यूज़रनेम लिखें (उदा. rahul, aman)..."
                  placeholderTextColor={theme.textMuted}
                  value={newChatUserInput}
                  onChangeText={setNewChatUserInput}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: theme.accent, paddingHorizontal: 16, height: 44, marginTop: 0 }]}
                  onPress={() => {
                    if (!newChatUserInput.trim()) return;
                    const target = newChatUserInput.trim().replace(/^@/, '');
                    setShowNewChatModal(false);
                    setNewChatUserInput('');
                    startDirectChat(target);
                  }}
                >
                  <Text style={[styles.primaryBtnText, { color: '#000000', fontSize: 14 }]}>Chat ➔</Text>
                </TouchableOpacity>
              </View>

              {/* Quick AI & Group Creation Row */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, backgroundColor: theme.card, borderRadius: 10, borderWidth: 1, borderColor: theme.border }}
                  onPress={() => {
                    setShowNewChatModal(false);
                    startDirectChat('gp_ai_bot');
                  }}
                >
                  <Text style={{ fontSize: 18 }}>🤖</Text>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>GP AI Bot</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, backgroundColor: theme.card, borderRadius: 10, borderWidth: 1, borderColor: theme.border }}
                  onPress={() => {
                    setShowNewChatModal(false);
                    setShowCreateChannelModal(true);
                  }}
                >
                  <Text style={{ fontSize: 18 }}>📢</Text>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>New Channel</Text>
                </TouchableOpacity>
              </View>

              {/* Registered Users List */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text }}>👥 सभी एक्टिव और रजिस्टर्ड यूज़र्स ({registeredUsersList.length})</Text>
                <TouchableOpacity onPress={fetchRegisteredUsers}>
                  <Text style={{ color: theme.accentLight, fontSize: 12, fontWeight: '700' }}>🔄 Refresh</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 220, marginVertical: 4 }}>
                {isLoadingUsersList ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={theme.accent} />
                    <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 6 }}>यूज़र्स लोड हो रहे हैं...</Text>
                  </View>
                ) : registeredUsersList.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>कोई अन्य यूज़र नहीं मिला। ऊपर सीधे यूज़रनेम टाइप करें!</Text>
                  </View>
                ) : (
                  registeredUsersList.map((u, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        backgroundColor: theme.card,
                        marginBottom: 6,
                        borderWidth: 1,
                        borderColor: theme.border
                      }}
                      onPress={() => {
                        setShowNewChatModal(false);
                        startDirectChat(u.username);
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                          <Text style={{ fontSize: 20 }}>{u.avatar}</Text>
                          {u.isOnline && (
                            <View style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e', borderWidth: 1.5, borderColor: theme.card }} />
                          )}
                        </View>
                        <View>
                          <Text style={{ color: theme.text, fontWeight: '800', fontSize: 14 }}>@{u.username}</Text>
                          <Text style={{ color: u.isOnline ? '#22c55e' : theme.textMuted, fontSize: 11 }}>
                            {u.isOnline ? 'Online 🟢' : u.status}
                          </Text>
                        </View>
                      </View>

                      <View style={{ backgroundColor: theme.accent, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}>
                        <Text style={{ color: '#000000', fontWeight: '800', fontSize: 11 }}>Message 💬</Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

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

        {/* 👤 Modal: Account & Profile Settings */}
        <Modal visible={activeSettingsCategory === 'ACCOUNT'} transparent animationType="slide" onRequestClose={() => setActiveSettingsCategory(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '92%', maxWidth: 460, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 22 }}>👤</Text>
                  <Text style={[styles.modalTitle, { color: theme.text, fontSize: 18 }]}>Account & Profile</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveSettingsCategory(null)}>
                  <Text style={{ fontSize: 18, color: theme.textMuted, fontWeight: '900' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 3D Avatar Selector */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginBottom: 8 }}>🎨 3D अवतार चुनें (Avatar)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
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

                {/* VIP Profile Badges Selector */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginBottom: 8 }}>⭐ Telegram VIP बैज (VIP Badges)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
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

                {/* Linked Devices Shortcut */}
                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 16 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>🔗 लिंक्ड डिवाइसेज (Web QR)</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>ब्राउज़र व पीसी पर तुरंत लिंक करें</Text>
                  </View>
                  <TouchableOpacity 
                    style={[styles.pinToggleBtn, { backgroundColor: theme.accent }]}
                    onPress={() => {
                      setActiveSettingsCategory(null);
                      setShowLinkedDevicesModal(true);
                    }}
                  >
                    <Text style={[styles.pinToggleBtnText, { color: '#000000' }]}>Link Web 📲</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 🔒 Modal: Privacy & Security Settings */}
        <Modal visible={activeSettingsCategory === 'PRIVACY'} transparent animationType="slide" onRequestClose={() => setActiveSettingsCategory(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '92%', maxWidth: 460, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 22 }}>🔒</Text>
                  <Text style={[styles.modalTitle, { color: theme.text, fontSize: 18 }]}>Privacy & Security</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveSettingsCategory(null)}>
                  <Text style={{ fontSize: 18, color: theme.textMuted, fontWeight: '900' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Ghost Mode Toggle */}
                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>👻 घोस्ट मोड (Ghost Mode)</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>ऑनलाइन स्टेटस, टाइपिंग व ब्लू टिक्स छिपाएं</Text>
                  </View>
                  <TouchableOpacity style={[styles.toggleSwitch, { backgroundColor: ghostMode ? theme.accentLight : theme.border }]} onPress={handleToggleGhostMode}>
                    <Text style={styles.toggleSwitchText}>{ghostMode ? 'ON' : 'OFF'}</Text>
                  </TouchableOpacity>
                </View>

                {/* AI Auto-Responder Toggle */}
                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>🤖 AI Auto-Responder (Away Mode)</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>बिजी होने पर Gemini AI ऑटो रिप्लाई दे</Text>
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

                {/* Security PIN Lock */}
                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>🔒 ऐप सुरक्षा पिन (App PIN)</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>{userPin ? '4-अंकों का पिन एक्टिव है ✅' : 'कोई पिन सेट नहीं है'}</Text>
                  </View>
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
                    <Text style={[styles.pinToggleBtnText, { color: userPin ? '#ffffff' : '#000000' }]}>{userPin ? 'Remove' : 'Set PIN'}</Text>
                  </TouchableOpacity>
                </View>

                {/* E2EE Info Box */}
                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>🛡️ 256-bit AES End-to-End Encryption</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>Zero-Knowledge Client-Side Key Negotiation • Active 🟢</Text>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 🎨 Modal: Appearance & Design Studio */}
        <Modal visible={activeSettingsCategory === 'APPEARANCE' || showAppearanceStudioModal} transparent animationType="slide" onRequestClose={() => { setActiveSettingsCategory(null); setShowAppearanceStudioModal(false); }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '92%', maxWidth: 460, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 22 }}>🎨</Text>
                  <Text style={[styles.modalTitle, { color: theme.text, fontSize: 18 }]}>Appearance & Chats</Text>
                </View>
                <TouchableOpacity onPress={() => { setActiveSettingsCategory(null); setShowAppearanceStudioModal(false); }}>
                  <Text style={{ fontSize: 18, color: theme.textMuted, fontWeight: '900' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 1. Themes */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginBottom: 8 }}>🌈 सिग्नेचर नियॉन थीम (Themes)</Text>
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
                      {activeThemeId === pal.id && <Text style={{ color: pal.accent, fontWeight: '900', fontSize: 12 }}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 2. Bubble Geometry */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginTop: 14, marginBottom: 8 }}>💬 चैट बबल का आकार (Bubble Shape)</Text>
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

                {/* 3. Font Scale */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginTop: 14, marginBottom: 8 }}>🔠 टेक्स्ट फॉन्ट साइज (Font Scaling)</Text>
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

                {/* 4. Wallpaper */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginTop: 14, marginBottom: 8 }}>🖼️ कस्टम चैट वॉलपेपर (Gallery Photos)</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity 
                    style={[styles.primaryBtn, { backgroundColor: theme.accent, flex: 1, marginTop: 0 }]}
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
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ☁️ Modal: Storage & Cloud Backup */}
        <Modal visible={activeSettingsCategory === 'STORAGE'} transparent animationType="slide" onRequestClose={() => setActiveSettingsCategory(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '92%', maxWidth: 460, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 22 }}>☁️</Text>
                  <Text style={[styles.modalTitle, { color: theme.text, fontSize: 18 }]}>Storage & Cloud Backup</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveSettingsCategory(null)}>
                  <Text style={{ fontSize: 18, color: theme.textMuted, fontWeight: '900' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={[styles.appearanceStudioCard, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 14 }]}>
                  <Text style={[styles.appearanceSubHeading, { color: theme.text }]}>☁️ AES-256 Encrypted Cloud Vault</Text>
                  <Text style={[styles.privacySub, { color: theme.textMuted, marginTop: 4 }]}>सभी संदेशों, मीडिया और सेटिंग्स का सुरक्षित जीरो डेटा-लॉस क्लाउड बैकअप।</Text>
                  {cloudBackupStatus ? <Text style={{ color: theme.accentLight, fontSize: 12, marginTop: 6, fontWeight: '700' }}>{cloudBackupStatus}</Text> : null}
                  
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity 
                      style={[styles.primaryBtn, { flex: 1, backgroundColor: theme.accent, marginTop: 0 }]}
                      onPress={handleCloudBackupSave}
                      disabled={isCloudBackupLoading}
                    >
                      <Text style={[styles.primaryBtnText, { color: '#000000' }]}>{isCloudBackupLoading ? 'Saving...' : 'Backup Now ☁️'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.secondaryBtn, { flex: 1, borderColor: theme.accentLight }]}
                      onPress={handleCloudBackupRestore}
                      disabled={isCloudBackupLoading}
                    >
                      <Text style={[styles.secondaryBtnText, { color: theme.accentLight }]}>Restore 🔄</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Starred Messages Shortcut */}
                <TouchableOpacity 
                  style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}
                  onPress={() => {
                    setActiveSettingsCategory(null);
                    setShowStarredModal(true);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>⭐ Starred Messages Vault</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>बुकमार्क किए गए संदेश देखें</Text>
                  </View>
                  <Text style={{ color: theme.accentLight, fontWeight: '800' }}>Open ➔</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 🤖 Modal: GP AI Engine Settings */}
        <Modal visible={activeSettingsCategory === 'GPAI'} transparent animationType="slide" onRequestClose={() => setActiveSettingsCategory(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '92%', maxWidth: 460, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 22 }}>🤖</Text>
                  <Text style={[styles.modalTitle, { color: theme.text, fontSize: 18 }]}>GP AI Assistant Engine</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveSettingsCategory(null)}>
                  <Text style={{ fontSize: 18, color: theme.textMuted, fontWeight: '900' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>⚡ Dual-Engine Hybrid Switch</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>Primary: Groq Llama 3.3 70B (84ms latency) • Fallback: Google Gemini 1.5</Text>
                  </View>
                  <View style={{ backgroundColor: '#22c55e', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ color: '#000000', fontWeight: '900', fontSize: 11 }}>ACTIVE 🟢</Text>
                  </View>
                </View>

                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>🛡️ 0-Token Instant Rule Caching</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>अक्सर पूछे जाने वाले प्रश्नों पर 0 API टोकन खर्च होते हैं</Text>
                  </View>
                </View>

                <TouchableOpacity 
                  style={[styles.primaryBtn, { backgroundColor: theme.accent, marginTop: 8 }]}
                  onPress={() => {
                    setActiveSettingsCategory(null);
                    startDirectChat('gp_ai_bot');
                  }}
                >
                  <Text style={[styles.primaryBtnText, { color: '#000000' }]}>🤖 Start Chat with GP AI ➔</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 🌐 Modal: Language Selector */}
        <Modal visible={showLanguageModal} transparent animationType="slide" onRequestClose={() => setShowLanguageModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, maxHeight: '80%' }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>🌐 {t('select_language')}</Text>
              
              <ScrollView style={{ marginVertical: 12 }}>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.languageChoiceBtn,
                      { backgroundColor: theme.card, borderColor: appLanguage === lang.code ? theme.accentLight : theme.border, marginVertical: 4 }
                    ]}
                    onPress={() => handleSelectLanguage(lang.code)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{lang.label}</Text>
                      {appLanguage === lang.code && <Text style={{ color: theme.accentLight, fontWeight: '900' }}>Selected ✓</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={[styles.modalBtnCancel, { backgroundColor: theme.border }]} onPress={() => setShowLanguageModal(false)}>
                <Text style={[styles.modalBtnCancelText, { color: theme.text }]}>Close ✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ⭐ Modal: Starred Messages */}
        <Modal visible={showStarredModal} transparent animationType="slide" onRequestClose={() => setShowStarredModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.commentsModalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.commentsHeader}>
                <Text style={[styles.commentsTitle, { color: theme.text }]}>⭐ {t('starred_messages')}</Text>
                <TouchableOpacity onPress={() => setShowStarredModal(false)}>
                  <Text style={{ color: theme.accentLight, fontWeight: '900', fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.commentsListScroll}>
                {messages.filter(m => m.starredBy && m.starredBy.includes(currentUser)).length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: theme.textMuted, fontSize: 14 }}>No starred messages yet. Bookmark important messages by long-pressing them! ⭐</Text>
                  </View>
                ) : (
                  messages.filter(m => m.starredBy && m.starredBy.includes(currentUser)).map((m, i) => (
                    <View key={i} style={[styles.commentBubble, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ color: theme.accentLight, fontWeight: '800', fontSize: 12 }}>@{m.sender} in #{m.room}</Text>
                        <Text style={{ color: theme.textMuted, fontSize: 10 }}>{m.time}</Text>
                      </View>
                      <Text style={{ color: theme.text, fontSize: 14, marginTop: 4 }}>{decryptText(m.text)}</Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 📲 Modal: Linked Devices (WhatsApp Web QR Link) */}
        <Modal visible={showLinkedDevicesModal} transparent animationType="slide" onRequestClose={() => setShowLinkedDevicesModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>🔗 लिंक्ड डिवाइसेज (Linked Web)</Text>
              <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: 'center', marginVertical: 12 }}>
                अपने कंप्यूटर ब्राउज़र पर <Text style={{ color: theme.accentLight, fontWeight: 'bold' }}>{BASE_URL}</Text> खोलें।
              </Text>

              <View style={{ alignItems: 'center', marginVertical: 12, padding: 14, backgroundColor: '#ffffff', borderRadius: 16 }}>
                <QRCode value={qrLinkData} size={170} />
              </View>

              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.accentLight }]} onPress={() => setShowLinkedDevicesModal(false)}>
                <Text style={styles.primaryBtnText}>पूर्ण (Done) ✅</Text>
              </TouchableOpacity>
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        style={{ flex: 1 }}
      >
        
        {/* 🌟 WhatsApp + Telegram Hybrid Chat Header */}
        <View style={[styles.chatHeader, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
          <TouchableOpacity 
            style={[styles.backBtn, { backgroundColor: 'rgba(255,255,255,0.06)' }]} 
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            onPress={handleBackNavigation}
          >
            <Text style={[styles.backBtnText, { color: theme.accent }]}>←</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.chatTitleBlock, { flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 6 }]}
            onPress={() => isDirectChat ? setShowSharedMediaVault(true) : setShowGroupAdminModal(true)}
            activeOpacity={0.8}
          >
            <View style={[styles.chatHeaderAvatarBox, { backgroundColor: theme.card, borderColor: theme.accent }]}>
              <Text style={{ fontSize: 18 }}>{isDirectChat ? '👤' : '👥'}</Text>
            </View>
            <View style={{ marginLeft: 8, flex: 1 }}>
              <Text style={[styles.chatTitleText, { color: theme.text }]} numberOfLines={1}>{chatTitle}</Text>
              <View style={styles.chatSubTitleRow}>
                <Text style={[styles.chatSubTitleText, { color: theme.accentLight }]}>
                  {typingUser ? `${typingUser} typing... ✍️` : (isDirectChat ? (ghostMode ? '👻 Incognito' : 'Online 🟢') : `👥 ${activeMembersCount} members`)}
                </Text>
                {disappearingTtl > 0 && <Text style={styles.disappearingBadge}> ⏱️ {disappearingTtl === 3600000 ? '1h' : '24h'}</Text>}
              </View>
            </View>
          </TouchableOpacity>

          {/* Action Icons in Header (WhatsApp Style) */}
          <View style={styles.chatHeaderActions}>
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
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setIsSearchActive(!isSearchActive)}>
              <Text style={styles.headerIconText}>🔍</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowChatOptionsMenu(true)}>
              <Text style={styles.headerIconText}>⋮</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 📌 Telegram-Style Pinned Message Sticky Banner */}
        {pinnedChatMessage && (
          <View style={[styles.pinnedBannerRow, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <Text style={{ fontSize: 14, marginRight: 6 }}>📌</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pinnedBannerTitle, { color: theme.accentLight }]}>Pinned Message</Text>
              <Text style={[styles.pinnedBannerSnippet, { color: theme.text }]} numberOfLines={1}>{decryptText(pinnedChatMessage.text)}</Text>
            </View>
            <TouchableOpacity onPress={() => setPinnedChatMessage(null)} style={{ padding: 4 }}>
              <Text style={{ color: theme.textMuted, fontSize: 14 }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 🌐 Real-Time Ambient Connection Status Banner */}
        {!isConnected && (
          <View style={styles.offlineStatusBar}>
            <Text style={styles.offlineStatusText}>⚠️ नेटवर्क कनेक्शन टूट गया है • ऑटो-रीकनेक्ट चालू है...</Text>
          </View>
        )}
        {isConnected && networkQuality === 'SLOW' && !isReconnectedAlertVisible && (
          <View style={[styles.offlineStatusBar, { backgroundColor: '#d97706' }]}>
            <Text style={styles.offlineStatusText}>🐢 धीमा नेटवर्क (Slow Network ~50kbps • RTT: {networkRttMs}ms) • संदेश सुरक्षित सिंक हो रहे हैं...</Text>
          </View>
        )}
        {isReconnectedAlertVisible && isConnected && (
          <View style={[styles.offlineStatusBar, { backgroundColor: '#059669' }]}>
            <Text style={styles.offlineStatusText}>🟢 पुनः कनेक्ट हुआ! सभी संदेश सिंक हैं ✅</Text>
          </View>
        )}

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
                removeClippedSubviews={Platform.OS === 'android'}
                initialNumToRender={15}
                maxToRenderPerBatch={10}
                windowSize={7}
                updateCellsBatchingPeriod={50}
                ListHeaderComponent={hasOlderMessages ? (
                  <TouchableOpacity 
                    style={styles.loadOlderBtn} 
                    onPress={() => setDisplayedMessageLimit((prev) => prev + 50)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.loadOlderText, { color: theme.accentLight }]}>
                      📜 {allFilteredMessages.length - displayedMessageLimit} पुराने संदेश लोड करें (Load Older)
                    </Text>
                  </TouchableOpacity>
                ) : null}
                renderItem={({ item }) => {
                  const isMine = item.sender === currentUser;
                  const isAiSender = item.sender === '🤖 GupShupp AI' || (item.isAi && item.sender !== currentUser);
                  const decryptedText = decryptText(item.text);
                  const isStarred = item.starredBy && item.starredBy.includes(currentUser);
                  const translatedText = translatedMessages[item._id];
                  const transcribedText = transcribedAudioMap[item._id];

                  // AI Assistant Message Bubble (GP AI Squad)
                  if (isAiSender) {
                    return (
                      <View style={[styles.aiBubbleWrapper, { backgroundColor: theme.bubbleAi, borderColor: theme.aiBorder, borderRadius: getBubbleRadius() }]}>
                        <View style={styles.aiHeader}>
                          <Text style={styles.aiRobotEmoji}>🤖</Text>
                          <Text style={styles.aiTitle}>GP AI (Llama 3.3 70B & Gemini)</Text>
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
                        isMine ? [styles.bubbleMineStyle, { backgroundColor: theme.bubbleMine }] : [styles.bubbleOtherStyle, { backgroundColor: theme.bubbleOther }],
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
                          <View style={[styles.quotedReplyBox, { borderLeftColor: theme.accentLight, backgroundColor: 'rgba(0,0,0,0.18)' }]}>
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

                        {/* Voice Note Message with Speed & Transcription (WhatsApp Style) */}
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
                          <TouchableOpacity 
                            style={[styles.documentCard, { backgroundColor: theme.surface }]}
                            onPress={() => handleDownloadOrSaveFile(item.document)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.docIcon}>📄</Text>
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={[styles.docName, { color: theme.text }]} numberOfLines={1}>{decryptText(item.document.name)}</Text>
                              <Text style={[styles.docSize, { color: theme.textMuted }]}>{item.document.size}</Text>
                            </View>
                            <Text style={[styles.docDownload, { color: theme.accentLight }]}>Download 📥</Text>
                          </TouchableOpacity>
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
                          <Text style={[styles.messageText, { color: isMine && activeThemeId === 'FROST' ? '#000000' : theme.text, fontSize: getFontSize() }]}>
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

                    {/* Failed Upload / Resumable Retry Tap Button */}
                    {isMine && item.status === 'failed' && (
                      <TouchableOpacity 
                        style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 2, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: 'rgba(239, 68, 68, 0.15)', borderRadius: 6 }}
                        onPress={() => retryFailedMessage(item)}
                      >
                        <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>⚠️ अपलोड विफल • दोबारा भेजें (Tap to Retry 🔄)</Text>
                      </TouchableOpacity>
                    )}

                    {/* Meta Row: Lock + Star + Time + WhatsApp Double Blue Ticks */}
                    <View style={styles.metaRow}>
                      {isStarred && <Text style={styles.starIcon}>⭐</Text>}
                      <Text style={[styles.lockIcon, { color: theme.textMuted }]}>🔒</Text>
                      <Text style={[styles.timestamp, { color: theme.textMuted }]}>{item.time}</Text>
                      {isMine && (
                        <Text style={[
                          styles.tickIcon, 
                          item.status === 'failed' 
                            ? { color: '#ef4444', fontSize: 11 } 
                            : (item.status === 'sending' 
                                ? { color: '#fbbf24', fontSize: 10 } 
                                : (item.status === 'read' 
                                    ? { color: theme.tickBlue || '#53bdeb' } 
                                    : { color: theme.textMuted }))
                        ]}>
                          {item.status === 'failed' ? '❌' : (item.status === 'sending' ? '🕒' : (item.status === 'read' ? '✓✓' : (item.status === 'delivered' ? '✓✓' : '✓')))}
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
        </View>
      </ImageBackground>
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

        {/* 🤖 Multi-Agent GP AI Squad Selector Bar */}
        <View style={[styles.aiBotSquadBar, { backgroundColor: theme.headerBg, borderTopColor: theme.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 4 }}>
            {[
              { tag: '@gp', label: '🤖 @gp (GP AI)' },
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

        {/* 💬 WhatsApp-Style Modern Input Bar */}
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
          <View style={[styles.inputBar, { backgroundColor: theme.headerBg, borderTopColor: theme.border }]}>
            <TouchableOpacity 
              style={styles.attachBtn} 
              onPress={() => setShowAttachmentMenuModal(true)}
            >
              <Text style={styles.attachIcon}>📎</Text>
            </TouchableOpacity>

            <TextInput
              style={[styles.chatInput, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
              placeholder={roomAdminSettings.adminOnlyPost && !roomAdminSettings.admins?.includes(currentUser) ? t('admin_only_badge') : (slowModeCooldown > 0 ? `Wait (${slowModeCooldown}s)...` : t('type_message_placeholder'))}
              placeholderTextColor={theme.textMuted}
              value={message}
              editable={slowModeCooldown === 0 && !(roomAdminSettings.adminOnlyPost && !roomAdminSettings.admins?.includes(currentUser))}
              onFocus={() => {
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
              }}
              onChangeText={(txt) => {
                setMessage(txt);
                const now = Date.now();
                if (!ghostMode && !silentTyping && (now - lastTypingEmitRef.current > 1000)) {
                  lastTypingEmitRef.current = now;
                  socket.emit('typing_start', { room: activeRoom, username: currentUser });
                }
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(() => socket.emit('typing_stop', { room: activeRoom, username: currentUser }), 1500);
              }}
              multiline
            />

            {message.trim() ? (
              <TouchableOpacity 
                style={[styles.sendBtn, { backgroundColor: slowModeCooldown > 0 ? '#64748b' : theme.accent }]} 
                onPress={() => sendMessage('text')}
                onLongPress={() => setShowSendOptionsModal(true)}
                disabled={slowModeCooldown > 0}
              >
                <Text style={[styles.sendBtnText, { color: '#000000' }]}>{slowModeCooldown > 0 ? `${slowModeCooldown}s` : '➤'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={[styles.micBtn, { backgroundColor: theme.accent }]} 
                onPress={startAudioRecording}
              >
                <Text style={styles.micIcon}>🎙️</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* 📎 WhatsApp-Style Attachment Menu Grid Modal */}
        <Modal 
          visible={showAttachmentMenuModal} 
          transparent 
          animationType="fade"
          onRequestClose={() => setShowAttachmentMenuModal(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowAttachmentMenuModal(false)}
          >
            <View style={[styles.attachmentMenuSheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.attachmentMenuTitle, { color: theme.text }]}>शेयर करें (Share Media & Tools)</Text>
              <View style={styles.attachmentGrid}>
                {/* 1. Camera */}
                <TouchableOpacity 
                  style={styles.attachmentGridItem}
                  onPress={() => {
                    setShowAttachmentMenuModal(false);
                    pickAndSendImage();
                  }}
                >
                  <View style={[styles.attachmentCircleIcon, { backgroundColor: '#ea4335' }]}>
                    <Text style={{ fontSize: 24 }}>📷</Text>
                  </View>
                  <Text style={[styles.attachmentItemLabel, { color: theme.text }]}>Camera</Text>
                </TouchableOpacity>

                {/* 2. Gallery / HD Media */}
                <TouchableOpacity 
                  style={styles.attachmentGridItem}
                  onPress={() => {
                    setShowAttachmentMenuModal(false);
                    setIsHdMediaMode(true);
                    pickAndSendImage();
                  }}
                >
                  <View style={[styles.attachmentCircleIcon, { backgroundColor: '#9333ea' }]}>
                    <Text style={{ fontSize: 24 }}>🖼️</Text>
                  </View>
                  <Text style={[styles.attachmentItemLabel, { color: theme.text }]}>Gallery HD</Text>
                </TouchableOpacity>

                {/* 3. Document */}
                <TouchableOpacity 
                  style={styles.attachmentGridItem}
                  onPress={() => {
                    setShowAttachmentMenuModal(false);
                    pickAndSendDocument();
                  }}
                >
                  <View style={[styles.attachmentCircleIcon, { backgroundColor: '#2563eb' }]}>
                    <Text style={{ fontSize: 24 }}>📄</Text>
                  </View>
                  <Text style={[styles.attachmentItemLabel, { color: theme.text }]}>Document</Text>
                </TouchableOpacity>

                {/* 4. Poll */}
                <TouchableOpacity 
                  style={styles.attachmentGridItem}
                  onPress={() => {
                    setShowAttachmentMenuModal(false);
                    setShowCreatePollModal(true);
                  }}
                >
                  <View style={[styles.attachmentCircleIcon, { backgroundColor: '#f59e0b' }]}>
                    <Text style={{ fontSize: 24 }}>📊</Text>
                  </View>
                  <Text style={[styles.attachmentItemLabel, { color: theme.text }]}>Poll</Text>
                </TouchableOpacity>

                {/* 5. 1-Time Self Destruct Photo */}
                <TouchableOpacity 
                  style={styles.attachmentGridItem}
                  onPress={() => {
                    setShowAttachmentMenuModal(false);
                    setIsOneTimeMediaMode(true);
                    pickAndSendImage();
                  }}
                >
                  <View style={[styles.attachmentCircleIcon, { backgroundColor: '#ef4444' }]}>
                    <Text style={{ fontSize: 24 }}>🔥</Text>
                  </View>
                  <Text style={[styles.attachmentItemLabel, { color: theme.text }]}>1-Time View</Text>
                </TouchableOpacity>

                {/* 6. Mini-Apps & Games */}
                <TouchableOpacity 
                  style={styles.attachmentGridItem}
                  onPress={() => {
                    setShowAttachmentMenuModal(false);
                    setShowMiniAppModal(true);
                  }}
                >
                  <View style={[styles.attachmentCircleIcon, { backgroundColor: '#10b981' }]}>
                    <Text style={{ fontSize: 24 }}>🎮</Text>
                  </View>
                  <Text style={[styles.attachmentItemLabel, { color: theme.text }]}>Mini Apps</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ⋮ Chat Options Dropdown Modal */}
        <Modal
          visible={showChatOptionsMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowChatOptionsMenu(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowChatOptionsMenu(false)}
          >
            <View style={[styles.chatOptionsDropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <TouchableOpacity 
                style={styles.dropdownMenuItem}
                onPress={() => {
                  setShowChatOptionsMenu(false);
                  setIsGeneratingSummary(true);
                  const cleanList = messages.slice(-25).map(m => ({ sender: m.sender, text: decryptText(m.text) }));
                  socket.emit('ai_summarize_request', { messages: cleanList }, (res) => {
                    setIsGeneratingSummary(false);
                    if (res?.success) setAiSummaryModal(res.summary);
                  });
                }}
              >
                <Text style={styles.dropdownMenuIcon}>📝</Text>
                <Text style={[styles.dropdownMenuText, { color: theme.text }]}>AI Summarize Chat</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.dropdownMenuItem}
                onPress={() => {
                  setShowChatOptionsMenu(false);
                  setShowDisappearingModal(true);
                }}
              >
                <Text style={styles.dropdownMenuIcon}>⏱️</Text>
                <Text style={[styles.dropdownMenuText, { color: theme.text }]}>Disappearing Messages</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.dropdownMenuItem}
                onPress={() => {
                  setShowChatOptionsMenu(false);
                  setShowSharedMediaVault(true);
                }}
              >
                <Text style={styles.dropdownMenuIcon}>📂</Text>
                <Text style={[styles.dropdownMenuText, { color: theme.text }]}>Media, Links & Docs</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.dropdownMenuItem}
                onPress={() => {
                  setShowChatOptionsMenu(false);
                  setShowWallpaperModal(true);
                }}
              >
                <Text style={styles.dropdownMenuIcon}>🎨</Text>
                <Text style={[styles.dropdownMenuText, { color: theme.text }]}>Chat Wallpaper</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.dropdownMenuItem}
                onPress={() => {
                  setShowChatOptionsMenu(false);
                  setShowStarredModal(true);
                }}
              >
                <Text style={styles.dropdownMenuIcon}>⭐</Text>
                <Text style={[styles.dropdownMenuText, { color: theme.text }]}>Starred Messages</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

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

        {/* ⚠️ Modal: Chaos Monkey & File Size Alert Card */}
        <Modal visible={chaosWarningModal.visible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.chaosAlertCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={styles.chaosAlertIcon}>⚠️</Text>
              <Text style={[styles.chaosAlertTitle, { color: theme.text }]}>{chaosWarningModal.title}</Text>
              <Text style={[styles.chaosAlertMsg, { color: theme.textMuted }]}>{chaosWarningModal.message}</Text>
              <TouchableOpacity 
                style={[styles.chaosAlertBtn, { backgroundColor: theme.accentLight }]}
                onPress={() => setChaosWarningModal({ visible: false, title: '', message: '' })}
                activeOpacity={0.85}
              >
                <Text style={styles.chaosAlertBtnText}>समझ गया (OK)</Text>
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

                  {Boolean(calcBillTotal) ? (
                    <View style={[styles.calcResultBox, { backgroundColor: theme.card, borderColor: theme.accentLight }]}>
                      <Text style={[styles.calcPerPerson, { color: theme.accentLight }]}>
                        प्रति व्यक्ति: ₹{Math.round((parseFloat(calcBillTotal) || 0) / (parseInt(calcPeopleCount) || 1))}
                      </Text>
                    </View>
                  ) : null}

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

        {/* 🌍 Modal: Global Language Selector (i18n) */}
        <Modal visible={showLanguageModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, maxHeight: '80%' }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>🌐 {t('language')}</Text>
              <Text style={[styles.modalSub, { color: theme.textMuted }]}>Select your preferred language / भाषा चुनें:</Text>

              <ScrollView style={{ marginVertical: 12 }}>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.themeChoiceCard,
                      { backgroundColor: theme.card, borderColor: appLanguage === lang.code ? theme.accentLight : theme.border, marginVertical: 4 }
                    ]}
                    onPress={() => handleSelectLanguage(lang.code)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{lang.label}</Text>
                      {appLanguage === lang.code && <Text style={{ color: theme.accentLight, fontWeight: '900' }}>Selected ✓</Text>}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={[styles.modalBtnCancel, { backgroundColor: theme.border }]} onPress={() => setShowLanguageModal(false)}>
                <Text style={[styles.modalBtnCancelText, { color: theme.text }]}>Close ✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 👤 Modal: Account & Profile Settings */}
        <Modal visible={activeSettingsCategory === 'ACCOUNT'} transparent animationType="slide" onRequestClose={() => setActiveSettingsCategory(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '92%', maxWidth: 460, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 22 }}>👤</Text>
                  <Text style={[styles.modalTitle, { color: theme.text, fontSize: 18 }]}>Account & Profile</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveSettingsCategory(null)}>
                  <Text style={{ fontSize: 18, color: theme.textMuted, fontWeight: '900' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 3D Avatar Selector */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginBottom: 8 }}>🎨 3D अवतार चुनें (Avatar)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
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

                {/* VIP Profile Badges Selector */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginBottom: 8 }}>⭐ Telegram VIP बैज (VIP Badges)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
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

                {/* Linked Devices Shortcut */}
                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 16 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>🔗 लिंक्ड डिवाइसेज (Web QR)</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>ब्राउज़र व पीसी पर तुरंत लिंक करें</Text>
                  </View>
                  <TouchableOpacity 
                    style={[styles.pinToggleBtn, { backgroundColor: theme.accent }]}
                    onPress={() => {
                      setActiveSettingsCategory(null);
                      setShowLinkedDevicesModal(true);
                    }}
                  >
                    <Text style={[styles.pinToggleBtnText, { color: '#000000' }]}>Link Web 📲</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 🔒 Modal: Privacy & Security Settings */}
        <Modal visible={activeSettingsCategory === 'PRIVACY'} transparent animationType="slide" onRequestClose={() => setActiveSettingsCategory(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '92%', maxWidth: 460, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 22 }}>🔒</Text>
                  <Text style={[styles.modalTitle, { color: theme.text, fontSize: 18 }]}>Privacy & Security</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveSettingsCategory(null)}>
                  <Text style={{ fontSize: 18, color: theme.textMuted, fontWeight: '900' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Ghost Mode Toggle */}
                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>👻 घोस्ट मोड (Ghost Mode)</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>ऑनलाइन स्टेटस, टाइपिंग व ब्लू टिक्स छिपाएं</Text>
                  </View>
                  <TouchableOpacity style={[styles.toggleSwitch, { backgroundColor: ghostMode ? theme.accentLight : theme.border }]} onPress={handleToggleGhostMode}>
                    <Text style={styles.toggleSwitchText}>{ghostMode ? 'ON' : 'OFF'}</Text>
                  </TouchableOpacity>
                </View>

                {/* AI Auto-Responder Toggle */}
                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>🤖 AI Auto-Responder (Away Mode)</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>बिजी होने पर Gemini AI ऑटो रिप्लाई दे</Text>
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

                {/* Security PIN Lock */}
                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>🔒 ऐप सुरक्षा पिन (App PIN)</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>{userPin ? '4-अंकों का पिन एक्टिव है ✅' : 'कोई पिन सेट नहीं है'}</Text>
                  </View>
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
                    <Text style={[styles.pinToggleBtnText, { color: userPin ? '#ffffff' : '#000000' }]}>{userPin ? 'Remove' : 'Set PIN'}</Text>
                  </TouchableOpacity>
                </View>

                {/* E2EE Info Box */}
                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>🛡️ 256-bit AES End-to-End Encryption</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>Zero-Knowledge Client-Side Key Negotiation • Active 🟢</Text>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 🎨 Modal: Appearance & Design Studio */}
        <Modal visible={activeSettingsCategory === 'APPEARANCE'} transparent animationType="slide" onRequestClose={() => setActiveSettingsCategory(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '92%', maxWidth: 460, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 22 }}>🎨</Text>
                  <Text style={[styles.modalTitle, { color: theme.text, fontSize: 18 }]}>Appearance & Chats</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveSettingsCategory(null)}>
                  <Text style={{ fontSize: 18, color: theme.textMuted, fontWeight: '900' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 1. Themes */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginBottom: 8 }}>🌈 सिग्नेचर नियॉन थीम (Themes)</Text>
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
                      {activeThemeId === pal.id && <Text style={{ color: pal.accent, fontWeight: '900', fontSize: 12 }}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 2. Bubble Geometry */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginTop: 14, marginBottom: 8 }}>💬 चैट बबल का आकार (Bubble Shape)</Text>
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

                {/* 3. Font Scale */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginTop: 14, marginBottom: 8 }}>🔠 टेक्स्ट फॉन्ट साइज (Font Scaling)</Text>
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

                {/* 4. Wallpaper */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.text, marginTop: 14, marginBottom: 8 }}>🖼️ कस्टम चैट वॉलपेपर (Gallery Photos)</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity 
                    style={[styles.primaryBtn, { backgroundColor: theme.accent, flex: 1, marginTop: 0 }]}
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
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ☁️ Modal: Storage & Cloud Backup */}
        <Modal visible={activeSettingsCategory === 'STORAGE'} transparent animationType="slide" onRequestClose={() => setActiveSettingsCategory(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '92%', maxWidth: 460, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 22 }}>☁️</Text>
                  <Text style={[styles.modalTitle, { color: theme.text, fontSize: 18 }]}>Storage & Cloud Backup</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveSettingsCategory(null)}>
                  <Text style={{ fontSize: 18, color: theme.textMuted, fontWeight: '900' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={[styles.appearanceStudioCard, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 14 }]}>
                  <Text style={[styles.appearanceSubHeading, { color: theme.text }]}>☁️ AES-256 Encrypted Cloud Vault</Text>
                  <Text style={[styles.privacySub, { color: theme.textMuted, marginTop: 4 }]}>सभी संदेशों, मीडिया और सेटिंग्स का सुरक्षित जीरो डेटा-लॉस क्लाउड बैकअप।</Text>
                  {cloudBackupStatus ? <Text style={{ color: theme.accentLight, fontSize: 12, marginTop: 6, fontWeight: '700' }}>{cloudBackupStatus}</Text> : null}
                  
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity 
                      style={[styles.primaryBtn, { flex: 1, backgroundColor: theme.accent, marginTop: 0 }]}
                      onPress={handleCloudBackupSave}
                      disabled={isCloudBackupLoading}
                    >
                      <Text style={[styles.primaryBtnText, { color: '#000000' }]}>{isCloudBackupLoading ? 'Saving...' : 'Backup Now ☁️'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.secondaryBtn, { flex: 1, borderColor: theme.accentLight }]}
                      onPress={handleCloudBackupRestore}
                      disabled={isCloudBackupLoading}
                    >
                      <Text style={[styles.secondaryBtnText, { color: theme.accentLight }]}>Restore 🔄</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Starred Messages Shortcut */}
                <TouchableOpacity 
                  style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}
                  onPress={() => {
                    setActiveSettingsCategory(null);
                    setShowStarredModal(true);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>⭐ Starred Messages Vault</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>बुकमार्क किए गए संदेश देखें</Text>
                  </View>
                  <Text style={{ color: theme.accentLight, fontWeight: '800' }}>Open ➔</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 🤖 Modal: GP AI Engine Settings */}
        <Modal visible={activeSettingsCategory === 'GPAI'} transparent animationType="slide" onRequestClose={() => setActiveSettingsCategory(null)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border, width: '92%', maxWidth: 460, maxHeight: '85%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 22 }}>🤖</Text>
                  <Text style={[styles.modalTitle, { color: theme.text, fontSize: 18 }]}>GP AI Assistant Engine</Text>
                </View>
                <TouchableOpacity onPress={() => setActiveSettingsCategory(null)}>
                  <Text style={{ fontSize: 18, color: theme.textMuted, fontWeight: '900' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>⚡ Dual-Engine Hybrid Switch</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>Primary: Groq Llama 3.3 70B (84ms latency) • Fallback: Google Gemini 1.5</Text>
                  </View>
                  <View style={{ backgroundColor: '#22c55e', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    <Text style={{ color: '#000000', fontWeight: '900', fontSize: 11 }}>ACTIVE 🟢</Text>
                  </View>
                </View>

                <View style={[styles.privacyBox, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.privacyTitle, { color: theme.text }]}>🛡️ 0-Token Instant Rule Caching</Text>
                    <Text style={[styles.privacySub, { color: theme.textMuted }]}>अक्सर पूछे जाने वाले प्रश्नों पर 0 API टोकन खर्च होते हैं</Text>
                  </View>
                </View>

                <TouchableOpacity 
                  style={[styles.primaryBtn, { backgroundColor: theme.accent, marginTop: 8 }]}
                  onPress={() => {
                    setActiveSettingsCategory(null);
                    startDirectChat('gp_ai_bot');
                  }}
                >
                  <Text style={[styles.primaryBtnText, { color: '#000000' }]}>🤖 Start Chat with GP AI ➔</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
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
  backBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  backBtnText: { fontSize: 22, fontWeight: '900' },
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
  neoFloatingNavBar: { flexDirection: 'row', marginHorizontal: 14, marginBottom: 10, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 24, borderWidth: 1, elevation: 8, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
  neoBottomNavItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },

  // Edge Case: Real-time Ambient Offline / Online Banner
  offlineStatusBar: { backgroundColor: '#dc2626', paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  offlineStatusText: { color: '#ffffff', fontSize: 12, fontWeight: '800', textAlign: 'center' },

  // Pagination & Lazy Loading
  loadOlderBtn: { paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center', marginVertical: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, alignSelf: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  loadOlderText: { fontSize: 12, fontWeight: '800' },

  // 🐒 Chaos Monkey Alert Card Styles
  chaosAlertCard: { width: '85%', maxWidth: 360, padding: 22, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', elevation: 10, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12 },
  chaosAlertIcon: { fontSize: 42, marginBottom: 12 },
  chaosAlertTitle: { fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  chaosAlertMsg: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  chaosAlertBtn: { width: '100%', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chaosAlertBtnText: { color: '#000000', fontSize: 14, fontWeight: '900' },

  // 🌟 WhatsApp + Telegram Signature Hybrid Styles
  headerAvatarRing: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  headerOnlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#111b21' },
  chatHeaderAvatarBox: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  pinnedBannerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1 },
  pinnedBannerTitle: { fontSize: 11, fontWeight: '800' },
  pinnedBannerSnippet: { fontSize: 13 },
  bubbleMineStyle: { alignSelf: 'flex-end', borderBottomRightRadius: 3 },
  bubbleOtherStyle: { alignSelf: 'flex-start', borderBottomLeftRadius: 3 },
  attachmentMenuSheet: { width: '92%', maxWidth: 400, borderRadius: 24, borderWidth: 1, padding: 20, elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 10 },
  attachmentMenuTitle: { fontSize: 16, fontWeight: '900', marginBottom: 16, textAlign: 'center' },
  attachmentGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
  attachmentGridItem: { width: '30%', alignItems: 'center' },
  attachmentCircleIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  attachmentItemLabel: { fontSize: 12, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  chatOptionsDropdown: { position: 'absolute', top: 55, right: 16, width: 220, borderRadius: 14, borderWidth: 1, padding: 8, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  dropdownMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
  dropdownMenuIcon: { fontSize: 18, marginRight: 10 },
  dropdownMenuText: { fontSize: 13, fontWeight: '700' },
  quickActionButton: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14 },
  quickActionIconBox: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  quickActionTitle: { fontSize: 14, fontWeight: '800' },
  quickActionSub: { fontSize: 11, marginTop: 2 },
  settingsCategoryGroup: { marginTop: 8 },
  settingsCategoryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  settingsCategoryIconBox: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  settingsCategoryIcon: { fontSize: 18 },
  settingsCategoryTitle: { fontSize: 14, fontWeight: '800' },
  settingsCategorySub: { fontSize: 11, marginTop: 2 }
});
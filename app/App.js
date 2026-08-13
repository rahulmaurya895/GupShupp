import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  FlatList, SafeAreaView, StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator 
} from 'react-native';
import io from 'socket.io-client';

// ⚠️ Oracle Cloud Server Public IP & Port
const SOCKET_URL = "http://140.238.225.236:3000";
const socket = io(SOCKET_URL, { 
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

export default function App() {
  const [screen, setScreen] = useState('NAME'); // 'NAME', 'HOME', 'CHAT'
  const [username, setUsername] = useState('');
  const [groupName, setGroupName] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const flatListRef = useRef(null);

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      console.log('Connected to socket server');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from socket server');
      setIsConnected(false);
    });

    // Listen to incoming messages in real-time
    socket.on('receive_message', (data) => {
      setMessages((prev) => [...prev, data]);
    });

    // Listen to MongoDB history loaded from server
    socket.on('load_history', (historyMessages) => {
      if (Array.isArray(historyMessages)) {
        setMessages(historyMessages);
      }
      setIsLoadingHistory(false);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('receive_message');
      socket.off('load_history');
      socket.disconnect();
    };
  }, []);

  // 1. नाम सेव करके होम स्क्रीन पर जाना
  const handleSaveName = () => {
    if (username.trim()) {
      setScreen('HOME');
    }
  };

  // 2. ग्रुप चैट में शामिल होना
  const handleJoinGroup = () => {
    const formattedGroup = groupName.trim().toLowerCase();
    if (formattedGroup && username.trim()) {
      setMessages([]);
      setIsLoadingHistory(true);
      socket.emit('join_room', { room: formattedGroup, username: username.trim() });
      setScreen('CHAT');
    }
  };

  // 3. ग्रुप से बाहर निकलना (Back)
  const handleLeaveGroup = () => {
    socket.emit('leave_room', { room: groupName.trim().toLowerCase(), username: username.trim() });
    setMessages([]);
    setScreen('HOME');
  };

  // 4. मैसेज भेजना
  const handleSendMessage = () => {
    if (message.trim() && groupName.trim()) {
      const msgData = {
        room: groupName.trim().toLowerCase(),
        sender: username.trim(),
        text: message.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      
      // Server को भेजें (Server इसे MongoDB में सेव करेगा और रूम के बाकी लोगों को भेजेगा)
      socket.emit('send_message', msgData);

      // स्थानीय UI में तुरंत जोड़ें (Optimistic update)
      setMessages((prev) => [...prev, msgData]);
      setMessage('');
    }
  };

  // --- SCREEN 1: नाम दर्ज करने की स्क्रीन ---
  if (screen === 'NAME') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.card}>
          <Text style={styles.appBadge}>GupShupp v1.0</Text>
          <Text style={styles.title}>Welcome to GupShupp 💬</Text>
          <Text style={styles.subtitle}>शुरू करने के लिए अपना नाम दर्ज करें:</Text>
          
          <TextInput 
            style={styles.input} 
            placeholder="आपका नाम (e.g. Rahul)" 
            placeholderTextColor="#999"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="words"
          />
          
          <TouchableOpacity 
            style={[styles.button, !username.trim() && styles.buttonDisabled]} 
            onPress={handleSaveName}
            disabled={!username.trim()}
          >
            <Text style={styles.buttonText}>आगे बढ़ें ➔</Text>
          </TouchableOpacity>

          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isConnected ? '#25D366' : '#FF3B30' }]} />
            <Text style={styles.statusText}>
              {isConnected ? 'Server Connected' : 'Connecting to Server...'}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- SCREEN 2: होम डैशबोर्ड (ग्रुप चुनने / बनाने की स्क्रीन) ---
  if (screen === 'HOME') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.card}>
          <Text style={styles.welcomeText}>नमस्ते, {username} 👋</Text>
          <Text style={styles.subtitle}>किसी ग्रुप में शामिल हों या नया बनाएँ:</Text>
          
          <TextInput 
            style={styles.input} 
            placeholder="ग्रुप का नाम (e.g. tech, friends)" 
            placeholderTextColor="#999"
            value={groupName}
            onChangeText={setGroupName}
            autoCapitalize="none"
          />
          
          <TouchableOpacity 
            style={[styles.button, { backgroundColor: '#25D366' }, !groupName.trim() && styles.buttonDisabled]} 
            onPress={handleJoinGroup}
            disabled={!groupName.trim()}
          >
            <Text style={styles.buttonText}>Join Group Chat 🚀</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={() => setScreen('NAME')}>
            <Text style={styles.linkText}>← नाम बदलें</Text>
          </TouchableOpacity>

          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isConnected ? '#25D366' : '#FF3B30' }]} />
            <Text style={styles.statusText}>
              {isConnected ? 'Server Online' : 'Connecting to Server...'}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // --- SCREEN 3: मुख्य चैट रूम स्क्रीन ---
  return (
    <SafeAreaView style={styles.chatContainer}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={handleLeaveGroup} style={styles.backBtnWrapper}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>#{groupName.toLowerCase()}</Text>
          <Text style={styles.headerSubtitle}>Logged in as {username}</Text>
        </View>
        <View style={[styles.statusDot, { backgroundColor: isConnected ? '#25D366' : '#FF3B30', alignSelf: 'center' }]} />
      </View>

      {/* History Loading Indicator */}
      {isLoadingHistory && (
        <View style={styles.loadingBanner}>
          <ActivityIndicator size="small" color="#128C7E" />
          <Text style={styles.loadingText}>चैट हिस्ट्री लोड हो रही है...</Text>
        </View>
      )}

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => item._id || index.toString()}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          if (item.isSystem || item.sender === 'System') {
            return (
              <View style={styles.systemMsgContainer}>
                <Text style={styles.systemMsgText}>{item.text}</Text>
              </View>
            );
          }

          const isMe = item.sender === username.trim();
          return (
            <View style={[
              styles.msgBubble, 
              isMe ? styles.myMsg : styles.otherMsg
            ]}>
              {!isMe && <Text style={styles.senderText}>{item.sender}</Text>}
              <Text style={styles.msgText}>{item.text}</Text>
              <Text style={styles.timeText}>{item.time || ''}</Text>
            </View>
          );
        }}
        contentContainerStyle={styles.msgList}
      />

      {/* Message Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputRow}>
          <TextInput 
            style={styles.chatInput} 
            placeholder="मैसेज लिखें..." 
            placeholderTextColor="#888"
            value={message}
            onChangeText={setMessage}
            onSubmitEditing={handleSendMessage}
            returnKeyType="send"
          />
          <TouchableOpacity 
            style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]} 
            onPress={handleSendMessage}
            disabled={!message.trim()}
          >
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', justifyContent: 'center', alignItems: 'center' },
  card: { width: '88%', padding: 24, backgroundColor: '#fff', borderRadius: 16, elevation: 4, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  appBadge: { backgroundColor: '#e8f5e9', color: '#128C7E', fontSize: 12, fontWeight: 'bold', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#128C7E', marginBottom: 6, textAlign: 'center' },
  welcomeText: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 5 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20, textAlign: 'center' },
  input: { width: '100%', height: 50, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 15, marginBottom: 15, backgroundColor: '#fafafa', fontSize: 16, color: '#333' },
  button: { width: '100%', height: 50, backgroundColor: '#128C7E', justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  linkButton: { marginTop: 15, padding: 5 },
  linkText: { color: '#007AFF', fontSize: 14, fontWeight: '500' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 12, color: '#777' },
  
  chatContainer: { flex: 1, backgroundColor: '#efeae2' },
  chatHeader: { height: 64, backgroundColor: '#128C7E', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, justifyContent: 'space-between', elevation: 3 },
  backBtnWrapper: { paddingVertical: 8, paddingRight: 10 },
  backButton: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  headerInfo: { flex: 1, marginLeft: 5 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  headerSubtitle: { color: '#e0e0e0', fontSize: 12 },
  
  loadingBanner: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 8, backgroundColor: '#e1f5fe' },
  loadingText: { marginLeft: 8, fontSize: 12, color: '#0288d1' },
  
  msgList: { padding: 15, paddingBottom: 20 },
  msgBubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, marginBottom: 8, maxWidth: '80%', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
  myMsg: { backgroundColor: '#dcf8c6', alignSelf: 'flex-end', borderTopRightRadius: 2 },
  otherMsg: { backgroundColor: '#ffffff', alignSelf: 'flex-start', borderTopLeftRadius: 2 },
  senderText: { fontSize: 11, color: '#075e54', fontWeight: 'bold', marginBottom: 2 },
  msgText: { fontSize: 15, color: '#111', lineHeight: 20 },
  timeText: { fontSize: 10, color: '#888', alignSelf: 'flex-end', marginTop: 4 },
  
  systemMsgContainer: { alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginVertical: 6 },
  systemMsgText: { fontSize: 11, color: '#555', fontStyle: 'italic' },
  
  inputRow: { flexDirection: 'row', padding: 10, backgroundColor: '#fff', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  chatInput: { flex: 1, minHeight: 44, maxHeight: 100, backgroundColor: '#f5f5f5', borderRadius: 22, paddingHorizontal: 16, marginRight: 8, fontSize: 15, color: '#333' },
  sendButton: { backgroundColor: '#128C7E', paddingHorizontal: 20, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 22 },
  sendButtonDisabled: { opacity: 0.5 },
  sendText: { color: '#fff', fontWeight: 'bold', fontSize: 15 }
});
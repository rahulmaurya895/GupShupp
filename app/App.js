import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Image } from "react-native";
import io from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";

// ?? ???? IP Address ???? ?????
const SOCKET_URL = "http://YOUR_LAPTOP_IP:3000"; 
const socket = io(SOCKET_URL);

export default function App() {
  const [groupName, setGroupName] = useState("");
  const [inGroup, setInGroup] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);

  useEffect(() => {
    loadOfflineChats();

    socket.on("system_message", (data) => {
      saveMessageLocally({ id: Date.now().toString(), text: data.message, type: "system", isImage: false });
    });

    socket.on("receive_group_message", (data) => {
      saveMessageLocally({ id: Date.now().toString(), text: data.payload, type: "received", isImage: data.isImage });
    });

    return () => {
      socket.off("system_message");
      socket.off("receive_group_message");
    };
  }, []);

  const loadOfflineChats = async () => {
    try {
      const savedChats = await AsyncStorage.getItem("GupShupp_Chats");
      if (savedChats) setChat(JSON.parse(savedChats));
    } catch (error) {
      console.log("Error loading chats:", error);
    }
  };

  const saveMessageLocally = async (newMessage) => {
    setChat((prev) => {
      const updatedChat = [...prev, newMessage];
      AsyncStorage.setItem("GupShupp_Chats", JSON.stringify(updatedChat));
      return updatedChat;
    });
  };

  const joinRoom = () => {
    if (groupName.trim()) {
      socket.emit("join_group", groupName);
      setInGroup(true);
    }
  };

  const sendMessage = () => {
    if (message.trim()) {
      socket.emit("send_group_message", { groupName, payload: message, isImage: false });
      saveMessageLocally({ id: Date.now().toString(), text: message, type: "sent", isImage: false });
      setMessage("");
    }
  };

  const pickImage = async () => {
    // ????? ?? ?????? ??????
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5, // 50% ???????? ???? ???? ????? ???? ??
      base64: true, // ???? ?? ??????? (Base64) ??? ???????
    });

    if (!result.canceled) {
      const imageBase64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      socket.emit("send_group_message", { groupName, payload: imageBase64, isImage: true });
      saveMessageLocally({ id: Date.now().toString(), text: imageBase64, type: "sent", isImage: true });
    }
  };

  if (!inGroup) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>GupShupp ??</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Enter Group Name (e.g. Friends)" 
          value={groupName} 
          onChangeText={setGroupName} 
        />
        <TouchableOpacity style={styles.button} onPress={joinRoom}>
          <Text style={styles.buttonText}>Join Group Chat</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.chatContainer} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Group: {groupName}</Text>
      </View>
      
      <FlatList
        data={chat}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[styles.messageBubble, item.type === "sent" ? styles.sentBubble : item.type === "system" ? styles.systemBubble : styles.receivedBubble]}>
            {item.type === "system" ? (
              <Text style={styles.systemText}>{item.text}</Text>
            ) : item.isImage ? (
              <Image source={{ uri: item.text }} style={{ width: 200, height: 150, borderRadius: 10 }} />
            ) : (
              <Text style={styles.messageText}>{item.text}</Text>
            )}
          </View>
        )}
      />

      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.attachButton} onPress={pickImage}>
          <Text style={styles.attachText}>+</Text>
        </TouchableOpacity>
        <TextInput 
          style={styles.chatInput} 
          placeholder="Type a message..." 
          value={message} 
          onChangeText={setMessage} 
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.buttonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F0F2F5", padding: 20 },
  title: { fontSize: 28, fontWeight: "bold", marginBottom: 20, color: "#075E54" },
  input: { width: "100%", height: 50, backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 15, marginBottom: 15 },
  button: { backgroundColor: "#25D366", padding: 15, borderRadius: 10, width: "100%", alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  
  chatContainer: { flex: 1, backgroundColor: "#E5DDD5" },
  header: { height: 60, backgroundColor: "#075E54", justifyContent: "center", alignItems: "center", marginTop: 40 },
  headerText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  
  messageBubble: { padding: 10, borderRadius: 10, marginVertical: 5, maxWidth: "80%", marginHorizontal: 10 },
  sentBubble: { backgroundColor: "#DCF8C6", alignSelf: "flex-end" },
  receivedBubble: { backgroundColor: "#fff", alignSelf: "flex-start" },
  systemBubble: { backgroundColor: "#d1d1d1", alignSelf: "center", borderRadius: 20, paddingHorizontal: 15, paddingVertical: 5 },
  messageText: { fontSize: 16 },
  systemText: { fontSize: 12, color: "#555", fontStyle: "italic" },
  
  inputContainer: { flexDirection: "row", padding: 10, backgroundColor: "#fff", alignItems: "center" },
  attachButton: { backgroundColor: "#075E54", width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center", marginRight: 10 },
  attachText: { color: "#fff", fontSize: 24, fontWeight: "bold", marginTop: -2 },
  chatInput: { flex: 1, height: 45, backgroundColor: "#F0F2F5", borderRadius: 20, paddingHorizontal: 15, marginRight: 10 },
  sendButton: { backgroundColor: "#25D366", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20 }
});

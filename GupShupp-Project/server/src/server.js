const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => {
    res.send('GupShupp Secure Server is Running with Group Chat Engine!');
});

io.on('connection', (socket) => {
    console.log('?? New Client Connected:', socket.id);

    socket.on('join_group', (groupName) => {
        socket.join(groupName);
        console.log(`User ${socket.id} joined group: ${groupName}`);
        socket.to(groupName).emit('system_message', { 
            message: `New member joined the chat!` 
        });
    });

    socket.on('send_group_message', (data) => {
        console.log(`Encrypted message routed to group [${data.groupName}]`);
        socket.to(data.groupName).emit('receive_group_message', data);
    });

    socket.on('disconnect', () => {
        console.log('? Client Disconnected:', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log('? GupShupp Server live on port 3000 (Group Chat Enabled)');
});

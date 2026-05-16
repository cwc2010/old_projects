// index.js
const express = require('express');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', socket => {
    console.log('✅ Client connected:', socket.id);

    // Spawn a persistent C++ fluid simulation process for this specific client
    const sim = spawn(path.join(__dirname, 'fluid'));
    
    // Attach the process to the socket object to manage it throughout the session
    socket.sim = sim;

    let outputBuffer = '';
    // Listen for data coming from the C++ simulation's stdout
    sim.stdout.on('data', chunk => {
        outputBuffer += chunk.toString();

        // The C++ process should send each JSON state delimited by a newline.
        // Process all complete JSON objects received in the buffer.
        let newlineIndex;
        while ((newlineIndex = outputBuffer.indexOf('\n')) !== -1) {
            const jsonString = outputBuffer.substring(0, newlineIndex);
            outputBuffer = outputBuffer.substring(newlineIndex + 1);

            if (jsonString) {
                try {
                    const result = JSON.parse(jsonString);
                    // Emit the full, updated state back to the client
                    socket.emit('update', result);
                } catch (err) {
                    console.error('Error parsing simulation output JSON:', err);
                    console.error('Offending JSON string:', jsonString);
                }
            }
        }
    });

    // Log any errors from the C++ process for debugging
    sim.stderr.on('data', chunk => {
        console.error(`[${socket.id}] C++ Sim Error:`, chunk.toString());
    });
    
    // Listen for the client to send its input
    socket.on('playerInput', input => {
        // Instead of spawning a new process, we write to the stdin of the existing one.
        // Ensure the C++ process expects a stream of JSON inputs, each on a new line.
        if (sim.stdin.writable) {
            sim.stdin.write(JSON.stringify(input) + '\n');
        }
    });

    // Clean up when the client disconnects
    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
        // Terminate the associated C++ process to free up resources
        sim.kill();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
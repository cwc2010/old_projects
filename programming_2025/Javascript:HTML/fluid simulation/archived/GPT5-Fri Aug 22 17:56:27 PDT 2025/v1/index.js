// index.js
// Server: Express + Socket.IO + persistent C++ fluid solver via stdin/stdout (binary).
// Multiplayer inputs are batched per step as "splat" events; solver runs as fast as it can.

const express = require('express');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Simulation parameters (tweakable via env)
const N = parseInt(process.env.N || '128', 10);          // Grid size (N x N)
const CHANNELS = 3;                                       // RGB dye
const DIFF = parseFloat(process.env.DIFF || '0.00005');   // Diffusion
const VISC = parseFloat(process.env.VISC || '0.0001');    // Viscosity
const MIN_DT = 1 / 120;
const MAX_DT = 1 / 30;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Spawn the fluid simulator process (persistent)
const fluidExecutable = process.platform === 'win32' ? 'fluid.exe' : './fluid';
const fluid = spawn(fluidExecutable, {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'inherit'] // stdin, stdout, stderr->inherit
});

fluid.on('error', (err) => {
  console.error('Failed to start fluid process:', err);
  process.exit(1);
});

// Initialize the simulator (binary protocol)
// 'I' + uint32 N + uint32 channels + float dt + float diff + float visc
const initBuffer = Buffer.alloc(1 + 4 + 4 + 4 + 4 + 4);
let offset = 0;
initBuffer.writeUInt8('I'.charCodeAt(0), offset); offset += 1;
initBuffer.writeUInt32LE(N, offset); offset += 4;
initBuffer.writeUInt32LE(CHANNELS, offset); offset += 4;
initBuffer.writeFloatLE(1 / 60, offset); offset += 4; // default dt; actual per-step dt sent in 'S'
initBuffer.writeFloatLE(DIFF, offset); offset += 4;
initBuffer.writeFloatLE(VISC, offset); offset += 4;
fluid.stdin.write(initBuffer);

// Outgoing frame parsing
const area = N * N;
const outFloats = CHANNELS * area;
const expectedOutBytes = 1 + outFloats * 4; // 'O' + floats
let outBuf = Buffer.alloc(0);

let lastStepTime = process.hrtime.bigint();
let waitingForFrame = false;

// Accumulate multiplayer inputs between steps
// Each event: {x,y,radius,fx,fy,r,g,b} floats
const pendingEvents = [];
// Limit the size to avoid unbounded memory growth in extreme cases
const MAX_PENDING_EVENTS = 20000;

// Socket.io
io.on('connection', (socket) => {
  socket.emit('config', { N, channels: CHANNELS });

  socket.on('splat', (e) => {
    // Validate and sanitize inputs
    if (typeof e !== 'object' || e === null) return;
    let {
      x = 0.5, y = 0.5,
      radius = 0.03,
      fx = 0, fy = 0,
      r = 1, g = 1, b = 1
    } = e;

    // Clamp ranges to avoid pathological inputs
    x = Math.max(0, Math.min(1, Number(x)));
    y = Math.max(0, Math.min(1, Number(y)));
    radius = Math.max(0.001, Math.min(0.5, Number(radius)));
    fx = Math.max(-5, Math.min(5, Number(fx)));
    fy = Math.max(-5, Math.min(5, Number(fy)));
    r = Math.max(0, Math.min(5, Number(r)));
    g = Math.max(0, Math.min(5, Number(g)));
    b = Math.max(0, Math.min(5, Number(b)));

    if (pendingEvents.length < MAX_PENDING_EVENTS) {
      pendingEvents.push({ x, y, radius, fx, fy, r, g, b });
    }
  });

  socket.on('disconnect', () => {
    // No special handling needed
  });
});

// Simulation loop: send step, wait for frame, broadcast, repeat
function stepSimulation() {
  if (waitingForFrame) return;
  waitingForFrame = true;

  // Determine dt based on wall clock, clamp to sane range
  const now = process.hrtime.bigint();
  const dtSeconds = Number(now - lastStepTime) / 1e9;
  lastStepTime = now;
  const dt = Math.max(MIN_DT, Math.min(MAX_DT, dtSeconds || (1 / 60)));

  // SNAPSHOT & CLEAR events to minimize lock time
  const events = pendingEvents.splice(0, pendingEvents.length);

  // Build 'S' command:
  // 'S' + uint32 eventsCount + float dt + events*8floats
  const eventStride = 8 * 4; // 8 floats per event = 32 bytes
  const buf = Buffer.alloc(1 + 4 + 4 + events.length * eventStride);
  let off = 0;
  buf.writeUInt8('S'.charCodeAt(0), off); off += 1;
  buf.writeUInt32LE(events.length, off); off += 4;
  buf.writeFloatLE(dt, off); off += 4;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    buf.writeFloatLE(ev.x, off); off += 4;
    buf.writeFloatLE(ev.y, off); off += 4;
    buf.writeFloatLE(ev.radius, off); off += 4;
    buf.writeFloatLE(ev.fx, off); off += 4;
    buf.writeFloatLE(ev.fy, off); off += 4;
    buf.writeFloatLE(ev.r, off); off += 4;
    buf.writeFloatLE(ev.g, off); off += 4;
    buf.writeFloatLE(ev.b, off); off += 4;
  }

  fluid.stdin.write(buf);
}

// Read frames from simulator and broadcast
fluid.stdout.on('data', (chunk) => {
  outBuf = Buffer.concat([outBuf, chunk]);

  while (outBuf.length >= expectedOutBytes) {
    if (outBuf.readUInt8(0) !== 'O'.charCodeAt(0)) {
      console.error('Protocol desync: expected O frame');
      process.exit(1);
    }
    const payload = outBuf.subarray(1, 1 + outFloats * 4);
    // Copy to avoid referencing the growing buffer
    const frame = Buffer.from(payload);

    // Remove this frame from buffer
    outBuf = outBuf.subarray(1 + outFloats * 4);

    // Broadcast binary frame to all clients
    // socket.io will send this Buffer as binary
    io.emit('frame', frame);

    waitingForFrame = false;

    // Immediately schedule next step (run as fast as compute allows)
    setImmediate(stepSimulation);
  }
});

// Kick off loop after a brief delay to ensure init
setTimeout(stepSimulation, 50);

// Graceful shutdown
function shutdown() {
  try {
    fluid.stdin.end();
  } catch (e) {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start HTTP server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

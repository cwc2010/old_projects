# List of files

implementation.md

```markdown
# Overview

Implement a particle-based FLIP simulation on a 2D MAC grid drawn to a full-window `<canvas>`; use device tilt/accelerometer (with a gesture-permission flow) as external acceleration and fall back to mouse movements which *imitate* accelerometer (mouse movement → acceleration), ensure strict conservation by never creating/destroying particles, enforce solid boundaries, and render a sharp water/air boundary using a marching-squares surface extracted from particle density.

---

# Recommended constants / design choices (change as needed)

* Canvas fills window (devicePixelRatio aware).
* Grid: Nx × Ny (e.g. 160×100 for desktop; reduce for mobile). Cell size `dx = canvasWidth / Nx`.
* Particles per cell at initialization: `ppc = 4`–`8` (higher → smoother surface).
* `dt` target: 1/60s; use substeps if needed.
* Particle volume = constant `V_p = (cellArea) / (particlesPerCellInitial)` so total volume = `numParticles * V_p`.
* FLIP blending alpha: `alpha = 1.0` (pure FLIP) optionally mix small PIC fraction (0.02) for stability.
* Pressure solve: use Jacobi (\~40–200 iterations) or Conjugate Gradient/PCG for faster convergence; Jacobi is easiest to implement.
* Use typed arrays (`Float32Array`, `Int32Array`) for speed.

---

# Step-by-step plan

### 1) Project scaffold + full-screen canvas

1. Create `index.html` with a full-screen canvas and small UI overlay (permission button, pause, reset).
2. CSS: make body/html height 100%, remove margin. Canvas style `position: fixed; inset: 0; width:100%; height:100%;`.
3. JS: set canvas resolution to `innerWidth*devicePixelRatio` and `innerHeight*devicePixelRatio` and scale context accordingly.

```html
<canvas id="c"></canvas>
<button id="enableSensors">Enable Sensors</button>
```

```js
const canvas = document.getElementById('c');
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', resize);
resize();
```

### 2) Grid (staggered MAC grid) & data structures

1. Use a staggered grid (MAC): `u` velocities at vertical faces (`(i+0.5, j)`), `v` at horizontal faces (`(i, j+0.5)`), `pressure` at cell centers.
2. Data arrays:

   * `u` size `(Nx+1) * Ny` (faces)
   * `v` size `Nx * (Ny+1)`
   * `u_prev`, `v_prev` to compute grid delta for FLIP
   * `mass_u`, `mass_v` arrays to accumulate particle mass contributions per face
   * `pressure` size `Nx*Ny`
3. Particle arrays (flat typed arrays): `px[]`, `py[]`, `pvx[]`, `pvy[]` (length = Nparticles).
4. Cell occupancy / density `cellCount[]` to help build marching-squares SDF.

### 3) Initialize particles and volumes

1. Fill a region (or arbitrary shape) with particles. For exact conservation, particles count is fixed and each particle represents a fixed volume `V_p`.
2. Example: for each cell inside initial fill area create `ppc` particles with random jitter inside the cell.
3. Track `totalVolume = numParticles * V_p` to assert conservation.

### 4) Main loop (per timestep)

Call `simulate(dt)` per animation frame — possibly with fixed `dt` substeps.

High-level FLIP loop per substep:

1. Zero grid (`u`, `v`, `mass_u`, `mass_v`, `pressure`, `cellCount`).
2. **P2G (Particles → Grid)**: transfer particle velocities to nearby face-centered grid nodes (bilinear weights).
3. Add external forces on grid velocities (gravity vector from sensors/mouse): `u += gravity.x * dt` and `v += gravity.y * dt` at face locations (or add as force to particles before P2G).
4. Save old grid velocities (`u_prev = u`, `v_prev = v`) **before** pressure solve only if you plan to compute delta after pressure projection (common).
5. **Pressure projection**: enforce incompressibility (divergence-free) on fluid cells — build RHS using divergence and solve Poisson for `pressure`. Subtract pressure gradient from face velocities. Enforce solid boundaries during this step.
6. **G2P (Grid → Particles)**: update particle velocities using FLIP:

   * interpolate both `u` and `u_prev` to particle → compute gridDelta = interp(u) − interp(u\_prev) and `pv += gridDelta`. (This is the FLIP update.)
   * optionally do `pv = (1 - beta)*PIC_value + beta*FLIP_value` with `beta≈0.98` for stability.
7. **Particle advection**: `p += pv * dt` (use RK2 if desired: advect halfway).
8. Enforce particle-boundary collisions: clamp inside domain, reflect normal velocity component or set to zero depending on slip/no-slip choice. Keep them inside — never destroy them.
9. Update any diagnostics (sum of particle volumes, total momentum).

I'll break down key sub-steps in code/pseudocode below.

---

### 5) Particle → Grid transfer (P2G) details

* Use bilinear weights onto adjacent face centers. For a particle at `(x,y)`:

  * For `u` faces (located at `i+0.5,j`): compute cell indices and weights for the four `u` face neighbors, add `u_face += p_vx * weight * particleMass`, `mass_u += weight * particleMass`. Then after all particles, divide `u_face /= mass_u` where mass\_u>0.
* Use particle mass/volume consistently: treat each particle mass `m_p = ρ * V_p` (density ρ can be 1.0 for simplicity).
* This weighted transfer preserves momentum.

Pseudocode:

```js
// for each particle p
for each neighbor face f of p:
  w = bilinearWeight(p, facePos)
  u[f] += p.vx * w * p.mass
  mass_u[f] += w * p.mass
// after loop
for f: if mass_u[f]>0: u[f] /= mass_u[f]
```

---

### 6) Pressure projection (solve Poisson)

* Compute divergence `div[i,j] = (u[i+1, j] - u[i, j]) / dx + (v[i, j+1] - v[i, j]) / dx`.
* Build linear system `A p = b` where `b = -div` for *fluid* cells only. For boundary/air cells, use Neumann/Dirichlet as needed:

  * If a cell is completely air (no particles), you can treat it as not part of fluid solve (or give it a large index with pressure=0). Simpler: solve on all cells but mark boundary cells (solid) with Dirichlet or zero pressure and exclude air if you want a free-surface.
* Use Jacobi iterations:

```js
for iter in 0..Niter:
  for each fluid cell (i,j):
    p_new = ( sum of neighbor pressures - b[i,j] * dx*dx ) / neighborCount
  swap p and p_new
```

* After solving `p`, update face velocities: `u[i,j] -= (p[i,j] - p[i-1,j]) / dx`, `v[i,j] -= (p[i,j] - p[i,j-1]) / dx`.
* Enforce solid normals: for boundary faces, set normal velocity to zero.

Notes:

* Jacobi converges slowly—if performance matters, replace with PCG.

---

### 7) Grid → Particle (FLIP velocity update)

* For each particle:

  * `grid_v_new = interpolate_grid_velocity(u, v, particle.pos)`
  * `grid_v_old = interpolate_grid_velocity(u_prev, v_prev, particle.pos)`
  * `delta = grid_v_new - grid_v_old`
  * `particle.v += delta`   // pure FLIP — conserves momentum and mass
  * Optionally combine with PIC:

    * `particle.v = (1 - alpha_PIC) * (particle.v + delta) + alpha_PIC * grid_v_new`

Important: Use the same interpolation (bilinear) used in P2G.

---

### 8) Particle advection + boundary handling

* Advance particle positions: `p += p.v * dt` (or use semi-implicit / RK2).
* Boundary handling: clamp or reflect if outside:

```js
if px < margin: px = margin; pvx *= -restitution;
if px > width-margin: px = width-margin; pvx *= -restitution;
```

* Use `restitution=0` or small value to avoid energy creation/loss; but reflecting perfectly can cause spurious energy — damp the tangential velocity a bit.

**Crucial for mass conservation**: never delete particles; if a particle somehow moves outside (due to numerical errors), snap it back inside and adjust velocity — do not remove it.

---

### 9) Rendering: crisp water/air separation

Goal: a visually sharp interface (no "blur" between air/water).

Approach recommended:

* Compute a scalar field (density or occupancy) on cell centers: for each particle add `density[cell] += 1` (or kernel-weighted).
* Threshold the density to get a binary mask: `fluidCell = density > threshold`.
* Run Marching Squares on the grid of `fluidCell` (or on a smoothed scalar field with threshold) to build an iso-contour polygon representing the free surface. Marching squares gives a smooth but *sharp* interface.
* Fill the polygon with solid water color (no alpha blur). Draw a crisp outline if desired. Then draw air background separately.

Advantages: sharp separation, looks like real water boundaries without alpha blending.

Simpler alternative: visualize particles as circles with blending disabled (draw with `globalCompositeOperation='source-over'` but without blur) — but that tends to look grainy or fuzzy. Marching squares gives a crisp fill.

Rendering snippet for marching squares (conceptual):

```js
// Build scalar field s[i][j] = min(1, density / normalization)
for each cell (i,j):
  s = density[i,j] / expectedDensityPerCell
// Run marching squares with threshold = 0.5 to get path
ctx.beginPath();
drawContourPath(pathsFromMarchingSquares(s, 0.5));
ctx.fillStyle = waterColor;
ctx.fill();
```

Also optionally draw particles as small circles (non-blurry) for debug.

---

### 10) Device sensors (accelerometer/gyroscope) + permission flow

You must obtain a user gesture before accessing motion sensors (especially on iOS). Flow:

1. On first load show an overlay explaining you need tilt permission and a big button “Enable Motion”.
2. On click:

   * For iOS 13+ Safari: call `DeviceMotionEvent.requestPermission().then(...)`.
   * For other browsers: add event listeners for `deviceorientation` or `devicemotion`.
3. Convert orientation/acceleration to a gravity vector `g_screen = (gx, gy)` in screen coordinates. For tilt-based gravity, use `gamma` and `beta` from `deviceorientation` and map to x/y.
4. Provide a toggle to fall back to mouse emulation.

Example permission code:

```js
async function enableSensors() {
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const res = await DeviceMotionEvent.requestPermission();
      if (res === 'granted') {
        window.addEventListener('devicemotion', handleMotion);
      }
    } catch(e) { /* fallback to mouse */ }
  } else {
    window.addEventListener('devicemotion', handleMotion);
  }
}
```

Handler mapping:

```js
function handleMotion(e) {
  // prefer accelerationIncludingGravity or rotation to compute tilt
  const ax = e.accelerationIncludingGravity.x || 0;
  const ay = e.accelerationIncludingGravity.y || 0;
  // Map device axes → canvas axes (experiment per device)
  gravity.x = ax * gravityScale;
  gravity.y = -ay * gravityScale; // invert as necessary
}
```

**Important**: sensors can be noisy — apply a low-pass filter to the reported gravity vector:

```js
gravity.x = lerp(gravity.x, newX, 0.05); // 0..1 smoothing
```

---

### 11) Mouse fallback (should NOT directly interact with water)

User requested mouse should *imitate* accelerometer, not push the fluid directly.

Implementation:

* Track mouse position and compute mouse velocity `mv = (dx, dy) / dtMouse`.
* Map mouse velocity to an acceleration vector `simulatedGravity = -k * mv` (or to gravity tilt): when the user moves mouse to the right quickly the gravity vector tilts right.
* Only update global `gravity` vector from mouse if sensors are not enabled. Smooth and clamp it.
* Do not inject velocity to particles directly — only affect gravity acceleration used in the simulation step.

Example:

```js
let lastMouse = null;
canvas.addEventListener('mousemove', (ev) => {
  if (sensorsEnabled) return;
  if (lastMouse) {
    const dx = ev.clientX - lastMouse.x;
    const dy = ev.clientY - lastMouse.y;
    const ax = dx / Math.max(1, (ev.timeStamp - lastMouse.t));
    const ay = dy / Math.max(1, (ev.timeStamp - lastMouse.t));
    gravity.x = lerp(gravity.x, ax * mouseToAccScale, 0.08);
    gravity.y = lerp(gravity.y, ay * mouseToAccScale, 0.08);
  }
  lastMouse = {x: ev.clientX, y: ev.clientY, t: ev.timeStamp};
});
```

This keeps the mouse from poking individual particles and instead controls the global acceleration field (exactly what you asked).

---

### 12) Ensuring strict water mass conservation

1. Fixed number of particles and fixed particle volume is the simplest way to guarantee mass conservation (no particles are created or destroyed).
2. Ensure P2G/G2P transfers are consistent and don't leak mass via grid faces: use accurate weights and normalize by mass arrays.
3. Boundary handling: do not remove particles when they hit walls — clamp and reflect; don't teleport them outside the domain.
4. Keep track of `numParticles * V_p` and optionally show a diagnostic number on-screen to detect any drift.
5. Beware of floating point drift — but particle count *should* guarantee constant volume; any perception of volume change comes from numerical diffusion (e.g. pressure solver or interpolation) which does not change particle count but may rearrange particles — choose suitable solver iterations to avoid visible compressibility.

---

### 13) Testing & validation

1. Unit tests:

   * Start with a small scenario and verify particle count constant after N frames.
   * Verify center-of-mass changes only from external acceleration (gravity), not from numerical artifacts.
2. Visual tests:

   * Drop particles sym sym and tilt device; they should move and come to rest when device stable.
   * Make sure water level against walls doesn't slowly rise/fall.
3. Debug visualizations:

   * Draw cell occupancy, divergence field, pressure field, `u_prev` vs `u_new` difference.
4. For numerical stability, test different `dt` and increase pressure-solve iterations if compressibility visible.

---

### 14) Performance & optimization tips

* Use `Float32Array` and flat indexing to avoid GC churn.
* Pre-allocate arrays; avoid per-frame allocation.
* Use small number of Jacobi iterations on mobile (e.g. 20) and more on desktop (60–200).
* Lower grid resolution for mobile; allow user to choose quality.
* Use SIMD/wasm later if needed.
* Use spatial hashing or cell lists to accelerate P2G / particle neighborhood queries.

---

### 15) UI & UX details

* Big “Enable Motion” button on load (required for sensors).
* Toggle “Use Mouse for Gravity” if sensors unavailable.
* Buttons: Pause, Step, Reset, Quality slider (grid res), Particle Count slider.
* Debug overlay showing `totalVolume` and `numParticles` to prove conservation.

---

### 16) Example pseudocode (core loop)

```js
function step(dt) {
  zeroGrid();
  // P2G
  for (p=0..N-1) transferParticleToGrid(p);
  normalizeGridVelocities();
  addGravityToGrid(gravity, dt);
  copyGridToOld(u, v, u_prev, v_prev);
  pressureSolve(); // modifies u,v
  // G2P (FLIP)
  for (p=0..N-1) {
    newGridVel = interpGrid(u, v, px[p], py[p]);
    oldGridVel = interpGrid(u_prev, v_prev, px[p], py[p]);
    delta = newGridVel - oldGridVel;
    pvx[p] += delta.x;
    pvy[p] += delta.y;
    // particle advection
    px[p] += pvx[p] * dt;
    py[p] += pvy[p] * dt;
    enforceParticleBoundary(p);
  }
  render();
}
```

---

### 17) Marching Squares – brief how-to for a crisp surface

1. Build scalar `s[i,j]` = kernel-smoothed particle density per cell (or count normalized).
2. Choose `iso = 0.5`.
3. For each cell square, evaluate 4 corners as above/below iso → choose 16 cases → draw segments accordingly.
4. Collect segments into continuous polygon(s) and `ctx.fill()` them.
   There are many small libraries and short reference implementations of marching squares; it is straightforward to implement for 2D.

---

### 18) Useful detail: interpolation weights

* For bilinear interpolation and transfers use cubic B-splines or simple bilinear depending on quality needs. Bilinear is simpler and sufficient.
* Implement helper functions:

  * `weight = (1 - abs(dx/dxGrid)) * (1 - abs(dy/dyGrid))` for bilinear based on distance.
  * For face-centered velocities offset coordinates accordingly.

---

### 19) Troubleshooting common problems

* If the fluid compresses/expands: increase pressure-solve iterations or use PCG.
* If particles cluster into clumps: use small PIC blending or add slight particle repulsion (but that changes strict FLIP).
* If water appears "blurred": switch rendering to marching squares and binary mask.
* If particles escape domain: clamp positions before next P2G step.
```

index.js

```javascript
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');

const app = express();

// Serve static files
app.use(express.static('public'));

// Ports
const HTTP_PORT = 3000;     // HTTP (redirects to HTTPS)
const HTTPS_PORT = 3443;    // HTTPS (actual app)

// Load SSL certs (generated with mkcert; see steps below)
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem')),
};

// Create HTTPS server
const httpsServer = https.createServer(sslOptions, app);

// Socket.io over HTTPS
const io = new Server(httpsServer);

// Example socket handler (optional)
// io.on('connection', (socket) => {
//   console.log('client connected');
// });

// Start HTTPS
httpsServer.listen(HTTPS_PORT, () => {
  console.log('HTTPS hosting on:');
  printAddresses('https', HTTPS_PORT);
});

// Create an HTTP server that redirects to HTTPS
const redirectApp = express();
redirectApp.enable('trust proxy');
redirectApp.use((req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  return res.redirect(301, `https://${host}:${HTTPS_PORT}${req.url}`);
});

const httpServer = http.createServer(redirectApp);

// Start HTTP
httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP on :${HTTP_PORT} (redirecting -> HTTPS :${HTTPS_PORT})`);
  printAddresses('http', HTTP_PORT);
});

function printAddresses(proto, port) {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4') {
        console.log(`${proto}://${net.address}:${port}`);
      }
    }
  }
  console.log(`${proto}://localhost:${port}`);
}
```

public/index.css

```css
:root {
  color-scheme: dark;
  --bg: #0e0f12;
  --panel: rgba(20, 22, 28, 0.7);
  --border: rgba(255, 255, 255, 0.08);
  --text: #d7e0ea;
  --muted: #9aa7b4;
  --primary: #4ea1ff;
  --primary-contrast: #061121;
  --btn: #252932;
  --btn-hover: #2d3340;
}

* { box-sizing: border-box; }

html, body {
  height: 100%;
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, "Apple Color Emoji", "Segoe UI Emoji";
}

/* Fullscreen canvas: we draw in CSS-pixel space but back it by device pixels */
#canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  background: radial-gradient(1200px 800px at 30% 20%, #15203a 0%, #0e0f12 60%, #0e0f12 100%);
  touch-action: none;
}

/* Overlay UI moved to top-right so it doesn't overlap our canvas title on the left */
.ui {
  position: fixed;
  top: env(safe-area-inset-top, 0);
  right: env(safe-area-inset-right, 0);
  left: auto;
  padding: 12px;
  display: grid;
  gap: 8px;
  user-select: none;
  align-items: start;
  text-align: right;
}

.ui-row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

.status {
  color: var(--muted);
  font-size: 12px;
  padding: 6px 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  backdrop-filter: blur(6px);
}

.btn {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--btn);
  color: var(--text);
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 120ms ease, transform 60ms ease;
  backdrop-filter: blur(6px);
}

.btn:hover { background: var(--btn-hover); }
.btn:active { transform: translateY(1px); }

.btn.primary {
  background: linear-gradient(180deg, #4ea1ff 0%, #2d7be0 100%);
  border-color: rgba(0,0,0,0.25);
  color: white;
  text-shadow: 0 1px 0 rgba(0,0,0,0.35);
}

@media (max-width: 680px) {
  .btn { padding: 10px 14px; }
}
```

public/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>FLIP Water – Step 2 (Grid & Data)</title>
  <link rel="stylesheet" href="./index.css" />
</head>
<body>
  <!-- Fullscreen canvas -->
  <canvas id="canvas" aria-label="FLIP water simulation canvas"></canvas>

  <!-- Overlay UI (moved to top-right so it doesn't block the canvas title text) -->
  <div class="ui">
    <div class="ui-row">
      <button id="enableSensors" class="btn primary" type="button">Enable Sensors</button>
      <button id="pauseBtn" class="btn" type="button" aria-pressed="false">Pause</button>
      <button id="resetBtn" class="btn" type="button">Reset</button>
    </div>
    <div class="ui-row status">
      <span id="statusText">Ready • DPR: <span id="dprText">1</span></span>
    </div>
  </div>

  <script src="./main.js"></script>
</body>
</html>
```

public/main.js

```javascript
"use strict";

/*
  FLIP (Fluid-Implicit Particle) – quick orientation
  --------------------------------------------------
  We will advance water using particles for momentum and a staggered (MAC) grid
  for the incompressibility solve. Per step we'll:
    - P2G: transfer particle velocities to face-centered grid velocities
    - Add external accel (from sensors/mouse)
    - Pressure solve → divergence-free grid velocities
    - G2P: apply grid velocity change to particles (FLIP), optionally tiny PIC
    - Advect particles, enforce solid walls
    - Render sharp water/air surface via marching squares over particle density

  This file is currently at Step 2:
    - We set up the staggered MAC grid data structures
    - We pre-create arrays for velocities, masses, pressure, and cell occupancy
    - We DO NOT simulate yet (no transfers or pressure solve in this step)
*/

// DOM elements
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", {alpha: false, desynchronized: true});

const enableSensorsBtn = document.getElementById("enableSensors");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const dprText = document.getElementById("dprText");
const statusText = document.getElementById("statusText");

// Viewport size in CSS pixels
let viewWidth = 0;
let viewHeight = 0;

// Animation state
let isPaused = false;
let rafId = 0;
let lastFrameTime = 0;

// Placeholder state for later steps
let sensorsEnabled = false;

/* ------------------------------
   Step 2: Grid & data structures
   ------------------------------
   We use a 2D MAC (staggered) grid:
     - xFaceVelocity (u): at vertical faces, size (gridWidth+1)×gridHeight
     - yFaceVelocity (v): at horizontal faces, size gridWidth×(gridHeight+1)
     - pressure: at cell centers, size gridWidth×gridHeight
     - xFaceMass, yFaceMass: accumulated mass during P2G
     - cellParticleCount: particle density/occupancy for marching squares

   Naming: We avoid 'u','v','Nx','Ny' per your preference and keep descriptive names.
*/
let gridWidth = 0;   // number of cells in X
let gridHeight = 0;  // number of cells in Y
let cellSize = 6;    // cell size in CSS pixels

// Face-centered velocity fields and their "previous" copies for FLIP delta
let xFaceVelocity = null;      // length: (gridWidth+1) * gridHeight
let yFaceVelocity = null;      // length: gridWidth * (gridHeight+1)
let xFaceVelocityPrev = null;  // same size as xFaceVelocity
let yFaceVelocityPrev = null;  // same size as yFaceVelocity

// Mass accumulators for P2G normalization
let xFaceMass = null;
let yFaceMass = null;

// Cell-centered pressure
let pressure = null;

// Cell occupancy/density (for surface extraction later)
let cellParticleCount = null;

// Particles (allocated in Step 3). We declare arrays now to lock in naming.
let particlePosX = new Float32Array(0);
let particlePosY = new Float32Array(0);
let particleVelX = new Float32Array(0);
let particleVelY = new Float32Array(0);

// Indexing helpers (flat indices into typed arrays)
function cellIndex(i, j) {
  // Valid for i in [0, gridWidth-1], j in [0, gridHeight-1]
  return i + j * gridWidth;
}
function xFaceIndex(i, j) {
  // Valid for i in [0, gridWidth], j in [0, gridHeight-1]
  return i + j * (gridWidth + 1);
}
function yFaceIndex(i, j) {
  // Valid for i in [0, gridWidth-1], j in [0, gridHeight]
  return i + j * gridWidth;
}

// Compute a cell size that keeps ~160 cells across on desktop, fewer on mobile
function chooseCellSize() {
  const approxAcross = Math.max(100, Math.min(160, Math.round(viewWidth / 8))); // heuristic guardrails
  const px = Math.round(viewWidth / approxAcross);
  // Clamp to a reasonable pixel size for performance and visual quality
  return Math.max(4, Math.min(8, px));
}

// Allocate or re-allocate the grid when the canvas size changes
function rebuildGrid() {
  cellSize = chooseCellSize();
  gridWidth = Math.max(4, Math.floor(viewWidth / cellSize));
  gridHeight = Math.max(4, Math.floor(viewHeight / cellSize));

  const xFaceCount = (gridWidth + 1) * gridHeight;
  const yFaceCount = gridWidth * (gridHeight + 1);
  const cellCount = gridWidth * gridHeight;

  xFaceVelocity = new Float32Array(xFaceCount);
  yFaceVelocity = new Float32Array(yFaceCount);
  xFaceVelocityPrev = new Float32Array(xFaceCount);
  yFaceVelocityPrev = new Float32Array(yFaceCount);
  xFaceMass = new Float32Array(xFaceCount);
  yFaceMass = new Float32Array(yFaceCount);
  pressure = new Float32Array(cellCount);
  cellParticleCount = new Float32Array(cellCount);

  // All typed arrays default-initialize to 0. We keep a helper for clarity.
  zeroGrid();

  // No particles yet (Step 3 will initialize them).
  particlePosX = new Float32Array(0);
  particlePosY = new Float32Array(0);
  particleVelX = new Float32Array(0);
  particleVelY = new Float32Array(0);

  setStatus("Grid allocated");
}

function zeroGrid() {
  xFaceVelocity.fill(0);
  yFaceVelocity.fill(0);
  xFaceVelocityPrev.fill(0);
  yFaceVelocityPrev.fill(0);
  xFaceMass.fill(0);
  yFaceMass.fill(0);
  pressure.fill(0);
  cellParticleCount.fill(0);
}

/* ------------------------------
   Canvas sizing & loop scaffold
   ------------------------------ */

// Resize canvas to fill the window and match devicePixelRatio.
// We draw in CSS pixel space but back the canvas by real device pixels for crispness.
function resizeCanvas() {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  viewWidth = Math.floor(window.innerWidth);
  viewHeight = Math.floor(window.innerHeight);

  canvas.style.width = viewWidth + "px";
  canvas.style.height = viewHeight + "px";
  canvas.width = Math.round(viewWidth * dpr);
  canvas.height = Math.round(viewHeight * dpr);

  // Set transform so 1 unit in canvas space == 1 CSS pixel
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  dprText.textContent = dpr.toFixed(2);

  // Rebuild grid to the new size
  rebuildGrid();

  // Draw once immediately after resizing
  drawPlaceholder(0);
}
window.addEventListener("resize", resizeCanvas);

// Basic animation loop skeleton (no simulation yet)
function startLoop() {
  cancelLoop();
  isPaused = false;
  pauseBtn.setAttribute("aria-pressed", "false");
  lastFrameTime = performance.now();
  const tick = (now) => {
    rafId = requestAnimationFrame(tick);
    if (isPaused) return;

    const deltaTime = Math.min(1 / 15, (now - lastFrameTime) / 1000); // clamp to avoid huge steps
    lastFrameTime = now;

    // Step 2: still drawing a placeholder scene (no P2G/G2P/pressure)
    drawPlaceholder(deltaTime);
  };
  rafId = requestAnimationFrame(tick);
}

function cancelLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

/* ------------------------------
   Placeholder rendering (Step 2)
   ------------------------------ */

function drawPlaceholder(deltaTime) {
  ctx.clearRect(0, 0, viewWidth, viewHeight);

  // Subtle animated lines
  const t = performance.now() * 0.001;
  const lines = 10;
  ctx.save();
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < lines; i++) {
    const y = (viewHeight / (lines + 1)) * (i + 1) + Math.sin(t * (0.5 + i * 0.1)) * 6;
    const hue = 210 + i * 2;
    const grad = ctx.createLinearGradient(0, y - 1, viewWidth, y + 1);
    grad.addColorStop(0.0, `hsla(${hue}, 70%, 50%, 0)`);
    grad.addColorStop(0.5, `hsla(${hue}, 70%, 60%, 0.8)`);
    grad.addColorStop(1.0, `hsla(${hue}, 70%, 50%, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 1, viewWidth, 2);
  }
  ctx.restore();

  // Title/info badge (top-left). UI is now top-right so it won't overlap.
  const badgeW = 520;
  const badgeH = 116;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(24, 24, badgeW, badgeH);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(22, 22, badgeW, badgeH);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(20, 20, badgeW, badgeH);

  ctx.fillStyle = "white";
  ctx.font = "700 28px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText("FLIP Water Simulation", 36, 60);

  ctx.fillStyle = "rgba(210,225,255,0.9)";
  ctx.font = "14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText("Step 2: Grid (MAC) & data structures allocated", 36, 86);

  // Grid summary line
  ctx.fillStyle = "rgba(195,215,255,0.9)";
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText(`Grid: ${gridWidth} × ${gridHeight} cells • Cell: ${cellSize}px • xFaces: ${(gridWidth+1)*gridHeight} • yFaces: ${gridWidth*(gridHeight+1)}`, 36, 106);
  ctx.restore();

  // Footer hint
  const hint = sensorsEnabled ? "Sensors ready (logic coming in a later step)" : "Click Enable Sensors (permission only; logic later)";
  ctx.save();
  ctx.fillStyle = "rgba(200, 210, 230, 0.75)";
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  const textWidth = ctx.measureText(hint).width;
  ctx.fillText(hint, Math.max(16, viewWidth - textWidth - 16), viewHeight - 16);
  ctx.restore();
}

/* ------------------------------
   UI interactions (no sensors yet)
   ------------------------------ */
enableSensorsBtn.addEventListener("click", () => {
  sensorsEnabled = true;
  enableSensorsBtn.textContent = "Sensors Enabled";
  enableSensorsBtn.disabled = true;
  setStatus("Gesture captured. Sensor permission flow will be added in Step 10.");
});

pauseBtn.addEventListener("click", () => {
  isPaused = !isPaused;
  pauseBtn.setAttribute("aria-pressed", isPaused ? "true" : "false");
  pauseBtn.textContent = isPaused ? "Resume" : "Pause";
  setStatus(isPaused ? "Paused" : "Running");
});

resetBtn.addEventListener("click", () => {
  // In later steps this will reset particles/grid state; here it's a no-op visual
  setStatus("Reset (placeholder).");
  // Visual tick could go here if needed
});

// Status helper
function setStatus(msg) {
  statusText.textContent = `${msg} • DPR: ${dprText.textContent} • Grid: ${gridWidth}×${gridHeight} • Cell: ${cellSize}px`;
}

// Initialize
resizeCanvas();
startLoop();
```

---

# Output styling

Provide your outputs in code blocks for each file if needed, and provide the name for each. For example:

main.js

```javascript
console.log("Hello world!")
```

---

# Code readability guidelines:

## Variable naming

Name variables meaningfully. Don't make them too long or too short. For example:
 * Instead of using "dt", use variables such as "time_step", "timeStep", "delta_time", "deltaTime". Do not use things like "time_step_in_miliseconds", "time_step_for_simulation"
* Instead of using "vx", use variables such as "velX", "xVel", "velocityX", "xVelocity". Do not use things like "fluidVelocityX"
* Instead of using "Nx", use variables such as "sizeX", "gridSizeX", "gridWidth". Do not use things like "widthForGridInPixels"
* Instead of using "V", use variables such as "volume". Do not use things like "totalSimulationVolume"
* Instead of using "c", use variables such as "canvas". Do not use things like "htmlMainCanvas", "simulationCanvas"

## Comments

If a variable needs to be explained, you may add comments explaining what they do. Do not overpopulate the code with comments, but don't just remove them entirely. 

## Abbreviated names

Names that are often abbreviated are acceptable. The following examples are a few of the acceptable names:
* for (let i = 0; i < str.length; ++i)
* player.x = 5
* player.y += 3

## User preferences
* The user would like you to use double quotes instead of single quotes
* The user is ok with `ctx` as a variable name, like this: `const ctx = canvas.getContext("2d")`
* The user does not like extra space on one-line JSON. Instead of `{ x: 0, y: 0 }`, use `{x: 0, y: 0}`
* The user would like you to add comments explaining how the fluid simulation works. The user does not understand how a particle based FLIP simulation works. 
* The user understands javascript, html, and css, so there is no need to explain what the code does.


---

# implementation.md

The steps to be used when creating the fluid simulation is given in implementation.md. You are not required to strictly follow implementation.md. eg. on step 2, you should rename the variables "u", "v", "Nx", "Ny" and others. If examples are given, they are not required to be copied exactly as written. 

---

# Directions

Apply changes from step 2 (Grid (staggered MAC grid) & data structures). Output looks good, but the UI is partially blocking the text on the canvas.

Do NOT move to any future steps yet. Provide your outputs with the file names and code block. Tell me the expected output when you are done. If revising files, provide the ENTIRE file instead of telling me what to edit. 
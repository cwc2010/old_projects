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
const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");

const app = express();

// Serve static files
app.use(express.static("public"));

// Ports
const HTTP_PORT = 3000;     // HTTP (redirects to HTTPS)
const HTTPS_PORT = 3443;    // HTTPS (actual app)

// Load SSL certs (generated with mkcert; see steps below)
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, "certs", "key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "certs", "cert.pem")),
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
  console.log("HTTPS hosting on:");
  printAddresses("https", HTTPS_PORT);
});

// Create an HTTP server that redirects to HTTPS
const redirectApp = express();
redirectApp.enable("trust proxy");
redirectApp.use((req, res) => {
  const host = (req.headers.host || "").split(":")[0];
  return res.redirect(301, `https://${host}:${HTTPS_PORT}${req.url}`);
});

const httpServer = http.createServer(redirectApp);

// Start HTTP
httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP on :${HTTP_PORT} (redirecting -> HTTPS :${HTTPS_PORT})`);
  printAddresses("http", HTTP_PORT);
});

function printAddresses(proto, port) {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4") {
        console.log(`${proto}://${net.address}:${port}`);
      }
    }
  }
  console.log(`${proto}://localhost:${port}`);
}
```

public/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>FLIP Water – Step 4 (Main Loop)</title>
  <link rel="stylesheet" href="./index.css" />
</head>
<body>
  <!-- Fullscreen canvas -->
  <canvas id="canvas" aria-label="FLIP water simulation canvas"></canvas>

  <!-- Overlay UI (top-right so it doesn't block the canvas title text) -->
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
  FLIP (Fluid-Implicit Particle) – orientation
  --------------------------------------------
  Particles carry momentum; a staggered (MAC) grid enforces incompressibility.
  Per fixed sub-step (this is Step 4: the main loop is now live):

    1) Zero grid accumulators (face velocities, masses, pressure, occupancy)
    2) P2G: transfer particle velocities -> face-centered grid with bilinear weights
       - also accumulate per-cell occupancy (for free-surface classification)
    3) Normalize grid face velocities by accumulated mass
    4) Add external acceleration (gravity vector) to grid face velocities
    5) Save a copy of grid velocities (Prev) for FLIP delta
    6) Pressure projection (Jacobi): make grid velocity field divergence-free
       - free-surface: cells without particles act like air (p=0 boundary)
       - solid walls: zero normal velocity at domain edges
    7) G2P (FLIP): sample grid velocity change and add to particle velocities
       - optional tiny PIC blend for stability (e.g. 2%)
    8) Advect particles; collide with solids (clamp, kill normal velocity)
    9) Render particles (simple debug draw; crisp surface comes later)

  We strictly conserve "mass" by never creating/destroying particles.
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

// Animation and time-stepping
let isPaused = false;
let rafId = 0;
let lastFrameTime = 0;
let timeAccumulator = 0;
const fixedTimeStep = 1 / 60; // seconds

// Placeholder for future sensor flow; gravity defaults to down
const gravity = {x: 0, y: 900}; // px/s^2; later steps will drive this from sensors/mouse
let sensorsEnabled = false;

/* ------------------------------
   Grid & data structures (MAC)
   ------------------------------ */
let gridWidth = 0;   // cells in X
let gridHeight = 0;  // cells in Y
let cellSize = 6;    // CSS pixels per cell
let invCellSize = 1 / 6;

// Face-centered grid velocities and their "previous" copies (for FLIP delta)
let xFaceVelocity = null;      // size: (gridWidth+1) * gridHeight
let yFaceVelocity = null;      // size: gridWidth * (gridHeight+1)
let xFaceVelocityPrev = null;  // same as xFaceVelocity
let yFaceVelocityPrev = null;  // same as yFaceVelocity

// Mass accumulators for P2G normalization
let xFaceMass = null;          // same size as xFaceVelocity
let yFaceMass = null;          // same size as yFaceVelocity

// Cell-centered arrays
let pressure = null;           // size: gridWidth * gridHeight
let pressureNext = null;       // scratch for Jacobi
let divergence = null;         // -div(V)
let isFluidCell = null;        // Uint8Array flags (1=fluid, 0=air)
let cellParticleCount = null;  // occupancy for surface/solve

// Indexing helpers (flat indices into typed arrays)
function cellIndex(i, j) { return i + j * gridWidth; }
function xFaceIndex(i, j) { return i + j * (gridWidth + 1); }
function yFaceIndex(i, j) { return i + j * gridWidth; }

/* ------------------------------
   Particles & volumes (conserved)
   ------------------------------ */
let particlesPerCellInit = 6; // auto-picked; 4–8 recommended
let particleVolume = 0;       // area represented by one particle
let totalVolume = 0;          // total area represented by all particles
let particlesCount = 0;       // fixed after init

let particlePosX = new Float32Array(0);
let particlePosY = new Float32Array(0);
let particleVelX = new Float32Array(0);
let particleVelY = new Float32Array(0);

// Small PIC blend to damp noise (0 = pure FLIP)
let picBlend = 0.02;

// Pressure solver iterations (Jacobi)
let jacobiIterations = 60;

/* ------------------------------
   Helpers
   ------------------------------ */
function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function chooseParticlesPerCell() {
  const small = viewWidth <= 820 || viewHeight <= 700 || (window.devicePixelRatio || 1) > 2;
  return small ? 4 : 6;
}
function chooseCellSize() {
  const approxAcross = Math.max(100, Math.min(160, Math.round(viewWidth / 8)));
  const px = Math.round(viewWidth / approxAcross);
  return Math.max(4, Math.min(16, px));
}
function chooseJacobiIterations() {
  const dpr = window.devicePixelRatio || 1;
  const cells = gridWidth * gridHeight;
  if (dpr > 2 || cells > 24000) return 40;
  if (cells > 36000) return 30;
  return 60; // desktop default
}

/* ------------------------------
   Allocation / initialization
   ------------------------------ */
function initializeParticles() {
  particlesPerCellInit = chooseParticlesPerCell();

  const fillFractionY = 0.55; // bottom 55% "tank"
  const fillRows = Math.max(1, Math.floor(gridHeight * fillFractionY));
  const startRow = Math.max(0, gridHeight - fillRows);
  const cellsInRegion = gridWidth * fillRows;
  particlesCount = cellsInRegion * particlesPerCellInit;

  particlePosX = new Float32Array(particlesCount);
  particlePosY = new Float32Array(particlesCount);
  particleVelX = new Float32Array(particlesCount);
  particleVelY = new Float32Array(particlesCount);

  const cellArea = cellSize * cellSize;
  particleVolume = cellArea / particlesPerCellInit;
  totalVolume = particleVolume * particlesCount;

  let p = 0;
  for (let j = startRow; j < gridHeight; j++) {
    const y0 = j * cellSize;
    for (let i = 0; i < gridWidth; i++) {
      const x0 = i * cellSize;
      for (let k = 0; k < particlesPerCellInit; k++) {
        const u = ((k + 0.5) % particlesPerCellInit) / particlesPerCellInit;
        const v = ((k * 3 + 0.5) % particlesPerCellInit) / particlesPerCellInit;
        const rx = (u + (Math.random() - 0.5) * 0.35) * cellSize;
        const ry = (v + (Math.random() - 0.5) * 0.35) * cellSize;

        particlePosX[p] = x0 + clamp(rx, 0.25, cellSize - 0.25);
        particlePosY[p] = y0 + clamp(ry, 0.25, cellSize - 0.25);
        particleVelX[p] = 0;
        particleVelY[p] = 0;
        p++;
      }
    }
  }
}

function zeroGrid() {
  xFaceVelocity.fill(0);
  yFaceVelocity.fill(0);
  xFaceVelocityPrev.fill(0);
  yFaceVelocityPrev.fill(0);
  xFaceMass.fill(0);
  yFaceMass.fill(0);
  pressure.fill(0);
  pressureNext.fill(0);
  divergence.fill(0);
  isFluidCell.fill(0);
  cellParticleCount.fill(0);
}

function rebuildGrid() {
  cellSize = chooseCellSize();
  invCellSize = 1 / cellSize;
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
  pressureNext = new Float32Array(cellCount);
  divergence = new Float32Array(cellCount);
  isFluidCell = new Uint8Array(cellCount);
  cellParticleCount = new Float32Array(cellCount);

  zeroGrid();
  initializeParticles();

  jacobiIterations = chooseJacobiIterations();
  setStatus("Grid & particles allocated");
}

/* ------------------------------
   MAC grid boundary conditions
   ------------------------------ */
function enforceBoundaryOnFaces() {
  // Vertical walls: x-face velocities at left/right are zero (no flow through walls)
  for (let j = 0; j < gridHeight; j++) {
    xFaceVelocity[xFaceIndex(0, j)] = 0;
    xFaceVelocity[xFaceIndex(gridWidth, j)] = 0;
  }
  // Horizontal walls: y-face velocities at bottom/top are zero
  for (let i = 0; i < gridWidth; i++) {
    yFaceVelocity[yFaceIndex(i, 0)] = 0;
    yFaceVelocity[yFaceIndex(i, gridHeight)] = 0;
  }
}

/* ------------------------------
   Particle ↔ Grid transfers
   ------------------------------ */
function p2gTransferAndOccupancy() {
  const particleMass = particleVolume; // ρ=1, mass=area
  const gw = gridWidth, gh = gridHeight;

  for (let p = 0; p < particlesCount; p++) {
    const x = particlePosX[p];
    const y = particlePosY[p];
    const vx = particleVelX[p];
    const vy = particleVelY[p];

    const gx = x * invCellSize;
    const gy = y * invCellSize;

    // Occupancy at cell centers (for free-surface classification)
    let ci = Math.floor(gx);
    let cj = Math.floor(gy);
    ci = clamp(ci, 0, gw - 1);
    cj = clamp(cj, 0, gh - 1);
    cellParticleCount[cellIndex(ci, cj)] += 1;

    // X-face (vertical faces at i, j+0.5)
    {
      const i0 = Math.floor(gx);
      const j0 = Math.floor(gy - 0.5);
      const fx = gx - i0;
      const fy = (gy - 0.5) - j0;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = (fx) * (1 - fy);
      const w01 = (1 - fx) * (fy);
      const w11 = (fx) * (fy);

      const i1 = i0 + 1;
      const j1 = j0 + 1;

      if (i0 >= 0 && i0 <= gw && j0 >= 0 && j0 < gh) {
        const idx = xFaceIndex(i0, j0);
        xFaceVelocity[idx] += vx * w00 * particleMass;
        xFaceMass[idx] += w00 * particleMass;
      }
      if (i1 >= 0 && i1 <= gw && j0 >= 0 && j0 < gh) {
        const idx = xFaceIndex(i1, j0);
        xFaceVelocity[idx] += vx * w10 * particleMass;
        xFaceMass[idx] += w10 * particleMass;
      }
      if (i0 >= 0 && i0 <= gw && j1 >= 0 && j1 < gh) {
        const idx = xFaceIndex(i0, j1);
        xFaceVelocity[idx] += vx * w01 * particleMass;
        xFaceMass[idx] += w01 * particleMass;
      }
      if (i1 >= 0 && i1 <= gw && j1 >= 0 && j1 < gh) {
        const idx = xFaceIndex(i1, j1);
        xFaceVelocity[idx] += vx * w11 * particleMass;
        xFaceMass[idx] += w11 * particleMass;
      }
    }

    // Y-face (horizontal faces at i+0.5, j)
    {
      const i0 = Math.floor(gx - 0.5);
      const j0 = Math.floor(gy);
      const fx = (gx - 0.5) - i0;
      const fy = (gy) - j0;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = (fx) * (1 - fy);
      const w01 = (1 - fx) * (fy);
      const w11 = (fx) * (fy);

      const i1 = i0 + 1;
      const j1 = j0 + 1;

      if (i0 >= 0 && i0 < gw && j0 >= 0 && j0 <= gh) {
        const idx = yFaceIndex(i0, j0);
        yFaceVelocity[idx] += vy * w00 * particleMass;
        yFaceMass[idx] += w00 * particleMass;
      }
      if (i1 >= 0 && i1 < gw && j0 >= 0 && j0 <= gh) {
        const idx = yFaceIndex(i1, j0);
        yFaceVelocity[idx] += vy * w10 * particleMass;
        yFaceMass[idx] += w10 * particleMass;
      }
      if (i0 >= 0 && i0 < gw && j1 >= 0 && j1 <= gh) {
        const idx = yFaceIndex(i0, j1);
        yFaceVelocity[idx] += vy * w01 * particleMass;
        yFaceMass[idx] += w01 * particleMass;
      }
      if (i1 >= 0 && i1 < gw && j1 >= 0 && j1 <= gh) {
        const idx = yFaceIndex(i1, j1);
        yFaceVelocity[idx] += vy * w11 * particleMass;
        yFaceMass[idx] += w11 * particleMass;
      }
    }
  }

  // Normalize faces by accumulated mass to get average velocity
  for (let f = 0; f < xFaceVelocity.length; f++) {
    const m = xFaceMass[f];
    xFaceVelocity[f] = m > 0 ? (xFaceVelocity[f] / m) : 0;
  }
  for (let f = 0; f < yFaceVelocity.length; f++) {
    const m = yFaceMass[f];
    yFaceVelocity[f] = m > 0 ? (yFaceVelocity[f] / m) : 0;
  }
}

function classifyFluidCells() {
  // Simple binary classification: any particle presence -> fluid
  const count = gridWidth * gridHeight;
  for (let c = 0; c < count; c++) {
    isFluidCell[c] = cellParticleCount[c] > 0 ? 1 : 0;
  }
}

/* ------------------------------
   Pressure projection (Jacobi)
   ------------------------------ */
function buildDivergence() {
  const invDx = invCellSize;

  for (let j = 0; j < gridHeight; j++) {
    for (let i = 0; i < gridWidth; i++) {
      const idx = cellIndex(i, j);
      if (!isFluidCell[idx]) {
        divergence[idx] = 0;
        continue;
      }

      const uR = xFaceVelocity[xFaceIndex(i + 1, j)];
      const uL = xFaceVelocity[xFaceIndex(i, j)];
      const vT = yFaceVelocity[yFaceIndex(i, j + 1)];
      const vB = yFaceVelocity[yFaceIndex(i, j)];
      const div = (uR - uL + vT - vB) * invDx;

      divergence[idx] = -div; // RHS b = -div
    }
  }
}

function solvePressureJacobi(iterations) {
  const h2 = cellSize * cellSize;

  pressure.fill(0);
  pressureNext.fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    for (let j = 0; j < gridHeight; j++) {
      for (let i = 0; i < gridWidth; i++) {
        const idx = cellIndex(i, j);
        if (!isFluidCell[idx]) {
          pressureNext[idx] = 0;
          continue;
        }

        let sum = 0;
        let n = 0;

        // left neighbor
        if (i - 1 >= 0) {
          const li = cellIndex(i - 1, j);
          if (isFluidCell[li]) { sum += pressure[li]; }
          // include neighbor in count (air treated as p=0)
          n++;
        }
        // right neighbor
        if (i + 1 < gridWidth) {
          const ri = cellIndex(i + 1, j);
          if (isFluidCell[ri]) { sum += pressure[ri]; }
          n++;
        }
        // bottom neighbor
        if (j - 1 >= 0) {
          const bi = cellIndex(i, j - 1);
          if (isFluidCell[bi]) { sum += pressure[bi]; }
          n++;
        }
        // top neighbor
        if (j + 1 < gridHeight) {
          const ti = cellIndex(i, j + 1);
          if (isFluidCell[ti]) { sum += pressure[ti]; }
          n++;
        }

        // Solid (domain) boundaries are handled by missing neighbors (not counted)
        const b = divergence[idx];
        pressureNext[idx] = n > 0 ? (sum - b * h2) / n : 0;
      }
    }
    // swap
    const tmp = pressure;
    pressure = pressureNext;
    pressureNext = tmp;
  }
}

function subtractPressureGradient() {
  const invDx = invCellSize;

  // Update x-face velocities with pressure gradient
  for (let j = 0; j < gridHeight; j++) {
    for (let i = 1; i < gridWidth; i++) { // skip walls; they get zeroed later
      const leftCell = cellIndex(i - 1, j);
      const rightCell = cellIndex(i, j);
      const pL = isFluidCell[leftCell] ? pressure[leftCell] : 0;
      const pR = isFluidCell[rightCell] ? pressure[rightCell] : 0;
      const grad = (pR - pL) * invDx;
      const f = xFaceIndex(i, j);
      xFaceVelocity[f] -= grad;
    }
  }

  // Update y-face velocities with pressure gradient
  for (let j = 1; j < gridHeight; j++) { // skip walls; they get zeroed later
    for (let i = 0; i < gridWidth; i++) {
      const bottomCell = cellIndex(i, j - 1);
      const topCell = cellIndex(i, j);
      const pB = isFluidCell[bottomCell] ? pressure[bottomCell] : 0;
      const pT = isFluidCell[topCell] ? pressure[topCell] : 0;
      const grad = (pT - pB) * invDx;
      const f = yFaceIndex(i, j);
      yFaceVelocity[f] -= grad;
    }
  }

  // Reinforce no-flow through walls
  enforceBoundaryOnFaces();
}

/* ------------------------------
   Grid → Particle (FLIP update)
   ------------------------------ */

// Interpolate x-face velocity at (x,y)
function sampleXFaceVelocityAt(x, y, field) {
  const gx = x * invCellSize;
  const gy = y * invCellSize;

  let i0 = Math.floor(gx);
  let j0 = Math.floor(gy - 0.5);

  const fx = gx - i0;
  const fy = (gy - 0.5) - j0;

  const i1 = i0 + 1;
  const j1 = j0 + 1;

  let v = 0, wsum = 0;
  function add(i, j, w) {
    if (i >= 0 && i <= gridWidth && j >= 0 && j < gridHeight) {
      v += field[xFaceIndex(i, j)] * w;
      wsum += w;
    }
  }
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  add(i0, j0, w00);
  add(i1, j0, w10);
  add(i0, j1, w01);
  add(i1, j1, w11);

  return wsum > 0 ? v : 0;
}

// Interpolate y-face velocity at (x,y)
function sampleYFaceVelocityAt(x, y, field) {
  const gx = x * invCellSize;
  const gy = y * invCellSize;

  let i0 = Math.floor(gx - 0.5);
  let j0 = Math.floor(gy);

  const fx = (gx - 0.5) - i0;
  const fy = gy - j0;

  const i1 = i0 + 1;
  const j1 = j0 + 1;

  let v = 0, wsum = 0;
  function add(i, j, w) {
    if (i >= 0 && i < gridWidth && j >= 0 && j <= gridHeight) {
      v += field[yFaceIndex(i, j)] * w;
      wsum += w;
    }
  }
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  add(i0, j0, w00);
  add(i1, j0, w10);
  add(i0, j1, w01);
  add(i1, j1, w11);

  return wsum > 0 ? v : 0;
}

function sampleGridVelocity(vec, x, y, xField, yField) {
  vec.x = sampleXFaceVelocityAt(x, y, xField);
  vec.y = sampleYFaceVelocityAt(x, y, yField);
  return vec;
}

/* ------------------------------
   Particle advection & walls
   ------------------------------ */
function integrateParticles(dt) {
  const domainW = gridWidth * cellSize;
  const domainH = gridHeight * cellSize;
  const margin = 0.5; // keep particles strictly inside

  for (let p = 0; p < particlesCount; p++) {
    // Semi-implicit Euler (simple and stable enough here)
    particlePosX[p] += particleVelX[p] * dt;
    particlePosY[p] += particleVelY[p] * dt;

    // Collide with domain bounds: clamp inside and kill normal velocity
    if (particlePosX[p] < margin) {
      particlePosX[p] = margin;
      if (particleVelX[p] < 0) particleVelX[p] = 0;
      particleVelY[p] *= 0.99; // slight tangential damping
    } else if (particlePosX[p] > domainW - margin) {
      particlePosX[p] = domainW - margin;
      if (particleVelX[p] > 0) particleVelX[p] = 0;
      particleVelY[p] *= 0.99;
    }
    if (particlePosY[p] < margin) {
      particlePosY[p] = margin;
      if (particleVelY[p] < 0) particleVelY[p] = 0;
      particleVelX[p] *= 0.99;
    } else if (particlePosY[p] > domainH - margin) {
      particlePosY[p] = domainH - margin;
      if (particleVelY[p] > 0) particleVelY[p] = 0;
      particleVelX[p] *= 0.99;
    }
  }
}

/* ------------------------------
   Simulation step (FLIP loop)
   ------------------------------ */
const tmpVelNew = {x: 0, y: 0};
const tmpVelOld = {x: 0, y: 0};

function simulateStep(dt) {
  // 1) Zero grid accumulators
  xFaceVelocity.fill(0);
  yFaceVelocity.fill(0);
  xFaceMass.fill(0);
  yFaceMass.fill(0);
  pressure.fill(0);
  pressureNext.fill(0);
  divergence.fill(0);
  cellParticleCount.fill(0);
  isFluidCell.fill(0);

  // 2) P2G + occupancy
  p2gTransferAndOccupancy();

  // 3) Boundaries on faces
  enforceBoundaryOnFaces();

  // 4) External acceleration on grid velocities
  // Apply to all faces uniformly (global acceleration field)
  const ax = gravity.x * dt;
  const ay = gravity.y * dt;
  for (let f = 0; f < xFaceVelocity.length; f++) xFaceVelocity[f] += ax;
  for (let f = 0; f < yFaceVelocity.length; f++) yFaceVelocity[f] += ay;
  enforceBoundaryOnFaces();

  // 5) Save pre-projection velocities for FLIP delta
  xFaceVelocityPrev.set(xFaceVelocity);
  yFaceVelocityPrev.set(yFaceVelocity);

  // 6) Pressure projection
  classifyFluidCells();
  buildDivergence();
  solvePressureJacobi(jacobiIterations);
  subtractPressureGradient();

  // 7) G2P (FLIP with small PIC blend)
  for (let p = 0; p < particlesCount; p++) {
    const x = particlePosX[p];
    const y = particlePosY[p];

    const newGrid = sampleGridVelocity(tmpVelNew, x, y, xFaceVelocity, yFaceVelocity);
    const oldGrid = sampleGridVelocity(tmpVelOld, x, y, xFaceVelocityPrev, yFaceVelocityPrev);

    const dvx = newGrid.x - oldGrid.x;
    const dvy = newGrid.y - oldGrid.y;

    const vFlipX = particleVelX[p] + dvx;
    const vFlipY = particleVelY[p] + dvy;

    // PIC-Flip blend: mostly FLIP with a tiny PIC fraction for damping
    particleVelX[p] = vFlipX * (1 - picBlend) + newGrid.x * picBlend;
    particleVelY[p] = vFlipY * (1 - picBlend) + newGrid.y * picBlend;
  }

  // 8) Advect particles and handle walls
  integrateParticles(dt);
}

/* ------------------------------
   Rendering (debug particles)
   ------------------------------ */
function render() {
  ctx.clearRect(0, 0, viewWidth, viewHeight);

  // Draw particles
  const dotSize = Math.max(1, Math.floor(cellSize * 0.25));
  const maxDots = 30000; // perf cap
  const stride = Math.max(1, Math.floor(particlesCount / maxDots));
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "rgba(110, 170, 255, 0.95)";
  for (let p = 0; p < particlesCount; p += stride) {
    const x = particlePosX[p];
    const y = particlePosY[p];
    ctx.fillRect(x - 0.5 * dotSize, y - 0.5 * dotSize, dotSize, dotSize);
  }
  ctx.restore();

  // Title/info badge (top-left)
  const badgeW = 680;
  const badgeH = 156;
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
  ctx.fillText("Step 4: Main loop live (P2G → gravity → projection → G2P → advection)", 36, 86);

  ctx.fillStyle = "rgba(195,215,255,0.9)";
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText(
    `Grid: ${gridWidth} × ${gridHeight} • Cell: ${cellSize}px • Particles: ${particlesCount} (ppc: ${particlesPerCellInit})`,
    36, 106
  );
  ctx.fillText(
    `Jacobi: ${jacobiIterations} iters • FLIP/PIC: ${(100*(1-picBlend)).toFixed(0)}% / ${(100*picBlend).toFixed(0)}% • Gravity: (${gravity.x.toFixed(0)}, ${gravity.y.toFixed(0)})`,
    36, 124
  );
  ctx.fillText(
    `Volume conserved: particleVolume=${particleVolume.toFixed(2)} • totalVolume≈${totalVolume.toFixed(0)} (constant)`,
    36, 142
  );
  ctx.restore();

  // Footer hint
  const hint = sensorsEnabled ? "Sensors ready (logic coming later)" : "Click Enable Sensors (permission only; logic later)";
  ctx.save();
  ctx.fillStyle = "rgba(200, 210, 230, 0.75)";
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  const textWidth = ctx.measureText(hint).width;
  ctx.fillText(hint, Math.max(16, viewWidth - textWidth - 16), viewHeight - 16);
  ctx.restore();
}

/* ------------------------------
   Canvas sizing & loop scaffold
   ------------------------------ */
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

  rebuildGrid();
  timeAccumulator = 0;
  render();
}
window.addEventListener("resize", resizeCanvas);

function startLoop() {
  cancelLoop();
  isPaused = false;
  pauseBtn.setAttribute("aria-pressed", "false");
  lastFrameTime = performance.now();
  const tick = (now) => {
    rafId = requestAnimationFrame(tick);
    if (isPaused) return;

    const deltaTime = Math.min(0.25, (now - lastFrameTime) / 1000); // clamp
    lastFrameTime = now;

    timeAccumulator += deltaTime;
    // Fixed substeps for stability
    let steps = 0;
    while (timeAccumulator >= fixedTimeStep && steps < 5) {
      simulateStep(fixedTimeStep);
      timeAccumulator -= fixedTimeStep;
      steps++;
    }

    render();
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
   UI interactions
   ------------------------------ */
enableSensorsBtn.addEventListener("click", () => {
  sensorsEnabled = true;
  enableSensorsBtn.textContent = "Sensors Enabled";
  enableSensorsBtn.disabled = true;
  setStatus("Gesture captured. Sensor permission flow will be added in a later step.");
});

pauseBtn.addEventListener("click", () => {
  isPaused = !isPaused;
  pauseBtn.setAttribute("aria-pressed", isPaused ? "true" : "false");
  pauseBtn.textContent = isPaused ? "Resume" : "Pause";
  setStatus(isPaused ? "Paused" : "Running");
});

resetBtn.addEventListener("click", () => {
  initializeParticles(); // fixed count; preserves mass
  setStatus("Particles re-initialized (volume conserved).");
});

// Status helper
function setStatus(msg) {
  statusText.textContent =
    `${msg} • DPR: ${dprText.textContent} • Grid: ${gridWidth}×${gridHeight} • Cell: ${cellSize}px • Particles: ${particlesCount}`;
}

// Init
resizeCanvas();
startLoop();
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

Apply changes from step 5 (Particle → Grid transfer (P2G) details). Code runs as expected.

Do NOT move to any future steps yet. Provide your outputs with the file names and code block. Tell me the expected output when you are done. If revising files, provide the ENTIRE file instead of telling me what to edit. 
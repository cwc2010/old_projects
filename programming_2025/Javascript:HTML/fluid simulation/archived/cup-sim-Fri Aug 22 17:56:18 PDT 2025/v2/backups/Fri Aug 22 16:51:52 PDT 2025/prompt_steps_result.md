Nice — that’s a great spec. Below I’ll give you a clear, numbered, developer-focused plan to implement a CPU FLIP fluid sim in plain HTML/JS/CSS (no WebGL). Each step contains enough detail, formulas, and code snippets to get you coding immediately. I’ll call out important gotchas (mass conservation, iOS sensor permissions, performance, rendering choices) and provide suggested parameter values.

---

# Overview (one-sentence)

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

---

### 20) Next steps & extension ideas

* Add surface tension via curvature-based forces.
* Add obstacles (solid polygons) by marking grid solid cells and enforcing no-penetration.
* Replace Jacobi with PCG / multigrid for real-time higher-res solves.
* Export screenshots or recorded frames.

---

If you’d like I can:

* generate a compact starter project (full HTML+JS file) showing a minimal working FLIP with Jacobi pressure and mouse fallback gravity (skeleton you can run and iterate on), or
* produce a focused snippet: marching squares implementation, P2G/G2P bilinear interpolation functions, or the iOS permission UI handler.

Which of those would you like me to produce now? (I can drop a single-file runnable example next — it’ll be CPU-only and intentionally small so you can iterate.)

"use strict";

/*
  FLIP fluid simulation (Particle-In-Cell + FLIP)
  - Full-screen canvas
  - Gravity pushing fluid downward
  - Focus on fluid behavior, not rendering quality
  - JS uses double quotes for strings
*/

/* ---------- Config / adaptive tuning ---------- */

const TARGET_FPS = 60;
const MAX_DT = 1 / 30; // clamp dt for stability
const GRAVITY = 1200.0; // px / s^2 (strong to be visually clear)
const PIC_BLEND = 0.05; // 0..1 ; small means mostly FLIP
const PRESSURE_ITERS = 18; // Jacobi iterations
const CELL_SIZE_MIN = 8;
const CELL_SIZE_MAX = 18;
const PARTICLE_JITTER = 0.25; // tiny jitter to avoid perfect grid

/* ---------- Canvas & resize ---------- */

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let width = 0;
let height = 0;
let dpr = Math.max(1, window.devicePixelRatio || 1);

function resize() {
  // Fit canvas to CSS pixels but use device pixel ratio for crispness
  width = Math.max(2, window.innerWidth | 0);
  height = Math.max(2, window.innerHeight | 0);
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  setupGrid();
  initParticlesIfNeeded();
}
window.addEventListener("resize", resize, { passive: true });

/* ---------- Grid & arrays (MAC grid) ---------- */

let cellSize = 12; // will be set adaptively
let gridW = 0;
let gridH = 0;
let invCell = 0.0;

// Staggered MAC:
// u: (gridW + 1) x gridH  -> horizontal velocity (x) at vertical faces
// v: gridW x (gridH + 1)  -> vertical velocity (y) at horizontal faces
let u = null;
let v = null;
let uOld = null;
let vOld = null;
let uWeight = null;
let vWeight = null;

// Pressure at cell centers: gridW x gridH
let pressure = null;
let pressureTmp = null;
let divergence = null;

function setupGrid() {
  // adapt cellSize for performance based on larger dimension
  const maxDim = Math.max(width, height);
  // choose cell size so grid around 48..140 cells on long side, clamp
  const idealCells = Math.max(48, Math.min(140, Math.round(maxDim / 9)));
  const candidate = Math.round(maxDim / idealCells);
  cellSize = Math.max(CELL_SIZE_MIN, Math.min(CELL_SIZE_MAX, candidate));
  invCell = 1.0 / cellSize;
  gridW = Math.max(3, Math.floor(width / cellSize));
  gridH = Math.max(3, Math.floor(height / cellSize));

  // allocate typed arrays
  u = new Float32Array((gridW + 1) * gridH);
  v = new Float32Array(gridW * (gridH + 1));
  uOld = new Float32Array(u.length);
  vOld = new Float32Array(v.length);
  uWeight = new Float32Array(u.length);
  vWeight = new Float32Array(v.length);

  pressure = new Float32Array(gridW * gridH);
  pressureTmp = new Float32Array(gridW * gridH);
  divergence = new Float32Array(gridW * gridH);
}

/* ---------- Particle set ---------- */

let particles = {
  x: null,
  y: null,
  vx: null,
  vy: null,
  count: 0,
  capacity: 0
};

function initParticlesIfNeeded() {
  // If grid changed significantly we recreate particles to fill screen
  // Particle spacing tied to cell size: fewer particles for large cells
  const spacing = Math.max(0.5 * cellSize, Math.min(0.9 * cellSize, cellSize * 0.65));
  const cols = Math.floor(width / spacing);
  const rows = Math.floor(height / spacing);
  const count = Math.min(50000, Math.max(800, cols * rows)); // clamp

  particles.capacity = count;
  particles.count = count;
  particles.x = new Float32Array(count);
  particles.y = new Float32Array(count);
  particles.vx = new Float32Array(count);
  particles.vy = new Float32Array(count);

  // Fill entire screen with fluid particles (user requested filled)
  let idx = 0;
  const margin = spacing * 0.5;
  for (let j = 0; j < rows; j++) {
    const py = margin + j * spacing;
    for (let i = 0; i < cols; i++) {
      if (idx >= count) break;
      const px = margin + i * spacing;
      // jitter slightly so particles are not perfectly regular
      particles.x[idx] = Math.min(width - 1, Math.max(1, px + (Math.random() - 0.5) * PARTICLE_JITTER * spacing));
      particles.y[idx] = Math.min(height - 1, Math.max(1, py + (Math.random() - 0.5) * PARTICLE_JITTER * spacing));
      particles.vx[idx] = 0;
      particles.vy[idx] = 0;
      idx++;
    }
    if (idx >= count) break;
  }
  particles.count = idx;
}

/* ---------- Utility index helpers ---------- */

function uIndex(i, j) {
  // i in [0..gridW], j in [0..gridH-1]
  return j * (gridW + 1) + i;
}
function vIndex(i, j) {
  // i in [0..gridW-1], j in [0..gridH]
  return j * gridW + i;
}
function pIndex(i, j) {
  return j * gridW + i;
}

/* ---------- Particle -> Grid (P2G) ---------- */

function clearGridWeights() {
  u.fill(0);
  v.fill(0);
  uWeight.fill(0);
  vWeight.fill(0);
  // pressure/divergence zeroed later
}

function accumulateToU(px, py, pvx, pvy, idx) {
  // u located at x = i*cellSize, y = (j+0.5)*cellSize
  const fx = px * invCell;
  const fy = py * invCell - 0.5;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;

  for (let j = 0; j <= 1; j++) {
    const wj = j === 0 ? (1 - ty) : ty;
    const jj = j0 + j;
    if (jj < 0 || jj >= gridH) continue;
    for (let i = 0; i <= 1; i++) {
      const wi = i === 0 ? (1 - tx) : tx;
      const ii = i0 + i;
      if (ii < 0 || ii > gridW) continue;
      const w = wi * wj;
      const id = uIndex(ii, jj);
      u[id] += pvx * w;
      uWeight[id] += w;
    }
  }
}

function accumulateToV(px, py, pvx, pvy, idx) {
  // v located at x = (i+0.5)*cellSize, y = j*cellSize
  const fx = px * invCell - 0.5;
  const fy = py * invCell;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;

  for (let j = 0; j <= 1; j++) {
    const wj = j === 0 ? (1 - ty) : ty;
    const jj = j0 + j;
    if (jj < 0 || jj > gridH) continue;
    for (let i = 0; i <= 1; i++) {
      const wi = i === 0 ? (1 - tx) : tx;
      const ii = i0 + i;
      if (ii < 0 || ii >= gridW) continue;
      const w = wi * wj;
      const id = vIndex(ii, jj);
      v[id] += pvy * w;
      vWeight[id] += w;
    }
  }
}

function particlesToGrid() {
  clearGridWeights();
  // accumulate momentum to grid faces
  const pxArr = particles.x;
  const pyArr = particles.y;
  const vxArr = particles.vx;
  const vyArr = particles.vy;
  const n = particles.count;
  for (let p = 0; p < n; p++) {
    const px = pxArr[p];
    const py = pyArr[p];
    const pvx = vxArr[p];
    const pvy = vyArr[p];
    accumulateToU(px, py, pvx, pvy, p);
    accumulateToV(px, py, pvx, pvy, p);
  }

  // normalize momentum -> velocities (divide by weight)
  for (let j = 0; j < gridH; j++) {
    for (let i = 0; i <= gridW; i++) {
      const id = uIndex(i, j);
      const w = uWeight[id];
      if (w > 0.0001) {
        u[id] = u[id] / w;
      } else {
        u[id] = 0;
      }
    }
  }
  for (let j = 0; j <= gridH; j++) {
    for (let i = 0; i < gridW; i++) {
      const id = vIndex(i, j);
      const w = vWeight[id];
      if (w > 0.0001) {
        v[id] = v[id] / w;
      } else {
        v[id] = 0;
      }
    }
  }
}

/* ---------- Add gravity & store old grid velocities ---------- */

function addForcesAndSaveOld(dt) {
  // copy into old arrays for FLIP delta
  uOld.set(u);
  vOld.set(v);

  // add gravity to v
  const g = GRAVITY * dt;
  for (let i = 0, len = v.length; i < len; i++) {
    v[i] += g;
  }
}

/* ---------- Boundary conditions on grid faces ---------- */

function applyBoundaryConditions() {
  // Walls on left/right: set u at i=0 and i=gridW to 0
  for (let j = 0; j < gridH; j++) {
    u[uIndex(0, j)] = 0;
    u[uIndex(gridW, j)] = 0;
  }
  // Walls on top/bottom: set v at j=0 and j=gridH to 0
  for (let i = 0; i < gridW; i++) {
    v[vIndex(i, 0)] = 0;
    v[vIndex(i, gridH)] = 0;
  }
}

/* ---------- Pressure solve (Jacobi) ---------- */

function computeDivergence() {
  // divergence at cell centers
  const dx = cellSize;
  const invDx = 1.0 / dx;
  for (let j = 0; j < gridH; j++) {
    for (let i = 0; i < gridW; i++) {
      const ur = u[uIndex(i + 1, j)];
      const ul = u[uIndex(i, j)];
      const ut = v[vIndex(i, j + 1)];
      const ub = v[vIndex(i, j)];
      const d = (ur - ul + ut - ub) * invDx;
      divergence[pIndex(i, j)] = d;
      pressure[pIndex(i, j)] = 0.0;
    }
  }
}

function jacobiPressureSolve() {
  // Solve Laplacian(p) = divergence using Jacobi
  const dx2 = cellSize * cellSize;
  for (let iter = 0; iter < PRESSURE_ITERS; iter++) {
    for (let j = 0; j < gridH; j++) {
      for (let i = 0; i < gridW; i++) {
        const idx = pIndex(i, j);
        let sum = 0.0;
        if (i > 0) sum += pressure[pIndex(i - 1, j)];
        if (i + 1 < gridW) sum += pressure[pIndex(i + 1, j)];
        if (j > 0) sum += pressure[pIndex(i, j - 1)];
        if (j + 1 < gridH) sum += pressure[pIndex(i, j + 1)];
        // p_new = (neighbors - divergence * dx^2) / 4
        pressureTmp[idx] = (sum - divergence[idx] * dx2) * 0.25;
      }
    }
    // swap buffers
    const tmp = pressure;
    pressure = pressureTmp;
    pressureTmp = tmp;
  }
}

/* ---------- Subtract pressure gradient from velocities ---------- */

function applyPressureGradient() {
  const invDx = 1.0 / cellSize;
  // u faces
  for (let j = 0; j < gridH; j++) {
    for (let i = 1; i < gridW; i++) {
      // left cell (i-1), right cell (i)
      const pL = pressure[pIndex(i - 1, j)];
      const pR = pressure[pIndex(i, j)];
      const id = uIndex(i, j);
      u[id] -= (pR - pL) * invDx;
    }
    // boundary faces remain zero
  }
  // v faces
  for (let j = 1; j < gridH; j++) {
    for (let i = 0; i < gridW; i++) {
      const pB = pressure[pIndex(i, j - 1)];
      const pT = pressure[pIndex(i, j)];
      const id = vIndex(i, j);
      v[id] -= (pT - pB) * invDx;
    }
  }
}

/* ---------- Grid to Particle (FLIP + PIC blending) ---------- */

function sampleGridVelocity(px, py, out) {
  // sample MAC grid at particle position -> out[0]=vx, out[1]=vy
  // Sample u (x) at (i*dx, (j+0.5)dx)
  const fxU = px * invCell;
  const fyU = py * invCell - 0.5;
  const i0u = Math.floor(fxU);
  const j0u = Math.floor(fyU);
  const tx = fxU - i0u;
  const ty = fyU - j0u;
  let vx = 0;
  for (let j = 0; j <= 1; j++) {
    const wj = j === 0 ? (1 - ty) : ty;
    const jj = j0u + j;
    if (jj < 0 || jj >= gridH) continue;
    for (let i = 0; i <= 1; i++) {
      const wi = i === 0 ? (1 - tx) : tx;
      const ii = i0u + i;
      if (ii < 0 || ii > gridW) continue;
      const w = wi * wj;
      vx += u[uIndex(ii, jj)] * w;
    }
  }

  // Sample v (y) at ((i+0.5)dx, j*dx)
  const fxV = px * invCell - 0.5;
  const fyV = py * invCell;
  const i0v = Math.floor(fxV);
  const j0v = Math.floor(fyV);
  const txv = fxV - i0v;
  const tyv = fyV - j0v;
  let vy = 0;
  for (let j = 0; j <= 1; j++) {
    const wj = j === 0 ? (1 - tyv) : tyv;
    const jj = j0v + j;
    if (jj < 0 || jj > gridH) continue;
    for (let i = 0; i <= 1; i++) {
      const wi = i === 0 ? (1 - txv) : txv;
      const ii = i0v + i;
      if (ii < 0 || ii >= gridW) continue;
      const w = wi * wj;
      vy += v[vIndex(ii, jj)] * w;
    }
  }

  out[0] = vx;
  out[1] = vy;
}

function sampleOldGridDelta(px, py, out) {
  // sample (u - uOld) and (v - vOld) at particle pos
  const fxU = px * invCell;
  const fyU = py * invCell - 0.5;
  const i0u = Math.floor(fxU);
  const j0u = Math.floor(fyU);
  const tx = fxU - i0u;
  const ty = fyU - j0u;
  let dvx = 0;
  for (let j = 0; j <= 1; j++) {
    const wj = j === 0 ? (1 - ty) : ty;
    const jj = j0u + j;
    if (jj < 0 || jj >= gridH) continue;
    for (let i = 0; i <= 1; i++) {
      const wi = i === 0 ? (1 - tx) : tx;
      const ii = i0u + i;
      if (ii < 0 || ii > gridW) continue;
      const w = wi * wj;
      dvx += (u[uIndex(ii, jj)] - uOld[uIndex(ii, jj)]) * w;
    }
  }

  const fxV = px * invCell - 0.5;
  const fyV = py * invCell;
  const i0v = Math.floor(fxV);
  const j0v = Math.floor(fyV);
  const txv = fxV - i0v;
  const tyv = fyV - j0v;
  let dvy = 0;
  for (let j = 0; j <= 1; j++) {
    const wj = j === 0 ? (1 - tyv) : tyv;
    const jj = j0v + j;
    if (jj < 0 || jj > gridH) continue;
    for (let i = 0; i <= 1; i++) {
      const wi = i === 0 ? (1 - txv) : txv;
      const ii = i0v + i;
      if (ii < 0 || ii >= gridW) continue;
      const w = wi * wj;
      dvy += (v[vIndex(ii, jj)] - vOld[vIndex(ii, jj)]) * w;
    }
  }

  out[0] = dvx;
  out[1] = dvy;
}

function updateParticlesFromGrid(dt) {
  const pxArr = particles.x;
  const pyArr = particles.y;
  const vxArr = particles.vx;
  const vyArr = particles.vy;
  const n = particles.count;
  const tmpSample = [0, 0];
  const tmpDelta = [0, 0];

  for (let p = 0; p < n; p++) {
    const px = pxArr[p];
    const py = pyArr[p];

    // FLIP: apply grid delta to particle velocity
    sampleOldGridDelta(px, py, tmpDelta);
    vxArr[p] += tmpDelta[0];
    vyArr[p] += tmpDelta[1];

    // PIC blending: small interpolation toward grid velocities for stability
    sampleGridVelocity(px, py, tmpSample);
    vxArr[p] = (1 - PIC_BLEND) * vxArr[p] + PIC_BLEND * tmpSample[0];
    vyArr[p] = (1 - PIC_BLEND) * vyArr[p] + PIC_BLEND * tmpSample[1];

    // advect particle
    let nx = px + vxArr[p] * dt;
    let ny = py + vyArr[p] * dt;

    // simple collision with screen boundaries (bounce + damp)
    if (nx < 1) {
      nx = 1;
      vxArr[p] *= -0.3;
    } else if (nx > width - 1) {
      nx = width - 1;
      vxArr[p] *= -0.3;
    }
    if (ny < 1) {
      ny = 1;
      vyArr[p] *= -0.3;
    } else if (ny > height - 1) {
      ny = height - 1;
      vyArr[p] *= -0.3;
    }

    pxArr[p] = nx;
    pyArr[p] = ny;
  }
}

/* ---------- Main step ---------- */

let lastT = performance.now() / 1000;
let running = true;

function step() {
  const now = performance.now() / 1000;
  let dt = now - lastT;
  if (dt <= 0) {
    dt = 1 / TARGET_FPS;
  }
  // clamp dt (avoid huge time steps)
  dt = Math.min(dt, MAX_DT);
  lastT = now;

  // 1) Particle -> Grid
  particlesToGrid();

  // 2) Save old grid, add forces
  addForcesAndSaveOld(dt);

  // 3) boundary
  applyBoundaryConditions();

  // 4) pressure projection
  computeDivergence();
  jacobiPressureSolve();
  applyPressureGradient();

  // 5) boundary again (ensure)
  applyBoundaryConditions();

  // 6) Grid -> Particle (FLIP + PIC)
  updateParticlesFromGrid(dt);

  // 7) render
  render();

  if (running) {
    requestAnimationFrame(step);
  }
}

/* ---------- Rendering ---------- */

function render() {
  // clear with slight fade for nicer trails
  ctx.clearRect(0, 0, width, height);

  // Optionally draw a faint "liquid" background by drawing many semi-transparent particles.
  // We'll render particles as small circles; size adapts by cell size.
  const r = Math.max(0.6, Math.min(2.2, cellSize * 0.12));
  ctx.fillStyle = "rgba(110,170,255,0.95)";

  const px = particles.x;
  const py = particles.y;
  const n = particles.count;

  // batch draw using path for performance
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = px[i];
    const y = py[i];
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();

  // Optional: draw a subtle surface highlight by computing a coarse density field (cheap)
  // We'll approximate density by counting particles per grid cell and draw translucent overlay
  // This is cheap because grid is relatively small.
  const cellW = gridW;
  const cellH = gridH;
  const density = new Uint16Array(cellW * cellH);
  for (let p = 0; p < n; p++) {
    const cx = Math.floor(px[p] * invCell);
    const cy = Math.floor(py[p] * invCell);
    if (cx >= 0 && cx < cellW && cy >= 0 && cy < cellH) {
      density[cx + cy * cellW]++;
    }
  }
  // draw low-alpha rectangles where dense
  ctx.fillStyle = "rgba(20,40,80,0.08)";
  for (let j = 0; j < cellH; j++) {
    for (let i = 0; i < cellW; i++) {
      const d = density[i + j * cellW];
      if (d > 3) {
        const alpha = Math.min(0.18, (d / 10) * 0.06);
        ctx.fillStyle = "rgba(20,40,80," + alpha.toFixed(3) + ")";
        ctx.fillRect(i * cellSize, j * cellSize, cellSize, cellSize);
      }
    }
  }

  // small HUD: FPS-ish estimate (not required but useful)
  // (very lightweight)
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Particles: " + particles.count, 10, 18);
  ctx.fillText("Grid: " + gridW + " x " + gridH + " (cell=" + cellSize + "px)", 10, 34);
}

/* ---------- Interaction: add disturbance on pointer ---------- */

let pointerDown = false;
let lastPointer = null;

canvas.addEventListener("pointerdown", function (e) {
  pointerDown = true;
  lastPointer = { x: e.clientX, y: e.clientY };
  applySplat(e.clientX, e.clientY, 600);
});
canvas.addEventListener("pointermove", function (e) {
  if (!pointerDown) return;
  const dx = e.clientX - lastPointer.x;
  const dy = e.clientY - lastPointer.y;
  // apply a directional force
  applySplat(e.clientX, e.clientY, 50, dx * 30, dy * 30);
  lastPointer = { x: e.clientX, y: e.clientY };
});
window.addEventListener("pointerup", function () {
  pointerDown = false;
});

function applySplat(cx, cy, strength, fx = 0, fy = 0) {
  // find nearby particles and push them
  const r = Math.max(12, cellSize * 2);
  const r2 = r * r;
  const pxArr = particles.x;
  const pyArr = particles.y;
  const vxArr = particles.vx;
  const vyArr = particles.vy;
  const n = particles.count;
  for (let i = 0; i < n; i++) {
    const dx = pxArr[i] - cx;
    const dy = pyArr[i] - cy;
    const dist2 = dx * dx + dy * dy;
    if (dist2 < r2) {
      const k = (1 - Math.sqrt(dist2) / r) * (strength / 1000);
      vxArr[i] += dx * k + fx * 0.01;
      vyArr[i] += dy * k + fy * 0.01;
    }
  }
}

/* ---------- Startup ---------- */

resize();
initParticlesIfNeeded();
lastT = performance.now() / 1000;
requestAnimationFrame(step);

// expose a simple global to pause/resume via console if desired
window.flipSim = {
  pause: function () {
    running = false;
  },
  resume: function () {
    if (!running) {
      running = true;
      lastT = performance.now() / 1000;
      requestAnimationFrame(step);
    }
  }
};

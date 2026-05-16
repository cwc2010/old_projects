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
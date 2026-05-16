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
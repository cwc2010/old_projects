// ————————————————————————————————
// 1) Canvas setup - Full screen
// ————————————————————————————————
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Remove margins and scrollbars
document.body.style.margin = '0';
document.body.style.padding = '0';
document.body.style.overflow = 'hidden';
canvas.style.display = 'block';

// ————————————————————————————————
// Motion permission UI
// ————————————————————————————————
const overlay = document.getElementById('permissionOverlay');
const startBtn = document.getElementById('startBtn');
const statusEl = document.getElementById('status');

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

// ————————————————————————————————
// 2) Simulation parameters - Adaptive grid
// ————————————————————————————————
const targetCellSize = 10; // Approximate pixel size per cell
let gridSizeX = Math.floor(canvas.width / targetCellSize);
let gridSizeY = Math.floor(canvas.height / targetCellSize);
let cellSizeX = canvas.width / gridSizeX;
let cellSizeY = canvas.height / gridSizeY;

const dt = 0.1;
const velDiffCoef = 0.0;
// CHANGED: Turn off density diffusion to avoid "mist" fade
const densDiffCoef = 0.0;
const iterations = 20;

// Gravity/Accelerometer data
let gravityX = 0;
let gravityY = 9.8; // Default gravity pointing down
let hasAccelerometer = false;
let mouseControlled = false;

// ————————————————————————————————
// 3) Cell class representing each fluid cell
// ————————————————————————————————
class Cell {
  constructor() {
    this.density = 0;
    this.prevDensity = 0;
    this.velocityX = 0;
    this.prevVelocityX = 0;
    this.velocityY = 0;
    this.prevVelocityY = 0;
    this.pressure = 0;
    this.divergence = 0;
  }
}

// ————————————————————————————————
// 4) Create the simulation grid
// ————————————————————————————————
let grid;

function createGrid() {
  gridSizeX = Math.floor(canvas.width / targetCellSize);
  gridSizeY = Math.floor(canvas.height / targetCellSize);
  cellSizeX = canvas.width / gridSizeX;
  cellSizeY = canvas.height / gridSizeY;

  grid = Array.from({length: gridSizeX}, () =>
    Array.from({length: gridSizeY}, () => new Cell()));
}
createGrid();

// Recreate grid on resize
window.addEventListener('resize', () => {
  createGrid();
});

// ————————————————————————————————
// 5) Accelerometer/Gyroscope setup (permission by button)
// ————————————————————————————————
let motionListenersAttached = false;

function addMotionListeners() {
  if (motionListenersAttached) return;
  motionListenersAttached = true;

  let motionEventCount = 0;

  // Primary: devicemotion
  window.addEventListener('devicemotion', (event) => {
    const ag = event.accelerationIncludingGravity;
    if (ag && (ag.x !== null || ag.y !== null)) {
      if (!hasAccelerometer && motionEventCount > 1) {
        hasAccelerometer = true;
        setStatus('Accelerometer active. Tilt to control gravity.');
        // Optional: toast
        const notification = document.createElement('div');
        notification.textContent = 'Accelerometer active! Tilt device to control gravity.';
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 200, 0, 0.9);
          color: white;
          padding: 8px 14px;
          border-radius: 8px;
          z-index: 2000;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2500);
      }
      motionEventCount++;

      // Use accel including gravity as gravity vector
      gravityX = (ag.x || 0) * 3;
      gravityY = -(ag.y || 9.8) * 3;
    }
  }, { passive: true });

  // Desktop fallback: mouse controls gravity
  window.addEventListener('mousemove', (event) => {
    if (!hasAccelerometer) {
      mouseControlled = true;
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      gravityX = (event.clientX - centerX) / centerX * 20;
      gravityY = (event.clientY - centerY) / centerY * 20 + 9.8;
    }
  });
}

// Request permission (iOS); on other platforms this just attaches listeners
async function requestMotionPermission() {
  let granted = true;

  try {
    // iOS 13+ requires a user gesture + explicit permission
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      const res = await DeviceMotionEvent.requestPermission();
      granted = (res === 'granted');
    }

    // Some iOS versions also gate orientation behind a permission
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        await DeviceOrientationEvent.requestPermission();
      } catch {
        // ignore; orientation may still work
      }
    }
  } catch (err) {
    console.warn('Motion permission request failed:', err);
    granted = false;
  }

  addMotionListeners(); // attach regardless; events will only fire if allowed
  overlay.style.display = 'none';

  if (!granted) {
    setStatus('Permission denied or unavailable. Using mouse to control gravity.');
  }
}

startBtn.addEventListener('click', () => {
  // Must be called in a direct user gesture for iOS
  requestMotionPermission();
});

// ————————————————————————————————
// 6) Utility functions - Updated
// ————————————————————————————————
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function sample(field, x, y) {
  x = Math.max(0.5, Math.min(gridSizeX - 1.5, x));
  y = Math.max(0.5, Math.min(gridSizeY - 1.5, y));
  const i0 = x | 0, j0 = y | 0,
        i1 = i0 + 1, j1 = j0 + 1,
        sx = x - i0, sy = y - j0;
  return (
    grid[i0][j0][field] * (1 - sx) * (1 - sy) +
    grid[i1][j0][field] * sx * (1 - sy) +
    grid[i0][j1][field] * (1 - sx) * sy +
    grid[i1][j1][field] * sx * sy
  );
}

function stencilMinMax(field, x, y) {
  x = clamp(x, 0.5, gridSizeX - 1.5);
  y = clamp(y, 0.5, gridSizeY - 1.5);
  const i0 = x | 0, j0 = y | 0,
        i1 = i0 + 1, j1 = j0 + 1;

  const v00 = grid[i0][j0][field];
  const v10 = grid[i1][j0][field];
  const v01 = grid[i0][j1][field];
  const v11 = grid[i1][j1][field];

  let minVal = v00, maxVal = v00;
  if (v10 < minVal) minVal = v10; if (v10 > maxVal) maxVal = v10;
  if (v01 < minVal) minVal = v01; if (v01 > maxVal) maxVal = v01;
  if (v11 < minVal) minVal = v11; if (v11 > maxVal) maxVal = v11;
  return [minVal, maxVal];
}

function swap(field) {
  for (let i = 0; i < gridSizeX; i++) {
    for (let j = 0; j < gridSizeY; j++) {
      const cell = grid[i][j];
      const temp = cell[field];
      cell[field] = cell["prev" + field.charAt(0).toUpperCase() + field.slice(1)];
      cell["prev" + field.charAt(0).toUpperCase() + field.slice(1)] = temp;
    }
  }
}

// ————————————————————————————————
// 7) Diffusion - unchanged (coef is 0 now)
// ————————————————————————————————
function diffuse(field, diffCoef) {
  if (diffCoef === 0) return;
  const a = diffCoef * dt;
  for (let k = 0; k < iterations; k++) {
    for (let i = 1; i < gridSizeX - 1; i++) {
      for (let j = 1; j < gridSizeY - 1; j++) {
        const cell = grid[i][j];
        const sumNeighbors =
          grid[i - 1][j][field] + grid[i + 1][j][field] +
          grid[i][j - 1][field] + grid[i][j + 1][field];
        const prev = "prev" + field.charAt(0).toUpperCase() + field.slice(1);
        cell[field] = (cell[prev] + a * sumNeighbors) / (1 + 4 * a);
      }
    }
  }
}

// ————————————————————————————————
// 8) Advection
// ————————————————————————————————
function advect(field) {
  const prevField = "prev" + field.charAt(0).toUpperCase() + field.slice(1);
  for (let i = 1; i < gridSizeX - 1; i++) {
    for (let j = 1; j < gridSizeY - 1; j++) {
      const cell = grid[i][j];
      const x = i - dt * cell.prevVelocityX;
      const y = j - dt * cell.prevVelocityY;
      cell[field] = sample(prevField, x, y);
    }
  }
}

// CHANGED: MacCormack (BFECC) advection for density only (much less diffusive)
function advectMacCormack(field, advectDt, dissipation = 1.0) {
  const prevField = "prev" + field.charAt(0).toUpperCase() + field.slice(1);
  for (let i = 1; i < gridSizeX - 1; i++) {
    for (let j = 1; j < gridSizeY - 1; j++) {
      const c = grid[i][j];

      // Backtrace using prev velocity (semi-Lagrangian forward step)
      const x1 = i - advectDt * c.prevVelocityX;
      const y1 = j - advectDt * c.prevVelocityY;
      const phi_fwd = sample(prevField, x1, y1);

      // Forward trace from backtraced point using prev velocity at x1,y1
      const up = sample("prevVelocityX", x1, y1);
      const vp = sample("prevVelocityY", x1, y1);
      const x2 = x1 + advectDt * up;
      const y2 = y1 + advectDt * vp;
      const phi_back = sample(prevField, x2, y2);

      // Correction
      const phi_prev_here = c[prevField];
      let phi_hat = phi_fwd + 0.5 * (phi_prev_here - phi_back);

      // Clamp to donor cell range
      const [mn, mx] = stencilMinMax(prevField, x1, y1);
      phi_hat = clamp(phi_hat, mn, mx);

      c[field] = phi_hat * dissipation;
    }
  }
}

// ————————————————————————————————
// 9) Projection - Updated for non-square grid
// ————————————————————————————————
function project() {
  for (let i = 1; i < gridSizeX - 1; i++) {
    for (let j = 1; j < gridSizeY - 1; j++) {
      const cell = grid[i][j];
      cell.divergence = -0.5 * (
        grid[i + 1][j].velocityX - grid[i - 1][j].velocityX +
        grid[i][j + 1].velocityY - grid[i][j - 1].velocityY
      );
      cell.pressure = 0;
    }
  }

  for (let k = 0; k < iterations; k++) {
    for (let i = 1; i < gridSizeX - 1; i++) {
      for (let j = 1; j < gridSizeY - 1; j++) {
        const cell = grid[i][j];
        cell.pressure = (
          cell.divergence +
          grid[i - 1][j].pressure +
          grid[i + 1][j].pressure +
          grid[i][j - 1].pressure +
          grid[i][j + 1].pressure
        ) / 4;
      }
    }
  }

  for (let i = 1; i < gridSizeX - 1; i++) {
    for (let j = 1; j < gridSizeY - 1; j++) {
      const cell = grid[i][j];
      cell.velocityX -= 0.5 * (grid[i + 1][j].pressure - grid[i - 1][j].pressure);
      cell.velocityY -= 0.5 * (grid[i][j + 1].pressure - grid[i][j - 1].pressure);
    }
  }
}

// ————————————————————————————————
// 10) Apply solid wall boundary conditions
// ————————————————————————————————
function applyBoundaryConditions() {
  const maxX = gridSizeX - 1;
  const maxY = gridSizeY - 1;
  if (maxX < 1 || maxY < 1) return;

  // Left/Right
  for (let j = 1; j < maxY; j++) {
    // No-flux density
    grid[0][j].density = grid[1][j].density;
    grid[maxX][j].density = grid[maxX - 1][j].density;

    // Velocity: zero normal, copy tangential
    grid[0][j].velocityX = 0; // block flow through wall
    grid[maxX][j].velocityX = 0;
    grid[0][j].velocityY = grid[1][j].velocityY;
    grid[maxX][j].velocityY = grid[maxX - 1][j].velocityY;

    // Pressure: zero-gradient
    grid[0][j].pressure = grid[1][j].pressure;
    grid[maxX][j].pressure = grid[maxX - 1][j].pressure;
  }

  // Top/Bottom
  for (let i = 1; i < maxX; i++) {
    // No-flux density
    grid[i][0].density = grid[i][1].density;
    grid[i][maxY].density = grid[i][maxY - 1].density;

    // Velocity: zero normal, copy tangential
    grid[i][0].velocityY = 0;
    grid[i][maxY].velocityY = 0;
    grid[i][0].velocityX = grid[i][1].velocityX;
    grid[i][maxY].velocityX = grid[i][maxY - 1].velocityX;

    // Pressure: zero-gradient
    grid[i][0].pressure = grid[i][1].pressure;
    grid[i][maxY].pressure = grid[i][maxY - 1].pressure;
  }

  // Corners (average neighbors)
  grid[0][0].density = 0.5 * (grid[1][0].density + grid[0][1].density);
  grid[maxX][0].density = 0.5 * (grid[maxX - 1][0].density + grid[maxX][1].density);
  grid[0][maxY].density = 0.5 * (grid[1][maxY].density + grid[0][maxY - 1].density);
  grid[maxX][maxY].density = 0.5 * (grid[maxX - 1][maxY].density + grid[maxX][maxY - 1].density);

  grid[0][0].pressure = 0.5 * (grid[1][0].pressure + grid[0][1].pressure);
  grid[maxX][0].pressure = 0.5 * (grid[maxX - 1][0].pressure + grid[maxX][1].pressure);
  grid[0][maxY].pressure = 0.5 * (grid[1][maxY].pressure + grid[0][maxY - 1].pressure);
  grid[maxX][maxY].pressure = 0.5 * (grid[maxX - 1][maxY].pressure + grid[maxX][maxY - 1].pressure);
}

// ————————————————————————————————
// 11) Apply gravity forces
// ————————————————————————————————
function applyGravity() {
  for (let i = 0; i < gridSizeX; i++) {
    for (let j = 0; j < gridSizeY; j++) {
      const cell = grid[i][j];
      const densityFactor = Math.min(cell.density / 100, 1);
      if (densityFactor > 0.01) {
        cell.velocityX += gravityX * dt * densityFactor * 0.5;
        cell.velocityY += gravityY * dt * densityFactor * 0.5;
      }
    }
  }
}

// ————————————————————————————————
// 12) One simulation step
// ————————————————————————————————
function step() {
  // 1) Save current velocities for advection
  for (let i = 0; i < gridSizeX; i++) {
    for (let j = 0; j < gridSizeY; j++) {
      const c = grid[i][j];
      c.prevVelocityX = c.velocityX;
      c.prevVelocityY = c.velocityY;
    }
  }

  // 2) Apply external forces (gravity)
  applyGravity();

  // 3) Viscous diffusion for velocity, then projection
  diffuse("velocityX", velDiffCoef);
  diffuse("velocityY", velDiffCoef);
  project();
  applyBoundaryConditions();

  // 4) Advect velocity
  for (let i = 0; i < gridSizeX; i++) {
    for (let j = 0; j < gridSizeY; j++) {
      const c = grid[i][j];
      c.prevVelocityX = c.velocityX;
      c.prevVelocityY = c.velocityY;
    }
  }
  advect("velocityX");
  advect("velocityY");
  applyBoundaryConditions();
  project();
  applyBoundaryConditions();

  // 5) Advect/diffuse density (smoke/water)
  // --- Prepare prevDensity for advection ---
  if (densDiffCoef !== 0) {
    swap("density");
    diffuse("density", densDiffCoef);
    applyBoundaryConditions();
    swap("density");
    // After diffusion, copy to prevDensity for advection
    for (let i = 0; i < gridSizeX; i++)
      for (let j = 0; j < gridSizeY; j++)
        grid[i][j].prevDensity = grid[i][j].density;
  } else {
    // No diffusion: just copy current density to prevDensity
    for (let i = 0; i < gridSizeX; i++)
      for (let j = 0; j < gridSizeY; j++)
        grid[i][j].prevDensity = grid[i][j].density;
  }

  // --- Mass compensation: compute total mass before advection ---
  let massBefore = 0;
  for (let i = 0; i < gridSizeX; i++)
    for (let j = 0; j < gridSizeY; j++)
      massBefore += grid[i][j].prevDensity;

  // --- Advect density ---
  advect("density");
  applyBoundaryConditions();

  // --- Mass compensation: rescale to preserve total mass ---
  let massAfter = 0;
  for (let i = 0; i < gridSizeX; i++)
    for (let j = 0; j < gridSizeY; j++)
      massAfter += grid[i][j].density;

  if (massAfter > 1e-6) {
    const k = massBefore / massAfter;
    for (let i = 0; i < gridSizeX; i++)
      for (let j = 0; j < gridSizeY; j++)
        grid[i][j].density *= k;
  }
}

// ————————————————————————————————
// 13) Render the density field
// ————————————————————————————————
function render() {
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;

  for (let i = 0; i < gridSizeX; i++) {
    for (let j = 0; j < gridSizeY; j++) {
      // CHANGED: nonlinear tone mapping keeps low densities visible
      const d = Math.max(0, grid[i][j].density);
      const densityShade = Math.max(0, Math.min(255, Math.floor(Math.sqrt(d))));

      const startX = Math.floor(i * cellSizeX);
      const endX = Math.floor((i + 1) * cellSizeX);
      const startY = Math.floor(j * cellSizeY);
      const endY = Math.floor((j + 1) * cellSizeY);

      for (let y = startY; y < endY && y < canvas.height; y++) {
        for (let x = startX; x < endX && x < canvas.width; x++) {
          const index = (y * canvas.width + x) * 4;
          data[index] = 0; // red
          data[index + 1] = 0; // green
          data[index + 2] = densityShade; // blue
          data[index + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(image, 0, 0);

  // Draw gravity indicator
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const centerX = canvas.width - 50;
  const centerY = 50;
  ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
  ctx.stroke();

  // Draw gravity direction arrow
  ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
  ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  const arrowLength = 20;
  const arrowX = centerX + (gravityX / 20) * arrowLength;
  const arrowY = centerY + (gravityY / 20) * arrowLength;
  ctx.lineTo(arrowX, arrowY);
  ctx.stroke();

  // Draw arrowhead
  ctx.beginPath();
  ctx.arc(arrowX, arrowY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ————————————————————————————————
// 14) Start the animation
// ————————————————————————————————
let frames = 0;
let lastFrameTime = 0;
const fps = 40; // Set your desired FPS
const frameInterval = 1000 / fps;

(function animate(timestamp) {
  if (timestamp - lastFrameTime < frameInterval) {
    requestAnimationFrame(animate);
    return;
  }
  lastFrameTime = timestamp;

  const midX = (gridSizeX / 2) | 0;
  const midY = (gridSizeY / 2) | 0;

  // Add sources - now just from top to demonstrate gravity better
  const sources = [
    { x: gridSizeX * 0.3, y: 5, vx: 10, vy: 0 },
    { x: gridSizeX * 0.5, y: 5, vx: 0, vy: 0 },
    { x: gridSizeX * 0.7, y: 5, vx: -10, vy: 0 }
  ];

  const intensity = Math.max(0, 120 - frames) / 120;

  // CHANGED: add instead of overwrite so the dye doesn’t instantly thin out
  sources.forEach(source => {
    const i = Math.floor(source.x);
    const j = Math.floor(source.y);
    if (i >= 0 && i < gridSizeX && j >= 0 && j < gridSizeY) {
      grid[i][j].density += intensity * 50000;
      grid[i][j].velocityX += source.vx * intensity;
      grid[i][j].velocityY += source.vy * intensity;
    }
  });

  step();
  render();
  frames += dt * 10;
  requestAnimationFrame(animate);
})();
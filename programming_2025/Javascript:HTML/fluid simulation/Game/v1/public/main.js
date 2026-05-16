/*──────────────────────── Canvas Setup ────────────────────────*/
const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");

// full‐resolution drawing buffer size (px)
const canvas_buffer_px = 4000;
canvas.width = canvas.height = canvas_buffer_px;

// CSS‐scaled display size (px)
const canvas_display_px = 700;
canvas.style.width = canvas.style.height = canvas_display_px + "px";

/*──────────────────── Simulation Parameters ──────────────────*/
const grid_size = 350;                      // number of cells per side
const cell_count = grid_size * grid_size;   // total cells
const time_step = 0.1;                      // Δt
const viscosity = 0;                      // velocity diffusion coefficient
const density_diffusion = 0.1;             // density diffusion coefficient
const solver_iterations = 10;               // Gauss–Seidel passes

/*──────────────────── Field Buffers ──────────────────────────*/
const densityField        = new Float32Array(cell_count);
const prevDensityField    = new Float32Array(cell_count);
const velocityXField      = new Float32Array(cell_count);
const prevVelocityXField  = new Float32Array(cell_count);
const velocityYField      = new Float32Array(cell_count);
const prevVelocityYField  = new Float32Array(cell_count);
const pressureField       = new Float32Array(cell_count);
const divergenceField     = new Float32Array(cell_count);

/*──────────────────── Bullets ──────────────────────────*/

let bullets = [];

class Bullet {
  constructor(x, y, dirX, dirY, config) {
    this.x = x;
    this.y = y;
    this.vx = dirX * config.speed;
    this.vy = dirY * config.speed;
    this.radius            = config.radius;
    this.density           = config.density;
    this.pressureAdd       = config.pressure;
    this.fluidResistance   = config.fluidResistance;
    this.velocityInfluence = config.velocityInfluence;
    this.minDistance       = config.minDistance;
    this.changeDelay       = config.changeDelay;
  }

  update(dt) {
    // 1) sample fluid at bullet
    const idxX = bilinearSample(velocityXField, this.x, this.y);
    const idxY = bilinearSample(velocityYField, this.x, this.y);
    const fdensity = bilinearSample(densityField, this.x, this.y) / 255;

    // 2) apply fluid influence (similar to player)
    this.vx += idxX * fdensity * dt / this.fluidResistance;
    this.vy += idxY * fdensity * dt / this.fluidResistance;
    this.vx /= 1.005
    this.vy /= 1.005

    // 3) move bullet
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // only start injecting once far enough from shooter
    const distToPlayer = Math.hypot(this.x - player.x, this.y - player.y);
    if (distToPlayer < this.minDistance) return;
    this.minDistance = 0 // bullets under very rare circumstances may get reflected back to the player

    // 4) inject density & pressure back into grid
    const minX = clamp(Math.floor(this.x - this.radius), 1, grid_size - 2);
    const maxX = clamp(Math.ceil (this.x + this.radius), 1, grid_size - 2);
    const minY = clamp(Math.floor(this.y - this.radius), 1, grid_size - 2);
    const maxY = clamp(Math.ceil (this.y + this.radius), 1, grid_size - 2);
    const rsq  = this.radius * this.radius;
    for (let yy = minY; yy <= maxY; yy++) {
      const row = yy * grid_size;
      const dy  = this.y - yy;
      for (let xx = minX; xx <= maxX; xx++) {
        const dx = this.x - xx;
        if (dx*dx + dy*dy > rsq) continue;
        const idx = row + xx;
        densityField[idx]  += this.density;
        pressureField[idx] += this.pressureAdd;
        velocityXField[idx] += this.vx * this.velocityInfluence;
        velocityYField[idx] += this.vy * this.velocityInfluence;
      }
    }
  }

  draw(ctx) {
    ctx.fillStyle = "yellow";
    ctx.beginPath();
    ctx.arc(
      this.x * (canvas_buffer_px / grid_size),
      this.y * (canvas_buffer_px / grid_size),
      8,
      0, Math.PI*2
    );
    ctx.fill();
  }
}


/*──────────────────── Helper Functions ───────────────────────*/
function cellIndex(x, y) {
  return x + y * grid_size;
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Bilinear sample of a scalar field
 * @param {Float32Array} field 
 * @param {number} x — floating‐point cell coordinate
 * @param {number} y — floating‐point cell coordinate
 */
function bilinearSample(field, x, y) {
  // clamp into [0.5, grid_size − 1.5] to avoid edge‐overflow
  const cx = clamp(x, 0.5, grid_size - 1.5);
  const cy = clamp(y, 0.5, grid_size - 1.5);

  const i0 = Math.floor(cx), j0 = Math.floor(cy);
  const i1 = i0 + 1,     j1 = j0 + 1;
  const sx = cx - i0,    sy = cy - j0;

  const f00 = field[cellIndex(i0, j0)];
  const f10 = field[cellIndex(i1, j0)];
  const f01 = field[cellIndex(i0, j1)];
  const f11 = field[cellIndex(i1, j1)];

  const interpX0 = f00 * (1 - sx) + f10 * sx;
  const interpX1 = f01 * (1 - sx) + f11 * sx;
  return interpX0 * (1 - sy) + interpX1 * sy;
}

/*──────────────────── Diffusion Solver ───────────────────────*/
function diffuse(currField, prevField, diffusionCoef) {
  if (diffusionCoef === 0) {
    currField.set(prevField);
    return;
  }
  const a = diffusionCoef * time_step;
  for (let iter = 0; iter < solver_iterations; iter++) {
    for (let y = 1; y < grid_size - 1; y++) {
      const rowOffset = y * grid_size;
      for (let x = 1; x < grid_size - 1; x++) {
        const idx = rowOffset + x;
        currField[idx] = (
          prevField[idx] +
          a * (
            currField[idx - 1] + currField[idx + 1] +
            currField[idx - grid_size] + currField[idx + grid_size]
          )
        ) / (1 + 4 * a);
      }
    }
  }
}

/*──────────────────── Advection ─────────────────────────────*/
function advect(currField, prevField, prevVelX, prevVelY) {
  for (let y = 1; y < grid_size - 1; y++) {
    const rowOffset = y * grid_size;
    for (let x = 1; x < grid_size - 1; x++) {
      const idx = rowOffset + x;
      const backX = x - time_step * prevVelX[idx];
      const backY = y - time_step * prevVelY[idx];
      currField[idx] = bilinearSample(prevField, backX, backY);
    }
  }
}

/*──────────────────── Projection (Incompressibility) ────────*/
function project(velX, velY, pressure, divergence) {
  // compute divergence and zero pressure
  for (let y = 1; y < grid_size - 1; y++) {
    const rowOffset = y * grid_size;
    for (let x = 1; x < grid_size - 1; x++) {
      const idx = rowOffset + x;
      divergence[idx] = -0.5 * (
        velX[idx + 1] - velX[idx - 1] +
        velY[idx + grid_size] - velY[idx - grid_size]
      );
      pressure[idx] = 0;
    }
  }
  // solve Poisson for pressure
  for (let iter = 0; iter < solver_iterations; iter++) {
    for (let y = 1; y < grid_size - 1; y++) {
      const rowOffset = y * grid_size;
      for (let x = 1; x < grid_size - 1; x++) {
        const idx = rowOffset + x;
        pressure[idx] = (
          divergence[idx] +
          pressure[idx - 1] + pressure[idx + 1] +
          pressure[idx - grid_size] + pressure[idx + grid_size]
        ) / 4;
      }
    }
  }
  // subtract pressure gradient
  for (let y = 1; y < grid_size - 1; y++) {
    const rowOffset = y * grid_size;
    for (let x = 1; x < grid_size - 1; x++) {
      const idx = rowOffset + x;
      velX[idx] -= 0.5 * (pressure[idx + 1] - pressure[idx - 1]);
      velY[idx] -= 0.5 * (pressure[idx + grid_size] - pressure[idx - grid_size]);
    }
  }
}

/*──────────────────── Player & Input ────────────────────────*/
const player = {
  x: grid_size / 2,
  y: grid_size / 2,
  vx: 0,
  vy: 0,
  radius: 16,
  speed: 0.3,
  fluidResistance: 1,
  isShooting: false,

  bulletSpeed: 40,    // additional launch speed
  bulletRadius: 5,     // how big the influence zone is
  bulletDensity: 300,   // how much density it injects
  bulletPressure: 0,   // how much pressure it injects
  bulletFluidResistance: 1000000000000,     // fluid drag on the bullet
  bulletVelocityInfluence: 1, // fraction of bullet velocity to inject
  bulletMinDistance: 10, // only inject once bullet is ≥ this far from the player
  fireCooldown: 2000,   // seconds between shots
  bulletKnockback: 3, // multiplier to knock player back when shooting

  _lastFireTime: 0,     // internal timestamp
};
/*  bulletSpeed: 50,    // additional launch speed
  bulletRadius: 3,     // how big the influence zone is
  bulletDensity: 50,   // how much density it injects
  bulletPressure: 0,   // how much pressure it injects
  bulletFluidResistance: 1,     // fluid drag on the bullet
  bulletVelocityInfluence: 1, // fraction of bullet velocity to inject
  bulletMinDistance: 5, // only inject once bullet is ≥ this far from the player
  fireCooldown: 1000,   // seconds between shots
  bulletKnockback: 1, // multiplier to knock player back when shooting*/


const keysPressed = {};
const mousePos = { x: player.x, y: player.y };

window.addEventListener("keydown", function(e) {
  keysPressed[e.code] = true;
  if (e.code === "Space") player.isShooting = true;
  if (e.key == "t") {
    player.x = mousePos.x
    player.y = mousePos.y
  }
  if (e.key == "r")location.reload()
});
window.addEventListener("keyup", function(e) {
  keysPressed[e.code] = false;
  if (e.code === "Space") player.isShooting = false;
});

canvas.addEventListener("mousemove", function(e) {
  const rect = canvas.getBoundingClientRect();
  // convert CSS coords → grid coords
  const scale = grid_size / canvas_display_px;
  mousePos.x = (e.clientX - rect.left) * scale;
  mousePos.y = (e.clientY - rect.top)  * scale;
});
canvas.addEventListener("mousedown", function() {
  player.isShooting = true;
});
canvas.addEventListener("mouseup", function() {
  player.isShooting = false;
});

/*──────────────────── Shooting Injection ────────────────────*/
function applyShooting() {
  const now = Date.now(); // seconds
  if (player.isShooting && now - player._lastFireTime > player.fireCooldown) {
    // compute direction:
    const dx = mousePos.x - player.x, dy = mousePos.y - player.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist, dirY = dy / dist;
    bullets.push(new Bullet(
      player.x, player.y, dirX, dirY, {
        speed:             player.bulletSpeed,
        radius:            player.bulletRadius,
        density:           player.bulletDensity,
        pressure:          player.bulletPressure,
        fluidResistance:   player.bulletFluidResistance,
        velocityInfluence: player.bulletVelocityInfluence,
        minDistance:       player.bulletMinDistance,
      }
    ));
    player.vx -= dirX * player.bulletKnockback
    player.vy -= dirY * player.bulletKnockback
    player._lastFireTime = now;
  }
}


/*──────────────────── Simulation Step ───────────────────────*/
function simulateStep() {
  // 1) handle player movement input
  let moveX = (keysPressed.ArrowRight || keysPressed.KeyD ? 1 : 0)
            - (keysPressed.ArrowLeft  || keysPressed.KeyA ? 1 : 0);
  let moveY = (keysPressed.ArrowDown  || keysPressed.KeyS ? 1 : 0)
            - (keysPressed.ArrowUp    || keysPressed.KeyW ? 1 : 0);
  if (moveX || moveY) {
    const len = Math.hypot(moveX, moveY);
    player.vx += (moveX / len) * player.speed;
    player.vy += (moveY / len) * player.speed;
  }

  // 2) sample fluid influence at player position
  const fx = clamp(bilinearSample(velocityXField, player.x, player.y),-255,255);
  const fy = clamp(bilinearSample(velocityYField, player.x, player.y),-255,255);
  //const fp = bilinearSample(pressureField, player.x, player.y);
  const fd = clamp(bilinearSample(densityField, player.x, player.y),0,255);
  player.vx += fx * time_step / player.fluidResistance;
  player.vy += fy * time_step / player.fluidResistance;

  // 3) update player position & damping
  player.x = clamp(player.x + player.vx, 1, grid_size - 2);
  player.y = clamp(player.y + player.vy, 1, grid_size - 2);
  player.vx *= 0.9;
  player.vy *= 0.9;

  // 4) shooting
  if (player.isShooting) applyShooting();

  // 5) velocity diffusion & projection
  prevVelocityXField.set(velocityXField);
  prevVelocityYField.set(velocityYField);
  diffuse(velocityXField, prevVelocityXField, viscosity);
  diffuse(velocityYField, prevVelocityYField, viscosity);
  project(velocityXField, velocityYField, pressureField, divergenceField);

  // 6) velocity advection & projection
  prevVelocityXField.set(velocityXField);
  prevVelocityYField.set(velocityYField);
  advect(velocityXField, prevVelocityXField, prevVelocityXField, prevVelocityYField);
  advect(velocityYField, prevVelocityYField, prevVelocityXField, prevVelocityYField);
  project(velocityXField, velocityYField, pressureField, divergenceField);

  // 7) density diffusion & advection
  prevDensityField.set(densityField);
  diffuse(densityField, prevDensityField, density_diffusion);
  prevDensityField.set(densityField);
  advect(densityField, prevDensityField, velocityXField, velocityYField);

  for (let i = 0; i < velocityXField.length; ++i) {
    velocityXField[i] /= 1.01
  }
  for (let i = 0; i < velocityYField.length; ++i) {
    velocityYField[i] /= 1.01
  }
  for (let i = 0; i < densityField.length; ++i) {
    densityField[i] /= 1.1
  }
  

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.update(time_step);
    // remove if out of bounds
    if (b.x < 1 || b.x > grid_size-2 || b.y < 1 || b.y > grid_size-2) {
      bullets.splice(i, 1);
    }
  }
}

/*──────────────────── Rendering ─────────────────────────────*/
const offscreen = new OffscreenCanvas(grid_size, grid_size);
const offCtx    = offscreen.getContext("2d");
const imageData = offCtx.createImageData(grid_size, grid_size);
const pixelData = imageData.data;

function renderFrame() {
  for (let idx = 0; idx < cell_count; idx++) {
    const density = densityField[idx];
    const speed = Math.hypot(velocityXField[idx], velocityYField[idx]) * 1;
    const pressure = pressureField[idx] * 1;

    pixelData[idx * 4    ] = 510/(1+1.1**-Math.abs(speed*2+density*0.5))-255;  // R
    pixelData[idx * 4 + 1] = 510/(1+1.1**-Math.abs(pressure*0.1+density*0.5))-255;          // G
    pixelData[idx * 4 + 2] = 510/(1+1.1**-Math.abs(pressure*0.5+density*0.5))-255;      // B
    pixelData[idx * 4 + 3] = 255;        // A
  }
  offCtx.putImageData(imageData, 0, 0);

  // upscale to display canvas
  context.imageSmoothingEnabled = false;
  context.drawImage(offscreen, 0, 0, canvas_buffer_px, canvas_buffer_px);

  // draw player
  context.fillStyle = "lime";
  context.beginPath();
  context.arc(
    player.x * (canvas_buffer_px / grid_size),
    player.y * (canvas_buffer_px / grid_size),
    player.radius,
    0,
    Math.PI * 2
  );
  context.fill();

  // draw bullets
  bullets.forEach(b => b.draw(context));
}


/*──────────────────── Main Loop ─────────────────────────────*/
let fps = 40;
let frameInterval = 1000 / fps;
let lastFrameTime = Date.now();

(function mainLoop() {
  requestAnimationFrame(mainLoop);
  const now = Date.now();
  if (now - lastFrameTime > frameInterval) {
    lastFrameTime = now;
    simulateStep();
    renderFrame();
  }
})();
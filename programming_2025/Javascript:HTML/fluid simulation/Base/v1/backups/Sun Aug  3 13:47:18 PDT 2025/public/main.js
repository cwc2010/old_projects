// ————————————————————————————————
// 1) Canvas setup
// ————————————————————————————————
const canvas     = document.getElementById("canvas");
const ctx        = canvas.getContext("2d");
const canvasSize = 1000;
canvas.width = canvas.height = canvasSize;

// ————————————————————————————————
// 2) Simulation parameters
// ————————————————————————————————
const gridSize     = 100;
const cellSize     = canvasSize / gridSize;
const dt           = 0.1;
const velDiffCoef  = 0.0;
const densDiffCoef = 0.1;
const iterations   = 20;

// ————————————————————————————————
// 3) Cell class representing each fluid cell
// ————————————————————————————————
class Cell {
  constructor () {
    this.density         = 0;
    this.prevDensity     = 0;
    this.velocityX       = 0;
    this.prevVelocityX   = 0;
    this.velocityY       = 0;
    this.prevVelocityY   = 0;
    this.pressure        = 0;
    this.divergence      = 0;
  }
}

// ————————————————————————————————
// 4) Create the simulation grid
// ————————————————————————————————
const grid = Array.from({length: gridSize}, () =>
             Array.from({length: gridSize}, () => new Cell()));

// Seed a dense blob in the center with an initial velocity to the right

// ————————————————————————————————
// 5) Utility functions
// ————————————————————————————————
function sample(field, x, y) {
  x = Math.max(0.5, Math.min(gridSize - 1.5, x));
  y = Math.max(0.5, Math.min(gridSize - 1.5, y));
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

function swap(field) {
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const cell = grid[i][j];
      const temp = cell[field];
      cell[field] = cell["prev" + field.charAt(0).toUpperCase() + field.slice(1)];
      cell["prev" + field.charAt(0).toUpperCase() + field.slice(1)] = temp;
    }
  }
}

// ————————————————————————————————
// 6) Diffusion
// ————————————————————————————————
function diffuse(field, diffCoef) {
  if (diffCoef === 0) return;
  const a = diffCoef * dt;
  for (let k = 0; k < iterations; k++) {
    for (let i = 1; i < gridSize - 1; i++) {
      for (let j = 1; j < gridSize - 1; j++) {
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
// 7) Advection
// ————————————————————————————————
function advect(field) {
  const prevField = "prev" + field.charAt(0).toUpperCase() + field.slice(1);
  for (let i = 1; i < gridSize - 1; i++) {
    for (let j = 1; j < gridSize - 1; j++) {
      const cell = grid[i][j];
      const x = i - dt * cell.prevVelocityX;
      const y = j - dt * cell.prevVelocityY;
      cell[field] = sample(prevField, x, y);
    }
  }
}

// ————————————————————————————————
// 8) Projection
// ————————————————————————————————
function project() {
  for (let i = 1; i < gridSize - 1; i++) {
    for (let j = 1; j < gridSize - 1; j++) {
      const cell = grid[i][j];
      cell.divergence = -0.5 * (
        grid[i + 1][j].velocityX - grid[i - 1][j].velocityX +
        grid[i][j + 1].velocityY - grid[i][j - 1].velocityY
      );
      cell.pressure = 0;
    }
  }

  for (let k = 0; k < iterations; k++) {
    for (let i = 1; i < gridSize - 1; i++) {
      for (let j = 1; j < gridSize - 1; j++) {
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

  for (let i = 1; i < gridSize - 1; i++) {
    for (let j = 1; j < gridSize - 1; j++) {
      const cell = grid[i][j];
      cell.velocityX -= 0.5 * (grid[i + 1][j].pressure - grid[i - 1][j].pressure);
      cell.velocityY -= 0.5 * (grid[i][j + 1].pressure - grid[i][j - 1].pressure);
    }
  }
}

// ————————————————————————————————
// 9) One simulation step
// ————————————————————————————————
function step() {
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const cell = grid[i][j];
      cell.prevVelocityX = cell.velocityX;
      cell.prevVelocityY = cell.velocityY;
    }
  }

  diffuse("velocityX", velDiffCoef);
  diffuse("velocityY", velDiffCoef);
  project();

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const cell = grid[i][j];
      cell.prevVelocityX = cell.velocityX;
      cell.prevVelocityY = cell.velocityY;
    }
  }

  advect("velocityX");
  advect("velocityY");
  project();

  swap("density");
  diffuse("density", densDiffCoef);
  swap("density");
  advect("density");
}

// ————————————————————————————————
// 10) Render the density field
// ————————————————————————————————
function render() {
  const image = ctx.getImageData(0, 0, canvasSize, canvasSize);
  const data = image.data;

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
    	const speed = Math.sqrt(grid[i][j].velocityX**2+grid[i][j].velocityY**2)

      const densityShade = Math.max(0, Math.min(255, Math.floor(grid[i][j].density)));
      const velocityXShade = Math.max(0, Math.min(255, Math.floor(grid[i][j].velocityX)));
      const velocityYShade = Math.max(0, Math.min(255, Math.floor(grid[i][j].velocityY)));
      const pressureShade = Math.max(0, Math.min(255, Math.floor(grid[i][j].pressure*10)));
      const speedShade = Math.max(0, Math.min(255, Math.floor(speed*10)));
      for (let dy = 0; dy < cellSize; dy++) {
        for (let dx = 0; dx < cellSize; dx++) {
          const x = i * cellSize + dx;
          const y = j * cellSize + dy;
          const index = (y * canvasSize + x) * 4;
          data[index]     = densityShade+speedShade// red
          data[index + 1] = densityShade// green
          data[index + 2] = densityShade+pressureShade; // blue
          data[index + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(image, 0, 0);
}

// ————————————————————————————————
// 11) Start the animation
// ————————————————————————————————

let frames = 0;
(function animate() {	
	const midX = (gridSize / 2) | 0;
	const midY = (gridSize / 2) | 0;
	grid[midX*0.2][midY].density   = Math.max(0,60-frames)/60*1500;
	grid[midX*0.2][midY].velocityX = 30 * Math.max(0,60-frames)/60;
	grid[midX*1.8][midY].density   = Math.max(0,60-frames)/60*1500;
	grid[midX*1.8][midY].velocityX = -30 * Math.max(0,60-frames)/60;
  step();
  render();
  frames += dt*10
  requestAnimationFrame(animate);
})();

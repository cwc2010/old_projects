const socket = io();

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
const grid_size = 350;
const cell_count = grid_size * grid_size;

/*──────────────────── Field Buffers ──────────────────────────*/
// These will be populated by the server's updates.
let velX = new Float32Array(cell_count);
let velY = new Float32Array(cell_count);
let density = new Float32Array(cell_count);
let pressure = new Float32Array(cell_count); // For rendering color

/*──────────────────── Player & Input ────────────────────────*/
const player = {
    // Client-side representation. The server will update its state.
    x: grid_size / 2,
    y: grid_size / 2,
    isShooting: false,
};

const keysPressed = {};
const mousePos = { x: player.x, y: player.y };

window.addEventListener("keydown", (e) => {
    keysPressed[e.code] = true;
});
window.addEventListener("keyup", (e) => {
    keysPressed[e.code] = false;
});

canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scale = grid_size / canvas_display_px; // Scale from CSS pixels to grid coordinates
    mousePos.x = (e.clientX - rect.left) * scale;
    mousePos.y = (e.clientY - rect.top) * scale;
});
canvas.addEventListener("mousedown", () => { player.isShooting = true; });
canvas.addEventListener("mouseup", () => { player.isShooting = false; });

/*──────────────────── Bullets ──────────────────────────*/
let bullets = [];

class Bullet {
    // Client-side bullet for rendering purposes only
    constructor(serverBullet) {
        this.x = serverBullet.x;
        this.y = serverBullet.y;
    }

    draw(ctx) {
        const scale = canvas_buffer_px / grid_size;
        ctx.fillStyle = "yellow";
        ctx.beginPath();
        // Draw with a fixed, visible radius on the high-res canvas
        ctx.arc(this.x * scale, this.y * scale, 40, 0, Math.PI * 2);
        ctx.fill();
    }
}

/*──────────────────── Offscreen for Rendering ─────────────────*/
const offscreen = new OffscreenCanvas(grid_size, grid_size);
const offCtx = offscreen.getContext("2d");
const imageData = offCtx.createImageData(grid_size, grid_size);
const pixelData = imageData.data;

/*──────────────────── Send Input to Server ───────────────────*/
function sendInput() {
    socket.emit("playerInput", {
        keysPressed: keysPressed,
        mousePos: mousePos,
        isShooting: player.isShooting,
    });
}

/*──────────────────── Handle Server Update ───────────────────*/
socket.on("update", (data) => {
    // Overwrite local fields with the authoritative state from the server
    if (data.newVelX) velX = Float32Array.from(data.newVelX);
    if (data.newVelY) velY = Float32Array.from(data.newVelY);
    if (data.newDensity) density = Float32Array.from(data.newDensity);
    if (data.newPressure) pressure = Float32Array.from(data.newPressure);

    // FIX: Check if player state exists before assigning to prevent crash
    if (data.newPlayerState) {
        Object.assign(player, data.newPlayerState);
    }

    // Recreate bullet objects for rendering if they exist
    if (data.newBullets) {
        bullets = data.newBullets.map(b => new Bullet(b));
    }

    renderFrame();

    // Schedule the next input send, creating a request/response loop
    setTimeout(sendInput, 1000 / 40); // Targeting ~40 FPS
});

/*──────────────────── Rendering ─────────────────────────────*/
function renderFrame() {
    // Render the fluid simulation to the offscreen canvas
    for (let idx = 0; idx < cell_count; idx++) {
        const d = density[idx];
        const s = Math.hypot(velX[idx], velY[idx]);
        const p = pressure[idx];

        pixelData[idx * 4] = 510 / (1 + 1.1 ** -Math.abs(s * 2 + d * 0.5)) - 255;      // R
        pixelData[idx * 4 + 1] = 510 / (1 + 1.1 ** -Math.abs(p * 0.1 + d * 0.5)) - 255;  // G
        pixelData[idx * 4 + 2] = 510 / (1 + 1.1 ** -Math.abs(p * 0.5 + d * 0.5)) - 255;  // B
        pixelData[idx * 4 + 3] = 255;                                                  // A
    }
    offCtx.putImageData(imageData, 0, 0);

    // Upscale offscreen canvas to the display canvas
    context.imageSmoothingEnabled = false;
    context.drawImage(offscreen, 0, 0, canvas_buffer_px, canvas_buffer_px);

    // Draw the player
    const scale = canvas_buffer_px / grid_size;
    context.fillStyle = "lime";
    context.beginPath();
    // FIX: Use a larger, hardcoded radius to ensure visibility on the 4000px canvas
    context.arc(player.x * scale, player.y * scale, 80, 0, Math.PI * 2);
    context.fill();

    // Draw bullets
    bullets.forEach(b => b.draw(context));
}

/*──────────────────── Kick Things Off ───────────────────────*/
socket.on("connect", () => {
    console.log("✅ Connected to server!");
    // Send the first input package to start the simulation loop
    sendInput();
});
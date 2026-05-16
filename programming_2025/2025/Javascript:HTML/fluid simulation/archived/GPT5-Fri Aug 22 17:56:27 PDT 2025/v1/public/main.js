// public/main.js
// WebGL renderer + inputs + socket.io client.
// Receives frames as Float32Array (channels*N*N), converts to Uint8 RGB texture, draws full-screen.

(() => {
  const canvas = document.getElementById('gl');
  const colorInput = document.getElementById('color');
  const radiusInput = document.getElementById('radius');
  const radiusVal = document.getElementById('radiusVal');
  const forceInput = document.getElementById('force');
  const forceVal = document.getElementById('forceVal');
  const gridInfo = document.getElementById('gridInfo');

  const socket = io();
  let N = 0;
  let channels = 3;

  // Update UI labels
  const syncLabels = () => {
    radiusVal.textContent = Number(radiusInput.value).toFixed(1);
    forceVal.textContent = Number(forceInput.value).toFixed(1);
  };
  radiusInput.addEventListener('input', syncLabels);
  forceInput.addEventListener('input', syncLabels);
  syncLabels();

  // WebGL setup
  const gl = canvas.getContext('webgl');
  if (!gl) {
    alert('WebGL not supported');
    return;
  }

  function compileShader(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(sh));
      throw new Error('Shader compile failed');
    }
    return sh;
  }

  const vs = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = (a_pos * 0.5) + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;
  const fs = `
    precision mediump float;
    varying vec2 v_uv;
    uniform sampler2D u_tex;
    void main() {
      vec3 c = texture2D(u_tex, v_uv).rgb;
      // Slight tone mapping for brighter visuals
      c = c / (1.0 + c);
      gl_FragColor = vec4(c, 1.0);
    }
  `;
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    throw new Error('Program link failed');
  }
  gl.useProgram(prog);

  const a_pos = gl.getAttribLocation(prog, 'a_pos');
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  // Full-screen quad (triangle strip): (-1,-1), (1,-1), (-1,1), (1,1)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,  1, 1
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(a_pos);
  gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  let pixelData = null; // Uint8Array RGB
  let texReady = false;

  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      draw(); // redraw
    }
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function hexToRGBf(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    return [r, g, b];
  }

  function draw() {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (texReady) {
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  socket.on('config', ({ N: n, channels: ch }) => {
    N = n;
    channels = ch;
    gridInfo.textContent = `${N}×${N}, ${channels}ch`;
    // Allocate texture storage and pixel buffer
    pixelData = new Uint8Array(N * N * 3);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, N, N, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
    texReady = true;
    draw();
  });

  socket.on('frame', (buf) => {
    // buf is an ArrayBuffer or a typed buffer from socket.io
    const floats = new Float32Array(buf.buffer || buf); // handle Buffer in some browsers
    if (floats.length === 0 || !pixelData) return;

    const area = N * N;
    const c0 = 0 * area;
    const c1 = 1 * area;
    const c2 = 2 * area;

    // Convert floats [0..inf) to bytes [0..255] with soft roll-off
    for (let i = 0, j = 0; i < area; i++, j += 3) {
      let r = floats[c0 + i];
      let g = (channels > 1) ? floats[c1 + i] : r;
      let b = (channels > 2) ? floats[c2 + i] : r;
      // Soft tone-map (to avoid clipping): x / (1 + x)
      r = r / (1 + r);
      g = g / (1 + g);
      b = b / (1 + b);
      pixelData[j]     = Math.max(0, Math.min(255, (r * 255)|0));
      pixelData[j + 1] = Math.max(0, Math.min(255, (g * 255)|0));
      pixelData[j + 2] = Math.max(0, Math.min(255, (b * 255)|0));
    }

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGB, gl.UNSIGNED_BYTE, pixelData);
    draw();
  });

  // Pointer input
  let isDown = false;
  let lastX = 0, lastY = 0;

  function getNormXY(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left) / rect.width;
    const yScreen = (evt.clientY - rect.top) / rect.height; // 0 at top
    const y = 1.0 - yScreen; // bottom-origin
    return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
  }

  function sendSplat(nx, ny, fx, fy) {
    const [r, g, b] = hexToRGBf(colorInput.value);
    // radius slider is in percent of min(width, height), assume normalized to grid
    const radiusPercent = Number(radiusInput.value); // 0.5..6 (%)
    const radiusNorm = Math.max(0.002, Math.min(0.3, radiusPercent / 100));
    const forceScale = Number(forceInput.value); // multiplier
    socket.emit('splat', {
      x: nx,
      y: ny,
      radius: radiusNorm,
      fx: fx * forceScale,
      fy: fy * forceScale,
      r, g, b
    });
  }

  function onDown(evt) {
    isDown = true;
    const [nx, ny] = getNormXY(evt);
    lastX = nx; lastY = ny;
    sendSplat(nx, ny, 0, 0);
  }
  function onMove(evt) {
    if (!isDown) return;
    const [nx, ny] = getNormXY(evt);
    const fx = (nx - lastX) * 100; // scale drag to meaningful force
    const fy = (ny - lastY) * 100;
    sendSplat(nx, ny, fx, fy);
    lastX = nx; lastY = ny;
  }
  function onUp() { isDown = false; }

  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('mouseleave', onUp);

  // Touch support
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    onDown(t);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    onMove(t);
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    onUp();
  }, { passive: false });
})();

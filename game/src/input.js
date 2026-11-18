// Keyboard + mouse input. Mouse look is drag-to-orbit (no pointer lock), so
// the game also plays in a headless browser and in a plain window.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDown = false;
    this.dragDX = 0;
    this.dragDY = 0;
    this.clicked = false;
    this.lastX = 0;
    this.lastY = 0;
    this.pressed = new Set(); // keys pressed since last poll
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
      if (e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true; this.lastX = e.clientX; this.lastY = e.clientY;
      if (e.button === 0) this.clicked = true;
    });
    addEventListener('mouseup', () => { this.mouseDown = false; });
    addEventListener('mousemove', (e) => {
      if (!this.mouseDown) return;
      this.dragDX += e.clientX - this.lastX;
      this.dragDY += e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    this.attachGamepad();
  }
  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  axis() {
    let x = 0; let z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, z };
  }
  consumeDrag() { const d = { dx: this.dragDX, dy: this.dragDY }; this.dragDX = 0; this.dragDY = 0; return d; }
  consumeClick() { const c = this.clicked; this.clicked = false; return c; }
  endFrame() { this.pressed.clear(); }

  // Gamepad: the standard Gamepad API, polled once per frame. Left stick
  // moves and steers, A jumps (or handbrakes in a car), X enters a car,
  // Y cycles the radio, Start pauses. Keyboard always stays primary.
  attachGamepad() {
    this.padIndex = null;
    this.padButtons = new Set();
    this.padPressed = new Set();
    this.padAxes = { x: 0, z: 0 };
    addEventListener('gamepadconnected', (e) => { this.padIndex = e.gamepad.index; });
    addEventListener('gamepaddisconnected', (e) => {
      if (this.padIndex === e.gamepad.index) { this.padIndex = null; this.padButtons.clear(); }
    });
  }
  pollPad() {
    if (this.padIndex === null || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const pad = pads && pads[this.padIndex];
    if (!pad) return;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    this.padAxes = { x: dz(pad.axes[0] || 0), z: dz(pad.axes[1] || 0) };
    const now = new Set();
    pad.buttons.forEach((b, i) => { if (b.pressed) now.add(i); });
    this.padPressed = new Set([...now].filter((i) => !this.padButtons.has(i)));
    this.padButtons = now;
  }
  padDown(i) { return this.padButtons.has(i); }
  padWasPressed(i) { return this.padPressed.has(i); }
  padAxis() { return { x: this.padAxes.x, z: this.padAxes.z }; }
  padConnected() { return this.padIndex !== null; }
}

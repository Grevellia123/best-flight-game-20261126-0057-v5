// TALON STRIKE — unified keyboard / mouse / touch input. Pointer Events only,
// touch-action none on the play surface, >= 44px touch targets.
export function createInput(playSurface, els) {
  const state = {
    pitch: 0, roll: 0, throttle: 0.62,
    gun: false, missile: false, // missile is an edge trigger, cleared by main
    camToggle: false, pauseToggle: false, muteToggle: false,
    trimUp: false, trimDown: false,
    usingTouch: false,
  };
  const keys = new Set();
  let drag = null; // {id, x0, y0, dx, dy}

  function recomputeStick() {
    let pitch = 0, roll = 0;
    if (keys.has('ArrowUp') || keys.has('KeyW')) pitch += 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) pitch -= 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;
    if (drag) {
      roll += Math.max(-1, Math.min(1, drag.dx / 140));
      pitch += Math.max(-1, Math.min(1, -drag.dy / 140));
    }
    state.pitch = Math.max(-1, Math.min(1, pitch));
    state.roll = Math.max(-1, Math.min(1, roll));
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') { state.gun = true; e.preventDefault(); }
    if (e.code === 'KeyF' || e.code === 'Enter') state.missile = true;
    if (e.code === 'KeyC') state.camToggle = true;
    if (e.code === 'KeyP' || e.code === 'Escape') state.pauseToggle = true;
    if (e.code === 'KeyM') state.muteToggle = true;
    if (e.code === 'KeyT') state.trimUp = true;
    if (e.code === 'KeyG') state.trimDown = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    recomputeStick();
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'Space') state.gun = false;
    if (e.code === 'KeyT') state.trimUp = false;
    if (e.code === 'KeyG') state.trimDown = false;
    recomputeStick();
  });
  window.addEventListener('blur', () => { keys.clear(); state.gun = false; drag = null; recomputeStick(); });

  // Mouse drag to steer, wheel for throttle.
  playSurface.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') state.usingTouch = true;
    if (drag) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
    playSurface.setPointerCapture(e.pointerId);
  });
  playSurface.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x0;
    drag.dy = e.clientY - drag.y0;
    recomputeStick();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    recomputeStick();
  };
  playSurface.addEventListener('pointerup', endDrag);
  playSurface.addEventListener('pointercancel', endDrag);
  playSurface.addEventListener('wheel', (e) => {
    state.throttle = Math.max(0, Math.min(1, state.throttle + (e.deltaY < 0 ? 0.08 : -0.08)));
    e.preventDefault();
  }, { passive: false });

  // Touch buttons.
  function holdButton(el, on, off) {
    if (!el) return;
    const start = (e) => { e.preventDefault(); state.usingTouch = true; on(); };
    const end = (e) => { e.preventDefault(); off(); };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);
  }
  holdButton(els.btnFire, () => { state.gun = true; }, () => { state.gun = false; });
  if (els.btnMsl) els.btnMsl.addEventListener('pointerdown', (e) => { e.preventDefault(); state.missile = true; });
  if (els.btnCam) els.btnCam.addEventListener('pointerdown', (e) => { e.preventDefault(); state.camToggle = true; });
  if (els.btnPause) els.btnPause.addEventListener('pointerdown', (e) => { e.preventDefault(); state.pauseToggle = true; });
  // NOTE: btnMute has NO pointerdown handler on purpose — its click
  // handler in main.js is the only mute path. A pointerdown handler here
  // PLUS the click handler toggled mute twice per tap (Chromium fires the
  // click even after pointerdown preventDefault), so the button looked
  // dead. Click fires for both mouse clicks and touch taps; KeyM still
  // works through state.muteToggle.

  // Per-frame: throttle on Shift/Ctrl (or R/V) and wheel. Touch has no
  // throttle control — the THR ▲ / ▼ hold buttons were deleted at the
  // user's request (v5.11), so on touch the throttle stays at its
  // cruise default (0.62) and the IAS tape sits at 377 kt.
  // (W/S steer pitch; Space fires; F launches a missile.)
  state.tick = (dt) => {
    if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyR')) state.throttle = Math.min(1, state.throttle + 0.55 * dt);
    if (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyV')) state.throttle = Math.max(0, state.throttle - 0.55 * dt);
    return state;
  };

  return state;
}

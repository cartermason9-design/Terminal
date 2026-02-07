/* ============================================================
   gesture-hud.js (DRAGGABLE + PARTICLE SPHERE)
   - exec order 15 -> opens panel + asks camera
   - 3D: particle sphere (THREE.Points)
   - Gestures:
      * Move hand -> rotate
      * Pinch -> resize
      * Fist -> speed boost
   ============================================================ */

(function () {
  const HUD_ID = "hud";
  const hud = document.getElementById(HUD_ID);
  if (!hud) return;

  const POS_KEY = "gesture_panel_pos_v2";

  // ---------- Styles ----------
  const style = document.createElement("style");
  style.textContent = `
      .gesturePanel {
        position: absolute;
        left: 14px;
        top: 62px;
        width: 360px;
        height: 420px;
        border: 1px solid rgba(88,183,255,.22);
        background: rgba(0,0,0,.55);
        box-shadow: inset 0 0 0 1px rgba(88,183,255,.06), 0 18px 50px rgba(0,0,0,.55);
        z-index: 999;
        overflow: hidden;
        display: none;
        touch-action: none;
        backdrop-filter: blur(1px);
      }
      .gesturePanel.show { display: block; }
  
      .gestureHdr{
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:10px 10px 8px 10px;
        border-bottom: 1px solid rgba(88,183,255,.12);
        user-select:none;
        cursor: grab;
      }
      .gesturePanel.dragging .gestureHdr{ cursor: grabbing; }
  
      .gestureTitle{
        font-size: 11px;
        letter-spacing: .14em;
        text-transform: uppercase;
        color: rgba(88,183,255,.85);
        pointer-events:none;
      }
      .gestureBtns{
        display:flex;
        gap:8px;
      }
      .gBtn{
        background: rgba(0,0,0,.35);
        border: 1px solid rgba(88,183,255,.18);
        color: rgba(88,183,255,.85);
        font-size: 11px;
        letter-spacing: .12em;
        padding: 6px 8px;
        cursor:pointer;
        touch-action: manipulation;
      }
      .gBtn:active { transform: translateY(1px); }
  
      .gestureBody{
        position:absolute;
        inset: 44px 0 0 0;
        display:grid;
        grid-template-rows: 1fr auto;
      }
  
      .gestureCanvasWrap{
        position: relative;
        overflow:hidden;
      }
  
      .gestureInfo{
        padding: 10px;
        border-top: 1px solid rgba(88,183,255,.12);
        color: rgba(88,183,255,.72);
        font-size: 11px;
        line-height: 1.45;
        background: rgba(0,0,0,.35);
      }
  
      .gestureBadge{
        display:inline-block;
        margin-top: 6px;
        padding: 4px 8px;
        border: 1px solid rgba(88,183,255,.18);
        background: rgba(0,0,0,.35);
        color: rgba(88,183,255,.85);
        letter-spacing: .10em;
        font-size: 10px;
      }
  
      .gestureCamPreview{
        position:absolute;
        right: 10px;
        bottom: 10px;
        width: 120px;
        height: 90px;
        border: 1px solid rgba(88,183,255,.18);
        background: rgba(0,0,0,.35);
        opacity: .35;
        filter: saturate(1.05) contrast(1.05);
        display:none;
      }
      .gestureCamPreview.show{ display:block; }
  
      .gestureToast{
        position:absolute;
        left:10px;
        bottom:10px;
        padding:6px 8px;
        border:1px solid rgba(88,183,255,.18);
        background: rgba(0,0,0,.45);
        color: rgba(88,183,255,.85);
        font-size: 11px;
        letter-spacing: .08em;
        opacity:0;
        transform: translateY(6px);
        transition: opacity .2s ease, transform .2s ease;
        pointer-events:none;
        max-width: 220px;
        white-space: pre-line;
      }
      .gestureToast.show{
        opacity:1;
        transform: translateY(0);
      }
    `;
  document.head.appendChild(style);

  // ---------- Convert first EMPTY pill ----------
  const mutedPills = hud.querySelectorAll(".topCenter .pill.muted");
  const tabPill = mutedPills && mutedPills[0] ? mutedPills[0] : null;

  if (tabPill) {
    tabPill.textContent = "GESTURE";
    tabPill.classList.remove("muted");
    tabPill.style.cursor = "pointer";
    tabPill.title = "Hand gesture control (exec order 15)";
  }

  // ---------- Panel DOM ----------
  const panel = document.createElement("div");
  panel.className = "gesturePanel";
  panel.innerHTML = `
      <div class="gestureHdr" id="gestureHdr">
        <div class="gestureTitle">GESTURE CONTROL</div>
        <div class="gestureBtns">
          <button class="gBtn" type="button" data-act="preview">PREVIEW</button>
          <button class="gBtn" type="button" data-act="close">CLOSE</button>
        </div>
      </div>
      <div class="gestureBody">
        <div class="gestureCanvasWrap">
          <canvas id="gestureThree"></canvas>
          <video id="gestureVideo" class="gestureCamPreview" playsinline></video>
          <div id="gestureToast" class="gestureToast"></div>
        </div>
        <div class="gestureInfo">
          <div>Controls:</div>
          <div>• Move hand → rotate</div>
          <div>• Pinch → resize</div>
          <div>• Fist → speed boost</div>
          <span class="gestureBadge" id="gestureStatus">STATUS: IDLE</span>
        </div>
      </div>
    `;
  hud.appendChild(panel);

  const hdr = panel.querySelector("#gestureHdr");
  const threeCanvas = panel.querySelector("#gestureThree");
  const videoEl = panel.querySelector("#gestureVideo");
  const toastEl = panel.querySelector("#gestureToast");
  const statusEl = panel.querySelector("#gestureStatus");
  const btnPreview = panel.querySelector('[data-act="preview"]');
  const btnClose = panel.querySelector('[data-act="close"]');

  function toast(msg, ms = 1200) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove("show"), ms);
  }

  function setStatus(s) {
    statusEl.textContent = `STATUS: ${s}`;
  }

  // ---------- Draggable ----------
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function getHudRect() {
    return hud.getBoundingClientRect();
  }

  function savePos() {
    try {
      const x = parseFloat(panel.style.left || "0") || 0;
      const y = parseFloat(panel.style.top || "0") || 0;
      localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
    } catch {}
  }

  function restorePos() {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
      panel.style.left = `${p.x}px`;
      panel.style.top = `${p.y}px`;
    } catch {}
  }

  function clampToViewport() {
    const hudRect = getHudRect();
    const pRect = panel.getBoundingClientRect();

    const left = parseFloat(panel.style.left || "0") || 0;
    const top = parseFloat(panel.style.top || "0") || 0;

    const maxLeft = hudRect.width - pRect.width - 8;
    const maxTop = hudRect.height - pRect.height - 8;

    const cl = clamp(left, 8, Math.max(8, maxLeft));
    const ct = clamp(top, 56, Math.max(56, maxTop));
    panel.style.left = `${cl}px`;
    panel.style.top = `${ct}px`;
  }

  restorePos();

  let dragging = false;
  let startX = 0,
    startY = 0;
  let startLeft = 0,
    startTop = 0;

  function isInteractive(el) {
    return !!el.closest("button, input, a, textarea, select");
  }

  hdr.addEventListener("pointerdown", (e) => {
    if (isInteractive(e.target)) return;

    dragging = true;
    panel.classList.add("dragging");

    const rect = panel.getBoundingClientRect();
    const hudRect = getHudRect();
    startLeft = rect.left - hudRect.left;
    startTop = rect.top - hudRect.top;

    startX = e.clientX;
    startY = e.clientY;

    hdr.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  hdr.addEventListener("pointermove", (e) => {
    if (!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    panel.style.left = `${startLeft + dx}px`;
    panel.style.top = `${startTop + dy}px`;

    clampToViewport();
    resizeThree();
  });

  hdr.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove("dragging");
    savePos();
    try {
      hdr.releasePointerCapture(e.pointerId);
    } catch {}
  });

  hdr.addEventListener("pointercancel", () => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove("dragging");
    savePos();
  });

  window.addEventListener("resize", () => {
    clampToViewport();
    resizeThree();
    savePos();
  });

  // ---------- Three.js: Particle Sphere ----------
  let renderer, scene, camera;
  let points = null;
  let ring = null;
  let glow = null;

  // gesture-driven targets
  let targetRotX = 0;
  let targetRotY = 0;
  let targetScale = 1;

  // speed boost
  let speedTarget = 1; // 1 normal, higher when fist
  let speed = 1;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function resizeThree() {
    const wrap = panel.querySelector(".gestureCanvasWrap");
    if (!wrap || !renderer || !camera) return;

    const rect = wrap.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));

    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function buildParticleSphere(radius = 1.0, count = 4200) {
    const geo = new THREE.BufferGeometry();

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    // cyan-ish palette (still "tiny particles" but bright core)
    for (let i = 0; i < count; i++) {
      // Uniform points on sphere using cosine distribution
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);

      // Slight thickness: jitter radius a bit so it feels volumetric
      const r = radius * (0.92 + Math.random() * 0.12);

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);

      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Color gradient (brighter near "front-ish" or random pop)
      const pop = Math.random();
      const c = 0.55 + pop * 0.45; // intensity
      colors[i * 3 + 0] = 0.34 * c; // R
      colors[i * 3 + 1] = 0.72 * c; // G
      colors[i * 3 + 2] = 1.0 * c; // B
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.012,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return new THREE.Points(geo, mat);
  }

  function initThree() {
    if (renderer) return;

    scene = new THREE.Scene();

    const wrap = panel.querySelector(".gestureCanvasWrap");
    const rect = wrap.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));

    camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
    camera.position.set(0, 0.05, 2.9);

    renderer = new THREE.WebGLRenderer({
      canvas: threeCanvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h, false);

    // subtle light just for ring/glow visuals (PointsMaterial not lit)
    const amb = new THREE.AmbientLight(0x203a52, 0.9);
    scene.add(amb);

    // particle sphere
    points = buildParticleSphere(1.0, 5200);
    scene.add(points);

    // ring
    const ringGeo = new THREE.TorusGeometry(1.18, 0.02, 12, 180);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x58b7ff,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI * 0.5;
    scene.add(ring);

    // glow plane
    const glowGeo = new THREE.PlaneGeometry(2.8, 2.8);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x58b7ff,
      transparent: true,
      opacity: 0.07,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.z = -0.4;
    scene.add(glow);

    resizeThree();

    // render loop
    const start = performance.now();
    const loop = (t) => {
      const tt = (t - start) / 1000;

      // smooth speed changes
      speed = lerp(speed, speedTarget, 0.1);

      // idle spin + fist boost
      const baseSpin = 0.0045;
      const boostSpin = baseSpin * speed;

      // apply gesture rotation targets smoothly
      points.rotation.x = lerp(points.rotation.x, targetRotX, 0.18);
      points.rotation.y = lerp(points.rotation.y, targetRotY, 0.18);

      // add continuous spin
      points.rotation.y += boostSpin;
      points.rotation.x += boostSpin * 0.42;

      // scale
      const s = lerp(points.scale.x, targetScale, 0.18);
      points.scale.set(s, s, s);

      // visuals react
      const boost01 = clamp((speed - 1) / 3.5, 0, 1); // fist glow
      const scale01 = clamp((targetScale - 1) / 0.9, 0, 1); // pinch glow
      const energy = clamp(scale01 * 0.7 + boost01 * 0.9, 0, 1);

      ring.material.opacity = 0.3 + energy * 0.45;
      glow.material.opacity = 0.05 + energy * 0.18;

      // ring wobble
      ring.rotation.z =
        Math.sin(tt * (0.7 + boost01 * 2.0)) * (0.18 + energy * 0.22);
      glow.rotation.z = -ring.rotation.z * 0.6;

      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---------- MediaPipe Hands ----------
  let hands = null;
  let cam = null;
  let tracking = false;
  let previewOn = false;

  function dist2D(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Fist heuristic:
  // if all fingertips are close to palm center -> fist
  function isFist(lm) {
    const palm = lm[9] || lm[0];

    const tips = [lm[8], lm[12], lm[16], lm[20]]; // index/middle/ring/pinky tips
    let avg = 0;
    for (const tip of tips) avg += dist2D(tip, palm);
    avg /= tips.length;

    // Typical open-hand avg ~0.18-0.28, fist ~0.07-0.13 (depends on distance to camera)
    // We'll use a conservative threshold and make it adaptive with wrist->palm scale.
    const wrist = lm[0];
    const palmScale = dist2D(wrist, palm) || 0.15;

    // normalize by palmScale so it works closer/farther
    const norm = avg / palmScale;

    return norm < 1.15; // lower = more closed; tweak if needed
  }

  async function initHands() {
    if (hands) return;

    if (!window.Hands || !window.Camera) {
      toast("Hand libs not loaded");
      setStatus("ERROR");
      return;
    }

    hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.6,
    });

    hands.onResults(onResults);

    videoEl.muted = true;
    videoEl.playsInline = true;

    cam = new Camera(videoEl, {
      onFrame: async () => {
        if (!hands) return;
        await hands.send({ image: videoEl });
      },
      width: 640,
      height: 480,
    });
  }

  function onResults(results) {
    if (
      !results.multiHandLandmarks ||
      results.multiHandLandmarks.length === 0
    ) {
      setStatus(tracking ? "SEARCHING..." : "IDLE");
      targetScale = lerp(targetScale, 1.0, 0.08);
      speedTarget = lerp(speedTarget, 1.0, 0.08);
      return;
    }

    const lm = results.multiHandLandmarks[0];
    const palm = lm[9] || lm[0];
    const indexTip = lm[8];
    const thumbTip = lm[4];

    // Move hand -> rotation
    const cx = palm.x - 0.5;
    const cy = palm.y - 0.5;
    targetRotY = cx * 2.4;
    targetRotX = cy * 1.6;

    // Pinch -> scale
    const pinch = dist2D(indexTip, thumbTip);
    const pinched = pinch < 0.055;

    const pinchNorm = clamp((0.14 - pinch) / 0.1, 0, 1);
    const desiredScale = 1.0 + pinchNorm * 0.95;

    if (pinched) {
      targetScale = desiredScale;
    } else {
      targetScale = lerp(targetScale, 1.0, 0.14);
    }

    // Fist -> speed boost
    const fist = isFist(lm);
    if (fist) {
      speedTarget = 4.0; // boost amount (bigger = faster)
      setStatus(pinched ? "PINCH + FIST" : "FIST BOOST");
    } else {
      speedTarget = 1.0;
      setStatus(pinched ? "PINCH" : "TRACKING");
    }
  }

  async function startTracking() {
    try {
      setStatus("REQUESTING CAM...");
      toast("Requesting camera…", 1200);

      await initHands();
      if (!cam) throw new Error("Camera init failed");

      await cam.start();
      tracking = true;

      setStatus("TRACKING");
      toast("Camera OK.\nPinch = resize • Fist = speed", 1600);
    } catch (e) {
      tracking = false;
      setStatus("DENIED / ERROR");
      toast("Camera blocked or unavailable", 1600);
    }
  }

  function stopTracking() {
    tracking = false;
    setStatus("IDLE");
    toast("Tracking stopped");

    try {
      const ms = videoEl.srcObject;
      if (ms && ms.getTracks) ms.getTracks().forEach((t) => t.stop());
    } catch {}

    try {
      videoEl.srcObject = null;
    } catch {}
  }

  function togglePreview() {
    previewOn = !previewOn;
    videoEl.classList.toggle("show", previewOn);
    toast(previewOn ? "Preview ON" : "Preview OFF");
  }

  function openPanel() {
    panel.classList.add("show");
    clampToViewport();
    initThree();
    resizeThree();
    savePos();
  }

  function closePanel() {
    panel.classList.remove("show");
    stopTracking();
    savePos();
  }

  // ---------- UI controls ----------
  btnClose.addEventListener("click", closePanel);
  btnPreview.addEventListener("click", togglePreview);

  if (tabPill) {
    tabPill.addEventListener("click", () => {
      if (panel.classList.contains("show")) closePanel();
      else {
        openPanel();
        startTracking();
      }
    });
  }

  // ---------- Terminal integration ----------
  const termInput = document.getElementById("termInput");
  if (termInput) {
    termInput.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter") return;

        const raw = termInput.value || "";
        const cmd = raw.trim().toLowerCase();

        if (cmd === "exec order 15") {
          setTimeout(() => {
            openPanel();
            startTracking();
            toast("Particle sphere engaged", 1200);
          }, 0);
        }
      },
      true
    );
  }

  // Global helper
  window.GestureHUD = {
    open: () => {
      openPanel();
      startTracking();
    },
    close: () => closePanel(),
    togglePreview: () => togglePreview(),
  };

  setStatus("IDLE");
})();

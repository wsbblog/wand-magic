(() => {
  "use strict";

  const COLORS = [
    { name: "白", value: "#ffffff" },
    { name: "金", value: "#e6b84c" },
    { name: "红", value: "#ff5f6d" },
    { name: "蓝", value: "#4cc9ff" },
    { name: "绿", value: "#7bf29c" },
    { name: "粉", value: "#ff9ecd" }
  ];

  const EFFECTS = {
    fire: { label: "火焰", color: "#ff9344", secondary: "#ffd166" },
    water: { label: "清水", color: "#4cc9ff", secondary: "#a6e5ff" },
    star: { label: "星光", color: "#ffffff", secondary: "#e6b84c" },
    lightning: { label: "闪电", color: "#8ee8ff", secondary: "#ffffff" }
  };

  const video = document.getElementById("camera");
  const drawCanvas = document.getElementById("drawCanvas");
  const drawCtx = drawCanvas.getContext("2d");
  const effectCanvas = document.getElementById("effectCanvas");
  const effectCtx = effectCanvas.getContext("2d");
  const stage = document.getElementById("stage");
  const startButton = document.getElementById("startButton");
  const calibrateButton = document.getElementById("calibrateButton");
  const startDrawButton = document.getElementById("startDrawButton");
  const clearButton = document.getElementById("clearButton");
  const cameraStatus = document.getElementById("cameraStatus");
  const handStatus = document.getElementById("handStatus");
  const runtimeStatus = document.getElementById("runtimeStatus");
  const brushStatus = document.getElementById("brushStatus");
  const brushSizePill = document.getElementById("brushSizePill");
  const calibrationTarget = document.getElementById("calibrationTarget");
  const calibrationLabel = document.getElementById("calibrationLabel");
  const calibrationProgress = document.getElementById("calibrationProgress");
  const normalBrushButton = document.getElementById("normalBrushButton");
  const effectBrushButton = document.getElementById("effectBrushButton");
  const eraserButton = document.getElementById("eraserButton");
  const effectTypeGrid = document.getElementById("effectTypeGrid");
  const effectTypeButtons = Array.from(document.querySelectorAll(".effect-type"));
  const colorGrid = document.getElementById("colorGrid");
  const brushSizeInput = document.getElementById("brushSizeInput");

  let handLandmarker = null;

  const state = {
    stream: null,
    cameraReady: false,
    mode: "idle",
    calibrated: false,
    armed: false,
    handGesture: "none",
    brushMode: "normal",
    effectType: "fire",
    brushColor: "#ffffff",
    brushWidth: 6,
    drawing: false,
    tip: null,
    smoothTip: null,
    prevSmoothTip: null,
    particles: []
  };

  function setRuntime(text) {
    runtimeStatus.textContent = text;
  }

  function hexToRgba(hex, alpha) {
    const value = hex.replace("#", "");
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function resizeStage() {
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    drawCanvas.width = width;
    drawCanvas.height = height;
    effectCanvas.width = width;
    effectCanvas.height = height;
    stage.style.aspectRatio = `${width} / ${height}`;
  }

  function updateBrushUI() {
    const rounded = Math.round(state.brushWidth);
    brushSizeInput.value = String(rounded);
    brushSizePill.textContent = `粗细 ${rounded}`;
  }

  async function enableDevices() {
    if (state.stream) {
      return;
    }

    startButton.disabled = true;
    startButton.textContent = "正在请求权限…";
    setRuntime("请求权限中");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      state.stream = stream;
      state.cameraReady = true;
      video.srcObject = stream;
      await video.play();

      cameraStatus.textContent = "已连接";
      startButton.textContent = "摄像头已开启";
      calibrateButton.disabled = true;
      setRuntime("加载手势识别");

      resizeStage();
      initializeHandTracking();
      requestAnimationFrame(loop);
    } catch (error) {
      const denied = error && (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError" ||
        error.name === "SecurityError"
      );
      cameraStatus.textContent = denied ? "权限被拒绝" : "连接失败";
      setRuntime("设备不可用");
      startButton.disabled = false;
      startButton.textContent = "重新请求权限";
    }
  }

  function startCalibration() {
    if (!state.cameraReady) {
      return;
    }

    if (!handLandmarker) {
      calibrationTarget.hidden = true;
      calibrateButton.disabled = true;
      handStatus.textContent = "不可用";
      brushStatus.textContent = "手势识别不可用";
      setRuntime("无法校准");
      return;
    }

    state.mode = "calibrating";
    state.calibrated = false;
    state.armed = false;
    startDrawButton.disabled = true;
    startDrawButton.textContent = "开始作画";
    calibrationTarget.hidden = false;
    calibrationLabel.textContent = "请伸出食指放入圆圈";
    calibrationProgress.style.width = "0%";
    calibrateButton.disabled = true;
    brushStatus.textContent = "手指：校准中";
    setRuntime("校准食指");
  }

  function finishFingerCalibration() {
    state.mode = "ready";
    state.calibrated = true;
    state.armed = false;
    state.drawing = false;
    state.prevSmoothTip = null;
    calibrationTarget.hidden = true;
    calibrationLabel.textContent = "";
    calibrationProgress.style.width = "0%";
    calibrateButton.disabled = false;
    startDrawButton.disabled = false;
    startDrawButton.textContent = "开始作画";
    handStatus.textContent = "手势识别";
    brushStatus.textContent = "手指：已校准";
    setRuntime("已校准");
  }

  async function initializeHandTracking() {
    handStatus.textContent = "加载中";
    try {
      const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3");
      const fileset = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      const options = {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.4,
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.4
      };

      try {
        handLandmarker = await vision.HandLandmarker.createFromOptions(fileset, options);
      } catch (_) {
        options.baseOptions.delegate = "CPU";
        handLandmarker = await vision.HandLandmarker.createFromOptions(fileset, options);
      }

      handStatus.textContent = "手势识别";
      calibrateButton.disabled = false;
      brushStatus.textContent = "手指：等待校准";
      setRuntime("等待食指校准");
    } catch (_) {
      handStatus.textContent = "不可用";
      calibrateButton.disabled = true;
      brushStatus.textContent = "手势识别不可用";
      setRuntime("手势识别不可用");
    }
  }

  function detectHand(now) {
    if (!handLandmarker) {
      return false;
    }

    let result;
    try {
      result = handLandmarker.detectForVideo(video, now);
    } catch (_) {
      return false;
    }

    if (!result.landmarks || !result.landmarks.length) {
      state.handGesture = "none";
      state.tip = null;
      state.smoothTip = null;
      state.drawing = false;
      state.prevSmoothTip = null;
      brushStatus.textContent = "手指：丢失";
      return false;
    }

    const landmarks = result.landmarks[0];
    const wrist = landmarks[0];
    const indexTip = landmarks[8];
    const indexMcp = landmarks[5];
    const width = video.videoWidth || drawCanvas.width || 640;
    const height = video.videoHeight || drawCanvas.height || 480;
    const displayX = (1 - indexTip.x) * width;
    const displayY = indexTip.y * height;
    const tipDistance = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
    const mcpDistance = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y);
    const indexExtended = tipDistance > mcpDistance * 1.08;

    state.handGesture = indexExtended ? "draw" : "none";
    state.tip = { x: displayX, y: displayY };

    if (state.mode === "calibrating" && indexExtended) {
      const centerDistance = Math.hypot(indexTip.x - 0.5, indexTip.y - 0.5);
      if (centerDistance < 0.13) {
        finishFingerCalibration();
      }
    }

    brushStatus.textContent = indexExtended ? "手指：已识别" : "手指：已识别";
    return true;
  }

  function updateDetection(now) {
    if (video.readyState < 2) {
      return;
    }
    detectHand(now);
  }

  function addParticle(x, y, vx, vy, life, size, color, type) {
    state.particles.push({
      x,
      y,
      vx,
      vy,
      life,
      maxLife: life,
      size,
      color,
      type,
      rotation: Math.random() * Math.PI * 2
    });

    if (state.particles.length > 600) {
      state.particles.splice(0, state.particles.length - 600);
    }
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawnEffectParticles(tip, dt, effectType) {
    const effect = EFFECTS[effectType];
    let count = Math.max(1, Math.round(dt * 80));

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomBetween(20, 110);

      if (effectType === "fire") {
        addParticle(
          tip.x + randomBetween(-8, 8),
          tip.y + randomBetween(-8, 8),
          randomBetween(-35, 35),
          randomBetween(-150, -40),
          randomBetween(0.5, 1.3),
          randomBetween(3, 10),
          Math.random() > 0.5 ? effect.color : effect.secondary,
          "fire"
        );
      } else if (effectType === "water") {
        addParticle(
          tip.x + randomBetween(-8, 8),
          tip.y + randomBetween(-8, 8),
          randomBetween(-45, 45),
          randomBetween(80, 220),
          randomBetween(0.6, 1.4),
          randomBetween(2, 6),
          Math.random() > 0.5 ? effect.color : effect.secondary,
          "water"
        );
      } else if (effectType === "lightning") {
        addParticle(
          tip.x,
          tip.y,
          Math.cos(angle) * randomBetween(180, 420),
          Math.sin(angle) * randomBetween(180, 420),
          randomBetween(0.3, 0.7),
          randomBetween(2, 5),
          Math.random() > 0.5 ? effect.color : effect.secondary,
          "spark"
        );
      } else {
        addParticle(
          tip.x,
          tip.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          randomBetween(0.5, 1.2),
          randomBetween(2, 6),
          Math.random() > 0.5 ? effect.color : effect.secondary,
          "spark"
        );
      }
    }
  }

  function drawStroke(from, to) {
    drawCtx.save();
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";

    if (state.brushMode === "eraser") {
      drawCtx.globalCompositeOperation = "destination-out";
      drawCtx.strokeStyle = "rgba(0, 0, 0, 1)";
      drawCtx.lineWidth = state.brushWidth * 2.2;
    } else {
      const color = state.brushMode === "effect"
        ? EFFECTS[state.effectType].color
        : state.brushColor;
      drawCtx.strokeStyle = color;
      drawCtx.lineWidth = state.brushWidth;
      if (state.brushMode === "effect") {
        drawCtx.shadowColor = color;
        drawCtx.shadowBlur = 14;
      }
    }

    drawCtx.beginPath();
    drawCtx.moveTo(from.x, from.y);
    drawCtx.lineTo(to.x, to.y);
    drawCtx.stroke();
    drawCtx.restore();
  }

  function smoothTip(rawTip) {
    if (!state.smoothTip) {
      state.smoothTip = { x: rawTip.x, y: rawTip.y };
    } else {
      state.smoothTip.x += (rawTip.x - state.smoothTip.x) * 0.42;
      state.smoothTip.y += (rawTip.y - state.smoothTip.y) * 0.42;
    }
  }

  function updateBrush(dt) {
    if (!state.calibrated || !state.armed || !state.tip) {
      state.drawing = false;
      state.prevSmoothTip = null;
      return;
    }

    if (state.handGesture !== "draw") {
      state.drawing = false;
      state.prevSmoothTip = null;
      return;
    }

    smoothTip(state.tip);

    if (state.drawing && state.prevSmoothTip) {
      const distance = Math.hypot(
        state.smoothTip.x - state.prevSmoothTip.x,
        state.smoothTip.y - state.prevSmoothTip.y
      );
      if (distance > 0.5) {
        drawStroke(state.prevSmoothTip, state.smoothTip);
      }
    }

    state.drawing = true;
    state.prevSmoothTip = { x: state.smoothTip.x, y: state.smoothTip.y };

    if (state.brushMode === "effect") {
      spawnEffectParticles(state.smoothTip, dt, state.effectType);
    }
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;

      if (particle.type === "fire") {
        particle.vy -= 45 * dt;
        particle.vx *= 0.985;
      } else if (particle.type === "water") {
        particle.vy += 240 * dt;
      } else {
        particle.vx *= 0.97;
        particle.vy *= 0.97;
      }
    }

    state.particles = state.particles.filter((particle) => {
      return particle.life > 0 &&
        particle.x > -100 &&
        particle.x < (effectCanvas.width || 640) + 100 &&
        particle.y > -100 &&
        particle.y < (effectCanvas.height || 480) + 100;
    });
  }

  function drawTrackingArea() {
    const width = effectCanvas.width || 640;
    const height = effectCanvas.height || 480;
    effectCtx.save();
    effectCtx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    effectCtx.lineWidth = 2;
    effectCtx.setLineDash([8, 8]);
    effectCtx.strokeRect(8, 8, width - 16, height - 16);
    effectCtx.restore();
  }

  function drawEffects() {
    effectCtx.clearRect(0, 0, effectCanvas.width, effectCanvas.height);
    drawTrackingArea();

    if (state.tip && state.calibrated) {
      const tip = state.smoothTip || state.tip;
      const radius = Math.max(8, state.brushWidth * 0.5);

      effectCtx.save();
      effectCtx.strokeStyle = state.armed
        ? "rgba(255, 255, 255, 0.9)"
        : "rgba(230, 184, 76, 0.95)";
      effectCtx.lineWidth = 2;

      if (!state.armed) {
        effectCtx.setLineDash([6, 6]);
      }

      effectCtx.beginPath();
      effectCtx.arc(tip.x, tip.y, radius + 10, 0, Math.PI * 2);
      effectCtx.stroke();

      effectCtx.setLineDash([]);
      effectCtx.beginPath();
      effectCtx.moveTo(tip.x - 22, tip.y);
      effectCtx.lineTo(tip.x - 8, tip.y);
      effectCtx.moveTo(tip.x + 8, tip.y);
      effectCtx.lineTo(tip.x + 22, tip.y);
      effectCtx.moveTo(tip.x, tip.y - 22);
      effectCtx.lineTo(tip.x, tip.y - 8);
      effectCtx.moveTo(tip.x, tip.y + 8);
      effectCtx.lineTo(tip.x, tip.y + 22);
      effectCtx.stroke();

      effectCtx.fillStyle = state.brushMode === "effect"
        ? EFFECTS[state.effectType].color
        : state.brushColor;
      effectCtx.beginPath();
      effectCtx.arc(tip.x, tip.y, 3, 0, Math.PI * 2);
      effectCtx.fill();
      effectCtx.restore();
    }

    effectCtx.save();
    effectCtx.globalCompositeOperation = "lighter";
    for (const particle of state.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      effectCtx.globalAlpha = alpha;
      effectCtx.fillStyle = particle.color;
      effectCtx.beginPath();
      effectCtx.arc(particle.x, particle.y, Math.max(0.5, particle.size * alpha), 0, Math.PI * 2);
      effectCtx.fill();
    }
    effectCtx.restore();
  }

  function clearCanvas() {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    state.particles = [];
    state.drawing = false;
    state.prevSmoothTip = null;
    brushStatus.textContent = state.calibrated ? "画布已清空" : "画布已清空";
    setRuntime("画布已清空");
  }

  let lastFrameTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    if (state.cameraReady) {
      updateDetection(now);
    }

    updateBrush(dt);
    updateParticles(dt);
    drawEffects();
    requestAnimationFrame(loop);
  }

  function setBrushMode(mode) {
    state.brushMode = mode;
    normalBrushButton.classList.toggle("active", mode === "normal");
    effectBrushButton.classList.toggle("active", mode === "effect");
    eraserButton.classList.toggle("active", mode === "eraser");
    effectTypeGrid.hidden = mode !== "effect";
    state.drawing = false;
    state.prevSmoothTip = null;
    setRuntime(mode === "normal" ? "普通画笔" : mode === "effect" ? "特效画笔" : "橡皮擦");
  }

  function setEffectType(type) {
    state.effectType = type;
    effectTypeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.effect === type);
    });
    setRuntime(`特效画笔：${EFFECTS[type].label}`);
  }

  function toggleDrawing() {
    if (!state.calibrated) {
      return;
    }
    state.armed = !state.armed;
    if (!state.armed) {
      state.drawing = false;
      state.prevSmoothTip = null;
    }
    startDrawButton.textContent = state.armed ? "暂停作画" : "开始作画";
    setRuntime(state.armed ? "作画中" : "已暂停");
  }

  function buildColorGrid() {
    for (const color of COLORS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "color-swatch";
      button.dataset.color = color.value;
      button.style.background = color.value;
      button.title = color.name;
      if (color.value === state.brushColor) {
        button.classList.add("active");
      }
      button.addEventListener("click", () => {
        state.brushColor = color.value;
        document.querySelectorAll(".color-swatch").forEach((item) => {
          item.classList.toggle("active", item.dataset.color === color.value);
        });
      });
      colorGrid.appendChild(button);
    }
  }

  startButton.addEventListener("click", enableDevices);
  calibrateButton.addEventListener("click", startCalibration);
  startDrawButton.addEventListener("click", toggleDrawing);
  clearButton.addEventListener("click", clearCanvas);
  normalBrushButton.addEventListener("click", () => setBrushMode("normal"));
  effectBrushButton.addEventListener("click", () => setBrushMode("effect"));
  eraserButton.addEventListener("click", () => setBrushMode("eraser"));
  effectTypeButtons.forEach((button) => {
    button.addEventListener("click", () => setEffectType(button.dataset.effect));
  });
  brushSizeInput.addEventListener("input", (event) => {
    state.brushWidth = Number(event.target.value);
    updateBrushUI();
  });
  video.addEventListener("loadedmetadata", resizeStage);
  window.addEventListener("beforeunload", () => {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
    }
  });

  buildColorGrid();
  setEffectType("fire");
  updateBrushUI();
})();

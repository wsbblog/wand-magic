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

  const video = document.getElementById("camera");
  const drawCanvas = document.getElementById("drawCanvas");
  const drawCtx = drawCanvas.getContext("2d");
  const effectCanvas = document.getElementById("effectCanvas");
  const effectCtx = effectCanvas.getContext("2d");
  const stage = document.getElementById("stage");
  const startButton = document.getElementById("startButton");
  const calibrateButton = document.getElementById("calibrateButton");
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
  const colorGrid = document.getElementById("colorGrid");
  const brushSizeInput = document.getElementById("brushSizeInput");

  let handLandmarker = null;

  const state = {
    stream: null,
    cameraReady: false,
    mode: "idle",
    calibrated: false,
    handGesture: "none",
    brushMode: "normal",
    brushColor: "#ffffff",
    brushWidth: 6,
    drawing: false,
    prevTip: null,
    tip: null,
    particles: [],
    tipHistory: []
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
    calibrationTarget.hidden = true;
    calibrationProgress.style.width = "100%";
    calibrationLabel.textContent = "食指校准完成";
    calibrateButton.disabled = false;
    handStatus.textContent = "手势识别";
    brushStatus.textContent = "手指：已校准";
    setRuntime("可以开始作画");
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
        numHands: 1
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

  function classifyFist(landmarks) {
    const wrist = landmarks[0];
    const fingers = [
      { tip: 8, mcp: 5 },
      { tip: 12, mcp: 9 },
      { tip: 16, mcp: 13 },
      { tip: 20, mcp: 17 }
    ];
    let extended = 0;

    for (const finger of fingers) {
      const tip = landmarks[finger.tip];
      const mcp = landmarks[finger.mcp];
      const tipDistance = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
      const mcpDistance = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);
      if (tipDistance > mcpDistance * 1.08) {
        extended += 1;
      }
    }

    return extended <= 1;
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
      state.drawing = false;
      state.prevTip = null;
      state.tip = null;
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
    const isFist = classifyFist(landmarks);

    state.handGesture = indexExtended ? "draw" : isFist ? "fist" : "none";
    state.tip = { x: displayX, y: displayY };
    state.tipHistory.push({ x: displayX, y: displayY });
    if (state.tipHistory.length > 8) {
      state.tipHistory.shift();
    }

    if (state.mode === "calibrating" && indexExtended) {
      const centerDistance = Math.hypot(indexTip.x - 0.5, indexTip.y - 0.5);
      if (centerDistance < 0.13) {
        finishFingerCalibration();
      }
    }

    if (state.handGesture === "draw") {
      brushStatus.textContent = "手指：作画中";
    } else if (state.handGesture === "fist") {
      brushStatus.textContent = "手指：调整粗细";
    } else {
      brushStatus.textContent = "手指：已识别";
    }

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

    if (state.particles.length > 500) {
      state.particles.splice(0, state.particles.length - 500);
    }
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function spawnEffectParticles(tip, dt) {
    const count = Math.max(1, Math.round(dt * 90));
    const palette = [state.brushColor, "#ffffff", "#e6b84c", "#4cc9ff", "#ff9ecd"];

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomBetween(15, 90);
      addParticle(
        tip.x + randomBetween(-6, 6),
        tip.y + randomBetween(-6, 6),
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        randomBetween(0.4, 1.1),
        randomBetween(2, 7),
        palette[Math.floor(Math.random() * palette.length)],
        Math.random() > 0.5 ? "spark" : "orb"
      );
    }
  }

  function drawStroke(from, to) {
    drawCtx.save();
    drawCtx.strokeStyle = state.brushColor;
    drawCtx.lineWidth = state.brushWidth;
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";

    if (state.brushMode === "effect") {
      drawCtx.shadowColor = state.brushColor;
      drawCtx.shadowBlur = 16;
    }

    drawCtx.beginPath();
    drawCtx.moveTo(from.x, from.y);
    drawCtx.lineTo(to.x, to.y);
    drawCtx.stroke();
    drawCtx.restore();

    drawCtx.fillStyle = state.brushColor;
    drawCtx.beginPath();
    drawCtx.arc(to.x, to.y, state.brushWidth * 0.5, 0, Math.PI * 2);
    drawCtx.fill();
  }

  function updateBrush(dt) {
    if (!state.calibrated || !state.tip) {
      state.drawing = false;
      state.prevTip = null;
      return;
    }

    const tip = state.tip;

    if (state.handGesture === "fist") {
      state.drawing = false;
      state.prevTip = null;
      state.brushWidth = Math.min(48, state.brushWidth + dt * 28);
      updateBrushUI();
      return;
    }

    if (state.handGesture === "draw") {
      if (state.drawing && state.prevTip) {
        const distance = Math.hypot(tip.x - state.prevTip.x, tip.y - state.prevTip.y);
        if (distance > 1) {
          drawStroke(state.prevTip, tip);
        }
      }

      state.drawing = true;
      state.prevTip = { x: tip.x, y: tip.y };

      if (state.brushMode === "effect") {
        spawnEffectParticles(tip, dt);
      }
      return;
    }

    state.drawing = false;
    state.prevTip = null;
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.97;
      particle.vy *= 0.97;
      particle.life -= dt;
    }

    state.particles = state.particles.filter((particle) => {
      return particle.life > 0 &&
        particle.x > -80 &&
        particle.x < (effectCanvas.width || 640) + 80 &&
        particle.y > -80 &&
        particle.y < (effectCanvas.height || 480) + 80;
    });
  }

  function drawEffects() {
    effectCtx.clearRect(0, 0, effectCanvas.width, effectCanvas.height);

    if (state.tip && state.calibrated) {
      const tip = state.tip;
      const radius = Math.max(6, state.brushWidth * 0.5);
      const isFist = state.handGesture === "fist";

      effectCtx.save();
      effectCtx.strokeStyle = isFist
        ? "rgba(230, 184, 76, 0.95)"
        : "rgba(255, 255, 255, 0.85)";
      effectCtx.lineWidth = 2;
      effectCtx.beginPath();
      effectCtx.arc(tip.x, tip.y, radius + 8, 0, Math.PI * 2);
      effectCtx.stroke();

      if (isFist) {
        const grow = (state.brushWidth / 48) * Math.PI * 2;
        effectCtx.beginPath();
        effectCtx.arc(tip.x, tip.y, radius + 14, -Math.PI / 2, -Math.PI / 2 + grow);
        effectCtx.stroke();
      }

      effectCtx.fillStyle = state.brushColor;
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
    state.prevTip = null;
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
    setRuntime(mode === "normal" ? "普通画笔" : "特效画笔");
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
  clearButton.addEventListener("click", clearCanvas);
  normalBrushButton.addEventListener("click", () => setBrushMode("normal"));
  effectBrushButton.addEventListener("click", () => setBrushMode("effect"));
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
  updateBrushUI();
})();

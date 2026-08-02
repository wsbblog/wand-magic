(() => {
  "use strict";

  const SPELLS = Object.freeze({
    "荧光闪烁": { en: "Lumos", color: "#fff3a6", beam: false, duration: Infinity, rate: 52, kind: "lumos" },
    "除你武器": { en: "Expelliarmus", color: "#ff6573", beam: true, duration: Infinity, rate: 85, kind: "expelliarmus" },
    "昏昏倒地": { en: "Stupefy", color: "#ffb04d", beam: false, duration: Infinity, rate: 82, kind: "stupefy" },
    "统统石化": { en: "Petrificus Totalus", color: "#8fc8ff", beam: false, duration: Infinity, rate: 58, kind: "petrificus" },
    "羽加迪姆勒维奥萨": { en: "Wingardium Leviosa", color: "#c6f5ff", beam: false, duration: Infinity, rate: 54, kind: "leviosa" },
    "火焰熊熊": { en: "Incendio", color: "#ff9344", beam: false, duration: Infinity, rate: 120, kind: "incendio" },
    "清水如泉": { en: "Aguamenti", color: "#4cc9ff", beam: true, duration: Infinity, rate: 92, kind: "aguamenti" },
    "呼神护卫": { en: "Expecto Patronum", color: "#dff3ff", beam: false, duration: Infinity, rate: 105, kind: "patronus" },
    "阿瓦达索命": { en: "Avada Kedavra", color: "#7bf29c", beam: true, duration: Infinity, rate: 86, kind: "avada" }
  });

  const SPELL_ALIASES = Object.freeze([
    { name: "荧光闪烁", aliases: ["荧光闪烁", "荧光", "路摸思", "lumos"] },
    { name: "除你武器", aliases: ["除你武器", "除你武器咒", "expelliarmus"] },
    { name: "昏昏倒地", aliases: ["昏昏倒地", "昏昏倒", "stupefy"] },
    { name: "统统石化", aliases: ["统统石化", "石化咒", "petrificus"] },
    { name: "羽加迪姆勒维奥萨", aliases: ["羽加迪姆勒维奥萨", "羽加迪姆", "勒维奥萨", "漂浮咒", "wingardium"] },
    { name: "火焰熊熊", aliases: ["火焰熊熊", "火焰咒", "incendio"] },
    { name: "清水如泉", aliases: ["清水如泉", "清水咒", "aguamenti"] },
    { name: "呼神护卫", aliases: ["呼神护卫", "守护神咒", "expecto"] },
    { name: "阿瓦达索命", aliases: ["阿瓦达索命", "索命咒", "avada"] }
  ]);

  const CLEAR_ALIASES = Object.freeze(["停止施法", "魔法消散", "清除魔法"]);

  const SCAN_W = 320;
  const SCAN_H = 180;
  const scanCanvas = document.createElement("canvas");
  scanCanvas.width = SCAN_W;
  scanCanvas.height = SCAN_H;
  const scanCtx = scanCanvas.getContext("2d", { willReadFrequently: true });
  const scanMask = new Uint8Array(SCAN_W * SCAN_H);
  const scanVisited = new Uint8Array(SCAN_W * SCAN_H);
  let handLandmarker = null;

  const video = document.getElementById("camera");
  const effectCanvas = document.getElementById("effectCanvas");
  const effectCtx = effectCanvas.getContext("2d");
  const stage = document.getElementById("stage");
  const startButton = document.getElementById("startButton");
  const calibrateButton = document.getElementById("calibrateButton");
  const stopButton = document.getElementById("stopButton");
  const cameraStatus = document.getElementById("cameraStatus");
  const micStatus = document.getElementById("micStatus");
  const handStatus = document.getElementById("handStatus");
  const speechStatus = document.getElementById("speechStatus");
  const runtimeStatus = document.getElementById("runtimeStatus");
  const wandStatus = document.getElementById("wandStatus");
  const calibrationTarget = document.getElementById("calibrationTarget");
  const calibrationLabel = document.getElementById("calibrationLabel");
  const calibrationProgress = document.getElementById("calibrationProgress");
  const castBanner = document.getElementById("castBanner");
  const transcript = document.getElementById("transcript");
  const spellList = document.getElementById("spellList");

  const state = {
    stream: null,
    cameraReady: false,
    micReady: false,
    speechOn: false,
    trackingMode: "idle",
    userChoseColor: false,
    mode: "idle",
    wand: {
      calibrated: false,
      colorCalibrated: false,
      h: 0,
      sMin: 0,
      vMin: 0,
      hRange: 0,
      x: 0,
      y: 0,
      confidence: 0,
      area: 0
    },
    calibration: {
      frames: [],
      start: 0
    },
    activeSpell: null,
    spellStartedAt: 0,
    particles: [],
    beams: [],
    tipHistory: [],
    lastCommandName: "",
    lastCommandAt: 0,
    bannerTimer: 0
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

  function rgbToHsv(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;

    if (delta !== 0) {
      if (max === rn) {
        h = 60 * (((gn - bn) / delta) % 6);
      } else if (max === gn) {
        h = 60 * ((bn - rn) / delta + 2);
      } else {
        h = 60 * ((rn - gn) / delta + 4);
      }
    }

    if (h < 0) {
      h += 360;
    }

    const s = max === 0 ? 0 : (delta / max) * 100;
    const v = max * 100;
    return { h, s, v };
  }

  function inColorRangeWith(hsv, hueRange, saturationMin, valueMin) {
    const diff = Math.abs(hsv.h - state.wand.h) % 360;
    const hueDistance = diff > 180 ? 360 - diff : diff;
    return (
      hueDistance <= hueRange &&
      hsv.s >= saturationMin &&
      hsv.v >= valueMin
    );
  }

  function inColorRange(hsv) {
    return inColorRangeWith(hsv, state.wand.hRange, state.wand.sMin, state.wand.vMin);
  }

  function resizeStage() {
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    effectCanvas.width = width;
    effectCanvas.height = height;
    stage.style.aspectRatio = `${width} / ${height}`;
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
        },
        audio: true
      });

      state.stream = stream;
      state.cameraReady = true;
      state.micReady = true;
      video.srcObject = stream;
      await video.play();

      cameraStatus.textContent = "已连接";
      micStatus.textContent = "已连接";
      startButton.textContent = "设备已开启";
      calibrateButton.disabled = false;
      stopButton.disabled = false;
      setRuntime("运行中");

      resizeStage();
      startSpeechRecognition();
      initializeHandTracking();
      requestAnimationFrame(loop);
    } catch (error) {
      const denied = error && (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError" ||
        error.name === "SecurityError"
      );
      cameraStatus.textContent = denied ? "权限被拒绝" : "连接失败";
      micStatus.textContent = denied ? "权限被拒绝" : "连接失败";
      setRuntime("设备不可用");
      startButton.disabled = false;
      startButton.textContent = "重新请求权限";
    }
  }

  function startCalibration() {
    if (!state.cameraReady) {
      return;
    }

    state.mode = "calibrating";
    state.trackingMode = "color";
    state.userChoseColor = true;
    state.wand.calibrated = false;
    state.wand.colorCalibrated = false;
    state.wand.confidence = 0;
    state.calibration.frames = [];
    state.calibration.start = performance.now();
    calibrationTarget.hidden = false;
    calibrationLabel.textContent = "请把魔杖尖端或手掌保持在圆圈内";
    calibrationProgress.style.width = "0%";
    wandStatus.textContent = "魔杖：校准中";
    calibrateButton.disabled = true;
    handStatus.textContent = "颜色校准";
  }

  function collectCalibrationFrame(now) {
    const halfX = 48;
    const halfY = 36;
    const cx = Math.floor(SCAN_W / 2);
    const cy = Math.floor(SCAN_H / 2);
    const imageData = scanCtx.getImageData(cx - halfX, cy - halfY, halfX * 2, halfY * 2);
    const data = imageData.data;
    const colors = [];

    for (let i = 0; i < imageData.width * imageData.height; i += 1) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const hsv = rgbToHsv(r, g, b);
      if (hsv.s >= 12 && hsv.v >= 30 && hsv.v <= 250) {
        colors.push(hsv);
      }
    }

    if (colors.length >= 20) {
      const h = colors.reduce((sum, item) => sum + item.h, 0) / colors.length;
      const s = colors.reduce((sum, item) => sum + item.s, 0) / colors.length;
      const v = colors.reduce((sum, item) => sum + item.v, 0) / colors.length;
      state.calibration.frames.push({ h, s, v });
    }

    const elapsed = now - state.calibration.start;
    const progress = Math.min(100, (elapsed / 1800) * 100);
    calibrationProgress.style.width = `${progress}%`;
    calibrationLabel.textContent = `校准中 ${state.calibration.frames.length}/6 帧…`;

    if (elapsed >= 1800) {
      finishCalibration();
    }
  }

  function finishCalibration() {
    const frames = state.calibration.frames;
    calibrationTarget.hidden = true;
    calibrateButton.disabled = false;

    if (frames.length < 6) {
      state.mode = "idle";
      calibrationLabel.textContent = "没有采集到足够颜色，请重试";
      wandStatus.textContent = "魔杖：颜色不足";
      handStatus.textContent = "颜色校准";
      setRuntime("校准失败");
      return;
    }

    const radians = frames.map((item) => (item.h * Math.PI) / 180);
    const cosSum = radians.reduce((sum, angle) => sum + Math.cos(angle), 0);
    const sinSum = radians.reduce((sum, angle) => sum + Math.sin(angle), 0);
    const count = frames.length;
    let meanHue = (Math.atan2(sinSum / count, cosSum / count) * 180) / Math.PI;
    if (meanHue < 0) {
      meanHue += 360;
    }

    const meanCos = cosSum / count;
    const meanSin = sinSum / count;
    const concentration = Math.hypot(meanCos, meanSin);
    const hueRange = Math.max(20, Math.min(50, 28 + (1 - concentration) * 35));
    const sMean = frames.reduce((sum, item) => sum + item.s, 0) / count;
    const vMean = frames.reduce((sum, item) => sum + item.v, 0) / count;
    const width = effectCanvas.width || video.videoWidth || 640;
    const height = effectCanvas.height || video.videoHeight || 480;

    state.wand = {
      calibrated: true,
      colorCalibrated: true,
      h: meanHue,
      sMin: Math.max(40, sMean - 75),
      vMin: Math.max(30, vMean - 95),
      hRange: hueRange,
      x: width / 2,
      y: height / 2,
      confidence: 0.55,
      area: 0
    };
    state.mode = "ready";
    state.trackingMode = "color";
    state.tipHistory = [{ x: width / 2, y: height / 2 }];
    calibrationLabel.textContent = "校准完成";
    wandStatus.textContent = "魔杖：已校准";
    handStatus.textContent = "颜色校准";
    setRuntime("等待咒语");
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

      if (state.userChoseColor) {
        state.trackingMode = "color";
        handStatus.textContent = "颜色校准";
        return;
      }

      state.trackingMode = "hand";
      state.wand.calibrated = true;
      state.wand.colorCalibrated = false;
      state.wand.confidence = 0;
      state.mode = "ready";
      state.wand.x = (effectCanvas.width || video.videoWidth || 640) / 2;
      state.wand.y = (effectCanvas.height || video.videoHeight || 480) / 2;
      handStatus.textContent = "已就绪";
      wandStatus.textContent = "手部识别：就绪";
      setRuntime("等待咒语");
    } catch (_) {
      state.trackingMode = "color";
      handStatus.textContent = "不可用";
      wandStatus.textContent = "手部识别不可用，请使用颜色校准";
    }
  }

  function detectHand(now) {
    if (!handLandmarker) {
      return;
    }

    let result;
    try {
      result = handLandmarker.detectForVideo(video, now);
    } catch (_) {
      return;
    }

    if (!result.landmarks || !result.landmarks.length) {
      state.wand.confidence = Math.max(0, state.wand.confidence - 0.01);
      wandStatus.textContent = state.wand.confidence > 0.08
        ? "手部：弱信号"
        : "手部：丢失";
      return false;
    }

    const landmarks = result.landmarks[0];
    const indexPip = landmarks[6];
    const indexTip = landmarks[8];
    const width = video.videoWidth || effectCanvas.width || 640;
    const height = video.videoHeight || effectCanvas.height || 480;
    const dx = indexTip.x - indexPip.x;
    const dy = indexTip.y - indexPip.y;
    const tipX = indexTip.x + dx * 0.65;
    const tipY = indexTip.y + dy * 0.65;
    const displayX = (1 - tipX) * width;
    const displayY = tipY * height;

    state.wand.x = state.wand.x
      ? state.wand.x + (displayX - state.wand.x) * 0.55
      : displayX;
    state.wand.y = state.wand.y
      ? state.wand.y + (displayY - state.wand.y) * 0.55
      : displayY;
    state.wand.confidence = Math.min(1, state.wand.confidence + 0.15);
    state.wand.area = 1;
    state.tipHistory.push({ x: state.wand.x, y: state.wand.y });
    if (state.tipHistory.length > 8) {
      state.tipHistory.shift();
    }
    wandStatus.textContent = "手部：已识别";
    return true;
  }

  function findColorBlob(hueRange, saturationMin, valueMin, minArea) {
    const imageData = scanCtx.getImageData(0, 0, SCAN_W, SCAN_H);
    const data = imageData.data;
    scanMask.fill(0);
    scanVisited.fill(0);

    for (let i = 0; i < SCAN_W * SCAN_H; i += 1) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      if (inColorRangeWith(rgbToHsv(r, g, b), hueRange, saturationMin, valueMin)) {
        scanMask[i] = 1;
      }
    }

    const baseWidth = video.videoWidth || effectCanvas.width || 640;
    const baseHeight = video.videoHeight || effectCanvas.height || 480;
    const lastRawX = SCAN_W - (state.wand.x / baseWidth) * SCAN_W;
    const lastRawY = (state.wand.y / baseHeight) * SCAN_H;
    let best = null;

    for (let start = 0; start < SCAN_W * SCAN_H; start += 1) {
      if (!scanMask[start] || scanVisited[start]) {
        continue;
      }

      const stack = [start];
      scanVisited[start] = 1;
      let area = 0;
      let sumX = 0;
      let sumY = 0;

      while (stack.length) {
        const index = stack.pop();
        const x = index % SCAN_W;
        const y = (index - x) / SCAN_W;
        area += 1;
        sumX += x;
        sumY += y;

        if (x > 0 && scanMask[index - 1] && !scanVisited[index - 1]) {
          scanVisited[index - 1] = 1;
          stack.push(index - 1);
        }
        if (x < SCAN_W - 1 && scanMask[index + 1] && !scanVisited[index + 1]) {
          scanVisited[index + 1] = 1;
          stack.push(index + 1);
        }
        if (index >= SCAN_W && scanMask[index - SCAN_W] && !scanVisited[index - SCAN_W]) {
          scanVisited[index - SCAN_W] = 1;
          stack.push(index - SCAN_W);
        }
        if (index < SCAN_W * (SCAN_H - 1) && scanMask[index + SCAN_W] && !scanVisited[index + SCAN_W]) {
          scanVisited[index + SCAN_W] = 1;
          stack.push(index + SCAN_W);
        }
      }

      if (area >= minArea) {
        const cx = sumX / area;
        const cy = sumY / area;
        const distance = Math.hypot(cx - lastRawX, cy - lastRawY);
        const proximityBoost = state.wand.confidence > 0.06 ? 4 / (1 + distance / 40) : 0;
        const score = area * (1 + proximityBoost);
        if (!best || score > best.score) {
          best = { cx, cy, area, score };
        }
      }
    }

    return best;
  }

  function detectWandTip() {
    let best = findColorBlob(state.wand.hRange, state.wand.sMin, state.wand.vMin, 6);
    let usingExpandedRange = false;

    if (!best) {
      const expandedHue = Math.min(95, state.wand.hRange + 18);
      const expandedSaturation = Math.max(8, state.wand.sMin - 22);
      const expandedValue = Math.max(15, state.wand.vMin - 15);
      best = findColorBlob(expandedHue, expandedSaturation, expandedValue, 4);
      usingExpandedRange = Boolean(best);
    }

    const baseWidth = video.videoWidth || effectCanvas.width || 640;
    const baseHeight = video.videoHeight || effectCanvas.height || 480;

    if (best) {
      const mirroredX = SCAN_W - best.cx;
      const displayX = (mirroredX / SCAN_W) * baseWidth;
      const displayY = (best.cy / SCAN_H) * baseHeight;
      const nextX = state.wand.calibrated
        ? state.wand.x + (displayX - state.wand.x) * 0.55
        : displayX;
      const nextY = state.wand.calibrated
        ? state.wand.y + (displayY - state.wand.y) * 0.55
        : displayY;

      state.wand.x = nextX;
      state.wand.y = nextY;
      state.wand.confidence = Math.min(1, state.wand.confidence + (usingExpandedRange ? 0.08 : 0.14));
      state.wand.area = best.area;
      state.tipHistory.push({ x: nextX, y: nextY });
      if (state.tipHistory.length > 8) {
        state.tipHistory.shift();
      }
      wandStatus.textContent = usingExpandedRange ? "魔杖：弱信号" : "魔杖：已识别";
    } else {
      state.wand.confidence = Math.max(0, state.wand.confidence - 0.008);
      wandStatus.textContent = state.wand.confidence > 0.25
        ? "魔杖：保持跟踪"
        : state.wand.confidence > 0.08
          ? "魔杖：弱信号"
          : "魔杖：丢失";
    }
  }

  function updateDetection(now) {
    if (video.readyState < 2) {
      return;
    }

    if (state.mode === "calibrating") {
      scanCtx.drawImage(video, 0, 0, SCAN_W, SCAN_H);
      collectCalibrationFrame(now);
      return;
    }

    if (state.trackingMode === "hand" && handLandmarker) {
      const handFound = detectHand(now);
      if (!handFound && state.wand.colorCalibrated) {
        scanCtx.drawImage(video, 0, 0, SCAN_W, SCAN_H);
        detectWandTip();
      }
      return;
    }

    scanCtx.drawImage(video, 0, 0, SCAN_W, SCAN_H);
    if (state.wand.calibrated) {
      detectWandTip();
    }
  }

  function normalizeCommand(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[\s，。！？、,.!?；;：:"'“”‘’\-]/g, "");
  }

  function matchCommand(text) {
    const normalized = normalizeCommand(text);
    if (!normalized) {
      return null;
    }

    if (CLEAR_ALIASES.some((alias) => normalized.includes(normalizeCommand(alias)))) {
      return { type: "clear" };
    }

    for (const entry of SPELL_ALIASES) {
      if (entry.aliases.some((alias) => normalized.includes(normalizeCommand(alias)))) {
        return { type: "spell", name: entry.name };
      }
    }

    return null;
  }

  function handleTranscript(text) {
    const command = matchCommand(text);
    if (!command) {
      transcript.textContent = `${text}…`;
      return;
    }

    if (command.type === "clear") {
      clearMagic();
      transcript.textContent = "魔法已停止";
      return;
    }

    const now = Date.now();
    if (now - state.lastCommandAt < 1500 && state.lastCommandName === command.name) {
      return;
    }

    triggerSpell(command.name, "voice");
  }

  function startSpeechRecognition() {
    if (!state.micReady || state.speechOn) {
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      speechStatus.textContent = "需 Chrome/Edge";
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      state.speechOn = true;
      speechStatus.textContent = "聆听中";
    };

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (result.isFinal) {
          handleTranscript(text);
        } else if (!state.activeSpell) {
          transcript.textContent = `${text}…`;
        }
      }
    };

    recognition.onerror = (event) => {
      speechStatus.textContent = `语音错误：${event.error}`;
    };

    recognition.onend = () => {
      state.speechOn = false;
      speechStatus.textContent = "已停止";
      if (state.micReady) {
        setTimeout(() => {
          if (!state.speechOn) {
            try {
              recognition.start();
            } catch (_) {
              // The browser may still be shutting the session down.
            }
          }
        }, 350);
      }
    };

    try {
      recognition.start();
    } catch (_) {
      speechStatus.textContent = "启动失败";
    }
  }

  function getTipPoint() {
    const width = effectCanvas.width || 640;
    const height = effectCanvas.height || 480;
    if (state.wand.calibrated) {
      const history = state.tipHistory;
      if (history.length >= 3) {
        const previous = history[history.length - 3];
        const current = history[history.length - 1];
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        return {
          x: current.x + dx * 0.22,
          y: current.y + dy * 0.22
        };
      }
      return { x: state.wand.x, y: state.wand.y };
    }
    return { x: width / 2, y: height / 2 };
  }

  function triggerSpell(name, source) {
    const spell = SPELLS[name];
    if (!spell) {
      return;
    }

    state.activeSpell = name;
    state.spellStartedAt = performance.now();
    state.particles = [];
    state.beams = [];
    state.lastCommandName = name;
    state.lastCommandAt = Date.now();

    const tip = getTipPoint();
    state.tipHistory.push({ x: tip.x, y: tip.y });
    if (state.tipHistory.length > 8) {
      state.tipHistory.shift();
    }

    if (spell.beam) {
      state.beams.push({
        x1: tip.x,
        y1: tip.y,
        x2: tip.x + 120,
        y2: tip.y - 40,
        color: spell.color
      });
    }

    document.querySelectorAll(".spell-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.spell === name);
    });

    castBanner.textContent = `${name} · ${spell.en}`;
    castBanner.hidden = false;
    castBanner.classList.add("show");
    clearTimeout(state.bannerTimer);
    state.bannerTimer = setTimeout(() => {
      castBanner.classList.remove("show");
    }, 1600);

    transcript.textContent = source === "voice" ? `语音识别：${name}` : `手动施法：${name}`;
    setRuntime(`施法：${name}`);
  }

  function clearMagic() {
    state.activeSpell = null;
    state.particles = [];
    state.beams = [];
    document.querySelectorAll(".spell-button").forEach((button) => {
      button.classList.remove("active");
    });
    castBanner.hidden = true;
    castBanner.classList.remove("show");
    transcript.textContent = "等待咒语";
    setRuntime("等待咒语");
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

    if (state.particles.length > 700) {
      state.particles.splice(0, state.particles.length - 700);
    }
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function getBeamEnd(tip) {
    const history = state.tipHistory;
    const older = history.length >= 3
      ? history[Math.max(0, history.length - 3)]
      : { x: tip.x + 80, y: tip.y - 40 };
    let dx = tip.x - older.x;
    let dy = tip.y - older.y;
    const length = Math.hypot(dx, dy);

    if (length < 8) {
      dx = 110;
      dy = -35;
    } else {
      dx = (dx / length) * 280;
      dy = (dy / length) * 280;
    }

    return { x: tip.x + dx, y: tip.y + dy };
  }

  function spawnEffectParticles(spell, tip, count) {
    for (let i = 0; i < count; i += 1) {
      if (spell.kind === "lumos") {
        addParticle(
          tip.x + randomBetween(-10, 10),
          tip.y + randomBetween(-10, 10),
          randomBetween(-14, 14),
          randomBetween(-18, 18),
          randomBetween(0.8, 1.6),
          randomBetween(4, 10),
          Math.random() > 0.5 ? "#fff9cf" : "#ffd98a",
          "orb"
        );
      } else if (spell.kind === "expelliarmus") {
        const angle = Math.random() * Math.PI * 2;
        const speed = randomBetween(90, 280);
        addParticle(
          tip.x,
          tip.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          randomBetween(0.45, 0.9),
          randomBetween(2, 5),
          "#ff6573",
          "spark"
        );
      } else if (spell.kind === "stupefy") {
        const angle = Math.random() * Math.PI * 2;
        const speed = randomBetween(160, 430);
        addParticle(
          tip.x,
          tip.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          randomBetween(0.35, 0.8),
          randomBetween(3, 7),
          Math.random() > 0.5 ? "#ffb04d" : "#ffe2a3",
          "spark"
        );
      } else if (spell.kind === "petrificus") {
        addParticle(
          tip.x + randomBetween(-12, 12),
          tip.y + randomBetween(-12, 12),
          randomBetween(-22, 22),
          randomBetween(-26, 26),
          randomBetween(1, 1.9),
          randomBetween(2, 5),
          Math.random() > 0.5 ? "#8fc8ff" : "#dff3ff",
          "ice"
        );
      } else if (spell.kind === "leviosa") {
        addParticle(
          tip.x + randomBetween(-22, 22),
          tip.y + randomBetween(-6, 14),
          randomBetween(-24, 24),
          randomBetween(-70, -26),
          randomBetween(1.3, 2.4),
          randomBetween(3, 7),
          Math.random() > 0.5 ? "#c6f5ff" : "#9ae8ff",
          "float"
        );
      } else if (spell.kind === "incendio") {
        addParticle(
          tip.x + randomBetween(-6, 6),
          tip.y + randomBetween(-6, 6),
          randomBetween(-26, 26),
          randomBetween(-130, -35),
          randomBetween(0.5, 1.3),
          randomBetween(4, 12),
          Math.random() > 0.5 ? "#ff9344" : "#ffd166",
          "flame"
        );
        if (Math.random() > 0.55) {
          addParticle(
            tip.x,
            tip.y,
            randomBetween(-50, 50),
            randomBetween(-60, 10),
            randomBetween(0.3, 0.7),
            randomBetween(1, 3),
            "#ffb36b",
            "spark"
          );
        }
      } else if (spell.kind === "aguamenti") {
        addParticle(
          tip.x + randomBetween(-8, 8),
          tip.y,
          randomBetween(-40, 40),
          randomBetween(70, 190),
          randomBetween(0.7, 1.4),
          randomBetween(2, 5),
          Math.random() > 0.5 ? "#4cc9ff" : "#a6e5ff",
          "drop"
        );
      } else if (spell.kind === "patronus") {
        const angle = Math.random() * Math.PI * 2;
        const speed = randomBetween(40, 220);
        addParticle(
          tip.x,
          tip.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed - 30,
          randomBetween(0.8, 1.8),
          randomBetween(2, 6),
          Math.random() > 0.5 ? "#dff3ff" : "#a8dfff",
          "spark"
        );
      } else if (spell.kind === "avada") {
        const angle = Math.random() * Math.PI * 2;
        const speed = randomBetween(50, 200);
        addParticle(
          tip.x,
          tip.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          randomBetween(0.6, 1.2),
          randomBetween(2, 5),
          Math.random() > 0.5 ? "#7bf29c" : "#c8ffd6",
          "spark"
        );
      }
    }
  }

  function updateActiveSpell(dt) {
    const name = state.activeSpell;
    if (!name) {
      return;
    }

    const spell = SPELLS[name];
    if (Number.isFinite(spell.duration) && performance.now() - state.spellStartedAt >= spell.duration) {
      clearMagic();
      return;
    }

    const tip = getTipPoint();
    const count = Math.max(1, Math.round(spell.rate * dt));
    spawnEffectParticles(spell, tip, count);

    if (spell.beam) {
      const end = getBeamEnd(tip);
      if (!state.beams.length) {
        state.beams.push({ x1: tip.x, y1: tip.y, x2: end.x, y2: end.y, color: spell.color });
      } else {
        const beam = state.beams[0];
        beam.x1 = tip.x;
        beam.y1 = tip.y;
        beam.x2 = end.x;
        beam.y2 = end.y;
        beam.color = spell.color;
      }
    }
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;

      if (particle.type === "flame") {
        particle.vy -= 28 * dt;
      } else if (particle.type === "drop") {
        particle.vy += 170 * dt;
      } else if (particle.type === "float") {
        particle.vy -= 18 * dt;
      }

      particle.vx *= 0.985;
      particle.vy *= 0.985;
    }

    state.particles = state.particles.filter((particle) => {
      return (
        particle.life > 0 &&
        particle.x > -120 &&
        particle.x < (effectCanvas.width || 640) + 120 &&
        particle.y > -120 &&
        particle.y < (effectCanvas.height || 480) + 120
      );
    });
  }

  function drawWandMarker() {
    if (!state.wand.calibrated || state.wand.confidence <= 0.04) {
      return;
    }

    const point = getTipPoint();
    const x = point.x;
    const y = point.y;
    const pulse = Math.sin(performance.now() * 0.006) * 2;
    const color = state.activeSpell ? SPELLS[state.activeSpell].color : "#ffffff";

    effectCtx.save();
    effectCtx.strokeStyle = hexToRgba(color, 0.9);
    effectCtx.lineWidth = 2;
    effectCtx.beginPath();
    effectCtx.arc(x, y, 20 + pulse, 0, Math.PI * 2);
    effectCtx.stroke();

    effectCtx.beginPath();
    effectCtx.moveTo(x - 30, y);
    effectCtx.lineTo(x - 11, y);
    effectCtx.moveTo(x + 11, y);
    effectCtx.lineTo(x + 30, y);
    effectCtx.moveTo(x, y - 30);
    effectCtx.lineTo(x, y - 11);
    effectCtx.moveTo(x, y + 11);
    effectCtx.lineTo(x, y + 30);
    effectCtx.stroke();

    effectCtx.fillStyle = "#ffffff";
    effectCtx.beginPath();
    effectCtx.arc(x, y, 3, 0, Math.PI * 2);
    effectCtx.fill();
    effectCtx.restore();
  }

  function drawActiveAura() {
    const spell = state.activeSpell ? SPELLS[state.activeSpell] : null;
    if (!spell) {
      return;
    }

    const tip = getTipPoint();
    const extra = spell.kind === "patronus" ? 56 : 0;
    const radius = 72 + extra + Math.sin(performance.now() * 0.012) * 10;
    const gradient = effectCtx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, radius);
    gradient.addColorStop(0, hexToRgba(spell.color, 0.34));
    gradient.addColorStop(0.65, hexToRgba(spell.color, 0.1));
    gradient.addColorStop(1, hexToRgba(spell.color, 0));

    effectCtx.save();
    effectCtx.globalCompositeOperation = "lighter";
    effectCtx.fillStyle = gradient;
    effectCtx.beginPath();
    effectCtx.arc(tip.x, tip.y, radius, 0, Math.PI * 2);
    effectCtx.fill();
    effectCtx.restore();
  }

  function drawParticles() {
    effectCtx.save();
    effectCtx.globalCompositeOperation = "lighter";

    for (const particle of state.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      effectCtx.globalAlpha = alpha;
      effectCtx.fillStyle = particle.color;

      if (particle.type === "flame") {
        const angle = Math.atan2(particle.vy, particle.vx);
        effectCtx.save();
        effectCtx.translate(particle.x, particle.y);
        effectCtx.rotate(angle + Math.PI / 2);
        effectCtx.beginPath();
        effectCtx.moveTo(0, -particle.size * 1.35);
        effectCtx.lineTo(particle.size * 0.7, particle.size);
        effectCtx.lineTo(-particle.size * 0.7, particle.size);
        effectCtx.closePath();
        effectCtx.fill();
        effectCtx.restore();
      } else if (particle.type === "float") {
        effectCtx.save();
        effectCtx.translate(particle.x, particle.y);
        effectCtx.rotate(particle.rotation + performance.now() * 0.001);
        effectCtx.fillRect(-particle.size * 0.6, -particle.size * 0.6, particle.size * 1.2, particle.size * 1.2);
        effectCtx.restore();
      } else {
        effectCtx.beginPath();
        effectCtx.arc(particle.x, particle.y, Math.max(0.5, particle.size * alpha), 0, Math.PI * 2);
        effectCtx.fill();
      }
    }

    effectCtx.restore();
  }

  function drawBeams() {
    if (!state.beams.length) {
      return;
    }

    effectCtx.save();
    effectCtx.globalCompositeOperation = "lighter";

    for (const beam of state.beams) {
      const gradient = effectCtx.createLinearGradient(beam.x1, beam.y1, beam.x2, beam.y2);
      gradient.addColorStop(0, hexToRgba(beam.color, 0.12));
      gradient.addColorStop(1, hexToRgba(beam.color, 0.92));
      effectCtx.shadowColor = beam.color;
      effectCtx.shadowBlur = 18;
      effectCtx.strokeStyle = gradient;
      effectCtx.lineWidth = 10;
      effectCtx.beginPath();
      effectCtx.moveTo(beam.x1, beam.y1);
      effectCtx.lineTo(beam.x2, beam.y2);
      effectCtx.stroke();

      effectCtx.shadowBlur = 24;
      effectCtx.fillStyle = beam.color;
      effectCtx.beginPath();
      effectCtx.arc(beam.x2, beam.y2, 14, 0, Math.PI * 2);
      effectCtx.fill();
    }

    effectCtx.restore();
  }

  function draw() {
    effectCtx.clearRect(0, 0, effectCanvas.width, effectCanvas.height);
    drawWandMarker();
    drawActiveAura();
    drawParticles();
    drawBeams();
  }

  let lastFrameTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    if (state.cameraReady) {
      updateDetection(now);
    }

    updateActiveSpell(dt);
    updateParticles(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function buildSpellList() {
    for (const [name, spell] of Object.entries(SPELLS)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "spell-button";
      button.dataset.spell = name;

      const nameElement = document.createElement("span");
      nameElement.className = "spell-name";
      nameElement.textContent = name;

      const enElement = document.createElement("span");
      enElement.className = "spell-en";
      enElement.textContent = spell.en;

      button.append(nameElement, enElement);
      button.addEventListener("click", () => triggerSpell(name, "button"));
      spellList.appendChild(button);
    }
  }

  startButton.addEventListener("click", enableDevices);
  calibrateButton.addEventListener("click", startCalibration);
  stopButton.addEventListener("click", clearMagic);
  video.addEventListener("loadedmetadata", resizeStage);
  window.addEventListener("beforeunload", () => {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
    }
  });

  buildSpellList();
})();

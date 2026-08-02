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
  const chargeMeter = document.getElementById("chargeMeter");
  const chargeLabel = document.getElementById("chargeLabel");
  const chargeFill = document.getElementById("chargeFill");
  const chargeValue = document.getElementById("chargeValue");

  const state = {
    stream: null,
    cameraReady: false,
    micReady: false,
    speechOn: false,
    trackingMode: "idle",
    mode: "idle",
    palmCalibrated: false,
    handGesture: "none",
    charging: false,
    charge: 0,
    selectedSpell: "除你武器",
    release: null,
    wand: {
      calibrated: false,
      x: 0,
      y: 0,
      confidence: 0
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
      handStatus.textContent = "加载中";
      wandStatus.textContent = "手掌：等待识别";
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

    if (!handLandmarker) {
      calibrationTarget.hidden = true;
      calibrateButton.disabled = true;
      handStatus.textContent = "不可用";
      wandStatus.textContent = "手势识别不可用";
      setRuntime("无法校准");
      return;
    }

    state.mode = "calibrating";
    state.trackingMode = "hand";
    state.palmCalibrated = false;
    state.wand.calibrated = true;
    state.wand.confidence = 0;
    calibrationTarget.hidden = false;
    calibrationLabel.textContent = "请张开手掌放在圆圈中";
    calibrationProgress.style.width = "0%";
    calibrateButton.disabled = true;
    wandStatus.textContent = "手掌：校准中";
    handStatus.textContent = "等待张开手掌";
  }

  function finishPalmCalibration() {
    state.palmCalibrated = true;
    state.mode = "ready";
    state.trackingMode = "hand";
    calibrationTarget.hidden = true;
    calibrationProgress.style.width = "100%";
    calibrationLabel.textContent = "手掌校准完成";
    wandStatus.textContent = "手掌：已校准";
    handStatus.textContent = "手势识别";
    calibrateButton.disabled = false;
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

      state.trackingMode = "hand";
      state.palmCalibrated = true;
      state.wand.calibrated = true;
      state.wand.confidence = 0;
      state.mode = "ready";
      state.wand.x = (effectCanvas.width || video.videoWidth || 640) / 2;
      state.wand.y = (effectCanvas.height || video.videoHeight || 480) / 2;
      handStatus.textContent = "手势识别";
      wandStatus.textContent = "手掌：等待识别";
      setRuntime("等待咒语");
    } catch (_) {
      state.trackingMode = "hand";
      handStatus.textContent = "不可用";
      wandStatus.textContent = "手势识别不可用";
      calibrateButton.disabled = true;
      setRuntime("手势识别不可用");
    }
  }

  function classifyHandGesture(landmarks) {
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

    if (extended >= 4) {
      return "open";
    }
    if (extended <= 1) {
      return "fist";
    }
    return "partial";
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
      state.handGesture = "none";
      state.charging = false;
      chargeMeter.hidden = true;
      state.wand.confidence = Math.max(0, state.wand.confidence - 0.01);
      wandStatus.textContent = state.wand.confidence > 0.08
        ? "手掌：弱信号"
        : "手掌：丢失";
      return false;
    }

    const landmarks = result.landmarks[0];
    const gesture = classifyHandGesture(landmarks);
    state.handGesture = gesture;

    const palmIndices = [0, 5, 9, 13, 17];
    let palmX = 0;
    let palmY = 0;
    for (const index of palmIndices) {
      palmX += landmarks[index].x;
      palmY += landmarks[index].y;
    }
    palmX /= palmIndices.length;
    palmY /= palmIndices.length;

    const width = video.videoWidth || effectCanvas.width || 640;
    const height = video.videoHeight || effectCanvas.height || 480;
    const displayX = (1 - palmX) * width;
    const displayY = palmY * height;

    state.wand.x = state.wand.x
      ? state.wand.x + (displayX - state.wand.x) * 0.55
      : displayX;
    state.wand.y = state.wand.y
      ? state.wand.y + (displayY - state.wand.y) * 0.55
      : displayY;
    state.wand.confidence = Math.min(1, state.wand.confidence + 0.15);
    state.tipHistory.push({ x: state.wand.x, y: state.wand.y });
    if (state.tipHistory.length > 8) {
      state.tipHistory.shift();
    }

    if (state.mode === "calibrating" && gesture === "open") {
      finishPalmCalibration();
    }

    wandStatus.textContent = gesture === "fist"
      ? "手掌：蓄力"
      : gesture === "open"
        ? "手掌：张开"
        : "手掌：已识别";
    return true;
  }

  function updateDetection(now) {
    if (video.readyState < 2) {
      return;
    }

    if (state.mode === "calibrating") {
      if (handLandmarker) {
        detectHand(now);
      }
      return;
    }

    if (handLandmarker) {
      detectHand(now);
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

  function castBeam(name, power, source) {
    const spell = SPELLS[name];
    if (!spell) {
      return;
    }

    const normalizedPower = Math.max(0.1, Math.min(1, power));
    const duration = 1000 + normalizedPower * 3200;
    const beamLength = 140 + normalizedPower * 520;
    state.activeSpell = name;
    state.selectedSpell = name;
    state.release = {
      name,
      power: normalizedPower,
      startedAt: performance.now(),
      duration,
      beamLength
    };
    state.particles = [];
    state.beams = [];
    state.lastCommandName = name;
    state.lastCommandAt = Date.now();

    const tip = getTipPoint();
    state.tipHistory.push({ x: tip.x, y: tip.y });
    if (state.tipHistory.length > 8) {
      state.tipHistory.shift();
    }

    const end = getBeamEnd(tip, beamLength * 0.85);
    state.beams.push({
      x1: tip.x,
      y1: tip.y,
      x2: end.x,
      y2: end.y,
      color: spell.color,
      fade: 1
    });

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

    transcript.textContent = source === "voice"
      ? `语音识别：${name}`
      : source === "gesture"
        ? `蓄力释放：${name}`
        : `手动施法：${name}`;
    setRuntime(`施法：${name}`);
  }

  function triggerSpell(name, source) {
    castBeam(name, 0.8, source);
  }

  function releaseChargedSpell() {
    const name = state.selectedSpell || "除你武器";
    const power = state.charge;
    state.charging = false;
    castBeam(name, power, "gesture");
    state.charge = 0;
    updateChargeUI();
  }

  function updateChargeUI() {
    const percent = Math.round(state.charge * 100);
    chargeFill.style.width = `${percent}%`;
    chargeValue.textContent = `${percent}%`;
    chargeLabel.textContent = state.release
      ? `释放 · ${state.release.name}`
      : state.charging
        ? `蓄力 · ${state.selectedSpell}`
        : "蓄力";
    chargeMeter.hidden = !state.charging && !state.release;
  }

  function updateGestureCharge(dt) {
    const gesture = state.handGesture;

    if (gesture === "fist") {
      if (!state.charging) {
        state.charging = true;
        state.charge = 0;
      }
      state.charge = Math.min(1, state.charge + dt / 2.5);
    } else if (gesture === "open") {
      if (state.charging && state.charge > 0.05) {
        releaseChargedSpell();
      }
      state.charging = false;
    } else {
      state.charging = false;
    }

    updateChargeUI();
  }

  function clearMagic() {
    state.activeSpell = null;
    state.release = null;
    state.particles = [];
    state.beams = [];
    state.charging = false;
    state.charge = 0;
    chargeMeter.hidden = true;
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

  function getBeamEnd(tip, beamLength) {
    const history = state.tipHistory;
    const older = history.length >= 3
      ? history[Math.max(0, history.length - 3)]
      : { x: tip.x + 80, y: tip.y - 40 };
    let dx = tip.x - older.x;
    let dy = tip.y - older.y;
    const length = Math.hypot(dx, dy);
    const targetLength = beamLength || 280;

    if (length < 8) {
      dx = 110;
      dy = -35;
    } else {
      dx = (dx / length) * targetLength;
      dy = (dy / length) * targetLength;
    }

    return { x: tip.x + dx, y: tip.y + dy };
  }

  function spawnBeamParticles(spell, tip, release, fade, dt) {
    const end = getBeamEnd(tip, release.beamLength * fade);
    const count = Math.max(1, Math.round((spell.rate || 70) * dt * (0.25 + fade * 0.75)));

    for (let i = 0; i < count; i += 1) {
      const t = Math.random();
      const jitter = 4 + 12 * fade;
      const x = tip.x + (end.x - tip.x) * t + randomBetween(-jitter, jitter);
      const y = tip.y + (end.y - tip.y) * t + randomBetween(-jitter, jitter);
      addParticle(
        x,
        y,
        randomBetween(-24, 24),
        randomBetween(-24, 24),
        randomBetween(0.2, 0.65) * fade + 0.15,
        randomBetween(2, 6) * fade + 1,
        Math.random() > 0.5 ? spell.color : "#ffffff",
        "spark"
      );
    }
  }

  function updateActiveSpell(dt) {
    const release = state.release;
    if (!release) {
      return;
    }

    const spell = SPELLS[release.name];
    const elapsed = performance.now() - release.startedAt;
    const progress = elapsed / release.duration;

    if (progress >= 1) {
      clearMagic();
      return;
    }

    const fade = Math.max(0, 1 - progress);
    const tip = getTipPoint();
    const end = getBeamEnd(tip, release.beamLength * fade);

    if (!state.beams.length) {
      state.beams.push({
        x1: tip.x,
        y1: tip.y,
        x2: end.x,
        y2: end.y,
        color: spell.color,
        fade
      });
    } else {
      const beam = state.beams[0];
      beam.x1 = tip.x;
      beam.y1 = tip.y;
      beam.x2 = end.x;
      beam.y2 = end.y;
      beam.color = spell.color;
      beam.fade = fade;
    }

    spawnBeamParticles(spell, tip, release, fade, dt);
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

    if (state.charging) {
      const chargeAngle = -Math.PI / 2 + state.charge * Math.PI * 2;
      effectCtx.strokeStyle = "rgba(230, 184, 76, 0.95)";
      effectCtx.lineWidth = 5;
      effectCtx.beginPath();
      effectCtx.arc(x, y, 32, -Math.PI / 2, chargeAngle);
      effectCtx.stroke();
    }

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

    const release = state.release;
    const fade = release
      ? Math.max(0, 1 - (performance.now() - release.startedAt) / release.duration)
      : 1;
    const tip = getTipPoint();
    const extra = spell.kind === "patronus" ? 56 : 0;
    const radius = 72 + extra + Math.sin(performance.now() * 0.012) * 10;
    const gradient = effectCtx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, radius);
    gradient.addColorStop(0, hexToRgba(spell.color, 0.34 * fade));
    gradient.addColorStop(0.65, hexToRgba(spell.color, 0.1 * fade));
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
      const fade = beam.fade ?? 1;
      const gradient = effectCtx.createLinearGradient(beam.x1, beam.y1, beam.x2, beam.y2);
      gradient.addColorStop(0, hexToRgba(beam.color, 0.12 * fade));
      gradient.addColorStop(1, hexToRgba(beam.color, 0.92 * fade));
      effectCtx.globalAlpha = fade;
      effectCtx.shadowColor = beam.color;
      effectCtx.shadowBlur = 18 + 18 * fade;
      effectCtx.strokeStyle = gradient;
      effectCtx.lineWidth = 10;
      effectCtx.beginPath();
      effectCtx.moveTo(beam.x1, beam.y1);
      effectCtx.lineTo(beam.x2, beam.y2);
      effectCtx.stroke();

      effectCtx.shadowBlur = 24;
      effectCtx.fillStyle = beam.color;
      effectCtx.beginPath();
      effectCtx.arc(beam.x2, beam.y2, 14 * fade + 2, 0, Math.PI * 2);
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

    updateGestureCharge(dt);
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

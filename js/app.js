(function () {
  "use strict";
  document.documentElement.classList.add("js");
  const S = window.PanTiltSim;
  const $ = (id) => document.getElementById(id);

  const WINDOW = 8;              // seconds shown in the plots
  const STEP_LEN = 6;            // seconds in a step test
  const MAX_SAMPLES = 1200;      // history kept (12 s at 100 Hz)

  const gains = Object.assign({}, S.PRESETS.wellTuned);
  let path = "figure8";
  let axisShown = "pan";
  const sim = new S.Sim({ mode: path, speed: 30, seed: 1, gains });
  let runSeed = 1;
  let paused = false;
  let stepState = "off";         // "off" | "running" | "done"
  let hist = [];
  let trail = [];

  // Figure-8 guide line for the 3D view (same shape for any speed)
  const guide = [];
  for (let i = 0; i < 80; i++) { const a = (i / 80) * Math.PI * 2; guide.push([30 * Math.sin(a), 15 * Math.sin(2 * a)]); }

  const state = { pan: 0, tilt: 0, targetPan: 0, targetTilt: 0, errPan: 0, errTilt: 0, trail: [], guide: guide };
  function syncState() {
    const last = hist[hist.length - 1];
    if (last) {
      state.pan = last.pan; state.tilt = last.tilt;
      state.targetPan = last.targetPan; state.targetTilt = last.targetTilt;
      state.errPan = last.errPan; state.errTilt = last.errTilt;
    }
    state.trail = trail;
    state.guide = (path === "figure8" && stepState === "off") ? guide : null;
  }

  // ---------- controls ----------
  function fmt(id, v, d) { $(id).textContent = v.toFixed(d); }
  function readSliders() {
    gains.kp = parseFloat($("kp").value);
    gains.ki = parseFloat($("ki").value);
    gains.kd = parseFloat($("kd").value);
    fmt("kpOut", gains.kp, 1); fmt("kiOut", gains.ki, 1); fmt("kdOut", gains.kd, 2);
    const sp = parseFloat($("speed").value);
    $("speedOut").textContent = sp;
    sim.setSpeed(sp);
  }
  ["kp", "ki", "kd", "speed"].forEach((id) => $(id).addEventListener("input", readSliders));

  document.querySelectorAll("[data-preset]").forEach((b) => {
    b.addEventListener("click", () => {
      const p = S.PRESETS[b.dataset.preset];
      $("kp").value = p.kp; $("ki").value = p.ki; $("kd").value = p.kd;
      readSliders();
    });
  });
  document.querySelectorAll('input[name="path"]').forEach((r) => {
    r.addEventListener("change", () => { path = r.value; startTracking(); });
  });
  document.querySelectorAll('input[name="axis"]').forEach((r) => {
    r.addEventListener("change", () => { axisShown = r.value; });
  });
  $("stepBtn").addEventListener("click", startStep);
  $("restartBtn").addEventListener("click", () => { stepState === "off" ? startTracking() : startStep(); });
  $("pauseBtn").addEventListener("click", () => {
    paused = !paused;
    $("pauseBtn").textContent = paused ? "Resume" : "Pause";
  });

  function resetRun(mode) {
    runSeed += 1;
    sim.setMode(mode);
    sim.speed = parseFloat($("speed").value);
    sim.reset(runSeed);
    hist = []; trail = [];
    paused = false;
    $("pauseBtn").textContent = "Pause";
  }
  function startTracking() {
    stepState = "off";
    resetRun(path);
    $("status").textContent = "Following the " + (path === "figure8" ? "figure-8" : "random path");
  }
  function startStep() {
    stepState = "running";
    resetRun("step");
    $("status").textContent = "Step test running...";
  }

  // ---------- step test results ----------
  function finishStep() {
    stepState = "done";
    const t = hist.map((s) => s.t);
    const st = sim.target.stepTime;
    const pan = S.stepMetrics(t, hist.map((s) => s.targetPan), hist.map((s) => s.pan), st, sim.target.stepPan, 0.5);
    const tilt = S.stepMetrics(t, hist.map((s) => s.targetTilt), hist.map((s) => s.tilt), st, sim.target.stepTilt, 0.5);
    const showOs = (m) => m.overshoot.toFixed(1) + " %";
    const showSt = (m) => (m.settling === null ? "never settled" : m.settling.toFixed(2) + " s");
    const showSs = (m) => m.sse.toFixed(2) + "\u00b0";
    $("mOsPan").textContent = showOs(pan); $("mOsTilt").textContent = showOs(tilt);
    $("mStPan").textContent = showSt(pan); $("mStTilt").textContent = showSt(tilt);
    $("mSsPan").textContent = showSs(pan); $("mSsTilt").textContent = showSs(tilt);
    $("metricsNote").textContent = "Settings used: Kp " + gains.kp.toFixed(1) + ", Ki " + gains.ki.toFixed(1) +
      ", Kd " + gains.kd.toFixed(2) + ". Noise changes a little each run, so numbers vary slightly.";
    $("status").textContent = "Step test done. Pick a path to go back.";
  }

  // ---------- plots ----------
  const dpr = () => window.devicePixelRatio || 1;
  function fit(c) {
    const r = c.getBoundingClientRect();
    const w = Math.round(r.width * dpr()), h = Math.round(r.height * dpr());
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
    return { ctx, w: r.width, h: r.height };
  }
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }

  function drawPlot(canvas, series, yRange, yLabel, extra) {
    const { ctx, w, h } = fit(canvas);
    const padL = 40, padR = 10, padT = 10, padB = 22;
    const pw = w - padL - padR, ph = h - padT - padB;
    ctx.clearRect(0, 0, w, h);
    const tNow = hist.length ? hist[hist.length - 1].t : 0;
    const t0 = tNow - WINDOW;
    const X = (t) => padL + ((t - t0) / WINDOW) * pw;

    let [lo, hi] = yRange;
    for (const s of series) for (const v of s.data) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const step = niceStep((hi - lo || 1) / 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * ph;

    ctx.font = "11px 'DM Sans', system-ui, sans-serif";
    ctx.lineWidth = 1;
    ctx.strokeStyle = css("--grid"); ctx.fillStyle = css("--muted");
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillText(String(Math.round(v * 100) / 100), padL - 5, y);
    }
    if (lo < 0 && hi > 0) {
      ctx.strokeStyle = css("--muted"); ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - padR, Y(0)); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = css("--muted");
    for (let k = Math.ceil(t0); k <= tNow; k++) { if (k >= 0) ctx.fillText(k + "s", X(k), h - padB + 5); }
    ctx.save();
    ctx.translate(11, padT + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(yLabel, 0, 0); ctx.restore();

    if (extra) extra(ctx, X, Y);

    ctx.save();
    ctx.beginPath(); ctx.rect(padL, padT, pw, ph); ctx.clip();
    ctx.lineJoin = "round";
    for (const s of series) {
      ctx.strokeStyle = css(s.color); ctx.lineWidth = s.width || 2.2;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < hist.length; i += 2) {
        const x = X(hist[i].t), y = Y(s.data[i]);
        if (x < padL - 2) continue;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlots() {
    const a = axisShown === "pan" ? "Left/right angle (deg)" : "Up/down angle (deg)";
    const tgt = hist.map((s) => (axisShown === "pan" ? s.targetPan : s.targetTilt));
    const act = hist.map((s) => (axisShown === "pan" ? s.pan : s.tilt));
    const band = (ctx, X, Y) => {
      if (stepState === "off" || !hist.length) return;
      const goal = axisShown === "pan" ? sim.target.stepPan : sim.target.stepTilt;
      ctx.fillStyle = css("--moss"); ctx.globalAlpha = 0.12;
      ctx.fillRect(X(sim.target.stepTime), Y(goal + 0.5), X(STEP_LEN + 1) - X(sim.target.stepTime), Y(goal - 0.5) - Y(goal + 0.5));
      ctx.globalAlpha = 1;
    };
    drawPlot($("plotAngle"), [
      { data: tgt, color: "--terra", width: 2.4 },
      { data: act, color: "--moss", width: 2.4 }
    ], [-10, 10], a, band);
    drawPlot($("plotErr"), [
      { data: hist.map((s) => s.errPan), color: "--moss", width: 1.8 },
      { data: hist.map((s) => s.errTilt), color: "--sun", width: 1.8 }
    ], [-2, 2], "gap (deg)");
  }

  // ---------- 3D stages ----------
  const hero = window.Scene3D.create($("heroStage"), () => state, {});
  const lab = window.Scene3D.create($("labStage"), () => state, { hud: true, sky: true });
  window.__stages = { hero, lab };
  const heroEl = $("heroStage"), labEl = $("labStage");
  const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.bottom > -50 && r.top < innerHeight + 50; };

  // ---------- main loop ----------
  let lastTs = null, acc = 0, sinceRms = 0, lock = true;
  function frame(ts) {
    if (lastTs === null) lastTs = ts;
    const dtReal = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    if (!paused && stepState !== "done") {
      acc += dtReal;
      const dt = sim.cfg.dt;
      while (acc >= dt) {
        acc -= dt;
        const s = sim.step();
        hist.push(s);
        if (hist.length > MAX_SAMPLES) hist.shift();
        if (hist.length % 3 === 0) {
          trail.push([s.targetPan, s.targetTilt]);
          if (trail.length > 45) trail.shift();
        }
        if (stepState === "running" && s.t >= STEP_LEN) { finishStep(); break; }
      }
    }
    syncState();
    sinceRms += dtReal;
    if (sinceRms > 0.25) { sinceRms = 0; updateRms(); }
    if (onScreen(heroEl)) hero.draw(ts);
    if (onScreen(labEl)) {
      lab.draw(ts);
      const now = state.__locked !== false;
      if (now !== lock) {
        lock = now;
        $("lockChip").textContent = now ? "Locked on" : "Lost the drone";
        $("lockChip").classList.toggle("lost", !now);
      }
      drawPlots();
    }
    requestAnimationFrame(frame);
  }
  function updateRms() {
    if (stepState !== "off" || hist.length < 50) { $("rmsOut").textContent = "-"; return; }
    const n = Math.min(hist.length, 500);
    let sum = 0;
    for (let i = hist.length - n; i < hist.length; i++) {
      const s = hist[i];
      sum += s.errPan * s.errPan + s.errTilt * s.errTilt;
    }
    $("rmsOut").textContent = Math.sqrt(sum / n).toFixed(2) + "\u00b0";
  }

  // Handy for tests: lets me read what the page is showing.
  window.__pid = { get hist() { return hist; }, get gains() { return gains; }, get stepState() { return stepState; } };

  readSliders();
  startTracking();
  requestAnimationFrame(frame);
})();

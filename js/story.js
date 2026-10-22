/* Scroll effects, the P/I/D story chart, and the "what I tested" section.
 * Every number here is calculated by running the same simulation (sim-core.js). */
(function () {
  "use strict";
  const S = window.PanTiltSim;
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  // ---------- run the tests ----------
  const STEP_AT = 0.5;
  function step(g) { return S.runStepTest(g, 1, 6); }
  function curve(r, kind, x0, x1) {
    const xs = [], ys = [];
    for (let i = 0; i < r.rec.t.length; i++) {
      const x = r.rec.t[i] - STEP_AT;
      if (x < x0 || x > x1) continue;
      xs.push(x);
      ys.push(kind === "err" ? r.rec.tp[i] - r.rec.ap[i] : r.rec.ap[i]);
    }
    return { xs, ys };
  }
  const P = S.PRESETS;
  const G = {
    low: P.tooLow, hi: P.aggressive, good: P.wellTuned,
    nod: { kp: 8, ki: 6, kd: 0 },
    p8: { kp: 8, ki: 0, kd: 0 }, p8d: { kp: 8, ki: 0, kd: 0.5 },
    k2: { kp: 2, ki: 0, kd: 0 }, k2i: { kp: 2, ki: 3, kd: 0 }
  };
  const R = {};
  for (const k of Object.keys(G)) R[k] = step(G[k]);
  const follow = (g, speed) => S.runTrackTest(g, "figure8", speed || 30, 1, 20).rms;
  const F = { low: follow(G.low), hi: follow(G.hi), good: follow(G.good), nod: follow(G.nod) };
  const SPEEDS = [15, 30, 45, 60, 80];
  const FS = SPEEDS.map((s) => follow(G.good, s));

  const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);
  const settle = (m) => (m.settling === null ? null : m.settling);

  // ---------- chart ----------
  function fit(c) {
    const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    const w = Math.round(r.width * d), h = Math.round(r.height * d);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const ctx = c.getContext("2d"); ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }
  function drawChart(canvas, cfg, frac) {
    const { ctx, w, h } = fit(canvas);
    ctx.clearRect(0, 0, w, h);
    if (w < 20) return;
    const padL = 38, padR = 10, padT = 10, padB = 24;
    const pw = w - padL - padR, ph = h - padT - padB;
    const X = (x) => padL + ((x - cfg.x0) / (cfg.x1 - cfg.x0)) * pw;
    const Y = (y) => padT + (1 - (y - cfg.y0) / (cfg.y1 - cfg.y0)) * ph;
    ctx.font = "11px 'DM Sans', system-ui, sans-serif";
    ctx.strokeStyle = cssv("--grid"); ctx.fillStyle = cssv("--muted"); ctx.lineWidth = 1;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let y = cfg.y0; y <= cfg.y1 + 1e-9; y += cfg.yStep) {
      const yy = Math.round(Y(y)) + .5;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
      ctx.fillText(String(Math.round(y * 100) / 100), padL - 5, yy);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let x = Math.ceil(cfg.x0); x <= cfg.x1; x += cfg.xStep || 1) ctx.fillText(x + "s", X(x), h - padB + 6);
    (cfg.refs || []).forEach((r) => {
      ctx.strokeStyle = cssv("--ink"); ctx.globalAlpha = .55; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(padL, Y(r.y)); ctx.lineTo(w - padR, Y(r.y)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = cssv("--ink"); ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      ctx.fillText(r.label, padL + 6, Y(r.y) - 3);
    });
    ctx.save(); ctx.beginPath(); ctx.rect(padL, padT, pw, ph); ctx.clip();
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const xLimit = cfg.x0 + frac * (cfg.x1 - cfg.x0);
    for (const s of cfg.series) {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 3;
      ctx.beginPath(); let st = false;
      const inc = s.xs.length < 10 ? 1 : 2;
      for (let i = 0; i < s.xs.length; i += inc) {
        if (s.xs[i] > xLimit) break;
        const x = X(s.xs[i]), y = Y(s.ys[i]);
        st ? ctx.lineTo(x, y) : ctx.moveTo(x, y); st = true;
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- sticky P / I / D story ----------
  const COL = { grey: "#a39786", terra: "#d9532b", moss: "#2f6b5a", sun: "#e09a1a", ink: "#231f1b" };
  const storyCharts = [
    { title: "Camera angle after the drone jumps 20 degrees",
      cfg: { x0: -0.3, x1: 3, xStep: 1, y0: 0, y1: 40, yStep: 10, refs: [{ y: 20, label: "drone" }],
        series: [
          Object.assign({ color: COL.grey }, curve(R.low, "ang", -0.3, 3)),
          Object.assign({ color: COL.moss }, curve(R.p8, "ang", -0.3, 3)),
          Object.assign({ color: COL.terra }, curve(R.hi, "ang", -0.3, 3))] },
      key: [[COL.grey, "P too small (1.5): crawls"], [COL.moss, "P in the middle (8): quick, a bit of overshoot"], [COL.terra, "P too big (28): shakes"]] },
    { title: "The leftover gap in degrees (zoomed in), weak P",
      cfg: { x0: 0, x1: 5.5, xStep: 1, y0: -2, y1: 3, yStep: 1, refs: [{ y: 0, label: "no gap" }],
        series: [
          Object.assign({ color: COL.grey }, curve(R.k2, "err", 0, 5.5)),
          Object.assign({ color: COL.sun }, curve(R.k2i, "err", 0, 5.5))] },
      key: [[COL.grey, "P only: stuck short of the target"], [COL.sun, "P + I: the gap closes"]] },
    { title: "Camera angle after the drone jumps 20 degrees",
      cfg: { x0: -0.3, x1: 2.5, xStep: 1, y0: 0, y1: 30, yStep: 10, refs: [{ y: 20, label: "drone" }],
        series: [
          Object.assign({ color: COL.terra }, curve(R.p8, "ang", -0.3, 2.5)),
          Object.assign({ color: COL.moss }, curve(R.p8d, "ang", -0.3, 2.5))] },
      key: [[COL.terra, "P only: swings past the target"], [COL.moss, "P + D: the brake stops it"]] }
  ];
  $("storyGap0").textContent = f2(R.k2.pan.sse);
  $("storyGap1").textContent = f2(R.k2i.pan.sse);
  $("storyOs0").textContent = Math.round(R.p8.pan.overshoot);
  $("storyOs1").textContent = Math.round(R.p8d.pan.overshoot);

  const story = $("parts"), steps = [...document.querySelectorAll(".step")], dots = [...document.querySelectorAll(".dots i")];
  const sc = $("storyCanvas");
  let curStep = -1, anim = { t0: 0, frac: 1 };
  function setStep(i) {
    if (i === curStep) return;
    curStep = i;
    steps.forEach((s, k) => s.classList.toggle("is-active", k === i));
    dots.forEach((d, k) => d.classList.toggle("on", k === i));
    $("storyTitle").textContent = storyCharts[i].title;
    $("storyKey").innerHTML = storyCharts[i].key.map(([c, t]) => `<li><i style="background:${c}"></i>${t}</li>`).join("");
    anim = { t0: performance.now(), frac: reduce ? 1 : 0 };
  }
  function storyFrame() {
    if (curStep >= 0) {
      if (anim.frac < 1) anim.frac = clamp((performance.now() - anim.t0) / 1500, 0, 1);
      const r = story.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) drawChart(sc, storyCharts[curStep].cfg, 1 - Math.pow(1 - anim.frac, 3));
    }
    requestAnimationFrame(storyFrame);
  }

  // ---------- test cards ----------
  const TESTS = [
    { k: "low", title: "Too low", g: G.low,
      said: () => `The camera crawled. It never got within half a degree of the new spot and stopped ${f2(R.low.pan.sse)} degrees short. Following the figure-8, it was ${f1(F.low)} degrees behind.` },
    { k: "hi", title: "Too aggressive", g: G.hi,
      said: () => `The camera swung ${Math.round(R.hi.pan.overshoot)}% past the target and kept shaking back and forth. It never calmed down. Following the figure-8, it was ${f1(F.hi)} degrees off.` },
    { k: "good", title: "Well tuned", g: G.good,
      said: () => `It reached the new spot in about ${f2(R.good.pan.settling)} seconds, went ${f1(R.good.pan.overshoot)}% past, then stayed put with ${f2(R.good.pan.sse)} degrees left over. Following the figure-8, it was ${f1(F.good)} degrees off.` },
    { k: "nod", title: "Well tuned, but no brake", g: G.nod,
      said: () => `Same as above with D turned off. It swung ${Math.round(R.nod.pan.overshoot)}% past the target before coming back. While following the figure-8 it did about the same (${f1(F.nod)} degrees), so D matters most when stopping.` }
  ];
  const grid = $("testGrid");
  const testCharts = [];
  TESTS.forEach((t, idx) => {
    const r = R[t.k];
    const ymax = Math.max(26, Math.ceil(Math.max(...r.rec.ap) / 5) * 5 + 2);
    const el = document.createElement("article");
    el.className = "test reveal"; el.style.setProperty("--d", (idx % 2) * 0.1 + "s");
    const st = settle(r.pan);
    el.innerHTML = `<header><h3>${t.title}</h3><span class="gains">Kp ${t.g.kp} &middot; Ki ${t.g.ki} &middot; Kd ${t.g.kd}</span></header>
      <canvas aria-label="${t.title}: camera angle after a 20 degree jump"></canvas>
      <div class="stats">
        <div class="stat"><b>${f1(r.pan.overshoot)}%</b><span>swung past</span></div>
        <div class="stat"><b>${st === null ? "never" : f2(st) + " s"}</b><span>time to settle</span></div>
        <div class="stat"><b>${f2(r.pan.sse)}&deg;</b><span>gap left over</span></div>
        <div class="stat"><b>${f1(F[t.k])}&deg;</b><span>gap following the 8</span></div>
      </div>
      <p class="said">${t.said()}</p>`;
    grid.appendChild(el);
    testCharts.push({ el, canvas: el.querySelector("canvas"), played: false,
      cfg: { x0: -0.3, x1: 3, xStep: 1, y0: 0, y1: ymax, yStep: ymax > 30 ? 10 : 5, refs: [{ y: 20, label: "drone" }],
        series: [
          { color: COL.terra, width: 2, xs: [-0.3, 3], ys: [0, 0] },
          Object.assign({ color: COL.moss }, curve(r, "ang", -0.3, 3))] } });
    // target line: step at 0
    const tc = testCharts[testCharts.length - 1];
    tc.cfg.series[0] = { color: COL.terra, width: 2, xs: [-0.3, -0.001, 0, 3], ys: [0, 0, 20, 20] };
  });

  // ---------- bars ----------
  function bars(el, rows, maxV, cls) {
    el.innerHTML = rows.map((r) => `<div class="bar ${cls(r.v)}"><div class="bar-name">${r.name}</div>
      <div class="bar-track"><div class="bar-fill" data-w="${(r.v / maxV * 100).toFixed(1)}">${f1(r.v)}&deg;</div></div></div>`).join("");
  }
  bars($("followBars"), [
    { name: "Too low", v: F.low }, { name: "Too aggressive", v: F.hi },
    { name: "Well tuned", v: F.good }, { name: "Well tuned, no brake", v: F.nod }
  ], Math.max(F.low, F.hi) * 1.02, (v) => (v > 10 ? "warn" : ""));
  bars($("speedBars"), SPEEDS.map((s, i) => ({ name: s + " deg/s" + (s === 30 ? " (normal)" : ""), v: FS[i] })),
    Math.max(...FS) * 1.02, (v) => (v > 8 ? "warn" : v > 5 ? "mid" : ""));

  // ---------- what I learned ----------
  const learn = [
    ["Too little and too much are both bad. They just look different.",
      `Following the figure-8, the lazy setting was ${f1(F.low)} degrees off and the shaky one was ${f1(F.hi)} degrees off. About the same gap, but for opposite reasons: one falls behind, the other shakes. The well tuned one was ${f1(F.good)} degrees.`],
    ["D is a brake. It fixes overshoot.",
      `Without D the camera swung ${Math.round(R.p8.pan.overshoot)}% past the target. With D it was only ${f1(R.p8d.pan.overshoot)}%, and it settled faster (${f2(R.p8.pan.settling)} s down to ${f2(R.p8d.pan.settling)} s). But it didn't help much when following the figure-8. D helps you stop, not chase.`],
    ["I fixes a gap that won't close, but it slows things down.",
      `My motor's dead zone left a weak setting ${f2(R.k2.pan.sse)} degrees short, for good. Adding I closed that to ${f2(R.k2i.pan.sse)} degrees. The price: it took ${f2(R.k2i.pan.settling)} s to settle and overshot ${f1(R.k2i.pan.overshoot)}%.`],
    ["Delay is the real limit.",
      `At ${SPEEDS[0]} deg/s the well tuned camera was ${f1(FS[0])} degrees off. At ${SPEEDS[3]} deg/s it was ${f1(FS[3])} degrees off. Turning the gains up doesn't fix this. It only starts the shaking sooner. The camera can only react to where the drone was a moment ago.`],
    ["There is no single right answer.",
      "The best settings depend on the motor, the delay, and how fast the target moves. That's why I need to measure my real motors before I trust any setting I found here."]
  ];
  $("learnList").innerHTML = learn.map(([h, p], i) =>
    `<li class="reveal" style="--d:${i * 0.05}s"><div><h3>${h}</h3><p>${p}</p></div></li>`).join("");

  // ---------- reveal on scroll ----------
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      io.unobserve(e.target);
      e.target.querySelectorAll?.(".bar-fill").forEach((b, i) => setTimeout(() => { b.style.width = b.dataset.w + "%"; }, 120 + i * 120));
      const tc = testCharts.find((c) => c.el === e.target);
      if (tc && !tc.played) {
        tc.played = true; const t0 = performance.now();
        const run = () => {
          const fr = reduce ? 1 : clamp((performance.now() - t0) / 1400, 0, 1);
          drawChart(tc.canvas, tc.cfg, 1 - Math.pow(1 - fr, 3));
          if (fr < 1) requestAnimationFrame(run);
        };
        run();
      }
    });
  }, { threshold: 0.18 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  // bars live inside panels that are .reveal: handled above via querySelectorAll

  // ---------- scroll-linked stuff ----------
  const bar = $("progress"), heroStage = document.querySelector(".hero-stage"), heroText = document.querySelector(".hero-text");
  let ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      if (!reduce && y < innerHeight * 1.2) {
        heroStage.style.transform = `translateY(${y * 0.12}px) scale(${1 + Math.min(y, 600) * 0.0003})`;
        heroText.style.transform = `translateY(${y * 0.2}px)`;
        heroText.style.opacity = String(clamp(1 - y / (innerHeight * 0.9), 0, 1));
        window.__stages.hero.view.extraYaw = Math.min(y, 900) * 0.0013;
      }
      const r = story.getBoundingClientRect(), total = r.height - innerHeight;
      const p = clamp(-r.top / total, 0, 0.999);
      setStep(Math.min(2, Math.floor(p * 3)));
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  window.addEventListener("resize", () => testCharts.forEach((c) => c.played && drawChart(c.canvas, c.cfg, 1)));
  onScroll();
  setStep(0);
  requestAnimationFrame(storyFrame);
  // draw the cards once fonts/layout are ready, in case they are already in view
  window.__results = { R, F, FS };
})();

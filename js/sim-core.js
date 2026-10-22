/*
 * Pan/tilt PID simulation core.
 * No DOM code in here, so the browser page and the Node script
 * (scripts/headless.js) run exactly the same model.
 *
 * Units: angles in degrees, time in seconds.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PanTiltSim = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Fixed settings for the servo model. Change these to model a different servo.
  const SERVO = {
    dt: 0.01,          // simulation step (s)
    tau: 0.08,         // first-order lag of the servo speed (s)
    maxSpeed: 200,     // max servo speed (deg/s)
    maxAccel: 1200,    // max servo acceleration (deg/s^2)
    delay: 0.05,       // camera + vision delay (s)
    noise: 0.12,       // sensor noise, std dev (deg)
    deadband: 1.5,     // commands smaller than this (deg/s) do nothing
    derivFilter: 0.04, // low-pass time constant on the D term (s)
    iZone: 5,          // integral only builds up when error is smaller than this (deg)
    limit: 80          // mechanical angle limit (deg)
  };

  // Small seeded random number generator, so a run can be repeated.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(rand) {
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  // One servo axis with its own PID controller.
  class Axis {
    constructor(cfg, rand) {
      this.cfg = cfg;
      this.rand = rand;
      this.delaySteps = Math.max(0, Math.round(cfg.delay / cfg.dt));
      this.reset(0);
    }
    reset(angle) {
      this.angle = angle;
      this.speed = 0;
      this.integral = 0;
      this.dFilt = 0;
      this.prevMeas = 0;
      this.first = true;
      this.errHist = [];
      this.lastU = 0;
    }
    // target: where the target really is now. gains: {kp, ki, kd}
    step(target, gains) {
      const c = this.cfg;
      const trueErr = target - this.angle;

      // Sensor delay: the controller only sees the error from a moment ago.
      this.errHist.push(trueErr);
      if (this.errHist.length > this.delaySteps + 1) this.errHist.shift();
      const delayedErr = this.errHist[0];
      const meas = delayedErr + c.noise * gauss(this.rand);

      // PID
      if (this.first) { this.prevMeas = meas; this.first = false; }
      const rawD = (meas - this.prevMeas) / c.dt;
      this.prevMeas = meas;
      const a = c.dt / (c.derivFilter + c.dt);
      this.dFilt += a * (rawD - this.dFilt);

      // Integral with a limit (anti-windup), so it cannot grow forever.
      if (Math.abs(meas) < c.iZone) this.integral += meas * c.dt;
      if (gains.ki > 0) {
        const iMax = (0.5 * c.maxSpeed) / gains.ki;
        this.integral = clamp(this.integral, -iMax, iMax);
      } else {
        this.integral = 0;
      }

      let u = gains.kp * meas + gains.ki * this.integral + gains.kd * this.dFilt;
      this.lastU = u;

      // Servo: deadband, speed limit, first-order lag, accel limit.
      if (Math.abs(u) < c.deadband) u = 0;
      const cmd = clamp(u, -c.maxSpeed, c.maxSpeed);
      const acc = clamp((cmd - this.speed) / c.tau, -c.maxAccel, c.maxAccel);
      this.speed = clamp(this.speed + acc * c.dt, -c.maxSpeed, c.maxSpeed);
      this.angle += this.speed * c.dt;
      if (this.angle > c.limit) { this.angle = c.limit; this.speed = Math.min(0, this.speed); }
      if (this.angle < -c.limit) { this.angle = -c.limit; this.speed = Math.max(0, this.speed); }
      return trueErr;
    }
  }

  // Target motion. speed = peak speed along the path in deg/s.
  class Target {
    constructor(mode, speed, seed) {
      this.mode = mode;
      this.speed = speed;
      this.rand = mulberry32((seed ^ 0x9e3779b9) >>> 0);
      this.t = 0;
      this.pan = 0; this.tilt = 0;
      this.vPan = 0; this.vTilt = 0;
      this.wpPan = 0; this.wpTilt = 0;
      this.nextWp = 0;
      this.stepTime = 0.5;
      this.stepPan = 20; this.stepTilt = 10;
      this.advance(0);
    }
    advance(dt) {
      this.t += dt;
      const t = this.t;
      if (this.mode === "figure8") {
        // pan = 30 sin(wt), tilt = 15 sin(2wt). Peak pan speed = 30 * w.
        const w = Math.max(0.01, this.speed / 30);
        this.pan = 30 * Math.sin(w * t);
        this.tilt = 15 * Math.sin(2 * w * t);
      } else if (this.mode === "wander") {
        // The target glides toward random way points. Smooth, but not predictable.
        if (t >= this.nextWp) {
          this.wpPan = (this.rand() * 2 - 1) * 35;
          this.wpTilt = (this.rand() * 2 - 1) * 18;
          this.nextWp = t + 1.2 + this.rand() * 2.2;
        }
        const wn = Math.max(0.2, this.speed / 14);
        const ax = wn * wn * (this.wpPan - this.pan) - 2 * wn * this.vPan;
        const ay = wn * wn * (this.wpTilt - this.tilt) - 2 * wn * this.vTilt;
        this.vPan += ax * dt; this.vTilt += ay * dt;
        const sp = Math.hypot(this.vPan, this.vTilt);
        if (sp > this.speed) {
          this.vPan *= this.speed / sp; this.vTilt *= this.speed / sp;
        }
        this.pan += this.vPan * dt; this.tilt += this.vTilt * dt;
      } else { // "step"
        const on = t >= this.stepTime;
        this.pan = on ? this.stepPan : 0;
        this.tilt = on ? this.stepTilt : 0;
      }
    }
  }

  // The whole rig: two axes, one target.
  class Sim {
    constructor(opts) {
      const o = Object.assign({ mode: "figure8", speed: 30, seed: 1,
        gains: { kp: 6, ki: 0, kd: 0 } }, opts || {});
      this.cfg = Object.assign({}, SERVO, o.servo || {});
      this.gains = o.gains;
      this.mode = o.mode;
      this.speed = o.speed;
      this.seed = o.seed;
      this.reset();
    }
    reset(seed) {
      if (seed !== undefined) this.seed = seed;
      this.rand = mulberry32(this.seed);
      this.pan = new Axis(this.cfg, this.rand);
      this.tilt = new Axis(this.cfg, this.rand);
      this.target = new Target(this.mode, this.speed, this.seed);
      // Start the camera pointed at the target (except a step test, which starts at 0).
      this.pan.reset(this.target.pan);
      this.tilt.reset(this.target.tilt);
      this.t = 0;
    }
    setMode(mode) { this.mode = mode; }
    setSpeed(s) { this.speed = s; this.target.speed = s; }
    step() {
      this.target.advance(this.cfg.dt);
      const ep = this.pan.step(this.target.pan, this.gains);
      const et = this.tilt.step(this.target.tilt, this.gains);
      this.t += this.cfg.dt;
      return {
        t: this.t,
        targetPan: this.target.pan, targetTilt: this.target.tilt,
        pan: this.pan.angle, tilt: this.tilt.angle,
        errPan: ep, errTilt: et
      };
    }
  }

  // Step response numbers, measured from the recorded run.
  //   t[], target[], actual[]: arrays from the sim; stepTime: when the target jumped;
  //   size: step size in deg (signed); band: "close enough" window in deg.
  function stepMetrics(t, target, actual, stepTime, size, band) {
    const dir = Math.sign(size) || 1;
    const final = size;
    let peak = -Infinity;
    for (let i = 0; i < t.length; i++) {
      if (t[i] < stepTime) continue;
      peak = Math.max(peak, dir * actual[i]);
    }
    const overshoot = Math.max(0, ((peak - Math.abs(final)) / Math.abs(final)) * 100);

    // Settling time: the last moment the camera was outside the band.
    let lastOut = -1;
    for (let i = 0; i < t.length; i++) {
      if (t[i] < stepTime) continue;
      if (Math.abs(actual[i] - final) > band) lastOut = i;
    }
    let settling;
    if (lastOut === t.length - 1) settling = null;       // never settled
    else if (lastOut < 0) settling = 0;
    else settling = t[lastOut + 1] - stepTime;

    // Steady-state error: average error over the last second.
    const tEnd = t[t.length - 1];
    let sum = 0, n = 0;
    for (let i = 0; i < t.length; i++) {
      if (t[i] >= tEnd - 1) { sum += target[i] - actual[i]; n++; }
    }
    const sse = n ? Math.abs(sum / n) : NaN;
    return { overshoot, settling, sse };
  }

  // Run a full step test with no UI. Returns series and metrics for both axes.
  function runStepTest(gains, seed, duration, servo) {
    const sim = new Sim({ mode: "step", gains, seed: seed || 1, servo });
    const rec = { t: [], tp: [], ap: [], tt: [], at: [] };
    const n = Math.round((duration || 6) / sim.cfg.dt);
    for (let i = 0; i < n; i++) {
      const s = sim.step();
      rec.t.push(s.t); rec.tp.push(s.targetPan); rec.ap.push(s.pan);
      rec.tt.push(s.targetTilt); rec.at.push(s.tilt);
    }
    const st = sim.target.stepTime;
    return {
      rec,
      pan: stepMetrics(rec.t, rec.tp, rec.ap, st, sim.target.stepPan, 0.5),
      tilt: stepMetrics(rec.t, rec.tt, rec.at, st, sim.target.stepTilt, 0.5)
    };
  }

  // Run a tracking test and report RMS pointing error (skips the first 2 s).
  function runTrackTest(gains, mode, speed, seed, duration, servo) {
    const sim = new Sim({ mode, speed, gains, seed: seed || 1, servo });
    const n = Math.round((duration || 20) / sim.cfg.dt);
    let sumSq = 0, cnt = 0, maxErr = 0;
    for (let i = 0; i < n; i++) {
      const s = sim.step();
      if (s.t < 2) continue;
      const e2 = s.errPan * s.errPan + s.errTilt * s.errTilt;
      sumSq += e2; cnt++;
      maxErr = Math.max(maxErr, Math.sqrt(e2));
    }
    return { rms: Math.sqrt(sumSq / cnt), max: maxErr };
  }

  const PRESETS = {
    tooLow:     { kp: 1.5, ki: 0,   kd: 0 },
    aggressive: { kp: 28,  ki: 0,   kd: 0 },
    wellTuned:  { kp: 8,   ki: 6,   kd: 0.5 }
  };

  return { SERVO, PRESETS, Sim, Axis, Target, stepMetrics, runStepTest, runTrackTest, mulberry32 };
});

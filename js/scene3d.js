/*
 * A tiny hand-made 3D renderer on a 2D canvas (no libraries).
 * Draws the pan/tilt head, the drone, the camera's view frame, and a ground grid.
 * Drag to orbit. World: x right, y up, z forward (away from the head).
 */
(function () {
  "use strict";
  const RAD = Math.PI / 180;
  const HS = 1.2;            // size of the head model
  const HEAD_H = 1.25 * HS;       // height of the camera pivot above the ground
  const DIST = 8;            // how far away the drone flies from the head
  const FOV_W = 6.5, FOV_H = 4.1; // half-angles of the camera view (deg)
  const CENTER = [0, 1.7, 3.6];

  const C = {
    skyTop: "#f9e4c6", skyBot: "#fbf3e4",
    ground: "#e9d8b8", groundEdge: "#f3e8d2", grid: "rgba(120,90,50,.22)",
    ink: "#2a2420", metal: "#8c8378", base: "#4a4038", accent: "#d9532b",
    moss: "#2f6b5a", sun: "#f0a830", drone: "#d9532b", path: "rgba(217,83,43,.28)"
  };

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function rotX(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; }
  function rotY(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  const LIGHT = (() => { const l = [-0.45, 0.8, -0.4]; const n = Math.hypot(...l); return l.map((x) => x / n); })();

  const BOX_FACES = [
    { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
    { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
    { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
    { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] }
  ];

  function create(canvas, getState, opts) {
    const o = Object.assign({ hud: false, sky: false }, opts || {});
    const ctx = canvas.getContext("2d");
    const view = { yaw: 0.45, pitch: 0.3, dist: 14, extraYaw: 0 };
    let dragging = false, lastX = 0, lastY = 0, lastInteract = -1e9;
    let w = 0, h = 0;

    canvas.addEventListener("pointerdown", (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY; lastInteract = performance.now();
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      view.yaw += (e.clientX - lastX) * 0.006;
      view.pitch += (e.clientY - lastY) * 0.004;
      view.yaw = Math.max(-1.4, Math.min(1.4, view.yaw));
      view.pitch = Math.max(0.04, Math.min(0.85, view.pitch));
      lastX = e.clientX; lastY = e.clientY; lastInteract = performance.now();
    });
    const end = () => { dragging = false; lastInteract = performance.now(); };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    function resize() {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const nw = Math.round(r.width * dpr), nh = Math.round(r.height * dpr);
      if (canvas.width !== nw || canvas.height !== nh) { canvas.width = nw; canvas.height = nh; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      w = r.width; h = r.height;
    }

    // world point -> view space (camera at origin looking +z)
    function toView(p, yaw) {
      let q = sub(p, CENTER);
      q = rotX(rotY(q, yaw), view.pitch);
      q[2] += view.dist;
      return q;
    }
    function dirView(n, yaw) { return rotX(rotY(n, yaw), view.pitch); }

    function draw(time) {
      resize();
      if (w < 10) return;
      const s = getState();
      // gentle sway when nobody is dragging
      const idle = performance.now() - lastInteract > 2500;
      const sway = idle ? 0.22 * Math.sin(time * 0.00025) : 0;
      const yaw = view.yaw + sway + view.extraYaw;
      const f = Math.min(h * 1.9, w * 1.2);
      const cx = w / 2, cy = h * 0.52;
      const P = (q) => { const k = f / q[2]; return [cx + q[0] * k, cy - q[1] * k, k]; };
      const proj = (p) => { const q = toView(p, yaw); return q[2] < 0.5 ? null : P(q); };

      // sky
      ctx.clearRect(0, 0, w, h);
      if (o.sky) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, C.skyTop); g.addColorStop(1, C.skyBot);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }

      // ground disc
      const R = 9;
      ctx.beginPath();
      let ok = true;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const p = proj([CENTER[0] + R * Math.cos(a), 0, CENTER[2] + R * Math.sin(a)]);
        if (!p) { ok = false; break; }
        i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
      }
      if (ok) {
        ctx.closePath();
        const c0 = proj([CENTER[0], 0, CENTER[2]]);
        const rr = (f * R) / view.dist * 1.05;
        const gg = ctx.createRadialGradient(c0[0], c0[1], 10, c0[0], c0[1], rr);
        gg.addColorStop(0, "rgba(233,216,184,.95)"); gg.addColorStop(0.55, "rgba(233,216,184,.55)"); gg.addColorStop(0.95, "rgba(233,216,184,0)");
        ctx.fillStyle = gg; ctx.fill();
      }
      // grid
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      for (let k = -9; k <= 9; k += 1.5) {
        for (const axis of [0, 1]) {
          const half = Math.sqrt(Math.max(0, R * R - (k - (axis ? CENTER[0] : CENTER[2])) ** 2));
          const a = axis ? [k, 0, CENTER[2] - half] : [CENTER[0] - half, 0, k];
          const b = axis ? [k, 0, CENTER[2] + half] : [CENTER[0] + half, 0, k];
          if (!axis && (k < CENTER[2] - R || k > CENTER[2] + R)) continue;
          if (axis && (k < -R || k > R)) continue;
          const pa = proj(a), pb = proj(b);
          if (pa && pb) { ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); }
        }
      }

      const pivot = [0, HEAD_H, 0];
      const pan = s.pan * RAD, tilt = s.tilt * RAD;
      const camXform = (q) => add(pivot, rotY(rotX(q, -tilt), pan));
      const camDir = (n) => rotY(rotX(n, -tilt), pan);
      const stageXform = (q) => add([0, 0, 0], rotY(q, pan));
      const noXform = (q) => q;

      const items = []; // {depth, draw()}

      // head parts as boxes: [center, half-size, color, xform, dirXform]
      const parts = [
        [[0, 0.1, 0], [0.75, 0.1, 0.75], C.base, noXform, noXform],              // base plate
        [[0, 0.55, 0], [0.11, 0.35, 0.11], C.metal, noXform, noXform],            // post
        [[0, 0.98, 0], [0.5, 0.07, 0.5], "#6a5f55", stageXform, (n) => rotY(n, pan)],   // pan stage
        [[-0.46, 1.15, 0], [0.06, 0.2, 0.12], C.metal, stageXform, (n) => rotY(n, pan)],  // yoke left
        [[0.46, 1.15, 0], [0.06, 0.2, 0.12], C.metal, stageXform, (n) => rotY(n, pan)],   // yoke right
        [[0, 0, 0], [0.34, 0.24, 0.42], C.ink, camXform, camDir],                // camera body (pivot-relative)
        [[0, 0, 0.62], [0.17, 0.17, 0.2], "#3b342e", camXform, camDir],         // lens barrel
        [[0, 0.1, -0.02], [0.2, 0.03, 0.2], C.accent, camXform, camDir]           // red stripe on top
      ];
      for (const [ctr0, hs0, col, xf, dxf] of parts) {
        const ctr = ctr0.map((x) => x * HS), hs = hs0.map((x) => x * HS);
        for (const face of BOX_FACES) {
          const wp = face.v.map((v) => xf([ctr[0] + v[0] * hs[0], ctr[1] + v[1] * hs[1], ctr[2] + v[2] * hs[2]]));
          const vp = wp.map((p) => toView(p, yaw));
          const nv = dirView(dxf(face.n), yaw);
          const centre = [(vp[0][0] + vp[2][0]) / 2, (vp[0][1] + vp[2][1]) / 2, (vp[0][2] + vp[2][2]) / 2];
          if (dot(nv, centre) >= 0) continue; // faces away
          if (vp.some((q) => q[2] < 0.5)) continue;
          const nw = dxf(face.n);
          const shade = 0.5 + 0.5 * Math.max(0, dot(nw, LIGHT));
          const rgb = hex(col).map((c) => Math.min(255, Math.round(c * (0.55 + 0.6 * shade))));
          const pts = vp.map(P);
          items.push({ depth: centre[2], draw: () => {
            ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.closePath();
            ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 0.7; ctx.stroke();
          } });
        }
      }

      // camera view frame at the drone's distance
      const fwd = camDir([0, 0, 1]), right = camDir([1, 0, 0]), up = camDir([0, 1, 0]);
      const lensPos = add(pivot, mul(fwd, 0.82 * HS));
      const centerW = add(pivot, mul(fwd, DIST));
      const hw = Math.tan(FOV_W * RAD) * DIST, hh = Math.tan(FOV_H * RAD) * DIST;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(centerW, add(mul(right, a * hw), mul(up, b * hh))));

      // drone world position
      const tp = s.targetPan * RAD, tt = s.targetTilt * RAD;
      const dronePos = add(pivot, mul([Math.sin(tp) * Math.cos(tt), Math.sin(tt), Math.cos(tp) * Math.cos(tt)], DIST));

      // is the drone inside the frame?
      const rel = sub(dronePos, centerW);
      const inside = Math.abs(dot(rel, right)) < hw && Math.abs(dot(rel, up)) < hh;
      s.__locked = inside;

      const beamCol = inside ? C.moss : C.accent;
      items.push({ depth: toView(centerW, yaw)[2], draw: () => {
        const lp = proj(lensPos); const cp = corners.map(proj);
        if (!lp || cp.some((c) => !c)) return;
        ctx.fillStyle = inside ? "rgba(47,107,90,.13)" : "rgba(217,83,43,.12)";
        for (let i = 0; i < 4; i++) {
          const a = cp[i], b = cp[(i + 1) % 4];
          ctx.beginPath(); ctx.moveTo(lp[0], lp[1]); ctx.lineTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.moveTo(cp[0][0], cp[0][1]);
        for (let i = 1; i < 4; i++) ctx.lineTo(cp[i][0], cp[i][1]);
        ctx.closePath();
        ctx.fillStyle = inside ? "rgba(47,107,90,.10)" : "rgba(217,83,43,.08)"; ctx.fill();
        ctx.strokeStyle = beamCol; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.strokeStyle = inside ? "rgba(47,107,90,.5)" : "rgba(217,83,43,.5)"; ctx.lineWidth = 1;
        for (const c of cp) { ctx.beginPath(); ctx.moveTo(lp[0], lp[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
      } });

      // drone path (figure-8 guide) and trail
      const guide = s.guide;
      items.push({ depth: 1e3, draw: () => {
        if (guide && guide.length) {
          ctx.strokeStyle = C.path; ctx.lineWidth = 2; ctx.setLineDash([5, 6]);
          ctx.beginPath(); let st = false;
          for (const [gp, gt] of guide) {
            const p = proj(add(pivot, mul([Math.sin(gp * RAD) * Math.cos(gt * RAD), Math.sin(gt * RAD), Math.cos(gp * RAD) * Math.cos(gt * RAD)], DIST)));
            if (!p) continue;
            st ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); st = true;
          }
          ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
        }
      } });
      items.push({ depth: toView(dronePos, yaw)[2] + 0.01, draw: () => {
        const trail = s.trail || [];
        for (let i = 1; i < trail.length; i++) {
          const a = proj(add(pivot, mul([Math.sin(trail[i - 1][0] * RAD) * Math.cos(trail[i - 1][1] * RAD), Math.sin(trail[i - 1][1] * RAD), Math.cos(trail[i - 1][0] * RAD) * Math.cos(trail[i - 1][1] * RAD)], DIST)));
          const b = proj(add(pivot, mul([Math.sin(trail[i][0] * RAD) * Math.cos(trail[i][1] * RAD), Math.sin(trail[i][1] * RAD), Math.cos(trail[i][0] * RAD) * Math.cos(trail[i][1] * RAD)], DIST)));
          if (!a || !b) continue;
          ctx.strokeStyle = `rgba(217,83,43,${(i / trail.length) * 0.55})`; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        const dp = proj(dronePos); const gp = proj([dronePos[0], 0, dronePos[2]]);
        if (!dp) return;
        // shadow + height line
        if (gp) {
          ctx.strokeStyle = "rgba(60,40,20,.25)"; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(dp[0], dp[1]); ctx.lineTo(gp[0], gp[1]); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = "rgba(60,40,20,.22)";
          ctx.beginPath(); ctx.ellipse(gp[0], gp[1], 0.4 * gp[2], 0.14 * gp[2], 0, 0, Math.PI * 2); ctx.fill();
        }
        const k = dp[2];
        // glow
        const gl = ctx.createRadialGradient(dp[0], dp[1], 0, dp[0], dp[1], 1.1 * k);
        gl.addColorStop(0, "rgba(217,83,43,.45)"); gl.addColorStop(1, "rgba(217,83,43,0)");
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(dp[0], dp[1], 1.1 * k, 0, Math.PI * 2); ctx.fill();
        // drone: arms + rotors + body
        const spin = performance.now() * 0.03;
        ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(2, 0.07 * k);
        for (const [ax, ay] of [[-1, -0.45], [1, -0.45], [-1, 0.45], [1, 0.45]]) {
          const rx = dp[0] + ax * 0.42 * k, ry = dp[1] + ay * 0.42 * k * 0.6;
          ctx.beginPath(); ctx.moveTo(dp[0], dp[1]); ctx.lineTo(rx, ry); ctx.stroke();
          ctx.fillStyle = "rgba(42,36,32,.28)";
          ctx.beginPath(); ctx.ellipse(rx, ry, 0.26 * k, 0.1 * k, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(42,36,32,.6)"; ctx.lineWidth = Math.max(1, 0.03 * k);
          ctx.beginPath(); ctx.moveTo(rx - 0.26 * k * Math.cos(spin), ry - 0.1 * k * Math.sin(spin)); ctx.lineTo(rx + 0.26 * k * Math.cos(spin), ry + 0.1 * k * Math.sin(spin)); ctx.stroke();
          ctx.strokeStyle = C.ink; ctx.lineWidth = Math.max(2, 0.07 * k);
        }
        ctx.fillStyle = C.drone;
        ctx.beginPath(); ctx.ellipse(dp[0], dp[1], 0.22 * k, 0.15 * k, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.55)";
        ctx.beginPath(); ctx.ellipse(dp[0] - 0.06 * k, dp[1] - 0.05 * k, 0.07 * k, 0.04 * k, 0, 0, Math.PI * 2); ctx.fill();
      } });

      items.sort((a, b) => b.depth - a.depth);
      for (const it of items) it.draw();

      if (o.hud) {
        ctx.font = "600 13px 'DM Sans', system-ui, sans-serif";
        ctx.fillStyle = "rgba(35,31,27,.7)";
        ctx.textAlign = "left";
        ctx.fillText("Gap: " + Math.hypot(s.errPan || 0, s.errTilt || 0).toFixed(1) + "\u00b0", 14, h - 14);
      }
    }
    return { draw, view };
  }

  window.Scene3D = { create };
})();

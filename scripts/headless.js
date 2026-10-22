// Runs the same model as the web page, with no browser.
// Usage: node scripts/headless.js
const S = require("../js/sim-core.js");

const sets = [
  ["too low", S.PRESETS.tooLow],
  ["too aggressive", S.PRESETS.aggressive],
  ["well tuned", S.PRESETS.wellTuned],
  ["P only (kp 9)", { kp: 9, ki: 0, kd: 0 }]
];

const f = (x, d = 2) => (x === null ? "never" : x.toFixed(d));
console.log("Step test: pan jumps 20 deg, tilt jumps 10 deg. Seed 1, 6 s.");
console.log("name".padEnd(16) + "Kp".padEnd(6) + "Ki".padEnd(6) + "Kd".padEnd(6) +
  "overshoot%".padEnd(12) + "settle(s)".padEnd(11) + "sse(deg)".padEnd(10) + "(pan axis)");
for (const [name, g] of sets) {
  const r = S.runStepTest(g, 1, 6);
  console.log(name.padEnd(16) + String(g.kp).padEnd(6) + String(g.ki).padEnd(6) + String(g.kd).padEnd(6) +
    f(r.pan.overshoot, 1).padEnd(12) + f(r.pan.settling).padEnd(11) + f(r.pan.sse, 3).padEnd(10));
}

console.log("\nTracking test: RMS pointing error over 20 s (deg), speed 30 deg/s.");
for (const mode of ["figure8", "wander"]) {
  for (const [name, g] of sets) {
    const r = S.runTrackTest(g, mode, 30, 1, 20);
    console.log((mode + " / " + name).padEnd(32) + "rms " + f(r.rms) + "   max " + f(r.max));
  }
}

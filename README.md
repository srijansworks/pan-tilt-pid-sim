# Pan/Tilt PID Tracker Simulator

A small in-browser simulator of a two-axis pan/tilt camera head that tries to keep pointing at a moving target. You tune the PID gains (Kp, Ki, Kd) with sliders and watch what changes.

It is the control-theory part of my real project: a ground-based pan/tilt camera that follows my drone, using Arduino servos and OpenCV on a PC.

- Live demo: https://pan-tilt-pid-sim.netlify.app
- GitHub: not pushed yet (the GitHub CLI is not installed on this Mac, so no repo was created)
- Portfolio page: https://cerulean-daffodil-607f14.netlify.app/project.html?id=pan-tilt-pid-sim

## How to run it

It is plain HTML, CSS, and JavaScript. No build step, no backend, no libraries.

- Easiest: open `index.html` in a browser.
- Or serve the folder: `python3 -m http.server 8000` and go to http://localhost:8000
- Deploying: drag the folder onto Netlify. It is a static site.

Headless version (same model, no browser):

```
node scripts/headless.js
```

That prints step-test numbers and tracking error for a few gain sets.

## What is in the folder

- `index.html`: the page (story-style, with the simulator in the middle)
- `css/style.css`: warm paper-and-ink look, layout, scroll animations (works on phones)
- `js/sim-core.js`: the simulation (servo model, PID, targets, metrics). No DOM code, so Node can run it too.
- `js/scene3d.js`: a small 3D renderer I wrote on a 2D canvas (drag to orbit)
- `js/app.js`: sliders, live plots, step test
- `js/story.js`: scroll effects, the P/I/D chart, and the "what I tested" numbers (calculated live from the simulation)
- `scripts/headless.js`: prints metrics for a few gain sets

## What the model does

Each axis (pan and tilt) has its own PID controller and its own servo:

- The controller sees the error (target angle minus camera angle) 50 ms late, plus about 0.12 degrees of random noise. That stands in for camera and vision delay.
- The PID output is a speed command in degrees per second.
- The servo has a dead zone (commands under 1.5 deg/s do nothing), a top speed of 200 deg/s, a top acceleration of 1200 deg/s^2, and a first-order lag of 80 ms.
- The integral only builds up when the error is under 5 degrees, and it is capped, so it does not wind up during big moves.
- The D term is low-pass filtered so noise does not blow it up.

Targets: a figure-8, a random wander (glides toward random points), and a step (for measuring).

## The numbers

Overshoot, settling time, and steady-state error come from the **step test**: the target jumps 20 degrees in pan and 10 degrees in tilt, and the sim runs 6 seconds. The numbers are calculated from the recorded run, not typed in.

- Overshoot: how far past the new target the camera went, as a percent of the jump.
- Settling time: how long until the camera stays within 0.5 degrees of the target for good.
- Steady-state error: average error over the last second.

Tracking a moving target does not have a step response, so in tracking mode the page shows the RMS pointing error over the last 5 seconds instead.

Results from `node scripts/headless.js` (seed 1, pan axis):

| Preset | Kp | Ki | Kd | Overshoot | Settling | Steady-state error |
|---|---|---|---|---|---|---|
| Too low | 1.5 | 0 | 0 | 0 % | never (stops 0.68 deg short) | 0.68 deg |
| Too aggressive | 28 | 0 | 0 | 87 % | never (keeps oscillating) | 2.0 deg |
| Well tuned | 8 | 6 | 0.5 | 4.5 % | 0.61 s | 0.01 deg |

Figure-8 at 30 deg/s, RMS pointing error over 20 s: too low 16.0 deg, too aggressive 16.1 deg, well tuned 3.6 deg.

## The page

The first version was a plain dashboard. I did not like how it looked, so I redesigned it as a short story: what the project is, what P, I and D each do (a scroll-driven chart), the simulator with a 3D view, what I tested, what I learned, and how it applies to my real projects. The test numbers on the page come from running `sim-core.js` in the browser when the page loads.

## What I learned

- P is the main push. Raise it and the camera catches up faster, but past a point it overshoots, swings back, and shakes. With only P at Kp 9 I got 33 % overshoot. At Kp 28 it never stops oscillating.
- D is the brake. Going from Kd 0 to Kd 0.5 (with Kp 8, Ki 6) dropped the overshoot from 28 % to 4.5 %, and the settling time got shorter too, 0.94 s down to 0.61 s.
- I fixes the small leftover error. With the servo dead zone, a low Kp leaves the camera stuck about a degree away, because the command is too small to move the servo. Integral keeps building until it pushes past the dead zone.
- Delay sets the limit. With 50 ms of delay, even a good controller trails a fast target. Well tuned still has about 3.6 degrees of RMS error on the figure-8 at 30 deg/s. More gain does not fix that, it just makes it shake.
- I fixes the leftover gap but slows things down. With Kp 2, adding Ki 3 closed the leftover gap from 0.45 to 0.02 degrees, but the camera took 2.7 s to settle and overshot about 6 %.
- D helps with stopping, not chasing. Following the figure-8, well tuned with and without D was about the same (3.6 degrees).
- Faster target, bigger gap. Well tuned was 1.4 degrees off at 15 deg/s and 7.5 degrees off at 60 deg/s.
- "Well tuned" is not one answer. It depends on the servo, the delay, and how fast the target moves. That is why I need to measure my real servos.

## Problems I hit while building and running it

- **No git, no GitHub CLI, no Netlify CLI on this Mac.** `git` was only a stub that asks for the Xcode command line tools, and I could not install them without a screen prompt. `gh` and `netlify` were not installed either. I used the `isomorphic-git` package from npm to make the repo and commits, and the Netlify and GitHub websites for the rest.
- **My first guess at "well tuned" was bad.** Kp 9, Ki 2, Kd 0.25 gave 24 % overshoot and took 2 s to settle, and after 6 seconds the camera was still 0.23 degrees off, because of the integral problem below.
- **The integral term wound up during big moves.** During the 20 degree jump the integral kept adding up while the error was huge, then it took seconds to unwind. Fix: only integrate when the error is under 5 degrees, and cap it.
- **"Too low" never counts as settled.** The servo dead zone stops the camera about 0.7 degrees short, which is outside my 0.5 degree window. That is a real effect of the model, so I left it and explained it.
- **Tracking error never gets near zero.** I expected a good tuning to give almost zero error on the figure-8. The delay and servo lag make that impossible with plain PID.
- **My first design was generic.** I redesigned the whole page (warm colors, a 3D view, scroll animations, plain-language sections). The first 3D camera angle made the scene look flat and the figure-8 hard to see, so I changed the angle, the size of the head, and the drone distance a few times.
- **Shell path confusion.** The terminal I ran things from had a sandboxed home folder, so `~` was not my real home. I used the full `/Users/srijan/...` path.
- **I could not resize the browser window to test phone width.** I loaded the page inside a 390 px wide iframe to check the mobile layout and that nothing scrolls sideways.

## Limitations

This is a simplified model made for learning. It is not a copy of my real rig.

- The servo is a speed-controlled motor with lag, speed and acceleration limits, a dead zone, and a fixed delay. Real hobby servos have their own position loop, gear slop, and stall torque. Not modeled.
- The two axes do not affect each other. A real head has weight, balance, and cable drag.
- The target is a perfect point with a perfect measurement. No object detection, no lost frames, no lighting changes, no lens. The only imperfection is a little random noise.
- The servo numbers are in a sensible range for a small hobby servo head, but I have not measured mine yet. Gains that work here will need re-tuning on hardware.
- Plain PID only. No feed-forward, no prediction of where the target is going, no gain scheduling.
- Only a single run is shown per step test, and the noise is different each run, so the numbers move a little.

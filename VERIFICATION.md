# First playable release verification

Initial release verified on 16 October 2026; manual-settings fix verified on 17 October 2026 using Node.js 24.19.0 and an installed Google Chrome browser on Windows.

## Command checks

| Check | Result |
| --- | --- |
| npm install | Passed; 54 packages installed, lockfile created |
| npm run dev | Passed; Vite serves the app |
| npm run typecheck | Passed; strict TypeScript |
| npm test | Passed; 41 tests across four suites |
| npm run build | Passed; production output in dist/ |
| npm run preview | Passed; static production build served locally |
| npm run test:browser | Passed against the production build |

The environment had Node without a global npm command, so these npm commands were invoked through the project-local CLI: `node .tools/package/bin/npm-cli.js <command>`. The package scripts are standard npm scripts. Network-restricted sandbox operations required running dependency installation and localhost browser verification outside that sandbox.

## Automated browser checks

The delivered `scripts/browser-smoke.mjs` performs these checks in a real headless Chromium browser:

- No microphone request on page load or in simulation.
- Desktop mouse simulation, capture hold, cherry collection, and score increment.
- Pause, resume, restart, and return to menu.
- Invalid settings rejected; valid settings saved and retained after reload.
- Manually saved pitch/loudness ranges survive Play after reload and Settings → Save → Resume without reopening calibration. Explicit Microphone Setup still opens the wizard.
- All six calibration screens measured from a synthetic microphone stream and persisted.
- Comfortable-voice calibration accepted a deliberately delayed start after extending past the original 2.5-second measurement window.
- Actual production AudioWorklet and analysis worker loaded and ran.
- A 250 Hz signal appeared as approximately 250 Hz in the debug overlay.
- Increasing pitch/loudness reached the top/right; reducing them reached bottom/left.
- Silence immediately invalidated vocal activity.
- Microphone tracks ended after standalone setup and pause.
- A 390 × 844 viewport had no page overflow and collected a cherry through simulation.
- Disabling AudioWorklet used the ScriptProcessor compatibility path and still detected pitch.
- Denied microphone access displayed actionable instructions and allowed simulation recovery.
- No uncaught browser runtime errors.

The synthetic microphone is an oscillator routed through a Web Audio MediaStream destination. It substitutes only the browser acquisition result. All game capture, worklet transport, worker DSP, gate, mapping, calibration, and lifecycle code execute normally. It is not a fake analysis-data source.

## Visual checks

Inspected the actual desktop menu/game and mobile menu/game screenshots. Fixed the initial mobile bird clipping and background seam. The final screenshots are in `artifacts/`:

- `menu-desktop.png`
- `game-desktop.png`
- `menu-mobile.png`
- `game-mobile.png`
- `calibration-1.png` through `calibration-6.png`

The mobile gameplay screenshot intentionally has debug enabled from the persistence test; the debug overlay is off by default for normal play.

## Voice-control polish

After a user reported difficulty completing the comfortable-voice step and horizontal oscillation, calibration was changed to gather usable voiced duration over up to eight seconds. It now tolerates pauses and isolated pitch outliers, uses a robust room-floor estimate, and expands the setup detection range. YIN now compares a shorter recent span and uses a 0.80 periodicity floor; deterministic broadband noise is still rejected in tests.

Horizontal control now filters transient levels, adds hysteresis, and smooths small corrections. A separate bug was fixed where the success-chime input guard was interpreted as silence and could pull the bird left. Regression tests cover these behaviors with imperfect synthetic voices and volume ripples.

## Remaining real-world verification

**A physical microphone and a human voice were not tested.** The automated browser uses synthetic audio and cannot establish real-room pitch reliability, comfortable personal ranges, microphone gain behavior, or native permission-prompt behavior on a particular device.

Firefox, Safari/iPadOS, touch hardware, and actual device switching remain manual compatibility checks. The game includes the necessary input selection and cleanup paths, but hardware differences can affect latency and detection. See the README for known audio limitations and setup guidance.

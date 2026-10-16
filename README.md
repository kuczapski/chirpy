# Chirpy: Sing & Soar

A relaxed, voice-controlled browser game. Help a little teal bird gather cherries in a sunny meadow: pitch moves up and down, loudness moves left and right. There are no timers, penalties, accounts, recordings, or backend services.

Built with **TypeScript in strict mode, Phaser 3.90.0, Vite, and the Web Audio API**. All illustrations are local SVGs or procedural Phaser graphics. All audio processing happens on the device.

## Run locally

Install Node.js 22.12+ (or a current Node LTS) with npm, then open a terminal:

```sh
cd chirpy
npm install
npm run dev
```

Open **http://localhost:5173**. Vite prints the actual address if that port is occupied. Keep the terminal running while playing. Stop the server with Ctrl+C.

The development environment used to create this project supplied Node but no npm executable. A project-local npm CLI was bootstrapped in the ignored `.tools/package` folder. On this computer, if `npm` is unavailable, the equivalent commands are:

```powershell
node .tools/package/bin/npm-cli.js install
node .tools/package/bin/npm-cli.js run dev
```

That bootstrap folder is tooling only; it is not needed with a normal Node/npm installation and is not included in the website.

## Play

1. Select **Let’s play** and allow microphone access when the browser asks.
2. If you have not calibrated this input, follow the short microphone setup.
3. Sustain a comfortable “AAAA”. Raise/lower its pitch to fly up/down. Make it softer/fuller to move left/right. There is no need to shout.
4. Stay near a cherry until its white ring fills. A visual burst, an optional chime, and the score show success.
5. Select **Pause**, or press Escape, to rest, resume, restart, change settings, or stop. Switching tabs also pauses the flight.

The microphone is requested only through Play or Microphone Setup (including its explicit retry button). Pause, Stop, canceled setup, completed standalone setup, a disconnected device, and leaving the page release microphone tracks and audio resources. Resume reconnects from a user gesture.

### Simulation Mode

Choose **Just exploring? Try Simulation Mode** on the start screen. Move the mouse over the meadow; on a tablet, touch or drag. X supplies a simulated loudness, and Y supplies a simulated pitch. The same mapping, smoothing, capture logic, and score run, with a persistent **SIMULATION MODE** badge. This mode never requests microphone permission. Moving the mouse outside the canvas releases the simulated voice.

Simulation is a testing/exploration option. Normal play uses only the voice for bird control.

## Build and deploy

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`build` checks TypeScript and writes the complete static site to `dist/`. Upload **the contents of `dist/`**, including its `assets/` directory, to any static host. No server code or environment secrets are required. Relative asset URLs allow deployment under a subdirectory. The worker and worklet are bundled as separate local JavaScript files.

Use HTTPS on the deployed site. Browsers restrict microphone access to secure contexts; **localhost is a development exception**. Opening `index.html` as a `file://` URL is not supported. An ordinary HTTP LAN address, such as `http://192.168.x.x:5173`, generally cannot use a microphone even though simulation works. For tablets, use an HTTPS host or a locally trusted HTTPS development setup. Embedded deployments also need microphone permission delegated by the containing page and its Permissions Policy.

Vite's development server exposes the project on the local network by default. To bind only to this computer, run `npm run dev -- --host 127.0.0.1`.

## Voice mapping

Each analysis frame contains F0 in Hz, YIN confidence, RMS, raw and smoothed dBFS, voice activity, an analysis timestamp, and the last valid timestamp.

```text
x = clamp((loudnessDb - minDb) / (maxDb - minDb), 0, 1)
linear y = clamp((pitch - pitchMin) / (pitchMax - pitchMin), 0, 1)
musical y = clamp(log(pitch / pitchMin) / log(pitchMax / pitchMin), 0, 1)
screen x = left + x × fieldWidth
screen y = bottom - y × fieldHeight
```

These are **absolute positions**, not accumulated movement or velocity. The default logarithmic mapping makes equal musical intervals occupy equal distances. Both axes have independent smoothing and a small adjustable normalized deadband. Horizontal control also uses a five-frame median and a small level hysteresis to reject brief loudness fluctuations. Small corrections are smoothed more than deliberate moves. Each audio frame is filtered only once, regardless of render frame rate. Frame-rate-independent exponential interpolation prevents rendering speed from changing movement behavior.

Reliable input must be voiced, have confidence ≥0.80, and be no more than 150 ms old. Invalid frames cannot capture cherries. A brief interruption holds the previous destination for 200 ms by default; sustained silence returns gently to bottom-left. Large pitch intervals require three consistent frames to avoid isolated octave-error jumps while permitting intentional register changes. A short gameplay input guard during the success chime holds the previous destination and disables collection, avoiding both speaker feedback and an unwanted return toward the left.

## Audio architecture

- `src/audio/AudioInput.ts`: permission handling, input selection, stream lifecycle, worker communication, and cleanup. Requests mono input and disables echo cancellation, noise suppression, and automatic gain where supported; browsers may still apply hardware/OS processing.
- `audio-worklet.ts`: a preallocated rolling buffer on the audio thread, with a nominal 40 Hz frame cadence. One transferable analysis frame may be in flight at a time. If processing is slow, new frames wait rather than building an unbounded queue. The worklet produces silent output; microphone audio is never played back.
- `analysis-worker.ts` / `AudioAnalyzer.ts`: DSP in a dedicated worker, independent of Phaser. RMS is calculated on full-rate input. Light box-filter decimation to approximately 16 kHz reduces YIN cost; this is intentionally a small, dependency-free implementation.
- `PitchDetector.ts`: YIN cumulative mean normalized differences, confidence thresholding, parabolic interpolation, and a temporal jump stabilizer. Its recent comparison span covers at least two low-note periods without averaging pitch modulation over the entire acquisition window. This accommodates natural vibrato and modest breathiness. It does not use FFT spectral peaks as F0.
- `LoudnessDetector.ts`: `20 * log10(max(rms, 1e-6))`, plus independent attack/release smoothing. The noise gate uses the raw level, so slow release never keeps silence voiced.
- If AudioWorklet is unavailable or fails to load, ScriptProcessor captures blocks and sends them to the same worker. This deprecated compatibility path has higher latency and may run below 30 Hz. It is retained for older browsers, not selected on modern browsers with working worklets.

The balanced window is 96 ms; 64 and 128 ms are selectable. Total response includes the window, up to one 25 ms analysis interval, worker scheduling, and smoothing. The debug overlay labels its window-plus-input-latency figure as an estimate, not a measured end-to-end latency. Hardware and OS buffering cannot be measured precisely here. Playback never contains microphone samples; only the small synthesized success chime reaches the speakers.

## Calibration

The six short screens represent four stages:

1. **Background**: about two seconds of quiet; the median room level plus a 6 dB margin supplies a provisional gate. The median prevents a short click or bump from setting an excessively high gate.
2. **Comfortable voice**: about 2.5 seconds of a steady “AAAA”.
3. **Pitch range**: separate low and high comfortable notes.
4. **Loudness range**: separate quiet-but-voiced and comfortably louder sounds.

Voiced steps normally take about 2.5 seconds, but automatically listen for up to eight seconds when needed. Each step gathers at least 1.2 seconds of usable voice across at least 12 distinct frames; small pauses and delayed starts are allowed. Progress reflects usable samples, not just elapsed time. A dominant pitch cluster and medians discard occasional octave errors rather than rejecting the entire step. Silence, missing audio, and a broad sweep with no representative note still cannot complete a step. Setup temporarily expands detection to at least 60–1200 Hz to include lower adult voices and higher voices outside an earlier profile.

The final profile requires meaningful pitch and loudness separation, a comfortable voice above the room level, and valid independent ranges. The final gate remains at least 4 dB below quiet phonation. Retry any step, or return to an earlier one. No step records or saves audio.

**Use default ranges** is always available. Defaults are explicitly labeled unpersonalized: 140–440 Hz and −42 to −18 dBFS. They can be edited in Settings, and choosing them does not create a personalized calibration. The current flight can pause/resume using the accepted defaults. A new visit may ask for calibration again.

Settings and voice setup are stored locally under `chirpy-settings-v1` and `chirpy-calibration-v1`. Setup records distinguish measured calibration from manually saved settings. **Save settings** explicitly accepts the displayed values for the selected input: Play and Resume use them directly, including after a page reload, without launching calibration. Choose **Microphone Setup** explicitly to measure and replace those ranges. Clear the setup choice with **Settings → Microphone & advanced audio → Reset calibration**; saving afterward accepts the displayed defaults as manual settings. Setup is associated with the selected device ID. If browser storage is unavailable, settings and the setup choice work for the current visit, and a message explains that they were not persisted.

## Settings and difficulty

Settings are available from the header and pause menu. A live flight pauses before editing. Numeric values are checked for finiteness, supported limits, ordering, and a detection range that covers the mapped pitch range.

| Option | Default |
| --- | --- |
| Pitch mapping | Logarithmic |
| Pitch / loudness movement smoothing | 90 / 110 ms |
| Silence hold | 200 ms |
| Jitter deadband | 0.012 normalized units |
| Loudness attack / release | 35 / 110 ms |
| Expected detected pitch | 80–800 Hz |
| Analysis window | 96 ms |
| Capture radius / hold | 58 logical pixels / 400 ms |
| Sound effects | 30% |

The **Easy / Normal / Advanced** selector sets capture defaults of **76 px / 300 ms**, **58 px / 400 ms**, and **40 px / 650 ms** respectively. Radius and duration can then be overridden individually. The first three targets are comfortable, central positions. Subsequent positions gradually spread out; the radius shrinks by at most 8%, 12%, or 15% over the first 30 cherries. All difficulty values and safe field bounds are centralized in `src/config/GameConfig.ts`.

The advanced section includes device selection, the gate, expected F0 range, loudness attack/release, and analysis window. Device names may be hidden until permission is granted. A selected input is opened on the next Play/Resume/Setup, after any existing stream has been stopped. **Microphone Setup / retry access** opens a fresh explicit permission/setup flow.

Reduced motion respects the system preference initially and can be overridden. It removes decorative bobbing, cloud motion, wing motion, and particle bursts while retaining smooth control and essential capture feedback. Menus use native focusable controls and a modal focus trap. The layout adapts to desktop, tablets, and narrow screens; landscape orientation gives the largest play field on a phone.

## Tests

`npm test` runs 41 hardware-independent Vitest tests for:

- 80–790 Hz tones, including the requested 200 and 400 Hz cases.
- A stronger second harmonic, silence, noise, and octave-error rejection.
- RMS/dBFS amplitude relationships, attack/release, and 44.1/48/96 kHz input.
- Independent axes, linear/logarithmic mappings, frame-rate-independent convergence, stale/invalid frames, and silence return.
- Simulation inversion, continuous voiced capture, calibration sample requirements, and numeric validation.
- Delayed starts, breathing pauses, octave outliers, slower analysis cadence, and room-noise transients during calibration.
- A harmonic vowel with vibrato and breath noise, loudness-ripple suppression, sustained horizontal changes, endpoint reachability, and position holding during chimes.
- Acceptance and persistence of manual voice setup, reset behavior, existing measured profiles, invalid ranges, and blocked storage.

An optional real-browser smoke test is included in `scripts/browser-smoke.mjs`. It feeds a synthetic Web Audio MediaStream through the **actual** worklet and worker; it does not substitute fake analysis values. It tests the UI, simulation collection, persistence, calibration, axis directions, silence, cleanup, compatibility capture, and denied-permission recovery. No microphone hardware is opened by that test.

```sh
# Optional testing dependency; unnecessary for running or building the game.
npm install --no-save playwright
npx playwright install chromium
# Keep npm run dev running in another terminal, then:
npm run test:browser
```

Set `BASE_URL` to test a different server (including `npm run preview`). Set `BROWSER_CHANNEL=chrome` or `msedge` to use an installed browser instead of downloaded Chromium. `PLAYWRIGHT_MODULE` can point to an existing Playwright module as a file URL. Screenshots are saved to `artifacts/`.

## Compatibility and limitations

- Target browsers are recent Chromium/Edge, Firefox, and Safari with Web Audio, workers, microphone permission, and native dialogs. Chromium was used for automated browser verification; Safari/iPadOS and Firefox still need hardware testing.
- **A physical microphone and human voice were not verified in this development session.** Synthetic streaming audio did verify the acquisition-to-analysis-to-control path, including calibration and cleanup. Test with the intended microphone, room, and speaker before relying on a personalized range.
- Pitch detection is designed for one sustained voice. Music, another speaker, strong periodic machinery/hum, very breathy sounds, or multiple simultaneous voices can confuse it. A periodic signal alone cannot reliably establish that a human is singing.
- Soft phonation can be lost in a noisy room; background processing or automatic gain may reduce loudness control. Calibrate near the microphone in a quiet room. Recalibrate if the microphone, room, distance, or OS input gain changes, including changes behind a system-default device.
- The simple downsampling filter and YIN thresholds are pragmatic for sustained vowels; strong high-frequency interference, vocal fry, rapid glides, and subharmonics can reduce reliability. Increase the analysis window for steadier low notes, at the cost of latency.
- Pitch and loudness are mapped independently, but changing one can naturally change the other in a real voice. The game cannot remove that physical coupling. Stay within comfortable ranges; caregiver-selected narrower ranges are supported.
- Background tabs and mobile audio interruptions may suspend capture. The game pauses and requires an explicit resume. Compatibility capture has more latency than AudioWorklet.
- This is a play/exercise tool, not a diagnostic or treatment system. It has no clinical scoring or progress recording.

See `VERIFICATION.md` for the checks run for this release.

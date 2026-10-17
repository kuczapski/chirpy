import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Playwright is an optional development tool, not a runtime dependency.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}), headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-features=CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.__micRequests = 0;
  window.__micStreams = [];
  navigator.mediaDevices.getUserMedia = async () => {
    window.__micRequests++;
    const context = new AudioContext({ sampleRate: 48000 });
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const destination = context.createMediaStreamDestination();
    oscillator.frequency.value = 250; gain.gain.value = 0.0001;
    oscillator.connect(gain).connect(destination); oscillator.start(); await context.resume();
    window.__micStreams.push(destination.stream);
    window.__testTone = (frequency, amplitude) => {
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      gain.gain.setValueAtTime(amplitude, context.currentTime);
    };
    destination.stream.getAudioTracks()[0].addEventListener('ended', () => { void context.close(); });
    return destination.stream;
  };
});
try {
  await page.goto(process.env.BASE_URL || 'http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.querySelector('#play-button').disabled);
  assert.equal(await page.evaluate(() => window.__micRequests), 0, 'No permission request before an explicit action');
  await page.screenshot({ path: 'artifacts/menu-desktop.png', fullPage: true });
  await page.locator('#simulation-button').click();
  await page.locator('#flight-start').click();
  await page.locator('#simulation-banner').waitFor({ state: 'visible' });
  const canvas = await page.locator('canvas').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * 436 / 1280, canvas.y + canvas.height * 409.25 / 720);
  await page.waitForFunction(() => document.querySelector('#score').textContent === '1');
  await page.screenshot({ path: 'artifacts/game-desktop.png', fullPage: true });
  await page.locator('#pause-button').click();
  assert.equal(await page.locator('dialog').isVisible(), true);
  await page.locator('#resume').click();
  await page.locator('#pause-button').click();
  await page.locator('#restart').click();
  await page.locator('#flight-start').click();
  await page.waitForFunction(() => document.querySelector('#score').textContent === '0');
  await page.locator('#pause-button').click();
  await page.locator('#stop').click();
  assert.equal(await page.evaluate(() => window.__micRequests), 0, 'Simulation never requests the microphone');
  for (const mode of ['pitch', 'loudness']) {
    await page.locator('#simulation-button').click();
    await page.locator(`[name="controlMode"][value="${mode}"]`).check();
    await page.locator('[name="pitchProfile"][value="kid"]').check();
    await page.locator('[name="loudnessProfile"][value="quiet"]').check();
    if (mode === 'pitch') {
      await page.locator('#flight-manual').click();
      assert.equal(await page.locator('[name="pitchMin"]').inputValue(), '180');
      assert.equal(await page.locator('[name="minDb"]').inputValue(), '-55');
      await page.getByRole('button', { name: 'Save settings', exact: true }).click();
      assert.equal(await page.locator('[name="controlMode"][value="pitch"]').isChecked(), true);
    }
    await page.screenshot({ path: `artifacts/flight-${mode}.png`, fullPage: true });
    await page.locator('#flight-start').click();
    // Deliberately put the unused mouse axis far from the cherry.
    for (const [index, [x, y]] of [[436, 409.25], [568.6, 333.6]].entries()) {
      await page.mouse.move(canvas.x + canvas.width * (mode === 'pitch' ? 1100 : x) / 1280,
        canvas.y + canvas.height * (mode === 'loudness' ? 130 : y) / 720);
      await page.waitForFunction(score => document.querySelector('#score').textContent === String(score), index + 1);
    }
    assert.equal(await page.locator('#mode-badge').innerText(), mode === 'pitch' ? 'Pitch' : 'Loudness');
    await page.locator('#pause-button').click();
    await page.locator('#stop').click();
  }
  await page.locator('#settings-button').click();
  await page.locator('[name="controlMode"]').selectOption('full');
  await page.locator('[name="debug"]').check();
  await page.locator('[name="showMeters"]').check();
  await page.locator('[name="pitchMax"]').fill('140');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  assert.match(await page.locator('#settings-error').innerText(), /High pitch/);
  await page.locator('[name="pitchMin"]').fill('160');
  await page.locator('[name="pitchMax"]').fill('420');
  await page.locator('[name="minDb"]').fill('-45');
  await page.locator('[name="maxDb"]').fill('-16');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('chirpy-settings-v1')).debug), true);
  // Saving manual ranges is a valid setup choice, including after reload.
  await page.locator('#play-button').click();
  await page.locator('#flight-start').click();
  await page.locator('#hud').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#cal-record').count(), 0);
  assert.deepEqual(await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('chirpy-settings-v1'));
    return [s.pitchMin, s.pitchMax, s.minDb, s.maxDb];
  }), [160, 420, -45, -16]);
  await page.locator('#pause-button').click();
  await page.locator('#pause-settings').click();
  await page.locator('[name="minDb"]').fill('-44');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.locator('#resume').click();
  await page.waitForFunction(() => !document.querySelector('dialog').open);
  assert.equal(await page.locator('#cal-record').count(), 0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('chirpy-settings-v1')).minDb), -44);
  await page.locator('#pause-button').click();
  await page.locator('#stop').click();
  // Explicit setup remains available and is allowed to replace manual ranges.
  await page.locator('#play-button').click();
  await page.locator('#flight-wizard').click();
  await page.locator('#cal-record').waitFor();
  const tones = [[250, 0.0001], [250, 0.12], [180, 0.12], [400, 0.12], [250, 0.035], [250, 0.2]];
  for (let index = 0; index < tones.length; index++) {
    await page.evaluate(([frequency, amplitude]) => window.__testTone(frequency, amplitude), tones[index]);
    await page.waitForTimeout(300);
    if (index === 1) await page.evaluate(() => window.__testTone(250, 0));
    await page.locator('#cal-record').click();
    if (index === 1) {
      // A slow start must extend listening instead of failing at 2.5 seconds.
      await page.waitForTimeout(2800);
      assert.equal(await page.locator('#cal-next').isDisabled(), true);
      assert.match(await page.locator('#cal-message').innerText(), /Take your time/);
      await page.evaluate(() => window.__testTone(250, 0.12));
    }
    await page.waitForFunction(() => !document.querySelector('#cal-next').disabled, null, { timeout: 7000 });
    await page.screenshot({ path: `artifacts/calibration-${index + 1}.png` });
    await page.locator('#cal-next').click();
  }
  await page.waitForFunction(() => localStorage.getItem('chirpy-calibration-v1') !== null);
  assert.equal(await page.evaluate(() => window.__micStreams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), true, 'Setup releases microphone tracks');
  await page.locator('#flight-form').waitFor();
  await page.locator('#flight-back').click();
  await page.locator('#play-button').click();
  await page.locator('#flight-start').click();
  await page.locator('#hud').waitFor({ state: 'visible' });
  await page.evaluate(() => window.__testTone(250, 0.12));
  await page.waitForFunction(() => document.querySelector('#mic-status').textContent.includes('we hear'));
  assert.match(await page.locator('#debug').innerText(), /AudioWorklet \+ worker/);
  assert.match(await page.locator('#debug').innerText(), /F0 250\./);
  await page.evaluate(() => window.__testTone(400, 0.2));
  await page.waitForTimeout(1300);
  assert.match(await page.locator('#debug').innerText(), /X (0\.9\d\d|1\.000)  Y (0\.9\d\d|1\.000)/);
  await page.evaluate(() => window.__testTone(180, 0.035));
  await page.waitForTimeout(1300);
  assert.match(await page.locator('#debug').innerText(), /X 0\.0\d\d  Y 0\.0\d\d/);
  await page.evaluate(() => window.__testTone(250, 0));
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#mic-status').innerText(), 'Ready when you are');
  assert.match(await page.locator('#debug').innerText(), /Voice no/);
  await page.locator('#pause-button').click();
  assert.equal(await page.evaluate(() => window.__micStreams.every(s => s.getTracks().every(t => t.readyState === 'ended'))), true, 'Pause releases microphone tracks');
  await page.locator('#stop').click();
  await page.waitForTimeout(4500); // Let the transient setup toast disappear before visual QA.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/menu-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile page has no horizontal overflow');
  await page.locator('#simulation-button').click();
  await page.screenshot({ path: 'artifacts/flight-mobile.png', fullPage: true });
  assert.equal(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'Mobile flight selector fits its dialog');
  await page.locator('#flight-start').click();
  const mobileCanvas = await page.locator('canvas').boundingBox();
  await page.mouse.click(mobileCanvas.x + mobileCanvas.width * 436 / 1280, mobileCanvas.y + mobileCanvas.height * 409.25 / 720);
  await page.waitForFunction(() => document.querySelector('#score').textContent === '1');
  await page.screenshot({ path: 'artifacts/game-mobile.png', fullPage: true });

  // Verify the graceful non-worklet path against the same real DSP worker.
  await page.locator('#pause-button').click();
  await page.locator('#stop').click();
  await page.addInitScript(() => {
    Object.defineProperty(AudioContext.prototype, 'audioWorklet', { get: () => undefined, configurable: true });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#play-button').click();
  await page.locator('#flight-start').click();
  await page.locator('#hud').waitFor({ state: 'visible' });
  await page.evaluate(() => window.__testTone(250, 0.12));
  await page.waitForFunction(() => document.querySelector('#mic-status').textContent.includes('we hear'));
  assert.match(await page.locator('#debug').innerText(), /Compatibility capture \+ worker/);
  await page.locator('#pause-button').click();
  await page.locator('#stop').click();

  // Permission-denied recovery must offer useful instructions and a playable fallback.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#play-button').click();
  await page.locator('#flight-start').click();
  await page.locator('#mic-error').waitFor();
  assert.match(await page.locator('#mic-error').innerText(), /browser’s site settings/);
  await page.locator('#error-sim').click();
  assert.equal(await page.locator('#simulation-banner').isVisible(), true);
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log('PASS: full/pitch/loudness modes, preset selection, manual/wizard return paths, mobile flight selector, desktop/mobile simulation, collection, pause/resume/restart, settings persistence, calibration, real audio worklet/worker, fallback, permission recovery, no runtime errors.');
} catch (error) {
  await page.screenshot({ path: 'artifacts/browser-failure.png', fullPage: true });
  console.error('Browser errors:', errors);
  throw error;
} finally { await browser.close(); }

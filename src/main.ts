import './styles/main.css';
import { AudioInput } from './audio/AudioInput';
import { SuccessSound } from './audio/SuccessSound';
import { loadSettings, saveSettings, type Settings } from './config/GameConfig';
import { hasVoiceSetup, resetCalibration, saveCalibration } from './controls/CalibrationManager';
import { createGame, type GameSnapshot } from './game/Game';
import { Modal } from './ui/Modal';
import { CalibrationWizard } from './ui/CalibrationWizard';
import { showSettings } from './ui/SettingsPanel';
import { updateDebug } from './ui/DebugOverlay';
import { MODE_LABELS, showFlightSetup } from './ui/FlightSetup';

const icons = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z" fill="currentColor"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3M8 22h8"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 4-5 5H3v6h3l5 5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19C-1 7 8 3 21 3c0 12-5 19-14 14M5 21 16 9"/></svg>',
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="site-header">
    <a class="brand" href="#" aria-label="Chirpy home"><span class="brand-icon"><img src="${import.meta.env.BASE_URL}assets/bird.svg" alt="" /></span><span>chirpy<span class="brand-dot">.</span></span></a>
    <span class="header-note">A little voice. A big adventure.</span>
    <nav aria-label="Game options"><button id="sound-button" class="icon-button" aria-label="Mute sound effects" title="Sound effects">${icons.sound}</button><button id="settings-button" class="header-button">${icons.settings}<span>Settings</span></button></nav>
  </header>
  <main>
    <section class="game-shell" aria-label="Chirpy: Sing & Soar game">
      <div id="game-canvas" aria-label="Voice-controlled meadow. Use Play for voice control or Simulation Mode for mouse control."></div>
      <div id="menu" class="menu-overlay">
        <div class="mobile-meadow" aria-hidden="true"><img class="mobile-cloud" src="${import.meta.env.BASE_URL}assets/cloud.svg" alt=""><div class="mobile-bird"><img src="${import.meta.env.BASE_URL}assets/bird.svg" alt=""><img class="mobile-wing" src="${import.meta.env.BASE_URL}assets/wing.svg" alt=""></div></div>
        <div class="menu-copy">
          <span class="pill"><span class="tiny-leaf">✦</span> YOUR VOICE HAS WINGS</span>
          <h1>Chirpy<span>Sing <i>&</i> Soar</span></h1>
          <p class="hero-copy">A gentle adventure, powered by you.<br>Find your voice. Follow the cherries.<br>See how high you can fly.</p>
          <button id="play-button" class="button play-button" disabled>${icons.play}<span>Let’s play</span></button>
          <button id="setup-button" class="setup-button">${icons.mic}Microphone Setup</button>
          <button id="simulation-button" class="simulation-link">Just exploring? Try Simulation Mode <span>↗</span></button>
        </div>
        <span class="bird-greeting">Hi, I’m Chirpy!<svg viewBox="0 0 90 45" aria-hidden="true"><path d="M5 4Q52-2 72 29m-13-2 15 6-1-16"/></svg></span>
        <div class="meadow-label">${icons.leaf} THE SUNNY MEADOW</div>
      </div>
      <div id="hud" class="hud" hidden>
        <div class="score-badge"><img src="${import.meta.env.BASE_URL}assets/cherry.svg" alt="Cherries" /><strong id="score">0</strong><span>collected</span></div>
        <div class="mic-badge"><span id="mic-dot"></span><span id="mic-status">Listening for your voice</span></div>
        <button id="fullscreen-button" class="button pause-button" aria-label="Enter fullscreen" aria-pressed="false" title="Enter fullscreen">&#x26F6;</button>
        <button id="pause-button" class="button pause-button" aria-label="Pause game">Ⅱ <span>Pause</span></button>
      </div>
      <div id="simulation-banner" class="simulation-banner" hidden>SIMULATION MODE <span>· Move your mouse or touch the meadow</span></div>
      <div id="play-guidance" class="play-guidance" hidden><span>↓ low &nbsp; · &nbsp; high ↑</span><span>quiet ← &nbsp; ♪ &nbsp; → louder</span></div>
      <div id="capture-hud" class="capture-hud" hidden><span id="capture-caption">Find a cherry and hold your voice</span><progress id="capture-progress" max="1" value="0" aria-label="Cherry capture progress"></progress></div>
      <div id="meters" class="meters" hidden><span id="pitch-meter">— Hz</span><span id="db-meter">— dBFS</span></div>
      <div id="mode-badge" class="mode-badge" hidden></div>
      <pre id="debug" class="debug" hidden></pre>
      <span id="encouragement" class="encouragement" aria-live="polite"></span>
    </section>
    <section class="how-to" aria-label="How to play">
      <div class="guide-intro"><span class="eyebrow">A SONG. A FLIGHT. A SMILE.</span><h2>Little sounds.<br> Lovely discoveries.</h2></div>
      <article class="guide-card"><span class="guide-icon pitch-icon">↕</span><div><h3>Change your pitch</h3><p>Sing higher to fly up.<br>Sing lower to float down.</p></div></article>
      <article class="guide-card"><span class="guide-icon loud-icon">◖))</span><div><h3>Find your volume</h3><p>A softer voice moves left.<br>A fuller voice moves right.</p></div></article>
      <article class="guide-card"><span class="guide-icon cherry-icon"><img src="${import.meta.env.BASE_URL}assets/cherry.svg" alt="" /></span><div><h3>Gather a little joy</h3><p>Stay by a cherry to collect it.<br>Take your time. It’s your sky.</p></div></article>
    </section>
  </main>
  <footer><span>${icons.leaf} No rush. No wrong notes. Just you and Chirpy.</span><span>${icons.mic} Your voice stays on this device.</span></footer>
  <div id="toast" role="status" class="toast" hidden></div>
`;

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
let settings = loadSettings();
const audio = new AudioInput();
const sound = new SuccessSound();
const modal = new Modal();
const shell = $('.game-shell');
shell.append(modal.element);
let expanded = false;
let nativeFullscreen = false;
let wizard: CalibrationWizard | null = null;
let operation = 0;
let busy = false;
let ready = false;
let toastTimer = 0;
let celebrationTimer = 0;
let beforeMute = settings.volume || 0.3;
let latestSnapshot: GameSnapshot | null = null;
let feedbackUntil = 0;
let acceptedDefaultsFor: string | null = null;

const { game, scene } = createGame($('#game-canvas'), {
  settings: () => settings,
  analysis: () => audio.latest,
  holdVoiceInput: () => performance.now() < feedbackUntil,
  onReady: () => { ready = true; $('#play-button').removeAttribute('disabled'); },
  onSnapshot: snapshot => {
    latestSnapshot = snapshot;
    $('#score').textContent = String(snapshot.score);
    $('#mic-status').textContent = scene.simulation ? 'Mouse voice is on' : snapshot.position.valid ? 'Lovely, we hear you!' : 'Ready when you are';
    $('#mic-dot').classList.toggle('active', snapshot.position.valid);
    $('#pitch-meter').textContent = snapshot.analysis.voiced ? `${Math.round(snapshot.analysis.pitch)} Hz` : '— Hz';
    $('#db-meter').textContent = `${Math.round(snapshot.analysis.db)} dBFS`;
    $<HTMLProgressElement>('#capture-progress').value = snapshot.progress;
    $('#capture-caption').textContent = snapshot.progress > 0 ? 'That’s it… keep your voice steady' : 'Find a cherry and hold your voice';
    if (settings.debug) updateDebug($('#debug'), snapshot, audio, scene.simulation);
  },
  onCapture: score => {
    sound.play(settings.volume);
    // Ignore speaker feedback during our short chime; raw analysis remains available.
    if (settings.volume > 0) feedbackUntil = performance.now() + 380;
    $('#score').textContent = String(score);
    $('#encouragement').textContent = ['Lovely flying!', 'You found it!', 'A little cherry joy!', 'Beautifully done!'][(score - 1) % 4];
    window.clearTimeout(celebrationTimer);
    celebrationTimer = window.setTimeout(() => { $('#encouragement').textContent = ''; }, 1600);
  },
});

function updateGameLayout(): void {
  if (!ready) return;
  const portrait = scene.mode !== 'menu' && settings.controlMode === 'pitch'
    && window.innerWidth <= 760 && window.innerHeight > window.innerWidth;
  shell.classList.toggle('pitch-portrait', portrait);
  const bounds = shell.getBoundingClientRect();
  scene.setPortrait(portrait ? 720 * bounds.width / bounds.height : null);
  game.scale.refresh();
}
function setExpanded(value: boolean): void {
  expanded = value;
  document.body.classList.toggle('game-expanded', value);
  const button = $('#fullscreen-button');
  button.setAttribute('aria-pressed', String(value));
  button.setAttribute('aria-label', value ? 'Exit fullscreen' : 'Enter fullscreen');
  button.title = value ? 'Exit fullscreen' : 'Enter fullscreen';
  button.textContent = value ? '↙' : '⛶';
  requestAnimationFrame(updateGameLayout);
}
async function leaveFullscreen(): Promise<void> {
  setExpanded(false);
  if (document.fullscreenElement === shell) await document.exitFullscreen().catch(() => {});
}
async function toggleFullscreen(): Promise<void> {
  if (expanded) { await leaveFullscreen(); return; }
  setExpanded(true);
  try {
    if (shell.requestFullscreen) await shell.requestFullscreen();
  } catch { /* Keep the screen-filling layout when native fullscreen is unavailable. */ }
}
function fullscreenChanged(): void {
  if (document.fullscreenElement === shell) { nativeFullscreen = true; setExpanded(true); }
  else if (nativeFullscreen) { nativeFullscreen = false; setExpanded(false); }
}
window.addEventListener('resize', updateGameLayout);
document.addEventListener('fullscreenchange', fullscreenChanged);

function toast(message: string): void {
  window.clearTimeout(toastTimer);
  $('#toast').textContent = message; $('#toast').hidden = false;
  toastTimer = window.setTimeout(() => { $('#toast').hidden = true; }, 4500);
}
function persist(updated: Settings): void {
  settings = updated;
  if (!saveSettings(settings)) toast('Settings work for this visit. Browser storage is unavailable, so they cannot be saved.');
  applyDisplay();
}
function applyDisplay(): void {
  document.body.classList.toggle('reduced-motion', settings.reducedMotion);
  $('#sound-button').setAttribute('aria-label', settings.volume === 0 ? 'Unmute sound effects' : 'Mute sound effects');
  $('#sound-button').classList.toggle('muted', settings.volume === 0);
  $('#meters').hidden = scene.mode === 'menu' || !settings.showMeters;
  $('#debug').hidden = scene.mode === 'menu' || !settings.debug;
  if (latestSnapshot && settings.debug) updateDebug($('#debug'), latestSnapshot, audio, scene.simulation);
}
function showGameUI(active: boolean): void {
  $('#menu').hidden = active;
  for (const id of ['hud', 'play-guidance', 'capture-hud']) $(`#${id}`).hidden = !active;
  $('#simulation-banner').hidden = !active || !scene.simulation;
  $('#mode-badge').hidden = !active;
  $('#mode-badge').textContent = MODE_LABELS[settings.controlMode];
  $('#play-guidance').innerHTML = settings.controlMode === 'pitch' ? '<span>↓ low &nbsp; · &nbsp; high ↑</span><span>Chirpy lines up left & right</span>'
    : settings.controlMode === 'loudness' ? '<span>Chirpy lines up at cherry height</span><span>quiet ← &nbsp; ♪ &nbsp; → fuller</span>'
    : '<span>↓ low &nbsp; · &nbsp; high ↑</span><span>quiet ← &nbsp; ♪ &nbsp; → fuller</span>';
  document.body.classList.toggle('playing', active);
  applyDisplay();
  if (!active) void leaveFullscreen();
  requestAnimationFrame(updateGameLayout);
}
function cancelPending(): void {
  operation++; busy = false;
  wizard?.cancel(); wizard = null;
  audio.stop(); modal.close();
}
function returnToMenu(): void {
  cancelPending(); sound.close(); if (ready) scene.menu(); showGameUI(false);
  acceptedDefaultsFor = null;
  $('#encouragement').textContent = ''; $('#play-button').focus();
}
function showError(message: string, retry: () => void): void {
  modal.show(`<div class="modal-top"><span class="eyebrow">LET’S GET CONNECTED</span></div><h2>A little microphone help.</h2><p id="mic-error" class="modal-copy" role="alert"></p><div class="button-row"><button id="retry-mic" class="button primary">Try again</button><button id="error-sim" class="button secondary">Simulation Mode</button></div><button id="error-close" class="text-button modal-dismiss">Return to menu</button>`, returnToMenu);
  modal.query('#mic-error').textContent = message;
  modal.query('#retry-mic').onclick = retry;
  modal.query('#error-sim').onclick = startSimulation;
  modal.query('#error-close').onclick = returnToMenu;
}
async function startVoice(setupOnly = false, resume = false, afterSetup?: () => void): Promise<void> {
  if (!ready || busy) return;
  busy = true;
  const token = ++operation;
  void sound.unlock();
  const cancelAccess = () => { cancelPending(); afterSetup?.(); };
  modal.show(`<div class="loading-bird"><img src="${import.meta.env.BASE_URL}assets/bird.svg" alt="Chirpy" /></div><h2>Let’s hear your voice.</h2><p class="modal-copy">Choose Allow in your browser’s microphone prompt.<br>Your voice stays on this device.</p><button id="cancel-access" class="button secondary">Cancel</button>`, cancelAccess);
  modal.query('#cancel-access').onclick = cancelAccess;
  try {
    await audio.start(settings);
    if (token !== operation) return;
    if (setupOnly || (!hasVoiceSetup(settings.deviceId) && acceptedDefaultsFor !== settings.deviceId)) {
      wizard = new CalibrationWizard(modal, audio, settings);
      const result = await wizard.run();
      wizard = null;
      if (token !== operation) return;
      if (!result) { audio.stop(); busy = false; if (afterSetup) afterSetup(); else if (scene.mode === 'pause') showPause(); return; }
      persist(result.settings);
      if (result.personalized) {
        acceptedDefaultsFor = null;
        if (!saveCalibration(settings)) toast('Calibration works for this visit, but browser storage is unavailable.');
      } else {
        resetCalibration(); acceptedDefaultsFor = settings.deviceId;
        toast('Using default voice ranges. These are not personalized; adjust them in Settings.');
      }
    }
    if (token !== operation) return;
    busy = false; modal.close();
    if (setupOnly) {
      audio.stop();
      toast('Microphone setup complete. You’re ready to fly.');
      if (afterSetup) afterSetup(); else if (scene.mode === 'pause') showPause();
    } else {
      if (resume) scene.resume(); else scene.start(false);
      showGameUI(true);
    }
  } catch (error) {
    if (token !== operation) return;
    busy = false;
    showError(error instanceof Error ? error.message : 'Could not connect to the microphone.', () => void startVoice(setupOnly, resume, afterSetup));
  }
}
function startSimulation(): void {
  if (!ready) return;
  cancelPending(); void sound.unlock(); scene.start(true); showGameUI(true);
  $('#pause-button').focus();
}
function showPause(message = 'Rest your voice. The meadow will wait.'): void {
  modal.show(`<div class="modal-top"><span class="eyebrow">A LITTLE BREATHER</span><span class="pause-cherry">✦</span></div><h2>You’re doing lovely.</h2><p class="modal-copy" id="pause-copy"></p><div class="pause-score"><strong>${scene.score}</strong> cherries collected</div><div class="pause-actions"><button id="resume" class="button primary">${icons.play}Keep flying</button><button id="restart" class="button secondary">Start a new flight</button><button id="pause-settings" class="button secondary">${icons.settings}Settings</button><button id="stop" class="text-button">Stop & return to menu</button></div>`, () => void resumeGame());
  modal.query('#pause-copy').textContent = message;
  modal.query('#resume').onclick = () => void resumeGame();
  modal.query('#restart').onclick = () => openFlight(scene.simulation);
  modal.query('#pause-settings').onclick = () => openSettings();
  modal.query('#stop').onclick = returnToMenu;
}
function pauseGame(message?: string): void {
  if (scene.mode !== 'play') return;
  scene.pause(); audio.stop(); showPause(message);
}
async function resumeGame(): Promise<void> {
  if (scene.simulation) { modal.close(); scene.resume(); showGameUI(true); return; }
  await startVoice(false, true);
}
function openSettings(onClose?: () => void): void {
  if (busy) return;
  if (scene.mode === 'play') { scene.pause(); audio.stop(); }
  void showSettings(modal, settings, audio, updated => {
    persist(updated);
    acceptedDefaultsFor = null;
    if (!saveCalibration(updated, 'manual')) toast('Your manual voice settings are ready for this visit, but browser storage is unavailable.');
  },
    () => { modal.close(); if (onClose) onClose(); else if (scene.mode === 'pause') showPause(); },
    () => void startVoice(true, false, onClose));
}

function openFlight(simulation = false): void {
  if (!ready || busy) return;
  showFlightSetup(modal, settings, simulation, {
    start: updated => {
      persist(updated);
      if (!saveCalibration(updated, 'manual')) toast('Your selections are ready for this visit; browser storage is unavailable.');
      if (simulation) startSimulation(); else void startVoice();
    },
    manual: updated => { persist(updated); openSettings(() => openFlight(simulation)); },
    wizard: updated => { persist(updated); void startVoice(true, false, () => openFlight(simulation)); },
    cancel: () => { modal.close(); if (scene.mode === 'pause') showPause(); },
  });
}

$('#play-button').onclick = () => openFlight();
$('#setup-button').onclick = () => void startVoice(true);
$('#simulation-button').onclick = () => openFlight(true);
$('#settings-button').onclick = () => openSettings();
$('#pause-button').onclick = () => pauseGame();
$('#fullscreen-button').onclick = () => void toggleFullscreen();
$('.brand').onclick = event => { event.preventDefault(); returnToMenu(); };
$('#sound-button').onclick = () => {
  if (settings.volume > 0) beforeMute = settings.volume;
  persist({ ...settings, volume: settings.volume === 0 ? beforeMute : 0.0 });
};
audio.onError = message => {
  if (scene.mode === 'play') { pauseGame(message); return; }
  if (busy) { cancelPending(); showError(message, () => void startVoice(true)); }
};
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && expanded && !modal.element.open) { void leaveFullscreen(); return; }
  if (event.key === 'Escape' && !modal.element.open && scene.mode === 'play') pauseGame();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (scene.mode === 'play') pauseGame('Your flight was paused while you were away.');
    else if (busy) { cancelPending(); toast('Setup paused. Select Microphone Setup when you’re ready.'); }
  }
});
window.addEventListener('pagehide', () => { cancelPending(); sound.close(); });
if (import.meta.hot) import.meta.hot.dispose(() => { cancelPending(); sound.close(); window.removeEventListener('resize', updateGameLayout); document.removeEventListener('fullscreenchange', fullscreenChanged); document.body.classList.remove('game-expanded'); game.destroy(true); modal.element.remove(); });
applyDisplay();

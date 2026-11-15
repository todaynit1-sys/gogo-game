// 배경음악 — 오락실을 위해 새로 지은 짧은 곡들을 브라우저 안에서 칩튠 소리로 합성해 돌린다(음악 파일 없음).
// 곡 표기: 한 칸 = 8분음표. "C5" 음, "." 쉼, "-" 앞 음 늘이기, "|" 마디 구분(무시). 드럼: k 북, s 스네어, h 하이햇, t 장구 궁편, c 장구 채편.
import { audio, noiseBuffer } from "./games/kit.js?v=3";

const SONGS = {
  // 내 방·로비: 포근하게
  lobby: {
    bpm: 100, lead: "triangle", leadVol: 0.07, bass: "triangle", bassVol: 0.07, drumVol: 0.6,
    melody: "E5 . G5 . A5 G5 E5 . | C5 . E5 . D5 C5 A4 . | F4 A4 C5 F5 E5 . C5 . | D5 - B4 . G4 - . . | E5 . G5 . C6 . B5 A5 | G5 . E5 . A5 . G5 E5 | F5 E5 D5 C5 A4 . C5 D5 | E5 - D5 . C5 - - .",
    bassline: "C3 . G3 . C3 . G3 . | A2 . E3 . A2 . E3 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . D3 . | C3 . G3 . C3 . G3 . | A2 . E3 . A2 . E3 . | F2 . C3 . F2 . C3 . | G2 . D3 . C3 - - .",
    drums: "k . h . s . h .",
  },
  // 배구·축구·피구: 신나게
  sport: {
    bpm: 132, lead: "square", leadVol: 0.035, bass: "triangle", bassVol: 0.08, drumVol: 0.8,
    melody: "D5 D5 B4 D5 G5 . F#5 G5 | E5 . B4 . E5 F#5 G5 E5 | C5 E5 G5 E5 A5 G5 E5 C5 | D5 . F#5 . A5 . F#5 D5 | G5 . B5 A5 G5 F#5 E5 D5 | E5 G5 B5 - A5 G5 E5 . | C5 . E5 . G5 . A5 B5 | A5 - F#5 . D5 - . .",
    bassline: "G2 G3 G2 G3 G2 G3 G2 G3 | E2 E3 E2 E3 E2 E3 E2 E3 | C3 C4 C3 C4 C3 C4 C3 C4 | D3 D4 D3 D4 D3 D4 D3 D4 | G2 G3 G2 G3 G2 G3 G2 G3 | E2 E3 E2 E3 E2 E3 E2 E3 | C3 C4 C3 C4 C3 C4 C3 C4 | D3 D4 D3 D4 D3 D4 D3 D4",
    drums: "k h s h k k s h",
  },
  // 폭탄 미로·땅따먹기: 두근두근
  tense: {
    bpm: 140, lead: "square", leadVol: 0.03, bass: "triangle", bassVol: 0.09, drumVol: 0.8,
    melody: "A4 . C5 . E5 . C5 . | A4 . C5 . E5 D5 C5 B4 | F4 . A4 . C5 . A4 . | E4 . G#4 . B4 . D5 . | A5 . G5 . E5 . C5 . | D5 E5 C5 - A4 - . . | F5 . E5 . D5 . C5 . | B4 . G#4 . E4 - - .",
    bassline: "A2 A2 A3 A2 A2 A2 A3 A2 | A2 A2 A3 A2 A2 A2 A3 A2 | F2 F2 F3 F2 F2 F2 F3 F2 | E2 E2 E3 E2 E2 E2 E3 E2 | A2 A2 A3 A2 A2 A2 A3 A2 | A2 A2 A3 A2 A2 A2 A3 A2 | F2 F2 F3 F2 F2 F2 F3 F2 | E2 E2 E3 E2 E2 E2 E3 E2",
    drums: "k h h k s h k h",
  },
  // 블록 대전·연쇄 팡: 통통 튀게
  puzzle: {
    bpm: 120, lead: "triangle", leadVol: 0.075, pluck: true, bass: "triangle", bassVol: 0.08, drumVol: 0.6,
    melody: "C5 F5 A5 F5 C5 F5 A5 C6 | A5 . F5 . D5 . F5 . | D5 F5 A#5 F5 D5 F5 A#5 D6 | C6 . A#5 . A5 . G5 . | A5 . C6 . A5 G5 F5 . | D5 . F5 . A5 . G5 F5 | A#4 D5 F5 A#5 A5 G5 F5 D5 | E5 . G5 . F5 - - .",
    bassline: "F2 . F3 . F2 . F3 . | D2 . D3 . D2 . D3 . | A#1 . A#2 . A#1 . A#2 . | C2 . C3 . C2 . C3 . | F2 . F3 . F2 . F3 . | D2 . D3 . D2 . D3 . | A#1 . A#2 . A#1 . A#2 . | C2 . C3 . C2 . C3 .",
    drums: "k . h s . k h s",
  },
  // 포격전·새총·당구·알까기: 느긋하게
  chill: {
    bpm: 92, swing: 0.14, lead: "sine", leadVol: 0.09, bass: "triangle", bassVol: 0.08, drumVol: 0.5,
    melody: "F#5 - . A5 - . F#5 E5 | D5 - - - B4 . D5 . | E5 . G5 . B5 . A5 G5 | F#5 . E5 - - - . . | F#5 . A5 . D6 . C#6 B5 | A5 . F#5 . D5 . F#5 . | G5 . F#5 . E5 . D5 . | E5 - - - D5 - - .",
    bassline: "D3 - . D3 A2 - . . | B2 - . B2 F#2 - . . | G2 - . G2 D3 - . . | A2 - . A2 E3 - . . | D3 - . D3 A2 - . . | B2 - . B2 F#2 - . . | G2 - . G2 D3 - . . | A2 - . A2 E3 - . .",
    drums: "k . h . s . h h",
  },
  // 윷놀이: 가야금처럼 튕기는 소리에 장구 장단
  yut: {
    bpm: 104, lead: "triangle", leadVol: 0.1, pluck: true, bass: "triangle", bassVol: 0.09, bassPluck: true, drumVol: 0.7,
    melody: "A4 . C5 D5 E5 . D5 C5 | D5 . E5 G5 A5 . G5 E5 | G5 . E5 D5 C5 . D5 E5 | D5 - - - C5 . A4 . | C5 . D5 E5 G5 . A5 G5 | A5 . C6 A5 G5 . E5 D5 | E5 . G5 E5 D5 . C5 A4 | C5 - - - A4 - - .",
    bassline: "A2 . . . E3 . . . | D3 . . . A2 . . . | C3 . . . G2 . . . | D3 . . . A2 . . . | A2 . . . E3 . . . | D3 . . . A2 . . . | C3 . . . G2 . . . | D3 . . . A2 . . .",
    drums: "k . t c k . t t",
  },
};

const NOTE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
function parse(str) {
  const toks = str.split(/\s+/).filter((t) => t && t !== "|"), steps = toks.map(() => null);
  toks.forEach((t, i) => {
    const m = /^([A-G]#?)(\d)$/.exec(t);
    if (!m) return;
    let len = 1; while (toks[i + len] === "-") len++;
    steps[i] = { n: 12 * (+m[2] + 1) + NOTE[m[1]], len };
  });
  return steps;
}
for (const k in SONGS) { const s = SONGS[k]; s.mel = parse(s.melody); s.bas = parse(s.bassline); s.len = s.mel.length; s.drum = s.drums.split(/\s+/); }

let on = true, unlocked = false, wanted = null, cur = null, bus = null, timer = 0, nextT = 0, step = 0, hurry = false;
// 박자 맞추개: 작업 스레드 타이머가 화면 타이머보다 덜 늦어진다(없으면 보통 타이머)
let worker = null;
function startTicker() {
  stopTicker();
  try {
    worker = new Worker(URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),25)"], { type: "text/javascript" })));
    worker.onmessage = schedule;
  } catch { timer = setInterval(schedule, 25); }
}
function stopTicker() { if (worker) { worker.terminate(); worker = null; } clearInterval(timer); }

function voice(type, f, t, dur, vol, pluck) {
  const ac = audio(), o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  if (pluck) g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.6, dur + 0.25));
  else { g.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.05)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.7);
}
function hit(kind, t, vol) {
  const ac = audio(), g = ac.createGain();
  g.connect(bus);
  if (kind === "k" || kind === "t") {
    const o = ac.createOscillator(), f0 = kind === "k" ? 150 : 260, f1 = kind === "k" ? 45 : 170;
    o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
    g.gain.setValueAtTime(0.4 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); o.start(t); o.stop(t + 0.2);
    return;
  }
  const src = ac.createBufferSource(), f = ac.createBiquadFilter();
  src.buffer = noiseBuffer(); src.loop = true;
  const [type, fr, q, v, d] = { s: ["highpass", 1300, 0.7, 0.16, 0.12], h: ["highpass", 7000, 0.7, 0.05, 0.04], c: ["bandpass", 2600, 4, 0.14, 0.04] }[kind] || ["highpass", 7000, 0.7, 0.04, 0.03];
  f.type = type; f.frequency.value = fr; f.Q.value = q;
  g.gain.setValueAtTime(v * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  src.connect(f).connect(g); src.start(t, Math.random() * 0.5); src.stop(t + d + 0.02);
}

function schedule() {
  if (!cur) return;
  const ac = audio(), eighth = 60 / (cur.bpm * (hurry ? 1.25 : 1)) / 2;
  if (nextT < ac.currentTime - 0.05) nextT = ac.currentTime + 0.05;      // 타이머가 늦게 깨면 밀린 음을 몰아 치지 않고 건너뛴다
  while (nextT < ac.currentTime + 0.15) {
    const i = step, m = cur.mel[i], b = cur.bas[i % cur.bas.length], d = cur.drum[i % cur.drum.length];
    if (m) voice(cur.lead, hz(m.n), nextT, m.len * eighth * 0.94, cur.leadVol, cur.pluck);
    if (b) voice(cur.bass, hz(b.n), nextT, b.len * eighth * 0.9, cur.bassVol, cur.bassPluck);
    if (d && d !== ".") hit(d, nextT, cur.drumVol);
    const sw = cur.swing ? (i % 2 === 0 ? 1 + cur.swing : 1 - cur.swing) : 1;
    nextT += eighth * sw;
    step = (step + 1) % cur.len;
  }
}

function start(name) {
  const ac = audio(), song = SONGS[name];
  if (!song) return;
  fadeOut(0.3);
  bus = ac.createGain(); bus.gain.setValueAtTime(0.0001, ac.currentTime); bus.gain.exponentialRampToValueAtTime(1, ac.currentTime + 0.6);
  bus.connect(ac.destination);
  cur = song; cur.name = name; step = 0; nextT = ac.currentTime + 0.1;
  startTicker(); schedule();
}
function fadeOut(sec) {
  if (!bus) return;
  const ac = audio(), old = bus;
  try { old.gain.cancelScheduledValues(ac.currentTime); old.gain.setValueAtTime(old.gain.value || 0.0001, ac.currentTime); old.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + sec); } catch {}
  setTimeout(() => { try { old.disconnect(); } catch {} }, sec * 1000 + 800);
  bus = null; cur = null; stopTicker();
}

export const music = {
  // 이 곡을 틀고 싶다(소리를 켤 수 있을 때 튼다). 같은 곡이면 그대로 둔다
  play(name) { wanted = name; if (!on || !unlocked || document.hidden) return; if (cur && cur.name === name) return; try { start(name); } catch {} },
  stop(sec = 0.6) { wanted = null; fadeOut(sec); },
  // 판이 끝나면 잠깐 멈춘다(다시 play 하면 이어서)
  pause(sec = 0.5) { fadeOut(sec); },
  unlock() { unlocked = true; if (wanted) this.play(wanted); },
  setOn(v) { on = v; if (!v) fadeOut(0.3); else if (wanted) this.play(wanted); },
  isOn: () => on,
  hurry(v) { hurry = !!v; },
};
document.addEventListener("visibilitychange", () => { if (document.hidden) fadeOut(0.2); else if (wanted && on && unlocked) music.play(wanted); });

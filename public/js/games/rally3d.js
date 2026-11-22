// 노을 옥상 라켓의 3D 무대 — 해질녘 옥상, 장난감 같은 코트와 떡 선수들.
// rally.js 가 필요할 때만 불러온다. render(보기, {me, t, touch}) 가 그린 캔버스를 돌려준다.

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";
import { parseLook, bodyColors } from "../avatar.js?v=3";
import { makeMochi, kit } from "./stage3d.js?v=2";

const CW = 3, CL = 6.6, NET = 0.95;
let R = null;      // { renderer, scene, cam, ... }

const rng = (() => { let a = 20261121; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
const mat = (color, rough = 0.85, extra) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
function mesh(geo, m, x, y, z, cast = true, recv = true) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = recv; return o; }
function canvasTex(w, h, paint) { const c = document.createElement("canvas"); c.width = w; c.height = h; paint(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

function build(touch) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  const k = touch ? 1 : 1.5;
  renderer.setPixelRatio(1); renderer.setSize(Math.round(960 * k), Math.round(540 * k), false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = canvasTex(4, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#7a86c4"); g.addColorStop(0.35, "#f0a48a"); g.addColorStop(0.6, "#ffc98f"); g.addColorStop(1, "#ffe2ad"); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  scene.fog = new THREE.Fog(0xf6b98c, 34, 95);

  const cam = new THREE.PerspectiveCamera(52, 16 / 9, 0.5, 220);

  scene.add(new THREE.HemisphereLight(0xffdcb8, 0x86709c, 1.15));
  const sun = new THREE.DirectionalLight(0xffb070, 3.1);
  sun.position.set(-17, 9.5, -8); sun.castShadow = true;
  sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 60 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const disc = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff3cc, fog: false }));
  disc.position.set(-120, 30, -62); scene.add(disc);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, "rgba(255,240,200,.9)"); g.addColorStop(1, "rgba(255,200,140,0)"); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.copy(disc.position); glow.scale.set(90, 90, 1); scene.add(glow);

  // ── 옥상 바닥과 난간 ──
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const concrete = mat(0xdcb692), wall = mat(0xedcfa6), cap = mat(0xc99a72);
  scene.add(mesh(box(22, 2, 38), concrete, 0, -1, 0, false));
  for (const [w, d, x, z] of [[0.6, 38, -10.7, 0], [0.6, 38, 10.7, 0], [22, 0.6, 0, -18.7], [22, 0.6, 0, 18.7]]) {
    scene.add(mesh(box(w, 1.1, d), wall, x, 0.55, z), mesh(box(w + 0.2, 0.14, d + 0.2), cap, x, 1.17, z));
  }
  // 바닥 타일 줄눈
  const groove = mat(0xc9a27e);
  for (let z = -18; z <= 18; z += 3) scene.add(mesh(box(21, 0.02, 0.06), groove, 0, 0.005, z, false));

  // ── 코트 ──
  const flat = (w, d, color, x, z, y) => mesh(box(w, 0.02, d), mat(color, 0.95), x, y, z, false);
  scene.add(flat(CW * 2 + 3.6, CL * 2 + 4.2, 0x2f807b, 0, 0, 0.012));
  scene.add(flat(CW * 2, CL * 2, 0x4fa798, 0, 0, 0.02));
  scene.add(flat(CW * 2, 4, 0xdb7a4c, 0, 0, 0.026));
  const line = mat(0xfff8ea, 0.8), lw = 0.08;
  for (const [w, d, x, z] of [[lw, CL * 2 + lw, -CW, 0], [lw, CL * 2 + lw, CW, 0], [CW * 2, lw, 0, -CL], [CW * 2, lw, 0, CL], [CW * 2, lw, 0, -2], [CW * 2, lw, 0, 2], [lw, CL - 2, 0, -(CL + 2) / 2], [lw, CL - 2, 0, (CL + 2) / 2]]) {
    scene.add(mesh(box(w, 0.02, d), line, x, 0.034, z, false));
  }
  // 네트
  const post = mat(0x39406e, 0.6);
  for (const x of [-CW - 0.45, CW + 0.45]) scene.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, NET + 0.12, 10), post, x, (NET + 0.12) / 2, 0));
  const netTex = canvasTex(256, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = "rgba(40,44,90,.95)"; c.lineWidth = 2; for (let x = 0; x <= w; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y <= h; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(CW * 2 + 0.9, NET - 0.1), new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1 }));
  net.position.set(0, (NET - 0.1) / 2 + 0.08, 0); net.castShadow = true; scene.add(net);
  scene.add(mesh(box(CW * 2 + 0.9, 0.09, 0.05), line, 0, NET, 0));

  // ── 소품 ──
  const greens = [mat(0x5fae5a, 0.9, { flatShading: true }), mat(0x3f8f5a, 0.9, { flatShading: true }), mat(0x86c56a, 0.9, { flatShading: true })];
  const potM = mat(0xc9653e), ico = new THREE.IcosahedronGeometry(1, 1), potG = new THREE.CylinderGeometry(0.38, 0.27, 0.55, 12);
  let plantN = 0;
  const plant = (x, z, s = 1) => {
    const kp = kit(["plant_a", "plant_c", "plant_b"][plantN++ % 3]);
    if (kp) { kp.position.set(x, 0, z); kp.scale.setScalar(s * 1.05); scene.add(kp); return; }
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
    g.add(mesh(potG, potM, 0, 0.28, 0));
    for (let i = 0; i < 4; i++) { const r = 0.3 + rng() * 0.22, m = mesh(ico, greens[i % 3], (rng() - 0.5) * 0.5, 0.75 + rng() * 0.45, (rng() - 0.5) * 0.5); m.scale.setScalar(r); g.add(m); }
    scene.add(g);
  };
  for (const sx of [-1, 1]) for (const z of [-10.5, -7.5, 7.5, 10.5]) plant(sx * (6.1 + rng() * 0.4), z + rng(), 0.9 + rng() * 0.5);
  plant(-9.4, -17.3, 1.5); plant(9.4, 17.3, 1.5); plant(-9.3, 17.2, 1.2); plant(3.2, -17.4, 1.1);

  // 벤치와 구경꾼
  const wood = mat(0xa9744c), fans = [], fanG = new THREE.SphereGeometry(0.4, 16, 12), eyeG = new THREE.SphereGeometry(0.055, 8, 6), ink = new THREE.MeshBasicMaterial({ color: 0x2b2d4e });
  const fanCols = [0xff9db5, 0x9bd88a, 0xffd66b, 0xa9c8ff, 0xc3a6ff, 0xffb37a, 0x8fe0d2, 0xf7f1e3];
  for (const sx of [-1, 1]) for (const z0 of [-4.6, 0.1, 4.6]) {
    scene.add(mesh(box(0.6, 0.12, 3), wood, sx * 7.6, 0.42, z0), mesh(box(0.1, 0.42, 0.1), wood, sx * 7.6, 0.21, z0 - 1.3), mesh(box(0.1, 0.42, 0.1), wood, sx * 7.6, 0.21, z0 + 1.3));
    for (let j = 0; j < 3; j++) {
      if (rng() < 0.2) continue;
      const g = new THREE.Group(), b = mesh(fanG, mat(fanCols[(rng() * fanCols.length) | 0], 0.6), 0, 0, 0, true, false);
      b.scale.set(1, 0.9, 1); g.add(b);
      for (const e of [-1, 1]) { const eye = new THREE.Mesh(eyeG, ink); eye.position.set(-sx * 0.36, 0.08, e * 0.14); g.add(eye); }
      g.position.set(sx * 7.6, 0.84, z0 - 1 + j); scene.add(g);
      fans.push({ g, y: 0.84, ph: rng() * 6.28, sp: 2.4 + rng() * 1.6 });
    }
  }
  // 물탱크, 옥탑, 실외기 (먼 쪽) / 파라솔 (가까운 쪽)
  const tank = new THREE.Group(); tank.position.set(-7.2, 0, -15.6);
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) tank.add(mesh(box(0.14, 1.3, 0.14), post, x, 0.65, z));
  tank.add(mesh(new THREE.CylinderGeometry(1.35, 1.35, 2, 20), mat(0xe9d6b4, 0.7), 0, 2.3, 0), mesh(new THREE.ConeGeometry(1.5, 0.7, 20), mat(0x7b8fc0, 0.7), 0, 3.65, 0));
  scene.add(tank);
  scene.add(mesh(box(4.2, 2.8, 3), mat(0xf3d6ae), 5.6, 1.4, -16.6), mesh(box(4.6, 0.2, 3.4), cap, 5.6, 2.9, -16.6), mesh(box(1, 1.9, 0.08), mat(0x3f8f86, 0.6), 4.6, 0.95, -15.06), mesh(box(1, 0.7, 0.08), mat(0xbfe6ff, 0.3), 6.6, 1.7, -15.06));
  for (const x of [0.2, 1.9]) { scene.add(mesh(box(1.4, 0.95, 0.8), mat(0xe7e3da, 0.6), x, 0.5, -17.6), mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.04, 16).rotateX(Math.PI / 2), mat(0x6f7690, 0.5), x, 0.5, -17.19)); }
  const para = new THREE.Group(); para.position.set(-7.4, 0, 14.8);
  para.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), post, 0, 1.3, 0), mesh(new THREE.ConeGeometry(1.7, 0.7, 8), mat(0xff8a5c, 0.8, { flatShading: true }), 0, 2.75, 0), mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16), wood, 0, 0.8, 0));
  scene.add(para);

  // 줄전구와 깃발
  const bulbG = new THREE.SphereGeometry(0.09, 8, 6), bulbM = new THREE.MeshBasicMaterial({ color: 0xfff2b8, fog: false }), flagG = new THREE.ConeGeometry(0.17, 0.34, 3);
  const flagM = [0xff5d73, 0xffc93c, 0x4fa798, 0xfff8ea, 0x7b8fc0].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide }));
  const corners = [[-8.8, -16], [8.8, -16], [8.8, 16], [-8.8, 16]], wire = new THREE.LineBasicMaterial({ color: 0x4a4466 });
  for (const [x, z] of corners) scene.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.9, 8), post, x, 1.95, z));
  for (let c = 0; c < 4; c++) {
    const [x0, z0] = corners[c], [x1, z1] = corners[(c + 1) % 4], len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.95), pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = 3.8 - Math.sin(t * Math.PI) * (len > 20 ? 1.15 : 0.8);
      pts.push(new THREE.Vector3(x, y, z));
      if (i && i < n) { if (i % 2) { const b = new THREE.Mesh(bulbG, bulbM); b.position.set(x, y - 0.1, z); scene.add(b); } else { const f = new THREE.Mesh(flagG, flagM[(i / 2) % 5 | 0]); f.position.set(x, y - 0.2, z); f.rotation.set(Math.PI, c % 2 ? Math.PI / 2 : 0, 0); f.scale.set(1, 1, 0.08); scene.add(f); } }
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire));
  }

  // ── 먼 도시 ──
  const winTex = (base, lit) => { const t = canvasTex(64, 128, (c, w, h) => { c.fillStyle = base; c.fillRect(0, 0, w, h); for (let y = 6; y < h - 6; y += 14) for (let x = 6; x < w - 8; x += 14) { c.fillStyle = rng() < lit ? "#ffe9a8" : "rgba(60,50,90,.35)"; c.fillRect(x, y, 8, 9); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); return t; };
  const cityM = [["#eeb690", 0.45], ["#dc9c88", 0.3], ["#c98d95", 0.5], ["#f3cba2", 0.25], ["#b98aa0", 0.4]].map(([c, l]) => { const t = winTex(c, l); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0x7a5a30, roughness: 0.9 }); });
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2 + rng() * 0.08, r = 27 + rng() * 34, w = 4 + rng() * 6, d = 4 + rng() * 6, top = -5 + rng() * (r > 44 ? 24 : 13);
    const b = mesh(box(w, top + 46, d), cityM[i % 5], Math.cos(a) * r, (top - 46) / 2, Math.sin(a) * r, false, false);
    b.rotation.y = rng() * 0.6; scene.add(b);
    if (rng() < 0.4) scene.add(mesh(box(w * 0.4, 1.4, d * 0.4), cityM[(i + 2) % 5], b.position.x, top + 0.7, b.position.z, false, false));
  }
  scene.add(mesh(new THREE.CircleGeometry(160, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe7a785 }), 0, -40, 0, false, false));
  const cloudM = new THREE.MeshBasicMaterial({ color: 0xffe4d0, fog: false, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 9; i++) { const a = rng() * 6.28, c = new THREE.Mesh(ico, cloudM); c.position.set(Math.cos(a) * 110, 30 + rng() * 26, Math.sin(a) * 110); c.scale.set(10 + rng() * 12, 2.4 + rng() * 2, 6 + rng() * 5); scene.add(c); }

  // ── 공 ──
  const ball = mesh(new THREE.SphereGeometry(0.17, 18, 14), mat(0xe9ff45, 0.5, { emissive: 0x4c5a00 }), 0, 1, 0, true, false);
  scene.add(ball);
  const blobG = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), blobM = () => new THREE.MeshBasicMaterial({ color: 0x241a3a, transparent: true, opacity: 0.35, depthWrite: false });
  const ballBlob = new THREE.Mesh(blobG, blobM()); ballBlob.position.y = 0.045; scene.add(ballBlob);
  const mark = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.44, 30).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe45c, transparent: true, opacity: 0.9, depthWrite: false })); mark.position.y = 0.06; mark.visible = false; scene.add(mark);
  const trail = [];
  for (let i = 0; i < 7; i++) { const t = new THREE.Mesh(ball.geometry, new THREE.MeshBasicMaterial({ color: 0xf4ff9a, transparent: true, opacity: 0.32 - i * 0.04, depthWrite: false })); t.scale.setScalar(0.85 - i * 0.09); scene.add(t); trail.push(t); }
  const sparkTex = canvasTex(64, 64, (c) => { c.strokeStyle = "#fff"; c.lineWidth = 7; c.beginPath(); c.arc(32, 32, 24, 0, 7); c.stroke(); });
  const sparks = [];
  for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff2b0 })); s.visible = false; scene.add(s); sparks.push({ s, t: 9 }); }

  return { renderer, scene, cam, sun, ball, ballBlob, mark, trail, hist: [], sparks, fans, blobG, blobM, chars: [null, null], keys: ["", ""], camX: 0, mem: { hc: -1, qc: -1 }, lastT: 0 };
}

// 떡 선수: 앞(+z)을 보는 모양으로 만들고 통째로 돌린다
function makeChar(look) {
  if (kit("mochi")) { const k = makeMochi(look, { cap: true, racket: true }); return { g: k.g, body: k.body, arm: k.arm, px: 0, pz: 0, run: 0 }; }      // 블렌더 모델
  const c = bodyColors(look), g = new THREE.Group(), body = new THREE.Group();
  const skin = mat(c.body, 0.55), dark = mat(c.dark, 0.7), ink = new THREE.MeshBasicMaterial({ color: 0x2b2d4e });
  const b = mesh(new THREE.SphereGeometry(0.66, 24, 18), skin, 0, 0.64, 0, true, false); b.scale.set(1, 0.92, 1); body.add(b);
  for (const e of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), ink); eye.position.set(e * 0.21, 0.78, 0.59); body.add(eye);
    const ck = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.75 })); ck.position.set(e * 0.36, 0.62, 0.5); ck.scale.set(1, 0.7, 0.4); body.add(ck);
    body.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), dark, e * 0.27, 0.1, 0.06, true, false));
  }
  const capTop = mesh(new THREE.SphereGeometry(0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), dark, 0, 0.9, 0, true, false); capTop.scale.set(1, 0.6, 1); body.add(capTop);
  body.add(mesh(new THREE.BoxGeometry(0.62, 0.05, 0.42), dark, 0, 0.93, 0.62, true, false));
  // 라켓 (오른손 쪽)
  const arm = new THREE.Group(); arm.position.set(-0.66, 0.66, 0.12);
  const frame = mat(0xff5d73, 0.5);
  arm.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8), mat(0x39406e, 0.6), 0, 0.25, 0, true, false));
  const head = mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 22), frame, 0, 0.8, 0, true, false); head.scale.set(1, 1.2, 1); arm.add(head);
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.29, 18), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide })); strings.position.y = 0.8; strings.scale.set(1, 1.2, 1); arm.add(strings);
  body.add(arm);
  g.add(body);
  return { g, body, arm, px: 0, pz: 0, run: 0 };
}

export function render(v, env) {
  if (!R) R = build(!!env.touch);
  const { scene, cam, renderer } = R, t = env.t, dt = Math.min(0.1, Math.max(0, t - R.lastT)); R.lastT = t;
  const me = env.me, side = me === 0 ? 1 : -1;

  for (let i = 0; i < 2; i++) {
    const key = v.seats[i].look + "|" + i;
    if (R.keys[i] !== key) {
      if (R.chars[i]) { scene.remove(R.chars[i].g); scene.remove(R.chars[i].blob); }
      const c = makeChar(parseLook(v.seats[i].look, i));
      c.blob = new THREE.Mesh(R.blobG, R.blobM()); c.blob.scale.set(0.62, 1, 0.5); c.blob.position.y = 0.04; c.blob.material.opacity = 0.28;
      scene.add(c.g, c.blob); R.chars[i] = c; R.keys[i] = key;
    }
    const c = R.chars[i], p = v.p[i];
    const moved = Math.hypot(p.x - c.px, p.z - c.pz) > 0.004; c.px = p.x; c.pz = p.z;
    c.run += ((moved ? 1 : 0) - c.run) * Math.min(1, dt * 12);
    const hop = Math.abs(Math.sin(t * 13 + i)) * 0.16 * c.run, win = v.over && v.over.w === i ? Math.abs(Math.sin(t * 7)) * 0.5 : 0;
    c.g.position.set(p.x, hop + win, p.z); c.g.rotation.y = i === 0 ? Math.PI : 0;
    c.body.scale.set(1 + 0.05 * c.run * Math.sin(t * 26), 1 - 0.05 * c.run * Math.sin(t * 26), 1);
    c.body.rotation.z = Math.sin(t * 13 + i) * 0.08 * c.run;
    c.blob.position.x = p.x; c.blob.position.z = p.z;
    // 휘두르기
    const k = p.sw ? Math.min(1, p.sw / 11) : 0, lob = p.sk === 1;
    const sw = p.sw ? (p.sw <= 11 ? 1 - Math.pow(1 - k, 3) : Math.max(0, 1 - (p.sw - 11) / 9)) : 0;
    c.arm.rotation.set(-0.5 + sw * (lob ? 1.5 : 2.1), 0, -0.55 + sw * 0.35 - (lob ? sw * 0.5 : 0));
    c.body.rotation.y = sw * 0.5;
  }

  // 공과 그림자, 꼬리
  const b = v.b;
  R.ball.position.set(b.x, b.y + 0.04, b.z);
  R.ballBlob.position.x = b.x; R.ballBlob.position.z = b.z;
  const bs = 0.2 + Math.min(0.22, b.y * 0.05); R.ballBlob.scale.set(bs, 1, bs); R.ballBlob.material.opacity = Math.max(0.12, 0.42 - b.y * 0.07);
  R.mark.visible = !!v.lm;
  if (v.lm) { R.mark.position.x = v.lm[0]; R.mark.position.z = v.lm[1]; const k = 1 + Math.sin(t * 10) * 0.12; R.mark.scale.set(k, 1, k); R.mark.material.color.set(v.lm[1] * side > 0 ? 0xffe45c : 0xffffff); R.mark.material.opacity = v.lm[1] * side > 0 ? 0.95 : 0.45; }
  R.hist.unshift([b.x, b.y + 0.04, b.z]); if (R.hist.length > 16) R.hist.length = 16;
  const fast = v.ph === 1 && Math.hypot(b.vx, b.vz) > 9;
  R.trail.forEach((m, i) => { const h = R.hist[(i + 1) * 2]; m.visible = !!(fast && h); if (h) m.position.set(h[0], h[1], h[2]); });

  // 맞는 순간 반짝
  if (R.mem.hc !== v.hc) {
    if (R.mem.hc >= 0) { const sp = R.sparks.find((x) => x.t > 0.35) || R.sparks[0]; sp.t = 0; sp.big = v.qc !== R.mem.qc; sp.s.position.set(b.x, b.y, b.z); sp.s.material.color.set(sp.big ? 0xffe45c : 0xffffff); }
    R.mem.hc = v.hc; R.mem.qc = v.qc;
  }
  for (const sp of R.sparks) { sp.t += dt; const k = sp.t / 0.35; sp.s.visible = k < 1; if (k < 1) { const s = (sp.big ? 2.6 : 1.3) * (0.3 + k); sp.s.scale.set(s, s, 1); sp.s.material.opacity = 1 - k; } }

  // 구경꾼: 평소엔 살랑, 점수가 나면 폴짝
  const cheer = v.ph === 2 || v.over ? 1 : 0;
  for (const f of R.fans) f.g.position.y = f.y + Math.abs(Math.sin(t * (cheer ? 8 : f.sp) + f.ph)) * (cheer ? 0.4 : 0.05);

  // 카메라: 내 뒤에서 내려다본다
  const mine = v.p[me] || v.p[0];
  R.camX += (mine.x * 0.42 - R.camX) * Math.min(1, dt * 4);
  cam.position.set(R.camX, 6.4, side * (CL + 8.6));
  cam.lookAt(R.camX * 0.55, 0.8, -side * 0.5);

  renderer.render(scene, cam);
  return renderer.domElement;
}

export function dispose() {
  if (!R) return;
  try {
    R.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) for (const x of Array.isArray(m) ? m : [m]) { if (x.map) x.map.dispose(); x.dispose(); } });
    R.renderer.dispose(); R.renderer.forceContextLoss();
  } catch {}
  R = null;
}

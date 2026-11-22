// 공용 3D 무대 — 해질녘 옥상. 게임마다 이 위에 자기 경기장과 말을 올린다.
// 각 게임의 *3d.js 가 불러 쓴다. (게임 규칙 파일은 이 파일을 직접 불러오지 않는다)

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";
import { bodyColors } from "../avatar.js?v=3";
export { THREE };

// 블렌더로 만든 모델 묶음 (tools/blender/make_kit.py → public/models/kit.glb). 못 불러오면 예전처럼 코드로 만든 모양을 쓴다.
let KIT = null;
try {
  const { GLTFLoader } = await import("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync("/models/kit.glb?v=1");
  KIT = {};
  for (const o of gltf.scene.children) KIT[o.name] = o;
  gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
} catch { KIT = null; }
// 모델 하나 꺼내기(같은 모양·재질을 나눠 쓰는 복사본). 없으면 null
export function kit(name) { return KIT && KIT[name] ? KIT[name].clone(true) : null; }
const tintCache = new Map();
// 떡 모델의 몸 색 바꾸기: 재질 "body"·"dark" 를 색별로 하나씩 만들어 갈아 끼운다
function recolor(o, body, dark) {
  o.traverse((m) => {
    if (!m.isMesh || !m.material) return;
    const col = m.material.name === "body" ? body : m.material.name === "dark" ? dark : null;
    if (col == null) return;
    const key = m.material.name + "|" + col;
    if (!tintCache.has(key)) { const c = m.material.clone(); c.color.set(col); tintCache.set(key, c); }
    m.material = tintCache.get(key);
  });
  return o;
}

export const LW = 960, LH = 540;      // 2D 화면 크기(점수판·이름표를 얹을 좌표)
export const mat = (color, rough = 0.85, extra) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
export const basic = (color, extra) => new THREE.MeshBasicMaterial({ color, ...extra });
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export function mesh(geo, m, x = 0, y = 0, z = 0, cast = true, recv = true) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = recv; return o; }
export function canvasTex(w, h, paint) { const c = document.createElement("canvas"); c.width = w; c.height = h; paint(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const mkRng = (seed) => { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

const BLOB_G = () => new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
export function blob(r, opacity = 0.3) { const m = new THREE.Mesh(BLOB_G(), basic(0x241a3a, { transparent: true, opacity, depthWrite: false })); m.scale.set(r, 1, r); m.position.y = 0.04; return m; }

// 옥상 무대 만들기. roofW×roofD 크기의 옥상, 둘레에 난간·화분·줄전구·구경꾼, 멀리 도시.
// sky: "dusk"(노을) | "night"(달밤) | "day"(낮)
export function createStage({ touch = false, roofW = 26, roofD = 22, sky = "dusk", fans = true, floor = 0xdcb692 } = {}) {
  const rng = mkRng(20261121 + roofW * 7 + roofD);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  const k = touch ? 1 : 1.5;
  renderer.setPixelRatio(1); renderer.setSize(Math.round(LW * k), Math.round(LH * k), false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const SKY = {
    dusk: { g: ["#7a86c4", "#f0a48a", "#ffc98f", "#ffe2ad"], fog: 0xf6b98c, hemi: [0xffdcb8, 0x86709c, 1.15], sun: [0xffb070, 3.1], lit: 0.4, glow: 0x7a5a30, far: 0xe7a785 },
    night: { g: ["#161a4a", "#2c2f78", "#5a4f9e", "#8d6fae"], fog: 0x3a3a7c, hemi: [0xaab4ff, 0x3a2f5c, 1.25], sun: [0xcfd6ff, 1.7], lit: 0.7, glow: 0xb08a40, far: 0x2a2c66 },
    day: { g: ["#4aa3f0", "#8ccbff", "#c9ecff", "#f2fbff"], fog: 0xcfeaff, hemi: [0xffffff, 0x9fb0c8, 1.5], sun: [0xfff2d6, 2.6], lit: 0.1, glow: 0x30281a, far: 0xb8d8ee },
  }[sky] || null;
  const scene = new THREE.Scene();
  scene.background = canvasTex(4, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); SKY.g.forEach((col, i) => g.addColorStop([0, 0.35, 0.6, 1][i], col)); c.fillStyle = g; c.fillRect(0, 0, w, h); });
  scene.fog = new THREE.Fog(SKY.fog, 38, 110);
  const cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.5, 240);

  scene.add(new THREE.HemisphereLight(...SKY.hemi));
  const sun = new THREE.DirectionalLight(...SKY.sun);
  sun.position.set(-17, 11, -9); sun.castShadow = true;
  sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
  const ext = Math.max(roofW, roofD) * 0.62;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 70 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const disc = new THREE.Mesh(new THREE.SphereGeometry(sky === "night" ? 5 : 7, 20, 14), basic(sky === "night" ? 0xf4f1dc : 0xfff3cc, { fog: false }));
  disc.position.set(-120, sky === "day" ? 70 : 34, -70); scene.add(disc);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, "rgba(255,240,200,.9)"); g.addColorStop(1, "rgba(255,200,140,0)"); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.copy(disc.position); glow.scale.set(80, 80, 1); scene.add(glow);

  // 옥상 바닥과 난간
  const hw = roofW / 2, hd = roofD / 2, wall = mat(0xedcfa6), cap = mat(0xc99a72), post = mat(0x39406e, 0.6), wood = mat(0xa9744c);
  scene.add(mesh(box(roofW, 2, roofD), mat(floor), 0, -1, 0, false));
  for (const [w, d, x, z] of [[0.6, roofD, -hw + 0.3, 0], [0.6, roofD, hw - 0.3, 0], [roofW, 0.6, 0, -hd + 0.3], [roofW, 0.6, 0, hd - 0.3]]) {
    scene.add(mesh(box(w, 1.1, d), wall, x, 0.55, z), mesh(box(w + 0.2, 0.14, d + 0.2), cap, x, 1.17, z));
  }
  const groove = mat(0xc9a27e);
  for (let z = -hd + 2; z < hd; z += 3) scene.add(mesh(box(roofW - 1.2, 0.02, 0.06), groove, 0, 0.005, z, false));

  // 화분
  const greens = [mat(0x5fae5a, 0.9, { flatShading: true }), mat(0x3f8f5a, 0.9, { flatShading: true }), mat(0x86c56a, 0.9, { flatShading: true })];
  const potM = mat(0xc9653e), ico = new THREE.IcosahedronGeometry(1, 1), potG = new THREE.CylinderGeometry(0.38, 0.27, 0.55, 12);
  let plantN = 0;
  const plant = (x, z, s = 1) => {
    const k = kit(["plant_a", "plant_c", "plant_b"][plantN++ % 3]);
    if (k) { k.position.set(x, 0, z); k.scale.setScalar(s * 1.05); k.rotation.y = rng() * 6.28; scene.add(k); return; }
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
    g.add(mesh(potG, potM, 0, 0.28, 0));
    for (let i = 0; i < 4; i++) { const m = mesh(ico, greens[i % 3], (rng() - 0.5) * 0.5, 0.75 + rng() * 0.45, (rng() - 0.5) * 0.5); m.scale.setScalar(0.3 + rng() * 0.22); g.add(m); }
    scene.add(g);
  };
  for (const sx of [-1, 1]) { plant(sx * (hw - 1.3), -hd + 1.3, 1.5); plant(sx * (hw - 1.2), hd - 1.4, 1.3); plant(sx * (hw - 1.2), -hd * 0.3, 1); }

  // 먼 쪽 벤치와 구경꾼
  const fanList = [];
  if (fans) {
    const fanG = new THREE.SphereGeometry(0.42, 16, 12), eyeG = new THREE.SphereGeometry(0.058, 8, 6), ink = basic(0x2b2d4e);
    const cols = [0xff9db5, 0x9bd88a, 0xffd66b, 0xa9c8ff, 0xc3a6ff, 0xffb37a, 0x8fe0d2, 0xf7f1e3];
    for (let x0 = -hw + 4.4; x0 <= hw - 4.3; x0 += 3.7) {
      const z0 = -hd + 1.5;
      const kb = kit("bench");
      if (kb) { kb.position.set(x0, 0, z0); scene.add(kb); }
      else scene.add(mesh(box(3, 0.12, 0.6), wood, x0, 0.42, z0), mesh(box(0.1, 0.42, 0.1), wood, x0 - 1.3, 0.21, z0), mesh(box(0.1, 0.42, 0.1), wood, x0 + 1.3, 0.21, z0));
      for (let j = 0; j < 3; j++) {
        if (rng() < 0.18) continue;
        const km = kit("mochi");
        if (km) {
          const col = new THREE.Color(cols[(rng() * cols.length) | 0]);
          recolor(km, "#" + col.getHexString(), "#" + col.clone().multiplyScalar(0.72).getHexString());
          km.scale.setScalar(0.62); km.position.set(x0 - 1 + j, 0.48, z0 + 0.02); km.rotation.y = (rng() - 0.5) * 0.5; scene.add(km);
          fanList.push({ g: km, y: 0.48, ph: rng() * 6.28, sp: 2.4 + rng() * 1.6 });
          continue;
        }
        const g = new THREE.Group(), b = mesh(fanG, mat(cols[(rng() * cols.length) | 0], 0.6), 0, 0, 0, true, false);
        b.scale.set(1, 0.9, 1); g.add(b);
        for (const e of [-1, 1]) { const eye = new THREE.Mesh(eyeG, ink); eye.position.set(e * 0.15, 0.08, 0.38); g.add(eye); }
        g.position.set(x0 - 1 + j, 0.86, z0); scene.add(g);
        fanList.push({ g, y: 0.86, ph: rng() * 6.28, sp: 2.4 + rng() * 1.6 });
      }
    }
  }
  // 줄전구와 깃발
  const bulbG = new THREE.SphereGeometry(0.1, 8, 6), bulbM = basic(0xfff2b8, { fog: false }), flagG = new THREE.ConeGeometry(0.19, 0.38, 3);
  const flagM = [0xff5d73, 0xffc93c, 0x4fa798, 0xfff8ea, 0x7b8fc0].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide }));
  const corners = [[-hw + 0.9, -hd + 0.9], [hw - 0.9, -hd + 0.9], [hw - 0.9, hd - 0.9], [-hw + 0.9, hd - 0.9]], wire = new THREE.LineBasicMaterial({ color: 0x4a4466 });
  for (const [x, z] of corners) { const kp = kit("pole"); if (kp) { kp.position.set(x, 0, z); scene.add(kp); } else scene.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.1, 8), post, x, 2.05, z)); }
  for (let c = 0; c < 3; c++) {      // 가까운 쪽(카메라 앞)은 비워 둔다
    const [x0, z0] = corners[(c + 3) % 4], [x1, z1] = corners[c], len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.95), pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = 4 - Math.sin(t * Math.PI) * 0.95;
      pts.push(new THREE.Vector3(x, y, z));
      if (i && i < n) { if (i % 2) { const b = new THREE.Mesh(bulbG, bulbM); b.position.set(x, y - 0.1, z); scene.add(b); } else { const f = new THREE.Mesh(flagG, flagM[((i / 2) | 0) % 5]); f.position.set(x, y - 0.22, z); f.rotation.set(Math.PI, c === 1 ? 0 : Math.PI / 2, 0); f.scale.set(1, 1, 0.08); scene.add(f); } }
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire));
  }

  // 먼 도시
  const winTex = (base, lit) => { const t = canvasTex(64, 128, (c, w, h) => { c.fillStyle = base; c.fillRect(0, 0, w, h); for (let y = 6; y < h - 6; y += 14) for (let x = 6; x < w - 8; x += 14) { c.fillStyle = rng() < lit ? "#ffe9a8" : "rgba(60,50,90,.35)"; c.fillRect(x, y, 8, 9); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); return t; };
  const tint = sky === "night" ? ["#5a5a96", "#4a4a86", "#6a5a96", "#54609a", "#48487c"] : sky === "day" ? ["#f1e4d0", "#e3d2c4", "#d4dcea", "#f6ead2", "#d9c9d2"] : ["#eeb690", "#dc9c88", "#c98d95", "#f3cba2", "#b98aa0"];
  const cityM = tint.map((c, i) => { const t = winTex(c, SKY.lit + (i % 2) * 0.1); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: SKY.glow, roughness: 0.9 }); });
  const r0 = Math.hypot(hw, hd) + 9;
  const BL = [["bldg_a", 7, 6, 22], ["bldg_b", 9, 7, 15], ["bldg_c", 6, 6, 30], ["bldg_d", 11, 8, 11]], baseM = mat(sky === "night" ? 0x4a4a86 : 0xc98d7c, 0.95);
  if (KIT && KIT.bldg_a) KIT.bldg_a.traverse((o) => { if (o.isMesh && o.material.name === "win_on") o.material.emissiveIntensity = sky === "night" ? 3.2 : sky === "day" ? 0.25 : 1.8; });
  // 바로 뒤 낮은 옥상: 옥탑·물탱크·실외기·파라솔 (배경 살림)
  if (kit("hut")) {
    const ny = -1.3, nz = -hd - 6.2, nw = Math.max(20, roofW * 0.85);
    scene.add(mesh(box(nw, 3, 10), mat(0xcfa888), 0, ny - 1.5, nz, false), mesh(box(nw + 0.4, 0.5, 10.4), mat(0xb98a6c), 0, ny - 0.1, nz, false));
    const put = (name, x, z, ry = 0, s = 1) => { const o = kit(name); if (!o) return; o.position.set(x, ny + 0.15, nz + z); o.rotation.y = ry; o.scale.setScalar(s); scene.add(o); };
    put("hut", -nw * 0.24, -1.2); put("tank", nw * 0.26, -1.0, 0.4); put("ac", nw * 0.02, -2.6); put("ac", nw * 0.02 + 1.7, -2.6);
    put("parasol", -nw * 0.02, 2.2, 0.3); put("crate", nw * 0.42, 2.6, 0.3); put("crate", nw * 0.42 - 1.05, 2.9, -0.2); put("crate", nw * 0.42 - 0.5, 2.7, 0.5, 0.8);
    put("plant_a", -nw * 0.44, 2.8, 0, 1.4); put("plant_b", nw * 0.13, 3.2, 0, 1.3); put("plant_c", -nw * 0.1, -3.4, 0, 1.2);
  }
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2 + rng() * 0.08, r = r0 + rng() * 34, w = 4 + rng() * 6, d = 4 + rng() * 6, top = -6 + rng() * (r > r0 + 18 ? 24 : 12);
    const kbd = kit(BL[i % 4][0]);
    if (kbd) {
      const [, bw, bd, bh] = BL[i % 4], s = 0.85 + rng() * 0.5, x = Math.cos(a) * r, z = Math.sin(a) * r, ry = ((rng() * 4) | 0) * (Math.PI / 2) + (rng() - 0.5) * 0.5;
      kbd.scale.setScalar(s); kbd.position.set(x, top - bh * s, z); kbd.rotation.y = ry;
      kbd.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      const base = mesh(box(bw * s, 50, bd * s), baseM, x, top - bh * s - 25, z, false, false); base.rotation.y = ry;
      scene.add(kbd, base);
      continue;
    }
    const b = mesh(box(w, top + 46, d), cityM[i % 5], Math.cos(a) * r, (top - 46) / 2, Math.sin(a) * r, false, false);
    b.rotation.y = rng() * 0.6; scene.add(b);
  }
  scene.add(mesh(new THREE.CircleGeometry(170, 24).rotateX(-Math.PI / 2), basic(SKY.far), 0, -40, 0, false, false));
  if (sky !== "night") { const cloudM = basic(sky === "day" ? 0xffffff : 0xffe4d0, { fog: false, transparent: true, opacity: 0.85 }); for (let i = 0; i < 9; i++) { const a = rng() * 6.28, c = new THREE.Mesh(ico, cloudM); c.position.set(Math.cos(a) * 115, 34 + rng() * 26, Math.sin(a) * 115); c.scale.set(10 + rng() * 12, 2.4 + rng() * 2, 6 + rng() * 5); scene.add(c); } }

  const v3 = new THREE.Vector3();
  const S = {
    renderer, scene, cam, sun, cheer: false, lastT: 0, dt: 0,
    // 매 장면: 구경꾼을 움직이고 그린 캔버스를 돌려준다
    render(t) {
      S.dt = Math.min(0.1, Math.max(0, t - S.lastT)); S.lastT = t;
      for (const f of fanList) f.g.position.y = f.y + Math.abs(Math.sin(t * (S.cheer ? 8 : f.sp) + f.ph)) * (S.cheer ? 0.4 : 0.05);
      renderer.render(scene, cam);
      return renderer.domElement;
    },
    // 3D 위치 → 2D 화면 좌표 (이름표 등을 얹을 때)
    project(x, y, z) { v3.set(x, y, z).project(cam); return [((v3.x + 1) / 2) * LW, ((1 - v3.y) / 2) * LH]; },
    dispose() {
      try {
        scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); const m = o.material; if (m) for (const x of Array.isArray(m) ? m : [m]) { if (x.map) x.map.dispose(); x.dispose(); } });
        renderer.dispose(); renderer.forceContextLoss();
      } catch {}
    },
  };
  return S;
}

// 떡 캐릭터. 앞(+z)을 보는 모양. opts: { r 크기(기본 0.66), cap 모자, racket 라켓, ring 발밑 고리 색 }
export function makeMochi(look, opts = {}) {
  const r = opts.r || 0.66, k = r / 0.66, c = bodyColors(look), g = new THREE.Group(), body = new THREE.Group();
  body.scale.setScalar(k);
  const km = kit("mochi");
  if (km) {      // 블렌더 모델
    body.add(recolor(km, c.body, c.dark));
    if (opts.cap) { const cp = kit("cap"); if (cp) body.add(recolor(cp, c.body, c.dark)); }
    let arm = null;
    if (opts.racket) { arm = new THREE.Group(); arm.position.set(-0.7, 0.6, 0.12); const rk = kit("racket"); if (rk) arm.add(rk); body.add(arm); }
    g.add(body);
    const shadow = blob(r * 0.95, 0.28);
    let ring = null;
    if (opts.ring != null) { ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.12, r * 1.36, 28).rotateX(-Math.PI / 2), basic(opts.ring, { transparent: true, opacity: 0.95, depthWrite: false })); ring.position.y = 0.05; }
    return { g, body, arm, shadow, ring, px: 0, pz: 0, run: 0, yaw: 0 };
  }
  const skin = mat(c.body, 0.55), dark = mat(c.dark, 0.7), ink = basic(0x2b2d4e);
  const b = mesh(new THREE.SphereGeometry(0.66, 24, 18), skin, 0, 0.64, 0, true, false); b.scale.set(1, 0.92, 1); body.add(b);
  for (const e of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), ink); eye.position.set(e * 0.21, 0.78, 0.585); body.add(eye);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), basic(0xffffff)); hl.position.set(e * 0.21 + 0.03, 0.81, 0.655); body.add(hl);
    const ck = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), basic(0xff8fa3, { transparent: true, opacity: 0.75 })); ck.position.set(e * 0.37, 0.62, 0.5); ck.scale.set(1, 0.7, 0.4); body.add(ck);
    body.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), dark, e * 0.27, 0.1, 0.06, true, false));
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12, Math.PI), ink); mouth.position.set(0, 0.64, 0.635); mouth.rotation.z = Math.PI; body.add(mouth);
  if (opts.cap) {
    const top = mesh(new THREE.SphereGeometry(0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), dark, 0, 0.9, 0, true, false); top.scale.set(1, 0.6, 1);
    body.add(top, mesh(box(0.62, 0.05, 0.42), dark, 0, 0.93, 0.62, true, false));
  }
  let arm = null;
  if (opts.racket) {
    arm = new THREE.Group(); arm.position.set(-0.66, 0.66, 0.12);
    arm.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8), mat(0x39406e, 0.6), 0, 0.25, 0, true, false));
    const head = mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 22), mat(0xff5d73, 0.5), 0, 0.8, 0, true, false); head.scale.set(1, 1.2, 1);
    const strings = new THREE.Mesh(new THREE.CircleGeometry(0.29, 18), basic(0xffffff, { transparent: true, opacity: 0.5, side: THREE.DoubleSide })); strings.position.y = 0.8; strings.scale.set(1, 1.2, 1);
    arm.add(head, strings); body.add(arm);
  }
  g.add(body);
  const shadow = blob(r * 0.95, 0.28);
  let ring = null;
  if (opts.ring != null) { ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.12, r * 1.36, 28).rotateX(-Math.PI / 2), basic(opts.ring, { transparent: true, opacity: 0.95, depthWrite: false })); ring.position.y = 0.05; }
  return { g, body, arm, shadow, ring, px: 0, pz: 0, run: 0, yaw: 0 };
}
export function addMochi(scene, c) { scene.add(c.g, c.shadow); if (c.ring) scene.add(c.ring); }
export function removeMochi(scene, c) { scene.remove(c.g, c.shadow); if (c.ring) scene.remove(c.ring); }
// 자리 옮기고 통통 뛰는 움직임. face: 바라볼 각도(라디안, 없으면 움직이는 방향), lift: 띄울 높이
export function moveMochi(c, x, z, t, dt, { face = null, lift = 0, seed = 0 } = {}) {
  const dx = x - c.px, dz = z - c.pz, moved = Math.hypot(dx, dz) > 0.004;
  if (moved && face == null) face = Math.atan2(dx, dz);
  c.px = x; c.pz = z;
  c.run += ((moved ? 1 : 0) - c.run) * Math.min(1, dt * 12);
  if (face != null) { let d = face - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * Math.min(1, dt * 14); }
  const hop = Math.abs(Math.sin(t * 13 + seed)) * 0.16 * c.run;
  c.g.position.set(x, hop + lift, z); c.g.rotation.y = c.yaw;
  const sq = 0.05 * c.run * Math.sin(t * 26 + seed), base = c.body.scale.y;
  c.body.rotation.z = Math.sin(t * 13 + seed) * 0.08 * c.run;
  c.shadow.position.x = x; c.shadow.position.z = z;
  if (c.ring) { c.ring.position.x = x; c.ring.position.z = z; }
  return sq + base * 0;
}

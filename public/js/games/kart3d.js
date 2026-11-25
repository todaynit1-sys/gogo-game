// 떡 카트의 3D 무대 — 옥상 위에 깐 고리 트랙, 말랑 쿠션 벽, ? 상자, 떡 운전사가 탄 카트.
// kart.js 가 필요할 때만 불러온다. render(보기, env, 트랙, 카트 자세, 물건 자세, 따라갈 카트) → { cv, tags }
// 반복되는 것(벽·관중·고깔·덤불·상자·웅덩이)은 모양·재질을 하나만 만들어 나눠 쓰고, 많은 것은 InstancedMesh 로 한 번에 그린다.

import { THREE, createStage, makeMochi, mat, basic, box, mesh, canvasTex, kit, LW, LH } from "./stage3d.js?v=2";
import { parseLook } from "../avatar.js?v=3";

const KART_COL = [0xff5d73, 0x4d9be0, 0xffa91e, 0x2fae74];      // kart.js 의 KART_COL 과 같게
const START = 200;                                                 // kart.js 의 START 와 같게
const TAU = Math.PI * 2, wrapA = (a) => a - TAU * Math.round(a / TAU), mod = (i, n) => ((i % n) + n) % n;
let S = null;
const dummy = new THREE.Object3D(), col = new THREE.Color(), v3 = new THREE.Vector3();

// 길을 따라가는 띠 (l0~l1: 가운데 선에서 옆으로 떨어진 거리, vrep: 무늬가 한 번 되풀이되는 길이)
function ribbon(T, l0, l1, y, material, vrep) {
  const N = T.N, pos = new Float32Array((N + 1) * 6), uv = new Float32Array((N + 1) * 4), idx = [];
  for (let i = 0; i <= N; i++) {
    const j = i % N, nx = -T.tz[j], nz = T.tx[j];
    for (let s = 0; s < 2; s++) {
      const l = s ? l1 : l0, o = i * 2 + s;
      pos[o * 3] = T.x[j] + nx * l; pos[o * 3 + 1] = y; pos[o * 3 + 2] = T.z[j] + nz * l;
      uv[o * 2] = s; uv[o * 2 + 1] = (i * T.st) / vrep;
    }
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.receiveShadow = true;
  return m;
}
const repTex = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };

function build(touch, T) {
  const HW = T.hw, WALL = T.wall, mg = WALL + 9;
  const st = createStage({ touch, roofW: T.w + mg * 2, roofD: T.d + mg * 2, sky: T.sky, fans: false, floor: T.floor }), sc = st.scene;
  sc.fog.near = 55; sc.fog.far = 240;
  st.cam.fov = 62; st.cam.far = 420; st.cam.updateProjectionMatrix();
  // 그림자는 내 카트 둘레만 또렷하게 (해가 카트를 따라다닌다)
  Object.assign(st.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 130 });
  st.sun.shadow.camera.updateProjectionMatrix();
  const extra = [];      // 장면에 안 붙어 있어서 따로 치워야 할 것들

  // 무대가 넓어서 둘레 줄전구·깃발이 수백 개(하나하나 그리기 호출)가 된다 → 인스턴스 둘로 합친다
  sc.updateMatrixWorld(true);
  const bulbs = [], flags = [];
  for (const o of sc.children) {
    const gp = o.isMesh && o.geometry && o.geometry.parameters;
    if (!gp) continue;
    if (o.geometry.type === "SphereGeometry" && gp.radius === 0.1) bulbs.push(o);
    else if (o.geometry.type === "ConeGeometry" && gp.radialSegments === 3 && Math.abs(gp.radius - 0.19) < 1e-6) flags.push(o);
  }
  if (bulbs.length > 8) {
    const im = new THREE.InstancedMesh(bulbs[0].geometry, bulbs[0].material, bulbs.length);
    bulbs.forEach((o, n) => { im.setMatrixAt(n, o.matrix); sc.remove(o); });
    sc.add(im);
  }
  if (flags.length > 8) {
    const im = new THREE.InstancedMesh(flags[0].geometry, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }), flags.length);
    const old = new Set();
    flags.forEach((o, n) => { im.setMatrixAt(n, o.matrix); im.setColorAt(n, o.material.color); old.add(o.material); sc.remove(o); });
    extra.push(...old); sc.add(im);
  }

  // 길 밖 매트 · 연석 · 아스팔트 · 출발선
  const night = T.sky === "night";
  const turfTex = repTex(canvasTex(16, 64, (c, w, h) => { c.fillStyle = "#8cc46a"; c.fillRect(0, 0, w, h); c.fillStyle = "#7fb95f"; c.fillRect(0, 0, w, h / 2); }));
  sc.add(ribbon(T, -WALL - 0.9, WALL + 0.9, 0.014, new THREE.MeshStandardMaterial({ map: turfTex, roughness: 0.95, side: THREE.DoubleSide }), 6));
  const roadTex = repTex(canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = night ? "#5e5b72" : "#77738a"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { c.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.08)"; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.fillStyle = "rgba(255,248,234,.75)"; c.fillRect(w / 2 - 3, 0, 6, h * 0.5);
  }));
  sc.add(ribbon(T, -HW, HW, 0.03, new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 }), 7));
  const curbTex = repTex(canvasTex(8, 32, (c, w, h) => { c.fillStyle = "#e8505b"; c.fillRect(0, 0, w, h); c.fillStyle = "#fff8ee"; c.fillRect(0, 0, w, h / 2); }));
  const curbM = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.7 });
  sc.add(ribbon(T, HW, HW + 0.8, 0.04, curbM, 3), ribbon(T, -HW - 0.8, -HW, 0.04, curbM, 3));
  const chk = canvasTex(16, 80, (c) => { for (let r = 0; r < 10; r++) for (let q = 0; q < 2; q++) { c.fillStyle = (r + q) & 1 ? "#fff" : "#2b2d6e"; c.fillRect(q * 8, r * 8, 8, 8); } });
  chk.magFilter = THREE.NearestFilter;
  const line = mesh(box(1.4, 0.02, HW * 2), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.8 }), T.x[0], 0.05, T.z[0], false, true);
  line.rotation.y = -T.ang[0]; sc.add(line);
  // 출발 문
  const gate = new THREE.Group(), pillar = new THREE.CylinderGeometry(0.32, 0.38, 5.2, 12), pm = mat(0x2b2d6e, 0.6);
  for (const s of [-1, 1]) gate.add(mesh(pillar, pm, 0, 2.6, s * (HW + 1.3)));
  const banner = canvasTex(512, 96, (c, w, h) => {
    c.fillStyle = "#ffd23f"; c.fillRect(0, 0, w, h); c.fillStyle = "#ff5d73"; c.fillRect(0, h - 14, w, 14); c.fillRect(0, 0, w, 10);
    c.fillStyle = "#2b2d6e"; c.font = "700 56px Jua, 'Malgun Gothic', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("떡 카트 · 출발!", w / 2, h / 2 + 2);
  });
  const bm = new THREE.MeshStandardMaterial({ map: banner, roughness: 0.7 });
  // 문 안쪽에서 x 가 길 방향이므로, 달려오는 카트가 보는 면은 -x 면(재질 1번)
  gate.add(mesh(box(0.5, 1.4, HW * 2 + 3.2), [pm, bm, pm, pm, pm, pm], 0, 5.2, 0));
  gate.position.set(T.x[0], 0, T.z[0]); gate.rotation.y = -T.ang[0];
  sc.add(gate);

  // 둘이 가까우면(다른 길 구간 위면) 장식을 놓지 않는다
  const clear = (x, z, r) => { const r2 = r * r; for (let i = 0; i < T.N; i++) { const dx = x - T.x[i], dz = z - T.z[i]; if (dx * dx + dz * dz < r2) return false; } return true; };

  // 말랑 쿠션 벽: 하얀·분홍·쑥색 떡을 번갈아 눕혀 둔 모양 (인스턴스 하나)
  const wallG = new THREE.CapsuleGeometry(0.44, 1.9, 2, 8).rotateZ(Math.PI / 2), wallPos = [];
  for (let i = 0; i < T.N; i += 2) for (const s of [-1, 1]) {
    const l = s * (WALL + 0.55), x = T.x[i] - T.tz[i] * l, z = T.z[i] + T.tx[i] * l;
    if (clear(x, z, WALL + 0.3)) wallPos.push([x, z, T.ang[i]]);
  }
  const walls = new THREE.InstancedMesh(wallG, mat(0xffffff, 0.55), wallPos.length);
  const wallCols = [0xfff8ee, 0xff9db5, 0xfff8ee, 0x9bd88a];
  wallPos.forEach(([x, z, a], n) => {
    dummy.position.set(x, 0.44, z); dummy.rotation.set(0, -a, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    walls.setMatrixAt(n, dummy.matrix); walls.setColorAt(n, col.set(wallCols[n % 4]));
  });
  walls.castShadow = true; walls.receiveShadow = true; sc.add(walls);

  // 굽은 길 바깥쪽 고깔
  const conePos = [];
  for (let i = 0; i < T.N; i += 3) {
    const cv = wrapA(T.ang[(i + 3) % T.N] - T.ang[i]);
    if (Math.abs(cv) < 0.09) continue;
    const l = -Math.sign(cv) * (WALL + 1.8), x = T.x[i] - T.tz[i] * l, z = T.z[i] + T.tx[i] * l;
    if (clear(x, z, WALL + 1.2)) conePos.push([x, z]);
  }
  const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(0.34, 0.95, 10), mat(0xff8a3d, 0.6), Math.max(1, conePos.length));
  conePos.forEach(([x, z], n) => { dummy.position.set(x, 0.47, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); cones.setMatrixAt(n, dummy.matrix); });
  cones.count = conePos.length; cones.castShadow = true; sc.add(cones);

  // 출발선 양쪽 관중 (몸·눈 인스턴스)
  const fans = [];
  for (let i = -26; i <= 26; i += 2) for (const s of [-1, 1]) for (const row of [0, 1]) {
    const j = mod(i, T.N), l = s * (WALL + 2.4 + row * 1.3), x = T.x[j] - T.tz[j] * l + (Math.random() - 0.5) * 0.4, z = T.z[j] + T.tx[j] * l;
    if (Math.random() < 0.15 || !clear(x, z, WALL + 1.6)) continue;
    fans.push({ x, z, y: 0.45 + row * 0.25, face: Math.atan2(T.tz[j] * s, -T.tx[j] * s), ph: Math.random() * 6.3, sp: 2 + Math.random() * 2 });
  }
  const fanBody = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 14, 10), mat(0xffffff, 0.6), Math.max(1, fans.length));
  const fanEye = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 6, 5), basic(0x2b2d4e), Math.max(1, fans.length * 2));
  const fanCols = [0xff9db5, 0x9bd88a, 0xffd66b, 0xa9c8ff, 0xc3a6ff, 0xffb37a, 0x8fe0d2, 0xf7f1e3];
  fans.forEach((f, n) => fanBody.setColorAt(n, col.set(fanCols[n % fanCols.length])));
  fanBody.count = fans.length; fanEye.count = fans.length * 2; fanBody.castShadow = true;
  sc.add(fanBody, fanEye);

  // 빈 옥상 자리: 덤불(인스턴스)과 블렌더 소품 몇 개
  const spots = [];
  const hw = T.w / 2 + mg - 3, hd = T.d / 2 + mg - 3;
  for (let x = -hw; x <= hw; x += 7) for (let z = -hd; z <= hd; z += 7) {
    const jx = x + (Math.random() - 0.5) * 3, jz = z + (Math.random() - 0.5) * 3;
    if (clear(jx, jz, WALL + 3.2)) spots.push([jx, jz]);
  }
  for (let i = spots.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [spots[i], spots[j]] = [spots[j], spots[i]]; }
  const props = ["parasol", "tank", "hut", "crate", "bench", "ac", "plant_a", "plant_b", "plant_c", "plant_a", "plant_b", "parasol"];
  let used = 0;
  for (const name of props) { if (used >= spots.length) break; const o = kit(name); if (!o) break; const [x, z] = spots[used++]; o.position.set(x, 0, z); o.rotation.y = Math.random() * 6.28; if (name.startsWith("plant")) o.scale.setScalar(1.6); sc.add(o); }
  const bushSpots = spots.slice(used, used + 60);
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat(0xffffff, 0.9, { flatShading: true }), Math.max(1, bushSpots.length * 2));
  let bn = 0;
  for (const [x, z] of bushSpots) for (let q = 0; q < 2; q++) {
    const s = 0.7 + Math.random() * 0.8; dummy.position.set(x + q * 0.9, s * 0.7, z + (q ? 0.5 : 0)); dummy.rotation.set(Math.random(), Math.random() * 6, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
    bushes.setMatrixAt(bn, dummy.matrix); bushes.setColorAt(bn, col.set(q ? 0x86c56a : 0x4f9f58)); bn++;
  }
  bushes.count = bn; bushes.castShadow = true; sc.add(bushes);

  // ? 상자 (인스턴스)
  const qTex = canvasTex(64, 64, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#ffb3d9"); g.addColorStop(0.5, "#b79cff"); g.addColorStop(1, "#7fd4ff");
    c.fillStyle = g; c.fillRect(0, 0, w, h); c.strokeStyle = "#fff"; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = "#fff"; c.font = "700 44px Jua, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("?", w / 2, h / 2 + 3);
  });
  const boxes = new THREE.InstancedMesh(box(1.25, 1.25, 1.25), new THREE.MeshStandardMaterial({ map: qTex, transparent: true, opacity: 0.9, emissive: 0x5a3c9a, emissiveIntensity: 0.35, roughness: 0.4 }), T.bxs.length);
  boxes.castShadow = true; sc.add(boxes);

  // 카트: 모양·재질은 하나씩만 만들고 네 대가 나눠 쓴다
  const KG = {
    base: box(1.8, 0.34, 2.6), nose: new THREE.CapsuleGeometry(0.3, 1.2, 2, 8).rotateZ(Math.PI / 2), seat: box(1.2, 0.7, 0.28),
    side: box(0.22, 0.3, 1.7), wheel: new THREE.CylinderGeometry(0.4, 0.4, 0.36, 14).rotateZ(Math.PI / 2), hub: new THREE.CylinderGeometry(0.17, 0.17, 0.38, 8).rotateZ(Math.PI / 2),
    spoil: box(1.9, 0.09, 0.45), post: box(0.1, 0.42, 0.1), steer: new THREE.TorusGeometry(0.22, 0.05, 6, 14),
    flame: new THREE.ConeGeometry(0.28, 1.3, 10).rotateX(-Math.PI / 2), shield: new THREE.SphereGeometry(1.75, 20, 14), blob: new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
  };
  const KM = {
    body: KART_COL.map((c) => mat(c, 0.42)), dark: mat(0x2b2d4e, 0.75), trim: mat(0xfff8ee, 0.55), hub: mat(0xd9dbe8, 0.4),
    flame: basic(0xffa43a, { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    shield: new THREE.MeshStandardMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.3, roughness: 0.1, emissive: 0x2a6aa0, emissiveIntensity: 0.4, depthWrite: false }),
    blob: basic(0x241a3a, { transparent: true, opacity: 0.32, depthWrite: false }),
  };
  const sparkTex = canvasTex(32, 32, (c) => { const g = c.createRadialGradient(16, 16, 1, 16, 16, 16); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.4, "rgba(255,255,255,.7)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.fillRect(0, 0, 32, 32); });
  const sparkM = [0xfff2d0, 0x6fd0ff, 0xff9a3c].map((c) => new THREE.SpriteMaterial({ map: sparkTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const starTex = canvasTex(32, 32, (c) => { c.fillStyle = "#ffe45c"; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 6 : 15; c.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r); } c.fill(); });
  const starM = new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false });
  extra.push(...sparkM, starM, sparkTex, starTex);
  const karts = [0, 1, 2, 3].map((i) => {
    const root = new THREE.Group(), tilt = new THREE.Group(); root.add(tilt);
    const b = KM.body[i];
    tilt.add(mesh(KG.base, b, 0, 0.5, 0), mesh(KG.nose, KM.trim, 0, 0.52, 1.35), mesh(KG.seat, b, 0, 0.95, -0.85));
    for (const sx of [-1, 1]) tilt.add(mesh(KG.side, KM.trim, sx * 0.95, 0.62, 0.1), mesh(KG.post, KM.dark, sx * 0.7, 0.9, -1.25));
    tilt.add(mesh(KG.spoil, b, 0, 1.12, -1.3));
    const sw = mesh(KG.steer, KM.dark, 0, 0.98, 0.55); sw.rotation.x = -0.9; tilt.add(sw);
    const wheels = [], fronts = [];
    for (const [x, z, front] of [[-0.98, 0.95, 1], [0.98, 0.95, 1], [-0.98, -0.9, 0], [0.98, -0.9, 0]]) {
      const piv = new THREE.Group(); piv.position.set(x, 0.4, z);
      const w = mesh(KG.wheel, KM.dark, 0, 0, 0), h = mesh(KG.hub, KM.hub, 0, 0, 0, false, false);
      w.add(h); piv.add(w); tilt.add(piv); wheels.push(w); if (front) fronts.push(piv);
    }
    const flame = new THREE.Mesh(KG.flame, KM.flame); flame.position.set(0, 0.55, -1.75); flame.visible = false; tilt.add(flame);
    const shield = new THREE.Mesh(KG.shield, KM.shield); shield.position.y = 0.9; shield.visible = false; tilt.add(shield);
    const sparks = [-1, 1].map((sx) => { const sp = new THREE.Sprite(sparkM[0]); sp.position.set(sx * 0.98, 0.25, -1.1); sp.visible = false; tilt.add(sp); return sp; });
    const stars = [0, 1, 2].map(() => { const sp = new THREE.Sprite(starM); sp.scale.set(0.5, 0.5, 1); sp.visible = false; tilt.add(sp); return sp; });
    const shadow = new THREE.Mesh(KG.blob, KM.blob); shadow.scale.set(1.25, 1, 1.7);
    sc.add(root, shadow);
    return { root, tilt, wheels, fronts, flame, shield, sparks, stars, shadow, driver: null, key: "", pa: 0, spin: 0 };
  });

  // 웅덩이와 폭죽 (미리 만들어 두고 켜고 끈다)
  const pudG = new THREE.CircleGeometry(1.7, 22).rotateX(-Math.PI / 2), pudM = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.88, emissive: 0x6a4a00, emissiveIntensity: 0.25 });
  const puddles = [];
  for (let i = 0; i < 8; i++) { const p = new THREE.Mesh(pudG, pudM); p.position.y = 0.06; p.visible = false; p.receiveShadow = true; sc.add(p); puddles.push(p); }
  const fwBody = new THREE.CylinderGeometry(0.2, 0.2, 0.9, 10).rotateX(Math.PI / 2), fwTip = new THREE.ConeGeometry(0.2, 0.42, 10).rotateX(Math.PI / 2), fwM = mat(0xff5d73, 0.45), fwTipM = mat(0xfff8ee, 0.5);
  const rockets = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    g.add(mesh(fwBody, fwM, 0, 0, 0), mesh(fwTip, fwTipM, 0, 0, 0.66));
    const tail = new THREE.Sprite(sparkM[2]); tail.position.z = -0.7; tail.scale.set(1.3, 1.3, 1); g.add(tail);
    g.visible = false; sc.add(g); rockets.push(g);
  }

  return { st, T, touch, karts, boxes, puddles, rockets, fanBody, fanEye, fans, extra, sparkM, cp: new THREE.Vector3(), ca: 0, fov: 62, orb: 0, first: true, lastT: 0, tags: [null, null, null, null], tagBuf: [[0, 0], [0, 0], [0, 0], [0, 0]] };
}

function setDriver(c, look) {
  if (c.driver) { c.tilt.remove(c.driver.g); }
  const d = makeMochi(parseLook(look.s, look.i), { r: 0.52 });
  // makeMochi 가 만든 바닥 그림자·고리는 쓰지 않으므로 바로 치운다
  try { d.shadow.geometry.dispose(); d.shadow.material.dispose(); if (d.ring) { d.ring.geometry.dispose(); d.ring.material.dispose(); } } catch {}
  d.g.position.set(0, 0.62, -0.3);
  c.tilt.add(d.g); c.driver = d;
}

export function render(v, env, T, pose, opose, fol) {
  if (S && (S.T !== T || S.touch !== !!env.touch)) { dispose(); }
  if (!S) S = build(!!env.touch, T);
  const { st, karts } = S, t = env.t, dt = Math.min(0.1, Math.max(0, t - S.lastT));
  S.lastT = t;

  // 카트
  for (let i = 0; i < 4; i++) {
    const c = karts[i], k = v.k[i], p = pose[i];
    if (!k) { c.root.visible = false; c.shadow.visible = false; continue; }
    c.root.visible = true; c.shadow.visible = true;
    const seat = v.seats[i] || {}, key = (seat.look || "") + "|" + i;
    if (c.key !== key) { setDriver(c, { s: seat.look || "", i }); c.key = key; }
    const yr = dt > 0 ? wrapA(p.a - c.pa) / dt : 0; c.pa = p.a;
    if (k.sp > 0) c.spin += dt * 15; else c.spin = wrapA(c.spin) * Math.max(0, 1 - dt * 10);
    c.root.position.set(p.x, 0, p.z);
    c.root.rotation.y = Math.PI / 2 - p.a - (k.dr ? k.dr * 0.38 : 0) + c.spin;
    const hop = k.hp ? Math.sin((k.hp / 12) * Math.PI) * 0.5 : 0, fin = v.over && v.over.r && v.over.r[0] === i ? Math.abs(Math.sin(t * 6)) * 0.35 : 0;
    c.tilt.position.y = hop + fin;
    c.tilt.rotation.z = (k.dr ? -k.dr * 0.12 : 0) - Math.max(-0.1, Math.min(0.1, yr * 0.04));
    const roll = (k.v * dt) / 0.4;
    for (const w of c.wheels) w.rotation.x += roll;
    const steerVis = Math.max(-0.45, Math.min(0.45, -yr * 0.22));
    for (const f of c.fronts) f.rotation.y = steerVis;
    if (c.driver) c.driver.body.rotation.z = Math.max(-0.2, Math.min(0.2, yr * 0.06));
    c.flame.visible = k.bo > 0;
    if (k.bo > 0) { const f = 0.8 + Math.random() * 0.5; c.flame.scale.set(f, f, 0.8 + Math.random() * 0.8); }
    c.shield.visible = k.sh > 0;
    if (k.sh > 0) { const f = 1 + Math.sin(t * 9) * 0.04; c.shield.scale.set(f, f, f); c.shield.visible = k.sh > 60 || ((t * 10) | 0) % 2 === 0; }
    const lvl = k.dc >= 130 ? 2 : k.dc >= 55 ? 1 : 0;
    for (const sp of c.sparks) {
      sp.visible = !!k.dr;
      if (k.dr) { sp.material = S.sparkM[lvl]; const f = (lvl ? 0.6 + lvl * 0.25 : 0.4) * (0.7 + Math.random() * 0.6); sp.scale.set(f, f, 1); }
    }
    for (let s = 0; s < 3; s++) {
      const sp = c.stars[s]; sp.visible = k.sp > 0;
      if (k.sp > 0) { const a = t * 6 + (s * TAU) / 3; sp.position.set(Math.cos(a) * 0.6, 2.05, Math.sin(a) * 0.6); }
    }
    c.shadow.position.set(p.x, 0.07, p.z); c.shadow.rotation.y = Math.PI / 2 - p.a;
  }
  // ? 상자
  for (let b = 0; b < S.T.bxs.length; b++) {
    const on = !v.bx[b], [x, z] = S.T.bxs[b];
    dummy.position.set(x, 1.0 + Math.sin(t * 2.4 + b) * 0.15, z); dummy.rotation.set(0.5, t * 1.6 + b, 0.3);
    const s = on ? 1 : 0.0001; dummy.scale.set(s, s, s); dummy.updateMatrix(); S.boxes.setMatrixAt(b, dummy.matrix);
  }
  S.boxes.instanceMatrix.needsUpdate = true;
  // 웅덩이·폭죽
  let pn = 0, rn = 0;
  for (let j = 0; j < opose.length; j++) {
    const o = opose[j];
    if (o.t === 1 && pn < S.puddles.length) { const p = S.puddles[pn++]; p.visible = true; p.position.x = o.x; p.position.z = o.z; }
    else if (o.t === 2 && rn < S.rockets.length) { const r = S.rockets[rn++]; r.visible = true; r.position.set(o.x, 0.9 + Math.sin(t * 20 + j) * 0.08, o.z); r.rotation.set(0, Math.PI / 2 - o.a, t * 12); }
  }
  for (; pn < S.puddles.length; pn++) S.puddles[pn].visible = false;
  for (; rn < S.rockets.length; rn++) S.rockets[rn].visible = false;
  // 관중: 평소엔 살랑, 출발·결승 때는 폴짝
  const cheer = v.tick < START + 90 || v.nf > 0;
  for (let n = 0; n < S.fans.length; n++) {
    const f = S.fans[n], y = f.y + Math.abs(Math.sin(t * (cheer ? 8 : f.sp) + f.ph)) * (cheer ? 0.45 : 0.06);
    dummy.position.set(f.x, y, f.z); dummy.rotation.set(0, f.face, 0); dummy.scale.set(1, 0.9, 1); dummy.updateMatrix(); S.fanBody.setMatrixAt(n, dummy.matrix);
    const cs = Math.cos(f.face), sn = Math.sin(f.face);
    for (let e = 0; e < 2; e++) {
      const ex = (e ? 0.16 : -0.16), ez = 0.45;      // 몸 앞쪽(+z)에서 좌우로
      dummy.position.set(f.x + ex * cs + ez * sn, y + 0.1, f.z - ex * sn + ez * cs); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      S.fanEye.setMatrixAt(n * 2 + e, dummy.matrix);
    }
  }
  S.fanBody.instanceMatrix.needsUpdate = true; S.fanEye.instanceMatrix.needsUpdate = true;

  // 카메라: 따라가는 카트 뒤에서. 출발 전에는 높은 데서 내려오고, 끝나면 천천히 돈다
  const p = pose[fol] || pose[0], kf = v.k[fol] || v.k[0], cam = st.cam;
  if (S.first || S.fol !== fol) { S.ca = p.a; S.fol = fol; }
  S.ca += wrapA(p.a - S.ca) * Math.min(1, dt * 5);
  let ca = S.ca, back = 7.6 + (kf.bo ? 1.3 : 0), up = 3.5;
  if (v.tick < START) { const f = Math.max(0, (START - 50 - v.tick) / (START - 50)); back += f * 14; up += f * 9; }
  S.orb = v.over ? S.orb + dt * 0.35 : 0;
  if (v.over) { ca += S.orb; back += 2; up += 1; }
  const cx = Math.cos(ca), cz = Math.sin(ca);
  v3.set(p.x - cx * back, up, p.z - cz * back);
  if (S.first) S.cp.copy(v3); else S.cp.lerp(v3, Math.min(1, dt * 9));
  S.first = false;
  cam.position.copy(S.cp);
  cam.lookAt(p.x + cx * 5, 1.1, p.z + cz * 5);
  const fov = 62 + (kf.bo ? 9 : 0);
  S.fov += (fov - S.fov) * Math.min(1, dt * 5);
  if (Math.abs(cam.fov - S.fov) > 0.05) { cam.fov = S.fov; cam.updateProjectionMatrix(); }
  st.sun.target.position.set(p.x + cx * 12, 0, p.z + cz * 12);
  st.sun.position.set(p.x + cx * 12 - 34, 44, p.z + cz * 12 - 18);
  st.cheer = cheer;

  // 이름표 자리 (카메라 앞에 있고 너무 멀지 않은 카트만)
  for (let i = 0; i < 4; i++) {
    S.tags[i] = null;
    const q = pose[i]; if (!v.k[i] || i === fol) continue;
    const dx = q.x - cam.position.x, dz = q.z - cam.position.z;
    if (dx * cx + dz * cz < 1.5 || dx * dx + dz * dz > 70 * 70) continue;
    v3.set(q.x, 2.4, q.z).project(cam);
    if (v3.z > 1) continue;
    const tb = S.tagBuf[i]; tb[0] = ((v3.x + 1) / 2) * LW; tb[1] = ((1 - v3.y) / 2) * LH; S.tags[i] = tb;
  }
  return { cv: st.render(t), tags: S.tags };
}

export function dispose() {
  if (!S) return;
  try {
    for (const o of [S.boxes, S.fanBody, S.fanEye]) o.dispose();
    S.st.scene.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    for (const x of S.extra) x.dispose();
  } catch {}
  S.st.dispose();
  S = null;
}

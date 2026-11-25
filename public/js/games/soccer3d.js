// 떡 축구의 3D 무대
// 공은 높이(z)를 가진다: 2D 좌표 (x, y, z) → 3D (X(x), 0.34 + z·K, Z(y)).
// 카메라는 고정(조작이 화면 기준이라서)이고, 공 쪽으로 살짝 따라가고 골이 나면 골대 쪽으로 당겨 본다.
import { THREE, createStage, makeMochi, addMochi, removeMochi, moveMochi, mat, basic, box, mesh, canvasTex, blob } from "./stage3d.js?v=2";
import { parseLook } from "../avatar.js?v=3";

const K = 1 / 44, X = (x) => (x - 480) * K, Z = (y) => (y - 280) * K;      // 2D 좌표 → 3D
const FX0 = 48, FX1 = 912, FY0 = 58, FY1 = 502, GY0 = 205, GY1 = 355, TEAM = [0xff5d73, 0x4d9be0], TEAM_CSS = ["#ff5d73", "#4d9be0"];
const BRAD = 0.34, GOAL_H = 1.8, GOAL_D = 0.9;      // 공 반지름, 골대 높이(soccer.js 의 GH=64 와 맞춤: (1.8-0.34)/K ≈ 64), 골대 깊이
const CH_SW0 = 38, CH_SW1 = 50, CH_MAX = 62, IMMUNE = 60, TUMBLE = 24, CELEB = 150;
const CAM = { x: 0, y: 10.2, z: 16.6, lx: 0, lz: -1.3, fov: 40 };
const N_TRAIL = 8, N_HIST = 18, N_DUST = 18, N_CONF = 120;
let S = null;
let ALPHA = 1;
const lerp = (cur, old) => (old != null ? old + (cur - old) * ALPHA : cur);
const MO = { face: 0, lift: 0, seed: 0 };      // moveMochi 옵션 (매 장면 새로 만들지 않는다)

function radialTex(inner, outer) {
  return canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, inner); g.addColorStop(1, outer); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
}

function build(touch, fd) {
  const night = fd.name === "밤 구장";
  const st = createStage({ touch, roofW: 28, roofD: 21, sky: night ? "night" : fd.name === "눈밭 구장" ? "day" : "dusk" }), sc = st.scene;
  const fw = (FX1 - FX0) * K, fdp = (FY1 - FY0) * K;
  sc.add(mesh(box(fw + 2.6, 0.02, fdp + 1.6), mat(fd.out, 0.95), 0, 0.012, 0, false));
  for (let i = 0; i < 8; i++) sc.add(mesh(box(fw / 8, 0.02, fdp), mat(i % 2 ? fd.a : fd.b, 0.95), X(FX0) + (i + 0.5) * (fw / 8), 0.022, 0, false));
  const line = mat(0xffffff, 0.8), lw = 0.07;
  for (const [w, d, x, z] of [[fw, lw, 0, Z(FY0)], [fw, lw, 0, Z(FY1)], [lw, fdp, X(FX0), 0], [lw, fdp, X(FX1), 0], [lw, fdp, 0, 0]]) sc.add(mesh(box(w, 0.02, d), line, x, 0.034, z, false));
  const ring = new THREE.Mesh(new THREE.RingGeometry(70 * K - lw / 2, 70 * K + lw / 2, 48).rotateX(-Math.PI / 2), line); ring.position.y = 0.045; sc.add(ring);
  for (const sx of [-1, 1]) {      // 벌칙 구역
    const x0 = sx < 0 ? X(FX0) : X(FX1), bw = 110 * K, bd = (GY1 - GY0 + 100) * K;
    sc.add(mesh(box(bw, 0.02, lw), line, x0 - (sx * bw) / 2, 0.034, -bd / 2, false), mesh(box(bw, 0.02, lw), line, x0 - (sx * bw) / 2, 0.034, bd / 2, false), mesh(box(lw, 0.02, bd), line, x0 - sx * bw, 0.034, 0, false));
  }
  // 골대 (뒤 그물은 골이 나면 불룩해진다)
  const netTex = canvasTex(64, 64, (c) => { c.strokeStyle = "rgba(255,255,255,.95)"; c.lineWidth = 2; for (let i = 0; i <= 64; i += 8) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 64); c.moveTo(0, i); c.lineTo(64, i); c.stroke(); } });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  const netM = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const nets = [], posts = [];
  [[X(FX0), -1, TEAM[0]], [X(FX1), 1, TEAM[1]]].forEach(([x, sx, col]) => {
    const pm = mat(col, 0.5, { emissive: col, emissiveIntensity: 0 }), gw = (GY1 - GY0) * K, bar = new THREE.CylinderGeometry(0.07, 0.07, 1, 10);
    for (const z of [-gw / 2, gw / 2]) { const p = mesh(bar, pm, x, GOAL_H / 2, z); p.scale.y = GOAL_H; sc.add(p); }
    const top = mesh(bar, pm, x, GOAL_H, 0); top.scale.y = gw; top.rotation.x = Math.PI / 2; sc.add(top);
    const backG = new THREE.PlaneGeometry(gw, GOAL_H, 10, 6);
    const back = new THREE.Mesh(backG, netM); back.position.set(x + sx * GOAL_D, GOAL_H / 2, 0); back.rotation.y = Math.PI / 2; sc.add(back);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_D, gw), netM); roof.position.set(x + (sx * GOAL_D) / 2, GOAL_H, 0); roof.rotation.x = -Math.PI / 2; sc.add(roof);
    for (const z of [-gw / 2, gw / 2]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_D, GOAL_H), netM); side.position.set(x + (sx * GOAL_D) / 2, GOAL_H / 2, z); sc.add(side); }
    nets.push({ g: backG, base: Float32Array.from(backG.attributes.position.array), sx, t: 9, cz: 0, cy: 0 });
    posts.push(pm);
  });
  // 모서리 깃발 (왼쪽은 빨강, 오른쪽은 파랑)
  const flagG = new THREE.PlaneGeometry(0.36, 0.24).translate(0.18, 0, 0), poleG = new THREE.CylinderGeometry(0.025, 0.025, 0.95, 6), poleM = mat(0xf4f1e6, 0.6);
  const flags = [];
  for (const [fx, fy] of [[FX0, FY0], [FX0, FY1], [FX1, FY0], [FX1, FY1]]) {
    const x = X(fx), z = Z(fy), team = fx === FX0 ? 0 : 1;
    sc.add(mesh(poleG, poleM, x, 0.475, z));
    const f = mesh(flagG.clone(), mat(TEAM[team], 0.8, { side: THREE.DoubleSide }), x, 0.82, z);
    sc.add(f); flags.push(f);
  }
  flagG.dispose();
  // 점수판 (왼쪽 먼 구석, 화면 위 점수판과 겹치지 않게)
  const boardTex = canvasTex(256, 96, (c) => { c.fillStyle = "#1d2050"; c.fillRect(0, 0, 256, 96); });
  const bx0 = -8.6, bz0 = -9.7, frame = mat(0x2b2d4e, 0.6);
  sc.add(mesh(box(0.14, 2.4, 0.14), frame, bx0 - 1.7, 1.2, bz0), mesh(box(0.14, 2.4, 0.14), frame, bx0 + 1.7, 1.2, bz0));
  const boardBox = mesh(box(4.1, 1.6, 0.18), frame, bx0, 3.1, bz0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.86, 1.42), basic(0xffffff, { map: boardTex }));
  face.position.set(0, 0, 0.1); boardBox.add(face);
  boardBox.rotation.y = Math.atan2(CAM.x - bx0, CAM.z - bz0); sc.add(boardBox);
  // 밤 구장: 조명탑
  if (night) {
    sc.add(new THREE.HemisphereLight(0xffffff, 0x445577, 0.45));
    const lampM = basic(0xfff6d8), glowM = new THREE.SpriteMaterial({ map: radialTex("rgba(255,246,210,.9)", "rgba(255,230,170,0)"), depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const sx of [-1, 1]) {
      const x = sx * 12.6, z = -9.4;
      sc.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.4, 8), frame, x, 3.2, z));
      const head = mesh(box(1.7, 0.9, 0.25), lampM, x, 6.6, z); head.rotation.y = -sx * 0.5; head.rotation.x = 0.35; sc.add(head);
      const gl = new THREE.Sprite(glowM); gl.position.set(x, 6.6, z + 0.3); gl.scale.set(5, 5, 1); sc.add(gl);
    }
  }
  // 공 + 그림자 + 꼬리(불꽃 슛·빠른 공) + 불꽃 빛
  const ballTex = canvasTex(128, 64, (c) => { c.fillStyle = "#fff"; c.fillRect(0, 0, 128, 64); c.fillStyle = "#2a2440"; for (const [x, y] of [[16, 16], [48, 44], [80, 16], [112, 44], [48, 8], [112, 8], [16, 52], [80, 52]]) { c.beginPath(); c.arc(x, y, 8, 0, 7); c.fill(); } });
  const ball = mesh(new THREE.SphereGeometry(BRAD, 20, 14), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.5 }), 0, BRAD, 0, true, false);
  const bShadow = blob(0.3, 0.3); sc.add(ball, bShadow);
  const trail = [];
  for (let i = 0; i < N_TRAIL; i++) { const m = new THREE.Mesh(ball.geometry, new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.42 - i * 0.045, depthWrite: false, blending: THREE.AdditiveBlending })); m.scale.setScalar(0.95 - i * 0.08); m.visible = false; sc.add(m); trail.push(m); }
  const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex("rgba(255,210,90,1)", "rgba(255,80,30,0)"), depthWrite: false, blending: THREE.AdditiveBlending })); fire.scale.set(1.6, 1.6, 1); fire.visible = false; sc.add(fire);
  // 흙먼지 (대시·가로채기·공 튐)
  const puffTex = radialTex("rgba(255,250,240,.9)", "rgba(255,240,220,0)"), dust = [];
  for (let i = 0; i < N_DUST; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color: 0xf3e2c4 })); s.visible = false; sc.add(s); dust.push({ s, t: 9, life: 0.5, k: 1 }); }
  // 꽃가루 (골)
  const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.11), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N_CONF);
  const cols = [0xff5d73, 0xffc93c, 0x7ddc7a, 0x6ec6ff, 0xb79cff, 0xffffff], cc = new THREE.Color();
  for (let i = 0; i < N_CONF; i++) conf.setColorAt(i, cc.setHex(cols[i % cols.length]));
  conf.frustumCulled = false; conf.visible = false; sc.add(conf);
  // 떡 아이템
  const item = new THREE.Group(), itemBody = mesh(new THREE.SphereGeometry(0.3, 16, 12), mat(0xffd23c, 0.45, { emissive: 0xffd23c, emissiveIntensity: 0.35 }), 0, 0, 0, true, false);
  itemBody.scale.set(1, 0.82, 1);
  const itemRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.04, 6, 24), basic(0xffffff, { transparent: true, opacity: 0.8 }));
  itemRing.rotation.x = Math.PI / 2; item.add(itemBody, itemRing); item.visible = false; sc.add(item);
  const itemShadow = blob(0.3, 0.25); itemShadow.visible = false; sc.add(itemShadow);

  st.cam.fov = CAM.fov; st.cam.updateProjectionMatrix();
  st.cam.position.set(CAM.x, CAM.y, CAM.z); st.cam.lookAt(CAM.lx, 0, CAM.lz);
  return {
    st, ball, bShadow, trail, fire, hist: new Float32Array(N_HIST * 3), hn: 0, dust, dustN: 0, conf, cp: new Float32Array(N_CONF * 3), cv: new Float32Array(N_CONF * 3), cr: new Float32Array(N_CONF * 2), ct: 9,
    dummy: new THREE.Object3D(), nets, posts, flags, boardTex, boardKey: -1, item, itemBody, itemShadow,
    chars: [], keys: [], th: fd, bx: 0, bz: 0, frame: 0, cam: { x: CAM.x, z: CAM.z, lx: CAM.lx, fov: CAM.fov }, mem: null,
    v3: new THREE.Vector3(), tags: [[0, 0], [0, 0], [0, 0], [0, 0]], out: { cv: null, tags: null },
  };
}

function puff(x, y, z, k = 1, life = 0.5) {
  const d = S.dust[S.dustN++ % N_DUST];
  d.t = 0; d.life = life; d.k = k; d.s.visible = true; d.s.position.set(x, y, z);
}

function startConfetti(gx) {
  const { cp, cv, cr } = S;
  for (let i = 0; i < N_CONF; i++) {
    cp[i * 3] = gx + (Math.random() - 0.5) * 3; cp[i * 3 + 1] = 3 + Math.random() * 2.5; cp[i * 3 + 2] = (Math.random() - 0.5) * 6;
    cv[i * 3] = (Math.random() - 0.5) * 3 - Math.sign(gx) * 1.5; cv[i * 3 + 1] = 2 + Math.random() * 3; cv[i * 3 + 2] = (Math.random() - 0.5) * 3;
    cr[i * 2] = Math.random() * 6.28; cr[i * 2 + 1] = 4 + Math.random() * 8;
  }
  S.ct = 0; S.conf.visible = true;
}

function drawBoard(v) {
  const sec = Math.ceil(v.time / 60), key = (((v.sc[0] * 20 + v.sc[1]) * 200 + sec) * 4 + (v.ph === 2 ? v.lg + 1 : 0)) * 2 + (v.over ? 1 : 0);      // 바뀔 때만 다시 그린다
  if (key === S.boardKey) return;
  S.boardKey = key;
  const c = S.boardTex.image.getContext("2d");
  c.fillStyle = "#1d2050"; c.fillRect(0, 0, 256, 96);
  c.textAlign = "center"; c.textBaseline = "middle"; c.font = "bold 50px sans-serif";
  if (v.ph === 2 && !v.over) { c.fillStyle = TEAM_CSS[v.lg]; c.fillText(v.og ? "앗!" : "골!!", 128, 50); }
  else {
    c.fillStyle = TEAM_CSS[0]; c.fillText(String(v.sc[0]), 56, 44);
    c.fillStyle = TEAM_CSS[1]; c.fillText(String(v.sc[1]), 200, 44);
    c.fillStyle = "#fff"; c.font = "bold 30px sans-serif"; c.fillText(":", 128, 42);
    c.font = "bold 22px sans-serif"; c.fillStyle = v.time > 1800 ? "#ffe9a8" : "#ff8fa3";
    c.fillText(v.over ? "경기 끝" : v.time > 0 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : "골든골", 128, 80);
  }
  S.boardTex.needsUpdate = true;
}

function dropChar(c) {
  removeMochi(S.st.scene, c);
  try { c.shadow.geometry.dispose(); c.shadow.material.dispose(); if (c.ring) { c.ring.geometry.dispose(); c.ring.material.dispose(); } } catch {}
}

export function render(v, env, fd) {
  if (S && S.th !== fd) { S.st.dispose(); S = null; }
  if (!S) S = build(!!env.touch, fd);
  const { st } = S, t = env.t, dt = Math.min(0.1, Math.max(0, t - st.lastT)), prev = env.prev;
  ALPHA = env.alpha;
  S.frame++;
  if (!S.mem) S.mem = { gk: v.gk, tk: v.tk, bo: v.bo, kk: v.kk };
  const mem = S.mem;

  // 공
  const bq = prev && prev.b;
  const bx = X(lerp(v.b.x, bq && bq.x)), bz = Z(lerp(v.b.y, bq && bq.y)), bh = Math.max(0, lerp(v.b.z, bq && bq.z)) * K;
  const spin = v.b.f > 0 ? 1.8 : 1;
  S.ball.rotation.z -= ((bx - S.bx) / BRAD) * spin; S.ball.rotation.x += ((bz - S.bz) / BRAD) * spin; S.bx = bx; S.bz = bz;
  S.ball.position.set(bx, BRAD + bh, bz);
  const shk = 1 - Math.min(0.6, bh / 3);
  S.bShadow.position.set(bx, 0.04, bz); S.bShadow.scale.set(0.3 * shk, 1, 0.3 * shk); S.bShadow.material.opacity = 0.32 * shk;
  // 꼬리: 지난 위치를 고리 버퍼에 담아 두고 띄엄띄엄 보여 준다
  const h = S.hist, hi = (S.hn++ % N_HIST) * 3;
  h[hi] = bx; h[hi + 1] = BRAD + bh; h[hi + 2] = bz;
  const speed = Math.hypot(v.b.vx, v.b.vy), fireOn = v.b.f > 0 && v.ph === 1, fast = fireOn || speed > 11.5;
  for (let i = 0; i < N_TRAIL; i++) {
    const m = S.trail[i], back = (i + 1) * 2;
    if (!fast || S.hn <= back) { m.visible = false; continue; }
    const j = ((S.hn - 1 - back) % N_HIST + N_HIST) % N_HIST * 3;
    m.visible = true; m.position.set(h[j], h[j + 1], h[j + 2]);
    m.material.color.setHex(fireOn ? (i < 3 ? 0xffc23a : 0xff5a2a) : 0xffffff);
    m.material.opacity = (fireOn ? 0.5 : 0.18) - i * (fireOn ? 0.055 : 0.02);
  }
  S.fire.visible = fireOn;
  if (fireOn) { S.fire.position.set(bx, BRAD + bh, bz); const f = 1.5 + Math.sin(t * 30) * 0.2; S.fire.scale.set(f, f, 1); }

  // 카메라: 공 쪽으로 살짝, 슬로 모션이면 조금 당기고, 골이 나면 골대 쪽으로 확대
  const celeb = v.ph === 2 && !v.over && CELEB - v.tm < 110;
  const gx = celeb ? X(v.lg === 0 ? FX1 : FX0) : 0;
  const tx = celeb ? gx * 0.3 : bx * 0.12, tz = celeb ? -1.2 : bz * 0.08, tl = celeb ? gx * 0.5 : bx * 0.16, tf = celeb ? 30 : v.sl > 0 ? 36 : CAM.fov;
  const ck = 1 - Math.exp(-dt * (celeb ? 2.4 : 2));
  const cm = S.cam;
  cm.x += (tx - cm.x) * ck; cm.z += (tz - cm.z) * ck; cm.lx += (tl - cm.lx) * ck; cm.fov += (tf - cm.fov) * ck;
  const cam = st.cam;
  if (Math.abs(cam.fov - cm.fov) > 0.005) { cam.fov = cm.fov; cam.updateProjectionMatrix(); }
  cam.position.set(CAM.x + cm.x, CAM.y, CAM.z + cm.z); cam.lookAt(CAM.lx + cm.lx, 0, CAM.lz + cm.z * 0.6); cam.updateMatrixWorld();

  // 선수
  const tags = S.tags, v3 = S.v3;
  for (let i = 0; i < v.p.length; i++) {
    const p = v.p[i], key = v.seats[i].look + "|" + p.team;
    if (S.keys[i] !== key) { if (S.chars[i]) dropChar(S.chars[i]); S.chars[i] = makeMochi(parseLook(v.seats[i].look, i), { r: 0.56, ring: TEAM[p.team] }); addMochi(st.scene, S.chars[i]); S.keys[i] = key; }
    const q = prev && prev.p[i], x = X(lerp(p.x, q && q.x)), z = Z(lerp(p.y, q && q.y)), c = S.chars[i];
    const down = p.tb > IMMUNE;
    MO.face = Math.atan2(bx - x, bz - z); MO.seed = i;
    MO.lift = v.ph === 2 && !v.over && v.lg === p.team ? Math.abs(Math.sin(t * 9 + i)) * (i === v.ls && !v.og ? 0.8 : 0.3) : v.over && v.over.w === p.team ? Math.abs(Math.sin(t * 7 + i)) * 0.35 : 0;
    moveMochi(c, x, z, t, dt, MO);
    const ch = p.ch / CH_MAX, kick = p.kc > 8 ? 1.18 : 1, dash = p.ds > 0 ? 1.25 : 1;
    c.g.scale.set(kick * (1 + 0.1 * ch), (kick / dash) * (1 - 0.2 * ch), kick * dash * (1 + 0.1 * ch));
    c.body.rotation.x = down ? ((p.tb - IMMUNE) / TUMBLE) * Math.PI * 2 : 0;      // 가로채기 당하면 데굴
    if (c.ring) {
      const sweet = p.ch >= CH_SW0 && p.ch <= CH_SW1;
      c.ring.material.color.setHex(p.fi ? 0xff8a3c : sweet ? 0xffd23c : p.sp > 0 && ((t * 8) | 0) % 2 ? 0xffe066 : TEAM[p.team]);
      c.ring.material.opacity = p.dc <= 0 || sweet || p.fi ? 0.95 : 0.45;      // 대시 준비되면 고리가 또렷해진다
    }
    if (p.ds > 0 && S.frame % 2 === 0) puff(x - p.dx * 0.45, 0.2, z - p.dy * 0.45, 0.9, 0.45);
    if (p.sp > 0 && S.frame % 6 === 0 && Math.hypot(p.vx, p.vy) > 2) puff(x, 0.15, z, 0.6, 0.35);
    v3.set(x, 1.55, z).project(cam);
    tags[i][0] = ((v3.x + 1) / 2) * 960; tags[i][1] = ((1 - v3.y) / 2) * 540;
  }
  for (let i = v.p.length; i < S.chars.length; i++) if (S.chars[i]) { dropChar(S.chars[i]); S.chars[i] = null; S.keys[i] = ""; }

  // 일어난 일에 맞춘 효과
  if (v.tk !== mem.tk) { mem.tk = v.tk; for (let k = 0; k < 5; k++) puff(bx + (Math.random() - 0.5) * 0.8, 0.2, bz + (Math.random() - 0.5) * 0.8, 1.3, 0.6); }
  if (v.bo !== mem.bo) { mem.bo = v.bo; puff(bx, 0.1, bz, 0.7, 0.4); }
  if (v.kk !== mem.kk) { mem.kk = v.kk; if (v.kh === 2) for (let k = 0; k < 3; k++) puff(bx, 0.3, bz, 1.4, 0.5); }
  if (v.gk !== mem.gk) {
    mem.gk = v.gk;
    const side = v.lg === 0 ? 1 : 0, gxx = X(v.lg === 0 ? FX1 : FX0);
    const n = S.nets[side]; n.t = 0; n.cz = -bz; n.cy = bh + BRAD - GOAL_H / 2;
    startConfetti(gxx);
  }
  // 흙먼지
  for (const d of S.dust) {
    if (d.t >= d.life) { if (d.s.visible) d.s.visible = false; continue; }
    d.t += dt; const k = d.t / d.life, sc = (0.4 + k * 0.9) * d.k;
    d.s.scale.set(sc, sc, 1); d.s.material.opacity = 0.75 * (1 - k); d.s.position.y += dt * 0.6;
  }
  // 그물 불룩
  for (let gi = 0; gi < 2; gi++) {
    const n = S.nets[gi];
    if (n.t > 1.6) continue;
    n.t += dt;
    const a = n.t > 1.6 ? 0 : 0.55 * Math.exp(-n.t * 3) * (1 + 0.25 * Math.sin(n.t * 22)), pos = n.g.attributes.position.array, base = n.base;
    for (let j = 0; j < pos.length; j += 3) {
      const dx = (base[j] - n.cz) / 1.1, dy = (base[j + 1] - n.cy) / 0.9, w = Math.max(0, 1 - dx * dx - dy * dy);
      pos[j + 2] = base[j + 2] + n.sx * a * w;
    }
    n.g.attributes.position.needsUpdate = true;
  }
  // 골대 번쩍 (골이 난 쪽)
  for (let gi = 0; gi < 2; gi++) S.posts[gi].emissiveIntensity = v.ph === 2 && !v.over && (v.lg === 0 ? 1 : 0) === gi ? 0.6 + 0.4 * Math.sin(t * 18) : 0;
  // 꽃가루
  if (S.conf.visible) {
    S.ct += dt;
    const { cp, cv, cr, dummy, conf } = S;
    for (let i = 0; i < N_CONF; i++) {
      const i3 = i * 3;
      if (cp[i3 + 1] > 0.06) {
        cv[i3 + 1] -= 4.2 * dt; cv[i3] *= 1 - dt * 0.8; cv[i3 + 2] *= 1 - dt * 0.8; if (cv[i3 + 1] < -1.6) cv[i3 + 1] = -1.6;      // 천천히 팔랑팔랑
        cp[i3] += cv[i3] * dt; cp[i3 + 1] += cv[i3 + 1] * dt; cp[i3 + 2] += cv[i3 + 2] * dt; cr[i * 2] += cr[i * 2 + 1] * dt;
      }
      dummy.position.set(cp[i3], Math.max(0.05, cp[i3 + 1]), cp[i3 + 2]);
      dummy.rotation.set(cr[i * 2], cr[i * 2] * 0.7, 0);
      dummy.updateMatrix(); conf.setMatrixAt(i, dummy.matrix);
    }
    conf.instanceMatrix.needsUpdate = true;
    if (S.ct > 5 || v.ph === 0) conf.visible = false;
  }
  // 깃발 펄럭
  for (let i = 0; i < S.flags.length; i++) S.flags[i].rotation.y = Math.sin(t * 3.2 + i * 1.7) * 0.45;
  // 아이템
  if (v.it) {
    const ix = X(v.it.x), iz = Z(v.it.y);
    S.item.visible = S.itemShadow.visible = true;
    S.item.position.set(ix, 0.5 + Math.sin(t * 4) * 0.12, iz); S.item.rotation.y = t * 2;
    S.itemShadow.position.set(ix, 0.04, iz);
    const col = v.it.k ? 0xff8a3c : 0xffd23c;
    S.itemBody.material.color.setHex(col); S.itemBody.material.emissive.setHex(col);
  } else S.item.visible = S.itemShadow.visible = false;
  drawBoard(v);
  st.cheer = v.ph === 2 || !!v.over || v.sl > 0;
  S.out.cv = st.render(t); S.out.tags = tags;
  return S.out;
}
export function dispose() { if (S) { S.st.dispose(); S = null; } }

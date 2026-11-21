// 판 게임용 3D 무대 — 게임이 원래 그리던 판(2D)을 옥상 바닥에 깔고, 말·공·돌은 입체로 세운다.
// 쓰는 법(게임의 draw 안에서):
//   const g = T.open("land", { rect: [0, 0, 960, 540], unit: 20, sky: "dusk", touch, t });
//   g.board  ← 여기에 판을 평소 2D 좌표 그대로 그린다
//   g.mochi(id, look, x, y, {...}); g.ball(id, x, y, {...}); g.disc(...); g.block(...); g.pin(...)
//   const cv = g.close();  ← 3D 로 그린 캔버스.  g.at(x, y, h) → 화면 좌표,  g.pick(sx, sy) → 판 좌표

import { THREE, createStage, makeMochi, addMochi, removeMochi, mat, basic, box, mesh, canvasTex, blob, LW, LH } from "./stage3d.js?v=1";

let S = null;

function build(key, o) {
  const [x0, y0, x1, y1] = o.rect, bw = x1 - x0, bh = y1 - y0, K = o.unit / bw, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const ww = bw * K, wd = bh * K;
  const st = createStage({ touch: o.touch, roofW: Math.max(24, ww + 8), roofD: Math.max(18, wd + 9), sky: o.sky || "dusk" }), sc = st.scene;
  const q = Math.min(2, 1536 / bw), cv = document.createElement("canvas");
  cv.width = Math.round(bw * q); cv.height = Math.round(bh * q);
  const board = cv.getContext("2d"), tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const lift = o.lift || 0.03;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(ww, wd).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  plane.position.y = lift; plane.receiveShadow = true; sc.add(plane);
  if (o.frame != null) {      // 판 테두리(탁자 틀)
    const fm = mat(o.frame, 0.7), th = 0.35, fh = o.frameH || 0.28;
    for (const [w, d, x, z] of [[ww + th * 2, th, 0, -wd / 2 - th / 2], [ww + th * 2, th, 0, wd / 2 + th / 2], [th, wd, -ww / 2 - th / 2, 0], [th, wd, ww / 2 + th / 2, 0]]) sc.add(mesh(box(w, fh, d), fm, x, lift + fh / 2 - 0.02, z));
  }
  const c = o.cam || {};
  st.cam.fov = c.fov || 40; st.cam.updateProjectionMatrix();
  st.cam.position.set(c.x || 0, c.y || 12.5, c.z || 11.5); st.cam.lookAt(c.x || 0, 0, c.look != null ? c.look : 0.4);      // x: 판을 화면 한쪽으로 밀고 싶을 때
  st.cam.updateMatrixWorld();
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -lift), hit = new THREE.Vector3();
  return {
    key, st, K, cx, cy, x0, y0, q, cv, board, tex, lift, pool: new Map(), frame: 0,
    X: (x) => (x - cx) * K, Z: (y) => (y - cy) * K,
    pick(sx, sy) { ndc.set((sx / LW) * 2 - 1, 1 - (sy / LH) * 2); ray.setFromCamera(ndc, st.cam); return ray.ray.intersectPlane(ground, hit) ? [hit.x / K + cx, hit.z / K + cy] : null; },
  };
}

// 조각 꺼내기: 같은 이름이면 다시 쓰고, 없으면 만든다
function piece(id, sig, make) {
  let p = S.pool.get(id);
  if (!p || p.sig !== sig) { if (p) drop(p); p = make(); p.sig = sig; S.pool.set(id, p); for (const o of p.objs) S.st.scene.add(o); }
  p.used = S.frame;
  for (const o of p.objs) o.visible = true;
  return p;
}
function drop(p) { for (const o of p.objs) S.st.scene.remove(o); }

const handle = {
  get board() { return S.board; },
  at(x, y, h = 0) { return S.st.project(S.X(x), S.lift + h * S.K, S.Z(y)); },
  pick(sx, sy) { return S.pick(sx, sy); },
  set cheer(v) { S.st.cheer = !!v; },
  // 떡 캐릭터. r: 반지름(px), face: 바라보는 2D 각도, lift: 띄울 높이(px), ring: 발밑 고리 색, show: 보일지
  mochi(id, look, x, y, o = {}) {
    const r = (o.r || 20) * S.K, sig = JSON.stringify(look) + "|" + r.toFixed(3) + "|" + (o.ring ?? "") + (o.cap ? "c" : "");
    const p = piece("m" + id, sig, () => { const c = makeMochi(look, { r, ring: o.ring, cap: o.cap }); const objs = [c.g, c.shadow]; if (c.ring) objs.push(c.ring); return { c, objs, px: null, pz: 0, run: 0, yaw: 0 }; });
    const c = p.c, wx = S.X(x), wz = S.Z(y), dt = S.st.dt, t = S.t, show = o.show !== false;
    const dx = p.px == null ? 0 : wx - p.px, dz = p.px == null ? 0 : wz - p.pz, moved = Math.hypot(dx, dz) > 0.003;
    p.px = wx; p.pz = wz;
    p.run += ((moved ? 1 : 0) - p.run) * Math.min(1, dt * 12);
    let face = o.face != null ? Math.atan2(Math.cos(o.face), Math.sin(o.face)) : moved ? Math.atan2(dx, dz) : null;
    if (face != null) { let d = face - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); p.yaw += d * Math.min(1, dt * 14); }
    const hop = Math.abs(Math.sin(t * 13 + (+id || 0))) * r * 0.25 * p.run;
    c.g.position.set(wx, S.lift + hop + (o.lift || 0) * S.K, wz); c.g.rotation.y = p.yaw;
    const s = o.scale || 1; c.g.scale.set(s, s * (o.squash || 1), s);
    c.g.visible = show && !o.blink; c.shadow.visible = show; c.shadow.position.set(wx, S.lift + 0.012, wz);
    if (c.ring) { c.ring.visible = show; c.ring.position.set(wx, S.lift + 0.02, wz); }
    return p;
  },
  // 공. r 반지름(px), h 떠 있는 높이(px), color, stripe 줄무늬 색, label 숫자
  ball(id, x, y, o = {}) {
    const r = (o.r || 10) * S.K, sig = [r.toFixed(3), o.color, o.stripe, o.label, o.glow].join("|");
    const p = piece("b" + id, sig, () => {
      let m;
      if (o.stripe != null || o.label != null) {
        const t = canvasTex(128, 64, (c) => { c.fillStyle = o.stripe != null ? "#fffdf6" : o.color; c.fillRect(0, 0, 128, 64); if (o.stripe != null) { c.fillStyle = o.stripe; c.fillRect(0, 18, 128, 28); } if (o.label != null) { for (const cx of [32, 96]) { c.fillStyle = "#fffdf6"; c.beginPath(); c.arc(cx, 32, 13, 0, 7); c.fill(); c.fillStyle = "#2b2d6e"; c.font = "700 18px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(String(o.label), cx, 33); } } });
        m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 });
      } else m = mat(o.color || "#ffffff", 0.4, o.glow ? { emissive: o.glow } : undefined);
      const b = mesh(new THREE.SphereGeometry(r, 20, 14), m, 0, 0, 0, true, false), sh = blob(r * 0.95, 0.3);
      return { b, sh, objs: [b, sh], lx: null, lz: 0 };
    });
    const wx = S.X(x), wz = S.Z(y);
    if (p.lx != null && o.roll !== false) { p.b.rotation.z -= (wx - p.lx) / r; p.b.rotation.x += (wz - p.lz) / r; }
    p.lx = wx; p.lz = wz;
    p.b.position.set(wx, S.lift + r + (o.h || 0) * S.K, wz); p.sh.position.set(wx, S.lift + 0.012, wz);
    if (o.show === false) { p.b.visible = false; p.sh.visible = false; }
    return p;
  },
  // 납작한 돌(알까기 알, 윷말). r 반지름(px), color, top 윗면 색, h 두께(px)
  disc(id, x, y, o = {}) {
    const r = (o.r || 16) * S.K, hh = (o.h || 10) * S.K, sig = [r.toFixed(3), hh.toFixed(3), o.color, o.top].join("|");
    const p = piece("d" + id, sig, () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(r, r * 1.04, hh, 28), mat(o.color || "#333", 0.45), 0, hh / 2, 0, true, false));
      if (o.top != null) g.add(mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.012, 24), mat(o.top, 0.5), 0, hh + 0.004, 0, false, false));
      const sh = blob(r * 1.05, 0.28);
      return { g, sh, objs: [g, sh] };
    });
    const wx = S.X(x), wz = S.Z(y);
    p.g.position.set(wx, S.lift + (o.lift || 0) * S.K, wz); p.sh.position.set(wx, S.lift + 0.012, wz);
    p.g.scale.setScalar(o.scale || 1);
    return p;
  },
  // 상자·기둥. w·d 가로세로(px), h 높이(px), rot 2D 회전각
  block(id, x, y, o = {}) {
    const w = (o.w || 20) * S.K, d = (o.d || 20) * S.K, hh = (o.h || 20) * S.K, sig = [w.toFixed(3), d.toFixed(3), hh.toFixed(3), o.color].join("|");
    const p = piece("k" + id, sig, () => { const m = mesh(box(w, hh, d), mat(o.color || "#888", 0.8), 0, 0, 0, true, true); return { m, hh, objs: [m] }; });
    p.m.position.set(S.X(x), S.lift + p.hh / 2 + (o.lift || 0) * S.K, S.Z(y)); p.m.rotation.y = -(o.rot || 0);
    return p;
  },
  // 볼링핀. r 반지름(px), up 서 있으면 true, ang 쓰러진 방향
  pin(id, x, y, o = {}) {
    const r = (o.r || 9) * S.K, sig = r.toFixed(3);
    const p = piece("p" + id, sig, () => {
      const g = new THREE.Group(), white = mat(0xfffdf6, 0.4), red = mat(0xff5d73, 0.5);
      g.add(mesh(new THREE.CylinderGeometry(r * 0.55, r, r * 2.2, 14), white, 0, r * 1.1, 0, true, false), mesh(new THREE.SphereGeometry(r * 0.95, 14, 10), white, 0, r * 1.5, 0, true, false), mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.56, r * 0.5, 14), red, 0, r * 2.6, 0, false, false), mesh(new THREE.SphereGeometry(r * 0.62, 14, 10), white, 0, r * 3.2, 0, true, false));
      const sh = blob(r * 1.1, 0.25);
      return { g, sh, objs: [g, sh], tilt: 0 };
    });
    const wx = S.X(x), wz = S.Z(y), up = o.up !== false;
    p.tilt += ((up ? 0 : 1) - p.tilt) * Math.min(1, S.st.dt * 10);
    p.g.position.set(wx, S.lift + p.tilt * r * 0.8, wz);
    p.g.rotation.set(0, 0, 0); p.g.rotateY(-(o.ang || 0)); p.g.rotateZ(-p.tilt * 1.5);
    p.sh.position.set(wx, S.lift + 0.012, wz);
    return p;
  },
  // 다 올렸으면 그린다
  close() {
    for (const [id, p] of S.pool) if (p.used !== S.frame) { if (S.frame - p.used > 240) { drop(p); S.pool.delete(id); } else for (const o of p.objs) o.visible = false; }
    S.tex.needsUpdate = true;
    return S.st.render(S.t);
  },
};

// 무대 열기. opts: { rect [x0,y0,x1,y1], unit 판 가로 길이(3D 단위), sky, frame 테두리 색, cam {fov,y,z,look}, touch, t, bg 판 바탕색 }
export function open(key, o) {
  const sig = key + "|" + (o.sky || "dusk") + "|" + (o.frame ?? "");
  if (S && S.key !== sig) { S.st.dispose(); S = null; }
  if (!S) S = build(sig, o);
  S.frame++; S.t = o.t || 0;
  const b = S.board;
  b.setTransform(S.q, 0, 0, S.q, -S.x0 * S.q, -S.y0 * S.q);
  b.globalAlpha = 1; b.setLineDash([]);
  if (o.bg) { b.fillStyle = o.bg; b.fillRect(S.x0, S.y0, S.cv.width / S.q, S.cv.height / S.q); } else b.clearRect(S.x0, S.y0, S.cv.width / S.q, S.cv.height / S.q);
  return handle;
}
// 화면(논리 좌표) → 판 좌표. 무대가 아직 없으면 그대로 돌려준다
export function pick(sx, sy) { return S ? S.pick(sx, sy) || [sx, sy] : [sx, sy]; }
export function dispose() { if (S) { S.st.dispose(); S = null; } }

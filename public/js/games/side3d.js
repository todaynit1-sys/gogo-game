// 옆에서 보는 게임용 3D 무대 — 옥상 위에 세운 무대를 정면에서 본다.
// 카메라를 z=0 면에 정확히 맞춰서, 그 면 위의 2D 좌표(x, y)가 화면 좌표와 그대로 겹친다.
// 그래서 땅·말·상자만 입체로 세우고, 포탄·폭발·글자 같은 건 원래 2D 그림을 그 위에 그대로 얹으면 된다.
//   const g = T.open("cannon", { K: 1 / 48, baseY: 540, sky, touch, t });
//   g.terrain(h, colW, { soil, grass }); g.mochi(id, look, x, y, {...}); g.rod(...); g.block(...); g.ball(...)
//   ctx.drawImage(g.close(), 0, 0, W, H)

import { THREE, createStage, makeMochi, mat, basic, box, mesh, LW, LH } from "./stage3d.js?v=2";

let S = null;

function build(sig, o) {
  const K = o.K || 1 / 48, baseY = o.baseY ?? LH, fov = o.fov || 30;
  const st = createStage({ touch: o.touch, roofW: LW * K + 7, roofD: o.roofD || 17, sky: o.sky || "dusk", floor: o.floor });
  const cy = (baseY - LH / 2) * K, d = ((LH / 2) * K) / Math.tan((fov * Math.PI) / 360);
  st.cam.fov = fov; st.cam.far = 260; st.cam.updateProjectionMatrix();
  st.cam.position.set(0, cy, d); st.cam.lookAt(0, cy, 0);
  if (o.mat) {      // 무대 바닥 깔개
    st.scene.add(mesh(box(LW * K + 1.2, 0.02, o.matD || 7), mat(o.mat, 0.95), 0, 0.012, o.matZ || 0, false));
  }
  return { sig, st, K, baseY, pool: new Map(), frame: 0, land: null, X: (x) => (x - LW / 2) * K, Y: (y) => (baseY - y) * K };
}

function piece(id, sig, make) {
  let p = S.pool.get(id);
  if (!p || p.sig !== sig) { if (p) for (const o of p.objs) S.st.scene.remove(o); p = make(); p.sig = sig; S.pool.set(id, p); for (const o of p.objs) S.st.scene.add(o); }
  p.used = S.frame;
  for (const o of p.objs) o.visible = true;
  return p;
}

const handle = {
  set cheer(v) { S.st.cheer = !!v; },
  // 땅: 기둥 높이 배열(2D y, 작을수록 높다) → 두께 있는 언덕
  terrain(h, colW, o = {}) {
    const n = h.length, zf = o.front ?? 0.22, zb = o.back ?? -2.3;
    if (!S.land || S.land.n !== n || S.land.key !== o.soil + o.grass) {
      if (S.land) S.st.scene.remove(S.land.front, S.land.top);
      const mk = (color, rough) => {
        const g = new THREE.BufferGeometry(), idx = [];
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 6), 3));
        for (let i = 0; i < n - 1; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
        g.setIndex(idx);
        const m = new THREE.Mesh(g, mat(color, rough, { side: THREE.DoubleSide })); m.receiveShadow = true; m.castShadow = true; m.frustumCulled = false;
        S.st.scene.add(m); return m;
      };
      S.land = { n, key: o.soil + o.grass, front: mk(o.soil, 0.95), top: mk(o.grass, 0.9) };
    }
    const fp = S.land.front.geometry.attributes.position, tp = S.land.top.geometry.attributes.position;
    for (let i = 0; i < n; i++) {
      const x = S.X(i * colW), y = Math.max(0, S.Y(Math.min(h[i], S.baseY)));
      fp.setXYZ(i * 2, x, 0, zf); fp.setXYZ(i * 2 + 1, x, y, zf);
      tp.setXYZ(i * 2, x, y, zf); tp.setXYZ(i * 2 + 1, x, y, zb);
    }
    fp.needsUpdate = true; tp.needsUpdate = true;
    S.land.front.geometry.computeVertexNormals(); S.land.top.geometry.computeVertexNormals();
  },
  // 떡 캐릭터. (x, y)는 발밑의 2D 좌표, r 반지름(px), yaw 몸 돌리기(0 이면 정면), tilt 기울기
  mochi(id, look, x, y, o = {}) {
    const r = (o.r || 20) * S.K, sig = JSON.stringify(look) + "|" + r.toFixed(3) + (o.cap ? "c" : "");
    const p = piece("m" + id, sig, () => { const c = makeMochi(look, { r, cap: o.cap }); return { c, objs: [c.g] }; });
    const g = p.c.g;
    g.position.set(S.X(x), S.Y(y), o.z || 0); g.rotation.set(0, o.yaw || 0, o.tilt || 0);
    const s = o.scale || 1, sq = o.squash || 0; g.scale.set(s * (1 - sq * 0.8), s * (1 + sq), s * (1 - sq * 0.8));
    g.visible = o.show !== false;
    return p;
  },
  // 막대(포신 등): 2D 두 점을 잇는다. w 굵기(px)
  rod(id, x1, y1, x2, y2, o = {}) {
    const w = (o.w || 8) * S.K, sig = w.toFixed(3) + "|" + o.color;
    const p = piece("r" + id, sig, () => { const m = mesh(new THREE.CylinderGeometry(w / 2, w / 2, 1, 10), mat(o.color || "#2b2d6e", 0.5), 0, 0, 0, true, false); return { m, objs: [m] }; });
    const ax = S.X(x1), ay = S.Y(y1), bx = S.X(x2), by = S.Y(y2), len = Math.hypot(bx - ax, by - ay) || 0.001;
    p.m.position.set((ax + bx) / 2, (ay + by) / 2, o.z || 0); p.m.scale.set(1, len, 1); p.m.rotation.set(0, 0, Math.atan2(by - ay, bx - ax) - Math.PI / 2);
    return p;
  },
  // 상자: 가운데 (x, y), 크기 w×h(px), rot 2D 회전각, depth 두께(px)
  block(id, x, y, w, h, o = {}) {
    const ww = w * S.K, hh = h * S.K, dd = (o.depth || Math.min(w, h, 60)) * S.K, sig = [ww.toFixed(3), hh.toFixed(3), dd.toFixed(3), o.color, o.opacity].join("|");
    const p = piece("k" + id, sig, () => { const m = mesh(box(ww, hh, dd), mat(o.color || "#888", 0.8, o.opacity != null ? { transparent: true, opacity: o.opacity } : undefined), 0, 0, 0, true, true); return { m, objs: [m] }; });
    p.m.position.set(S.X(x), S.Y(y), o.z || 0); p.m.rotation.set(0, 0, -(o.rot || 0));
    return p;
  },
  // 공
  ball(id, x, y, o = {}) {
    const r = (o.r || 10) * S.K, sig = r.toFixed(3) + "|" + o.color;
    const p = piece("b" + id, sig, () => { const m = mesh(new THREE.SphereGeometry(r, 18, 14), mat(o.color || "#fff", 0.45), 0, 0, 0, true, false); return { m, objs: [m] }; });
    p.m.position.set(S.X(x), S.Y(y), o.z || 0);
    return p;
  },
  close() {
    for (const [id, p] of S.pool) if (p.used !== S.frame) { if (S.frame - p.used > 240) { for (const o of p.objs) S.st.scene.remove(o); S.pool.delete(id); } else for (const o of p.objs) o.visible = false; }
    return S.st.render(S.t);
  },
};

export function open(key, o) {
  const sig = key + "|" + (o.sky || "dusk") + "|" + (o.mat ?? "") + "|" + (o.floor ?? "");
  if (S && S.sig !== sig) { S.st.dispose(); S = null; }
  if (!S) S = build(sig, o);
  S.frame++; S.t = o.t || 0;
  return handle;
}
export function dispose() { if (S) { S.st.dispose(); S = null; } }

// 폭탄 미로의 3D 무대
import { THREE, createStage, makeMochi, addMochi, removeMochi, moveMochi, mat, basic, box, mesh, canvasTex, blob } from "./stage3d.js?v=1";
import { parseLook } from "../avatar.js?v=3";

const GW = 15, GH = 11, N = GW * GH, X = (x) => x - 7, Z = (y) => y - 5;
let S = null;

function build(touch, th, thi, drawItem) {
  const st = createStage({ touch, roofW: 25, roofD: 20, sky: thi === 3 ? "night" : thi === 1 ? "day" : "dusk" }), sc = st.scene;
  sc.add(mesh(box(GW + 0.5, 0.3, GH + 0.5), mat(0x2b2d6e, 0.7), 0, 0.03, 0, true));
  const inst = (geo, m, cast) => { const o = new THREE.InstancedMesh(geo, m, N); o.castShadow = cast; o.receiveShadow = true; o.count = 0; sc.add(o); return o; };
  const tile = [inst(box(1, 0.1, 1), mat(th.f[0], 0.95), false), inst(box(1, 0.1, 1), mat(th.f[1], 0.95), false)];
  const d = new THREE.Object3D();
  const n = [0, 0];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const k = (x + y) % 2; d.position.set(X(x), 0.18, Z(y)); d.updateMatrix(); tile[k].setMatrixAt(n[k]++, d.matrix); }
  tile[0].count = n[0]; tile[1].count = n[1];
  const wall = inst(box(0.96, 0.9, 0.96), mat(th.w[1], 0.7), true), wallCap = inst(box(1, 0.12, 1), mat(th.w[0], 0.7), false);
  const crate = inst(box(0.84, 0.74, 0.84), mat(th.c[1], 0.8), true), band = inst(box(0.9, 0.16, 0.9), mat(th.c[0], 0.8), false);
  const flame = inst(new THREE.SphereGeometry(0.46, 12, 10), basic(0xff7a2f), false), core = inst(new THREE.SphereGeometry(0.26, 10, 8), basic(0xffe680), false);
  const icons = {};
  for (const ch of "abcde") icons[ch] = canvasTex(64, 64, (c) => { c.scale(2, 2); drawItem(c, ch, 16, 16); });
  const items = [];
  for (let i = 0; i < 24; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: icons.a, transparent: true })); s.scale.set(0.82, 0.82, 1); s.visible = false; sc.add(s); items.push(s); }
  const bombs = [];
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group(), body = mesh(new THREE.SphereGeometry(0.36, 16, 12), mat(0x2a2440, 0.4), 0, 0.36, 0, true, false);
    const fuse = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), mat(0x8a5a3c), 0.12, 0.76, 0, false, false); fuse.rotation.z = -0.5;
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), basic(0xffd24a)); spark.position.set(0.2, 0.86, 0);
    g.add(body, fuse, spark); g.visible = false; sc.add(g); bombs.push({ g, body, spark });
  }
  st.cam.fov = 38; st.cam.updateProjectionMatrix();
  st.cam.position.set(0, 16.8, 12.4); st.cam.lookAt(0, 0, 0.7);
  return { st, d, wall, wallCap, crate, band, flame, core, items, icons, bombs, chars: [], keys: [], shields: [], thi };
}

export function render(v, env, th, drawItem) {
  const thi = v.th | 0;
  if (S && S.thi !== thi) { S.st.dispose(); S = null; }
  if (!S) S = build(!!env.touch, th, thi, drawItem);
  const { st, d } = S, t = env.t, tags = [];
  let nw = 0, nc = 0, nf = 0, ni = 0;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const ch = v.g[y * GW + x];
    if (ch === "0") continue;
    d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
    if (ch === "1") { d.position.set(X(x), 0.68, Z(y)); d.updateMatrix(); S.wall.setMatrixAt(nw, d.matrix); d.position.y = 1.18; d.updateMatrix(); S.wallCap.setMatrixAt(nw++, d.matrix); }
    else if (ch === "2") { d.position.set(X(x), 0.6, Z(y)); d.updateMatrix(); S.crate.setMatrixAt(nc, d.matrix); d.position.y = 0.62; d.updateMatrix(); S.band.setMatrixAt(nc++, d.matrix); }
    else if (ch === "f" || ch === "3") { const k = 0.85 + Math.sin(t * 30 + x + y) * 0.15; d.position.set(X(x), 0.6, Z(y)); d.scale.set(k, k * 1.2, k); d.updateMatrix(); S.flame.setMatrixAt(nf, d.matrix); d.position.y = 0.66; d.updateMatrix(); S.core.setMatrixAt(nf++, d.matrix); }
    else if (S.icons[ch] && ni < S.items.length) { const s = S.items[ni++]; s.visible = true; if (s.material.map !== S.icons[ch]) s.material.map = S.icons[ch]; s.position.set(X(x), 0.72 + Math.sin(t * 4 + x) * 0.07, Z(y)); }
  }
  for (const [m, c] of [[S.wall, nw], [S.wallCap, nw], [S.crate, nc], [S.band, nc], [S.flame, nf], [S.core, nf]]) { m.count = c; m.instanceMatrix.needsUpdate = true; }
  for (let i = ni; i < S.items.length; i++) S.items[i].visible = false;
  S.bombs.forEach((b, i) => {
    const q = v.b[i]; b.g.visible = !!q; if (!q) return;
    const [bx, by, bt] = q, k = 1 + Math.sin(bt * 0.25) * 0.09;
    b.g.position.set(X(bx), 0.22, Z(by)); b.g.scale.setScalar(k);
    b.body.material.color.set(bt < 40 && bt % 10 < 5 ? 0xff5d73 : 0x2a2440); b.spark.scale.setScalar(bt % 6 < 3 ? 1.5 : 1);
  });
  v.p.forEach((p, i) => {
    const key = v.seats[i].look;
    if (S.keys[i] !== key) {
      if (S.chars[i]) { removeMochi(st.scene, S.chars[i]); st.scene.remove(S.shields[i]); }
      S.chars[i] = makeMochi(parseLook(v.seats[i].look, i), { r: 0.4 }); addMochi(st.scene, S.chars[i]); S.keys[i] = key;
      S.shields[i] = new THREE.Mesh(new THREE.SphereGeometry(0.56, 16, 12), basic(0x6ec6ff, { transparent: true, opacity: 0.35, depthWrite: false })); st.scene.add(S.shields[i]);
    }
    const c = S.chars[i], q = env.prev && env.prev.p[i] ? env.prev.p[i] : p, x = X(q.x + (p.x - q.x) * env.alpha), z = Z(q.y + (p.y - q.y) * env.alpha);
    c.g.visible = !!p.al && !(p.iv > 0 && v.tick % 8 < 4); c.shadow.visible = !!p.al;
    moveMochi(c, x, z, t, st.dt, { lift: 0.22, seed: i });
    c.shadow.position.y = 0.26;
    S.shields[i].visible = !!p.al && !!p.sh; S.shields[i].position.set(x, 0.66, z);
    tags.push(p.al ? st.project(x, 1.35, z) : null);
  });
  for (let i = v.p.length; i < S.chars.length; i++) if (S.chars[i]) { removeMochi(st.scene, S.chars[i]); st.scene.remove(S.shields[i]); S.chars[i] = null; S.keys[i] = null; }
  st.cheer = !!v.over;
  return { cv: st.render(t), tags };
}
export function dispose() { if (S) { S.st.dispose(); S = null; } }

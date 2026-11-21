// 떡 피구의 3D 무대
import { THREE, createStage, makeMochi, addMochi, removeMochi, moveMochi, mat, basic, box, mesh, blob } from "./stage3d.js?v=1";
import { parseLook } from "../avatar.js?v=3";

const K = 1 / 44, X = (x) => (x - 480) * K, Z = (y) => (y - 287) * K;
const FX0 = 60, FX1 = 900, FY0 = 74, FY1 = 500, MID = 480, TEAM = [0xff5d73, 0x4d9be0];
let S = null;

function build(touch, c, th) {
  const st = createStage({ touch, roofW: 28, roofD: 21, sky: th === 3 ? "night" : th === 2 ? "day" : "dusk" }), sc = st.scene;
  const fw = (FX1 - FX0) * K, fd = (FY1 - FY0) * K, hwid = fw / 2;
  sc.add(mesh(box(fw + 2.4, 0.02, fd + 1.6), mat(c.out, 0.95), 0, 0.012, 0, false));
  sc.add(mesh(box(hwid, 0.02, fd), mat(c.a, 0.95), -hwid / 2, 0.022, 0, false), mesh(box(hwid, 0.02, fd), mat(c.b, 0.95), hwid / 2, 0.022, 0, false));
  for (const [x, col] of [[-hwid / 2, TEAM[0]], [hwid / 2, TEAM[1]]]) { const t = new THREE.Mesh(new THREE.PlaneGeometry(hwid, fd).rotateX(-Math.PI / 2), basic(col, { transparent: true, opacity: 0.1, depthWrite: false })); t.position.set(x, 0.036, 0); sc.add(t); }
  const line = mat(th === 2 ? 0x4d9be0 : 0xffffff, 0.8), lw = 0.08;
  for (const [w, d, x, z] of [[fw, lw, 0, Z(FY0)], [fw, lw, 0, Z(FY1)], [lw, fd, X(FX0), 0], [lw, fd, X(FX1), 0], [lw * 1.6, fd, 0, 0]]) sc.add(mesh(box(w, 0.02, d), line, x, 0.04, z, false));
  const ring = new THREE.Mesh(new THREE.RingGeometry(56 * K - 0.03, 56 * K + 0.03, 40).rotateX(-Math.PI / 2), line); ring.position.y = 0.05; sc.add(ring);
  for (const x of [FX0 + 110, FX1 - 110]) for (let z = Z(FY0) + 0.2; z < Z(FY1); z += 0.5) sc.add(mesh(box(lw * 0.8, 0.02, 0.24), line, X(x), 0.04, z, false));
  const ball = mesh(new THREE.SphereGeometry(0.3, 18, 14), mat(0xe8453c, 0.45), 0, 0.4, 0, true, false);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 24), basic(0xffffff)); ball.add(stripe);
  const bShadow = blob(0.28, 0.3), trail = [];
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(ball.geometry, basic(0xff8a80, { transparent: true, opacity: 0.3 - i * 0.06, depthWrite: false })); t.scale.setScalar(0.85 - i * 0.12); sc.add(t); trail.push(t); }
  sc.add(ball, bShadow);
  st.cam.fov = 40; st.cam.updateProjectionMatrix();
  st.cam.position.set(0, 10.2, 16.6); st.cam.lookAt(0, 0, -1.3);
  return { st, ball, bShadow, trail, chars: [], keys: [], th };
}

export function render(v, env, court) {
  const th = v.th | 0;
  if (S && S.th !== th) { S.st.dispose(); S = null; }
  if (!S) S = build(!!env.touch, court, th);
  const { st } = S, t = env.t, at = (cur, old) => (old != null ? old + (cur - old) * env.alpha : cur), tags = [];
  v.p.forEach((p, i) => {
    const key = v.seats[i].look + "|" + p.team;
    if (S.keys[i] !== key) { if (S.chars[i]) removeMochi(st.scene, S.chars[i]); S.chars[i] = makeMochi(parseLook(v.seats[i].look, i), { r: 0.56, ring: TEAM[p.team] }); addMochi(st.scene, S.chars[i]); S.keys[i] = key; }
    const c = S.chars[i], q = env.prev && env.prev.p[i], x = X(at(p.x, q && q.x)), z = Z(at(p.y, q && q.y));
    const show = !!p.al && !(p.iv > 0 && v.tick % 8 < 4);
    c.g.visible = show; c.shadow.visible = !!p.al; c.ring.visible = !!p.al;
    moveMochi(c, x, z, t, st.dt, { face: Math.atan2(p.fx, p.fy), seed: i });
    const grab = p.cw > 0 ? 1.2 : 1, dash = p.ds > 0 ? 1.25 : 1;
    c.g.scale.set(grab, grab / dash, grab * dash);
    tags.push(p.al ? st.project(x, 1.5, z) : null);
  });
  for (let i = v.p.length; i < S.chars.length; i++) if (S.chars[i]) { removeMochi(st.scene, S.chars[i]); S.chars[i] = null; S.keys[i] = ""; }
  const b = v.b, bq = env.prev && env.prev.b, bx = X(at(b.x, bq && bq.x)), bz = Z(at(b.y, bq && bq.y)), by = b.live ? 0.75 : 0.42;
  S.ball.position.set(bx, by, bz); S.ball.rotation.x += 0.2; S.ball.rotation.z += 0.13; S.bShadow.position.set(bx, 0.045, bz);
  S.trail.forEach((m, k) => { m.visible = !!b.live; m.position.set(bx - b.vx * K * (k + 1) * 1.3, by, bz - b.vy * K * (k + 1) * 1.3); });
  st.cheer = !!v.over;
  const cv = st.render(t);
  return { cv, tags, at: (x, y, h = 1.2) => st.project(X(x), h, Z(y)) };
}
export function dispose() { if (S) { S.st.dispose(); S = null; } }

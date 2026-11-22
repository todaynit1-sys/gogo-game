// 떡 축구의 3D 무대
import { THREE, createStage, makeMochi, addMochi, removeMochi, moveMochi, mat, box, mesh, canvasTex, blob } from "./stage3d.js?v=2";
import { parseLook } from "../avatar.js?v=3";

const K = 1 / 44, X = (x) => (x - 480) * K, Z = (y) => (y - 280) * K;      // 2D 좌표 → 3D
const FX0 = 48, FX1 = 912, FY0 = 58, FY1 = 502, GY0 = 205, GY1 = 355, TEAM = [0xff5d73, 0x4d9be0];
let S = null;

function build(touch, fd) {
  const st = createStage({ touch, roofW: 28, roofD: 21, sky: fd.name === "밤 구장" ? "night" : fd.name === "눈밭 구장" ? "day" : "dusk" }), sc = st.scene;
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
  // 골대
  const netTex = canvasTex(64, 64, (c) => { c.strokeStyle = "rgba(255,255,255,.95)"; c.lineWidth = 2; for (let i = 0; i <= 64; i += 8) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 64); c.moveTo(0, i); c.lineTo(64, i); c.stroke(); } });
  const netM = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  [[X(FX0), -1, TEAM[0]], [X(FX1), 1, TEAM[1]]].forEach(([x, sx, col]) => {
    const pm = mat(col, 0.5), gh = 1.5, gd = 0.9, gw = (GY1 - GY0) * K, bar = new THREE.CylinderGeometry(0.07, 0.07, 1, 10);
    for (const z of [-gw / 2, gw / 2]) { const p = mesh(bar, pm, x, gh / 2, z); p.scale.y = gh; sc.add(p); }
    const top = mesh(bar, pm, x, gh, 0); top.scale.y = gw; top.rotation.x = Math.PI / 2; sc.add(top);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), netM); back.position.set(x + sx * gd, gh / 2, 0); back.rotation.y = Math.PI / 2; sc.add(back);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(gd, gw), netM); roof.position.set(x + (sx * gd) / 2, gh, 0); roof.rotation.x = -Math.PI / 2; sc.add(roof);
    for (const z of [-gw / 2, gw / 2]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(gd, gh), netM); side.position.set(x + (sx * gd) / 2, gh / 2, z); sc.add(side); }
  });
  // 공
  const ballTex = canvasTex(128, 64, (c) => { c.fillStyle = "#fff"; c.fillRect(0, 0, 128, 64); c.fillStyle = "#2a2440"; for (const [x, y] of [[16, 16], [48, 44], [80, 16], [112, 44], [48, 8], [112, 8], [16, 52], [80, 52]]) { c.beginPath(); c.arc(x, y, 8, 0, 7); c.fill(); } });
  const ball = mesh(new THREE.SphereGeometry(0.34, 20, 14), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.5 }), 0, 0.34, 0, true, false);
  const bShadow = blob(0.3, 0.3); sc.add(ball, bShadow);
  st.cam.fov = 40; st.cam.updateProjectionMatrix();
  st.cam.position.set(0, 10.2, 16.6); st.cam.lookAt(0, 0, -1.3);
  return { st, ball, bShadow, chars: [], keys: [], th: fd, bx: 0, bz: 0 };
}

export function render(v, env, fd) {
  if (S && S.th !== fd) { S.st.dispose(); S = null; }
  if (!S) S = build(!!env.touch, fd);
  const { st } = S, t = env.t, lerp = (cur, old) => (old != null ? old + (cur - old) * env.alpha : cur), tags = [];
  v.p.forEach((p, i) => {
    const key = v.seats[i].look + "|" + p.team;
    if (S.keys[i] !== key) { if (S.chars[i]) removeMochi(st.scene, S.chars[i]); S.chars[i] = makeMochi(parseLook(v.seats[i].look, i), { r: 0.56, ring: TEAM[p.team] }); addMochi(st.scene, S.chars[i]); S.keys[i] = key; }
    const q = env.prev && env.prev.p[i], x = X(q ? lerp(p.x, q.x) : p.x), z = Z(q ? lerp(p.y, q.y) : p.y), c = S.chars[i];
    moveMochi(c, x, z, t, st.dt, { face: Math.atan2(X(v.b.x) - x, Z(v.b.y) - z), seed: i });
    const kick = p.kc > 8 ? 1.18 : 1, dash = p.ds > 0 ? 1.25 : 1;
    c.g.scale.set(kick, kick / dash, kick * dash);
    if (c.ring) c.ring.material.opacity = p.dc <= 0 ? 0.95 : 0.45;      // 대시 준비되면 고리가 또렷해진다
    tags.push(st.project(x, 1.55, z));
  });
  for (let i = v.p.length; i < S.chars.length; i++) if (S.chars[i]) { removeMochi(st.scene, S.chars[i]); S.chars[i] = null; S.keys[i] = ""; }
  const bq = env.prev && env.prev.b, bx = X(bq ? lerp(v.b.x, bq.x) : v.b.x), bz = Z(bq ? lerp(v.b.y, bq.y) : v.b.y);
  S.ball.rotation.z -= (bx - S.bx) / 0.34; S.ball.rotation.x += (bz - S.bz) / 0.34; S.bx = bx; S.bz = bz;
  S.ball.position.set(bx, 0.34, bz); S.bShadow.position.set(bx, 0.04, bz);
  st.cheer = v.ph === 2 || !!v.over;
  return { cv: st.render(t), tags };
}
export function dispose() { if (S) { S.st.dispose(); S = null; } }

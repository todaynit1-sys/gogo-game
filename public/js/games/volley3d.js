// 통통 배구의 3D 무대 — 옆에서 보는 옥상 코트
import { THREE, createStage, makeMochi, addMochi, removeMochi, mat, basic, box, mesh, canvasTex, blob } from "./stage3d.js?v=2";

const K = 1 / 60, GROUND = 470, PR = 40, NET_H = 165 * K, X = (x) => (x - 480) * K, Y = (y) => (GROUND - y) * K;
const SKY = ["day", "dusk", "night", "dusk"], FLOOR = [0xf1d49a, 0xe9b77c, 0x8f93c4, 0xdba266], EDGE = [0x3f9fd8, 0xd9774f, 0x5a5fa8, 0x3f8f86];
let S = null;

function build(touch, thi) {
  const st = createStage({ touch, roofW: 21, roofD: 15, sky: SKY[thi] || "dusk" }), sc = st.scene;
  sc.add(mesh(box(16.6, 0.02, 7.2), mat(EDGE[thi], 0.95), 0, 0.012, 0, false), mesh(box(16, 0.02, 6.4), mat(FLOOR[thi], 0.95), 0, 0.022, 0, false));
  const line = mat(0xfff8ea, 0.8);
  for (const [w, d, x, z] of [[16, 0.08, 0, -3.2], [16, 0.08, 0, 3.2], [0.08, 6.4, -8, 0], [0.08, 6.4, 8, 0], [0.08, 6.4, -2.7, 0], [0.08, 6.4, 2.7, 0]]) sc.add(mesh(box(w, 0.02, d), line, x, 0.034, z, false));
  // 네트
  const post = mat(0x8a5a3c, 0.7);
  for (const z of [-3.4, 3.4]) sc.add(mesh(new THREE.CylinderGeometry(0.09, 0.1, NET_H + 0.15, 10), post, 0, (NET_H + 0.15) / 2, z));
  const netTex = canvasTex(256, 128, (c, w, h) => { c.strokeStyle = "rgba(255,255,255,.95)"; c.lineWidth = 2.5; for (let x = 0; x <= w; x += 12) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y <= h; y += 12) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(6.8, NET_H - 0.5), new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1 }));
  net.rotation.y = Math.PI / 2; net.position.set(0, 0.5 + (NET_H - 0.5) / 2, 0); net.castShadow = true; sc.add(net);
  sc.add(mesh(box(0.14, 0.16, 6.8), line, 0, NET_H, 0));
  // 양 끝 그물 울타리 (공이 튕겨 나오는 벽)
  const fenceM = basic(0xffffff, { map: netTex, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  for (const x of [-8.45, 8.45]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 12.4), fenceM); f.rotation.y = Math.PI / 2; f.position.set(x, 6.2, 0); sc.add(f);
    for (const z of [-3.4, 3.4]) sc.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 12.4, 8), mat(0x39406e, 0.6), x, 6.2, z));
  }
  // 공
  const ballTex = canvasTex(128, 64, (c) => { c.fillStyle = "#fff"; c.fillRect(0, 0, 128, 64); c.fillStyle = "#ffb703"; c.fillRect(0, 22, 128, 9); c.fillStyle = "#3d6fd6"; c.fillRect(0, 36, 128, 9); });
  const ball = mesh(new THREE.SphereGeometry(0.4, 22, 16), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.45 }), 0, 3, 0, true, false);
  const bShadow = blob(0.4, 0.3), trail = [];
  for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(ball.geometry, basic(0xff8a50, { transparent: true, opacity: 0.3 - i * 0.045, depthWrite: false })); t.scale.setScalar(0.9 - i * 0.1); sc.add(t); trail.push(t); }
  sc.add(ball, bShadow);
  st.cam.fov = 30; st.cam.updateProjectionMatrix();
  st.cam.position.set(0, 5.262, 24.0); st.cam.lookAt(0, 5.262, 0);      // z=0 면이 2D 좌표의 0.7배로 화면에 딱 겹친다 (volley.js 의 ZOOM)
  return { st, ball, bShadow, trail, hist: [], chars: [], keys: [], thi };
}

// s: 경기 상태, o: { t, touch, thi, looks[] }
export function render(s, o) {
  if (S && S.thi !== o.thi) { S.st.dispose(); S = null; }
  if (!S) S = build(!!o.touch, o.thi);
  const { st } = S, t = o.t, b = s.b;
  s.p.forEach((p, i) => {
    const key = JSON.stringify(o.looks[i]);
    if (S.keys[i] !== key) { if (S.chars[i]) removeMochi(st.scene, S.chars[i]); S.chars[i] = makeMochi(o.looks[i], { r: PR * K }); addMochi(st.scene, S.chars[i]); S.keys[i] = key; }
    const c = S.chars[i], x = X(p.x), y = Math.max(0, Y(p.y + PR)), air = y > 0.04, dir = p.team === 0 ? 1 : -1;
    let sq = air ? Math.max(-0.16, Math.min(0.16, -p.vy / 5200)) : Math.sin(s.tick * 0.12 + i) * 0.025;
    const slide = p.dv > 0;
    if (slide) sq = -0.4; else if (p.rc > 0) sq = -0.4 + (11 - p.rc) * 0.035;
    c.g.position.set(x, y, 0);
    c.g.rotation.y = slide ? p.dd * 1.35 : dir * 0.85 + Math.max(-0.5, Math.min(0.5, (X(b.x) - x) * 0.12));
    c.g.rotation.z = slide ? -p.dd * 0.5 : 0;
    c.body.scale.set((1 - sq * 0.8) * (PR * K / 0.66), (1 + sq) * (PR * K / 0.66), (1 - sq * 0.8) * (PR * K / 0.66));
    c.body.rotation.x = p.sm > 0 ? -0.5 : 0;      // 강타할 때 몸을 젖힌다
    const sh = Math.max(0.3, 0.64 - y * 0.06); c.shadow.scale.set(sh, 1, sh); c.shadow.position.set(x, 0.04, 0);
  });
  for (let i = s.p.length; i < S.chars.length; i++) if (S.chars[i]) { removeMochi(st.scene, S.chars[i]); S.chars[i] = null; S.keys[i] = ""; }
  const bx = X(b.x), by = Y(b.y);
  S.ball.position.set(bx, by, 0); S.ball.rotation.z = -(s.tick * 0.02 + b.x * 0.02) * 2; S.ball.rotation.x = 0.4;
  const bs = Math.max(0.16, 0.42 - by * 0.03); S.bShadow.scale.set(bs, 1, bs); S.bShadow.position.set(bx, 0.045, 0); S.bShadow.material.opacity = Math.max(0.1, 0.34 - by * 0.025);
  S.hist.unshift([bx, by]); if (S.hist.length > 14) S.hist.length = 14;
  const fast = Math.hypot(b.vx, b.vy) > 800;
  S.trail.forEach((m, k) => { const h = S.hist[(k + 1) * 2]; m.visible = !!(fast && h); if (h) m.position.set(h[0], h[1], 0); });
  st.cheer = s.ph === 2 || s.ph === 3;
  return { cv: st.render(t) };
}
export function dispose() { if (S) { S.st.dispose(); S = null; } }

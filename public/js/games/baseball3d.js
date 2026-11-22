// 떡 야구의 3D 구장 — 포수 뒤 높은 자리에서 본 내야. 스트라이크 존·공·글자는 2D 로 그 위에 얹는다.
import { THREE, createStage, makeMochi, mat, box, mesh, blob } from "./stage3d.js?v=2";

let S = null;
const MOUND = -14, HOME = [0, 0], BAT = [-2.0, -1.3];

function build(touch, st, thi) {
  const sg = createStage({ touch, roofW: 90, roofD: 110, sky: st.night ? "night" : thi === 1 ? "dusk" : "day", fans: false, floor: st.grass }), sc = sg.scene;
  // 잔디 줄무늬
  for (let k = -6; k <= 6; k++) if (k % 2) sc.add(mesh(box(5, 0.02, 100), mat(st.grass2, 0.95), k * 5, 0.012, -20, false));
  // 내야 흙(마름모)과 안쪽 잔디
  const dia = (size, color, y, z) => { const m = mesh(box(size, 0.02, size), mat(color, 0.95), 0, y, z, false); m.rotation.y = Math.PI / 4; return m; };
  sc.add(dia(27, st.dirt, 0.02, -15.5), dia(17, st.grass, 0.03, -15.5));
  const white = mat(0xffffff, 0.8);
  for (const sx of [-1, 1]) { const l = mesh(box(0.14, 0.02, 60), white, sx * 21.2, 0.035, -21.2, false); l.rotation.y = -sx * Math.PI / 4; sc.add(l); }
  for (const [x, z] of [[13.5, -15.5], [0, -29], [-13.5, -15.5]]) { const b = mesh(box(0.9, 0.08, 0.9), white, x, 0.06, z); b.rotation.y = Math.PI / 4; sc.add(b); }
  // 홈 플레이트와 타석
  sc.add(mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.02, 32), mat(st.dirt, 0.95), 0, 0.034, 0, false));
  const plate = mesh(box(0.95, 0.05, 0.95), white, 0, 0.06, 0); sc.add(plate);
  // 마운드
  sc.add(mesh(new THREE.CylinderGeometry(2.3, 2.7, 0.22, 28), mat(st.dirt, 0.95), 0, 0.11, MOUND, false), mesh(box(0.8, 0.05, 0.16), white, 0, 0.25, MOUND));
  // 방망이
  const bat = new THREE.Group(), wood = mat(0xc98a4a, 0.5);
  const barrel = mesh(new THREE.CylinderGeometry(0.11, 0.06, 2, 12), wood, 1, 0, 0, true, false); barrel.rotation.z = -Math.PI / 2;
  const grip = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.32, 10), mat(0x2b2d6e, 0.6), 0.14, 0, 0, true, false); grip.rotation.z = -Math.PI / 2;
  bat.add(barrel, grip); sc.add(bat);
  sg.cam.fov = 20; sg.cam.far = 400; sg.cam.updateProjectionMatrix();
  sg.cam.position.set(0, 18.3, 26); sg.cam.lookAt(0, 0, -9.2);
  Object.assign(sg.sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24 }); sg.sun.shadow.camera.updateProjectionMatrix();
  sg.sun.position.set(-16, 22, 6); sg.sun.target.position.set(0, 0, -8);
  return { sg, bat, chars: [null, null], keys: ["", ""], thi };
}

// o: { t, touch, thi, st(구장 색), looks [투수, 타자], wind 와인드업 0~1, ang 방망이 각도(2D), open }
export function render(o) {
  if (S && S.thi !== o.thi) { S.sg.dispose(); S = null; }
  if (!S) S = build(!!o.touch, o.st, o.thi);
  const { sg } = S;
  for (let i = 0; i < 2; i++) {
    const key = JSON.stringify(o.looks[i]);
    if (S.keys[i] !== key) {
      if (S.chars[i]) sg.scene.remove(S.chars[i].g, S.chars[i].shadow);
      const c = makeMochi(o.looks[i], { r: i ? 0.7 : 0.62, cap: true }); sg.scene.add(c.g, c.shadow); S.chars[i] = c; S.keys[i] = key;
    }
  }
  const pit = S.chars[0], bat = S.chars[1], w = o.wind || 0;
  pit.g.position.set(0, 0.22 + w * 0.25, MOUND); pit.g.rotation.y = 0; pit.g.scale.set(1 + w * 0.12, 1 - w * 0.15, 1 + w * 0.12);
  pit.shadow.position.set(0, 0.24, MOUND);
  bat.g.position.set(BAT[0], 0, BAT[1]); bat.g.rotation.y = Math.PI * 0.62; bat.shadow.position.set(BAT[0], 0.045, BAT[1]);
  S.bat.position.set(BAT[0] + 0.55, 0.95, BAT[1] + 0.25); S.bat.rotation.set(0, -o.ang, 0.25);
  return sg.render(o.t);
}
export function dispose() { if (S) { S.sg.dispose(); S = null; } }

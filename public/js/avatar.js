// 떡 캐릭터 — 모든 게임과 '내 방'이 함께 쓰는 그리기·꾸미기 모듈
// 모습(look)은 "색.표정.꾸미기" 숫자 셋으로 표현한다. 예: "2.1.3"

export const BODY = [
  { name: "분홍", body: "#ff9db5", dark: "#e56b8c" },
  { name: "쑥", body: "#9bd88a", dark: "#5fae55" },
  { name: "호박", body: "#ffd66b", dark: "#e3a820" },
  { name: "하늘", body: "#8ecbff", dark: "#4d9be0" },
  { name: "포도", body: "#c3a6ff", dark: "#8a63e0" },
  { name: "백설", body: "#fff8ee", dark: "#c9b79f" },
  { name: "초코", body: "#c08a62", dark: "#8a5a3c" },
  { name: "귤", body: "#ffb067", dark: "#e9772b" },
];
export const FACES = ["기본", "반짝", "졸림", "씩씩"];
export const HATS = ["없음", "새싹", "리본", "왕관", "꽃", "밀짚모자"];

export function parseLook(s, fallback = 0) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/.exec(String(s || ""));
  if (!m) return { c: fallback % BODY.length, f: 0, h: 0 };
  return { c: +m[1] % BODY.length, f: +m[2] % FACES.length, h: +m[3] % HATS.length };
}
export const lookStr = (l) => `${l.c}.${l.f}.${l.h}`;
export const randomLook = () => ({ c: (Math.random() * BODY.length) | 0, f: (Math.random() * FACES.length) | 0, h: (Math.random() * HATS.length) | 0 });

// (x, y) = 몸 가운데, R = 반지름. o: { ang 바라보는 방향, sq 찌그러짐, open 입 벌림 }
export function drawMochi(ctx, x, y, R, look, o = {}) {
  const c = BODY[look.c] || BODY[0], sq = o.sq || 0;
  const rx = 40 * (1 - sq * 0.8), ry = 40 * (1 + sq), cy = 40 - ry;
  ctx.save();
  ctx.translate(x, y); ctx.scale(R / 40, R / 40);
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // 밀짚모자 챙은 몸 뒤에
  // 몸
  ctx.fillStyle = c.body; ctx.strokeStyle = c.dark; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.beginPath(); ctx.ellipse(-rx * 0.38, cy - ry * 0.45, rx * 0.24, ry * 0.14, -0.5, 0, 7); ctx.fill();

  // 얼굴
  const ang = o.ang == null ? 0.3 : o.ang, ex = Math.cos(ang) * 4, ey = Math.sin(ang) * 4;
  const fy = cy - 4, ink = "#3a2a22";
  for (const sx of [-13, 13]) {
    if (look.f === 1) {            // 반짝: 크고 까만 눈에 반짝임
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(sx + ex * 0.5, fy + ey * 0.5, 7.5, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx + ex * 0.5 - 2.5, fy + ey * 0.5 - 2.5, 2.6, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + ex * 0.5 + 2.5, fy + ey * 0.5 + 2.5, 1.3, 0, 7); ctx.fill();
    } else if (look.f === 2) {     // 졸림: 감은 눈
      ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, fy - 1, 6.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, fy, 8, 0, 7); ctx.fill();
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(sx + ex, fy + ey, 4.2, 0, 7); ctx.fill();
      if (look.f === 3) {          // 씩씩: 눈썹
        ctx.strokeStyle = ink; ctx.lineWidth = 3.2; ctx.beginPath();
        ctx.moveTo(sx + Math.sign(sx) * 8, fy - 15); ctx.lineTo(sx - Math.sign(sx) * 7, fy - 10); ctx.stroke();
      }
    }
  }
  ctx.fillStyle = "rgba(255,90,110,.35)";
  ctx.beginPath(); ctx.arc(-24, fy + 11, 6, 0, 7); ctx.arc(24, fy + 11, 6, 0, 7); ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath();
  if (o.open) { ctx.fillStyle = ink; ctx.arc(0, fy + 15, 5, 0, 7); ctx.fill(); }
  else { ctx.arc(0, fy + 10, 7, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }

  // 꾸미기 (머리 위 기준점)
  const top = cy - ry;
  ctx.lineWidth = 3; ctx.strokeStyle = "#2b2d6e";
  if (look.h === 1) {              // 새싹
    ctx.strokeStyle = "#3f8f3a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, top + 3); ctx.lineTo(0, top - 12); ctx.stroke();
    ctx.fillStyle = "#6fcf5f"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(-9, top - 16, 10, 5.5, 0.5, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(9, top - 16, 10, 5.5, -0.5, 0, 7); ctx.fill(); ctx.stroke();
  } else if (look.h === 2) {       // 리본
    ctx.fillStyle = "#ff5d73"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(14, top + 6); ctx.lineTo(-2, top - 6); ctx.lineTo(-2, top + 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, top + 6); ctx.lineTo(30, top - 6); ctx.lineTo(30, top + 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(14, top + 6, 5, 0, 7); ctx.fill(); ctx.stroke();
  } else if (look.h === 3) {       // 왕관
    ctx.fillStyle = "#ffc93c"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-18, top + 6); ctx.lineTo(-20, top - 14); ctx.lineTo(-9, top - 4); ctx.lineTo(0, top - 18); ctx.lineTo(9, top - 4); ctx.lineTo(20, top - 14); ctx.lineTo(18, top + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ff5d73"; ctx.beginPath(); ctx.arc(0, top - 3, 3, 0, 7); ctx.fill();
  } else if (look.h === 4) {       // 꽃
    ctx.lineWidth = 2; ctx.fillStyle = "#fff";
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(-20 + Math.cos(a) * 7, top + 10 + Math.sin(a) * 7, 5.5, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = "#ffc93c"; ctx.beginPath(); ctx.arc(-20, top + 10, 4.5, 0, 7); ctx.fill(); ctx.stroke();
  } else if (look.h === 5) {       // 밀짚모자
    ctx.fillStyle = "#f3d58a"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, top + 9, 36, 8, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-20, top + 8); ctx.quadraticCurveTo(-18, top - 16, 0, top - 16); ctx.quadraticCurveTo(18, top - 16, 20, top + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#ff5d73"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-19, top + 3); ctx.quadraticCurveTo(0, top + 9, 19, top + 3); ctx.stroke();
  }
  ctx.restore();
}

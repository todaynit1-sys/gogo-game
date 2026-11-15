// 떡 캐릭터 — 모든 게임과 '내 방'이 함께 쓰는 그리기·꾸미기 모듈
// 모습(look)은 "색.표정.머리.무늬.얼굴[.직접 고른 색]" 으로 표현한다. 예: "2.1.3.0.1" 또는 "0.0.0.2.0.ff8800"

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
export const FACES = ["기본", "반짝", "졸림", "씩씩", "윙크", "깜짝"];
export const HATS = ["없음", "새싹", "리본", "왕관", "꽃", "밀짚모자", "고양이 귀", "헤드폰", "요리사 모자"];
export const PATTERNS = ["없음", "점박이", "줄무늬", "하트", "별"];
export const ACCS = ["없음", "동그란 안경", "선글라스", "콧수염", "반창고"];

export function parseLook(s, fallback = 0) {
  const part = String(s || "").split(".");
  const hex = part.length > 3 && /^[0-9a-f]{6}$/i.test(part[part.length - 1]) ? part.pop().toLowerCase() : null;
  const n = part.map((x) => (/^\d{1,2}$/.test(x) ? +x : NaN));
  if (n.length < 3 || n.some(Number.isNaN)) return { c: fallback % BODY.length, f: 0, h: 0, m: 0, a: 0, hex: null };
  return { c: n[0] % BODY.length, f: n[1] % FACES.length, h: n[2] % HATS.length, m: (n[3] || 0) % PATTERNS.length, a: (n[4] || 0) % ACCS.length, hex };
}
export const lookStr = (l) => `${l.c}.${l.f}.${l.h}.${l.m || 0}.${l.a || 0}` + (l.hex ? "." + l.hex : "");
const pick = (arr) => (Math.random() * arr.length) | 0;
export const randomLook = () => ({ c: pick(BODY), f: pick(FACES), h: pick(HATS), m: Math.random() < 0.5 ? 0 : pick(PATTERNS), a: Math.random() < 0.6 ? 0 : pick(ACCS), hex: null });

function shade(hex, k) {
  const n = parseInt(hex, 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, "0");
  return "#" + f(n >> 16) + f((n >> 8) & 255) + f(n & 255);
}
export function bodyColors(look) {
  if (look.hex) return { body: "#" + look.hex, dark: shade(look.hex, 0.72) };
  return BODY[look.c] || BODY[0];
}

function heart(ctx, x, y, s) {
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.5, y - s * 0.2, x - s * 0.6, y - s * 1.2, x, y - s * 0.3);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.5, y - s * 0.2, x, y + s * 0.9); ctx.fill();
}
function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}

// (x, y) = 몸 가운데, R = 반지름. o: { ang 바라보는 방향, sq 찌그러짐, open 입 벌림 }
export function drawMochi(ctx, x, y, R, look, o = {}) {
  const c = bodyColors(look), sq = o.sq || 0;
  const rx = 40 * (1 - sq * 0.8), ry = 40 * (1 + sq), cy = 40 - ry;
  const ink = "#3a2a22", navy = "#2b2d6e", top = cy - ry;
  ctx.save();
  ctx.translate(x, y); ctx.scale(R / 40, R / 40);
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  // 몸 뒤에 놓이는 머리 장식
  if (look.h === 6) {              // 고양이 귀
    ctx.fillStyle = c.body; ctx.strokeStyle = c.dark; ctx.lineWidth = 4;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 30, top + 22); ctx.lineTo(s * 27, top - 8); ctx.lineTo(s * 8, top + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffb3c6"; ctx.beginPath(); ctx.moveTo(s * 25, top + 12); ctx.lineTo(s * 24, top + 1); ctx.lineTo(s * 15, top + 9); ctx.closePath(); ctx.fill(); ctx.fillStyle = c.body;
    }
  }

  // 몸
  ctx.fillStyle = c.body; ctx.strokeStyle = c.dark; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(0, cy, rx, ry, 0, 0, 7); ctx.fill(); ctx.stroke();

  // 무늬 (몸 안쪽에만)
  if (look.m) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, cy, rx - 2, ry - 2, 0, 0, 7); ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.strokeStyle = "rgba(255,255,255,.45)";
    if (look.m === 1) { for (const [px, py, pr] of [[-22, -20, 6], [20, -24, 5], [26, 6, 7], [-28, 12, 5], [2, 28, 6], [-6, -32, 4]]) { ctx.beginPath(); ctx.arc(px, cy + py, pr, 0, 7); ctx.fill(); } }
    else if (look.m === 2) { ctx.lineWidth = 7; for (let k = -70; k <= 70; k += 20) { ctx.beginPath(); ctx.moveTo(k - 30, cy + 45); ctx.lineTo(k + 30, cy - 45); ctx.stroke(); } }
    else if (look.m === 3) { ctx.fillStyle = "rgba(255,93,115,.75)"; heart(ctx, 22, cy + 22, 8); heart(ctx, -26, cy - 22, 5); }
    else if (look.m === 4) { ctx.fillStyle = "rgba(255,230,120,.95)"; star(ctx, 24, cy + 20, 9); star(ctx, -25, cy - 20, 6); }
    ctx.restore();
  }
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.beginPath(); ctx.ellipse(-rx * 0.38, cy - ry * 0.45, rx * 0.24, ry * 0.14, -0.5, 0, 7); ctx.fill();

  // 얼굴
  const ang = o.ang == null ? 0.3 : o.ang, ex = Math.cos(ang) * 4, ey = Math.sin(ang) * 4;
  const fy = cy - 4;
  for (const sx of [-13, 13]) {
    if (look.f === 1) {            // 반짝: 크고 까만 눈에 반짝임
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(sx + ex * 0.5, fy + ey * 0.5, 7.5, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx + ex * 0.5 - 2.5, fy + ey * 0.5 - 2.5, 2.6, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + ex * 0.5 + 2.5, fy + ey * 0.5 + 2.5, 1.3, 0, 7); ctx.fill();
    } else if (look.f === 2 || (look.f === 4 && sx > 0)) {     // 졸림(감은 눈) / 윙크의 한쪽 눈
      ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath();
      if (look.f === 2) ctx.arc(sx, fy - 1, 6.5, 0.15 * Math.PI, 0.85 * Math.PI); else ctx.arc(sx, fy + 3, 6.5, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
    } else {
      const big = look.f === 5;    // 깜짝: 눈이 커지고 눈동자가 작아진다
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, fy, big ? 9.5 : 8, 0, 7); ctx.fill();
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(sx + ex, fy + ey, big ? 2.8 : 4.2, 0, 7); ctx.fill();
      if (look.f === 3) {          // 씩씩: 눈썹
        ctx.strokeStyle = ink; ctx.lineWidth = 3.2; ctx.beginPath();
        ctx.moveTo(sx + Math.sign(sx) * 8, fy - 15); ctx.lineTo(sx - Math.sign(sx) * 7, fy - 10); ctx.stroke();
      }
    }
  }
  ctx.fillStyle = "rgba(255,90,110,.35)";
  ctx.beginPath(); ctx.arc(-24, fy + 11, 6, 0, 7); ctx.arc(24, fy + 11, 6, 0, 7); ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath();
  if (o.open || look.f === 5) { ctx.fillStyle = ink; ctx.arc(0, fy + 15, 5, 0, 7); ctx.fill(); }
  else { ctx.arc(0, fy + 10, 7, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }

  // 얼굴 장식
  if (look.a === 1) {              // 동그란 안경
    ctx.strokeStyle = navy; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(-13, fy, 11, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(13, fy, 11, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, fy); ctx.lineTo(2, fy); ctx.stroke();
  } else if (look.a === 2) {       // 선글라스
    ctx.fillStyle = "#23233f";
    ctx.beginPath(); ctx.roundRect(-25, fy - 8, 22, 15, 5); ctx.fill(); ctx.beginPath(); ctx.roundRect(3, fy - 8, 22, 15, 5); ctx.fill();
    ctx.fillRect(-4, fy - 5, 8, 3);
    ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(-21, fy - 5, 6, 3); ctx.fillRect(7, fy - 5, 6, 3);
  } else if (look.a === 3) {       // 콧수염
    ctx.fillStyle = ink;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, fy + 9); ctx.quadraticCurveTo(s * 9, fy + 4, s * 17, fy + 10); ctx.quadraticCurveTo(s * 9, fy + 13, 0, fy + 11); ctx.fill(); }
  } else if (look.a === 4) {       // 반창고
    ctx.save(); ctx.translate(23, fy + 12); ctx.rotate(-0.5);
    ctx.fillStyle = "#f3cfa0"; ctx.strokeStyle = "#c79a63"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-9, -4, 18, 8, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  // 머리 장식
  ctx.lineWidth = 3; ctx.strokeStyle = navy;
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
  } else if (look.h === 7) {       // 헤드폰
    ctx.strokeStyle = navy; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, cy - 2, rx + 1, 1.12 * Math.PI, 1.88 * Math.PI); ctx.stroke();
    ctx.fillStyle = "#ff5d73"; ctx.lineWidth = 2.5;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.roundRect(s * (rx - 2) - 7, cy - 14, 14, 24, 6); ctx.fill(); ctx.stroke(); }
  } else if (look.h === 8) {       // 요리사 모자
    ctx.fillStyle = "#fff"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(-13, top - 8, 11, 0, 7); ctx.arc(0, top - 14, 13, 0, 7); ctx.arc(13, top - 8, 11, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(-13, top - 8, 11, 0.6 * Math.PI, 1.6 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, top - 14, 13, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(13, top - 8, 11, 1.4 * Math.PI, 0.4 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-17, top - 4, 34, 12, 3); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

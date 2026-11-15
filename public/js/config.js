// 사이트 설정 — 여기만 고치면 이름·후원 정보가 바뀝니다.
export const SITE = {
  name: "한판 오락실",
  // 온라인 대전 서버(Cloudflare Worker) 주소. 같은 곳에서 함께 돌리면 비워 둔다.
  // 예: "https://hanpan-arcade.내계정.workers.dev"
  server: "",
  donate: {
    // 카카오페이 송금 링크 (카카오페이 앱 > 송금 > 내 송금코드 > 링크 복사). 비워 두면 표시 안 함.
    kakaopay: "",
    // 토스 송금 링크 (toss.me/아이디 등). 비워 두면 표시 안 함.
    toss: "",
    // 계좌 안내 문구. 예: "○○은행 123-456-789012 (예금주 홍길동)". 비워 두면 표시 안 함.
    bank: "",
  },
};

// 게임 목록. ready:false 는 "준비 중" 카드로만 보인다.
export const GAMES = [
  { id: "volley", name: "통통 배구", tag: "2~4명 · 1대1 / 2대2", desc: "말랑한 떡 친구들의 한판 배구. 점프해서 강타를 꽂아 보세요.", ready: true, color: "#ff8fab" },
  { id: "blocks", name: "블록 대전", tag: "2~4명", desc: "줄을 지워 상대에게 방해 줄을 보내는 낙하 블록 대결.", ready: false, color: "#7cc6fe" },
  { id: "chain", name: "연쇄 팡", tag: "2~4명", desc: "같은 색 넷을 이어 터뜨리고, 연쇄로 상대를 몰아붙이기.", ready: false, color: "#b79cff" },
  { id: "bomb", name: "폭탄 미로", tag: "2~4명", desc: "미로에서 끝까지 살아남는 사람이 승리.", ready: false, color: "#ffc93c" },
  { id: "land", name: "땅따먹기", tag: "2~4명", desc: "선을 그어 내 땅을 넓히고, 상대 꼬리를 끊어라.", ready: false, color: "#8ed081" },
];

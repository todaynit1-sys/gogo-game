// 사이트 설정 — 여기만 고치면 이름·후원 정보가 바뀝니다.
export const SITE = {
  name: "한판 오락실",
  // 온라인 대전 서버(Cloudflare Worker) 주소. 같은 곳에서 함께 돌리면 비워 둔다.
  // 예: "https://hanpan-arcade.내계정.workers.dev"
  server: "https://hanpan-arcade.hjsy.workers.dev",
  donate: {
    // 후원하기 버튼을 보일지. 준비되면 true 로 바꾼다.
    show: false,
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
  { id: "volley", name: "통통 배구", tag: "2~4명 · 1대1 / 2대2", desc: "말랑한 떡 친구들의 한판 배구. 강타와 슬라이딩으로 랠리를 이어 가요.", ready: true },
  { id: "bomb", name: "폭탄 미로", tag: "2~4명", desc: "폭탄으로 상자를 부수고 끝까지 살아남는 사람이 승리.", ready: true },
  { id: "land", name: "땅따먹기", tag: "2~4명", desc: "선을 그어 내 땅을 넓히고, 상대 선을 밟아 끊어라.", ready: true },
  { id: "soccer", name: "떡 축구", tag: "2~4명 · 1대1 / 2대2", desc: "위에서 내려다보는 미니 축구. 몸으로 밀고 뻥 차서 골!", ready: true },
  { id: "cannon", name: "쾅쾅 포격전", tag: "2~4명 · 번갈아 쏘기", desc: "각도와 힘, 바람을 읽고 포탄을 날려요. 땅이 파이는 포격 대결.", ready: true },
  { id: "sling", name: "새총 무너뜨리기", tag: "1~4명 · 번갈아 쏘기", desc: "새총으로 몸을 날려 성을 무너뜨리고 도깨비를 잡아요.", ready: true },
  { id: "baseball", name: "떡 야구", tag: "1~2명 · 3·6·9회", desc: "구종을 섞어 던지고, 타이밍 맞춰 홈런! 1대1로 번갈아 던지고 치는 야구.", ready: true },
  { id: "dodge", name: "떡 피구", tag: "2~4명 · 1대1 / 2대2", desc: "공을 던져 맞히고, 날아오는 공은 잡아서 되갚기!", ready: true },
  { id: "pool", name: "미니 당구", tag: "1~4명 · 번갈아 치기", desc: "흰 공을 끌어 쳐서 색 공을 구멍에 쏙. 넣으면 한 번 더!", ready: true },
  { id: "yut", name: "윷놀이", tag: "2~4명 · 번갈아 던지기", desc: "도·개·걸·윷·모! 잡고 업고 지름길로, 말을 먼저 다 내보내면 승리.", ready: true },
  { id: "alkkagi", name: "알까기", tag: "2~4명 · 번갈아 튕기기", desc: "내 알을 튕겨 상대 알을 판 밖으로! 온라인에서도 끊김 없는 차례제.", ready: true },
  { id: "blocks", name: "블록 대전", tag: "2~4명", desc: "줄을 지워 상대에게 방해 줄을 보내는 낙하 블록 대결.", ready: true },
  { id: "chain", name: "연쇄 팡", tag: "2~4명", desc: "같은 색 넷을 이어 터뜨리고, 연쇄로 상대를 몰아붙이기.", ready: true },
];

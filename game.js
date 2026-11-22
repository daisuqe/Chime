'use strict';
// =====================================================================
//  Chime — 放課後の校舎ダンジョン（プロトタイプ）
//  校舎データは school.js、人物・サブシナリオは events.js
// =====================================================================
// ビルド番号：タイトル画面の右下に出す。コミットのたびに .git/hooks/pre-commit が「何番目のコミットか」に書き換える
const BUILD = 70;
const stairCells = st => [[st.x, st.y], [st.x + DIRS[st.dir][0], st.y + DIRS[st.dir][1]]];
const stairEntry = st => [st.x - DIRS[st.dir][0], st.y - DIRS[st.dir][1]];
// (x,y) を含む階段と、そのマスが何段目のマスか（0 手前 / 1 奥）
function stairAt(fl, x, y) {
  for (const st of MAPS[fl].stairs) { const i = stairCells(st).findIndex(([cx, cy]) => cx === x && cy === y); if (i >= 0) return { st, i }; }
  return null;
}
// 自分の目の前にある、今の向きで昇り降りできる階段
function stairAhead() {
  const d = state.dir, h = stairAt(state.fl, state.x + DIRS[d][0], state.y + DIRS[d][1]);
  return h && h.i === 0 && h.st.dir === d ? h.st : null;
}
// カーテン：廊下（部屋の外・階段ホール）の窓には無い。部屋の窓は最初すべて閉まっていて、
// 廊下の窓の目の前で外を見たとき（state.flags.reveal）に部屋ごとの設定で開く
//   closed：ずっと閉まったまま / partial：一部の窓だけ閉まったまま / それ以外：すべて開く
const CURTAIN = { 保健室: 'closed', 校長室: 'closed', 放送室: 'closed', 視聴覚室: 'closed', 放送準備室: 'closed',
  職員室: 'partial', 理科室: 'partial', 音楽室: 'partial', 図書室: 'partial', 美術室: 'partial', '3年E組': 'partial' };
const NO_CURTAIN_ROOMS = ['鐘楼'];
const edgeHash = (fl, x, y, d) => { // 辺ごとに決まった乱数の種（両側から見ても同じ値）
  if (d === 2) { y++; d = 0; } else if (d === 1) { x++; d = 3; }
  return ((fl * 73856093) ^ (x * 19349663) ^ (y * 83492791) ^ (d * 2654435761)) >>> 0;
};
// 窓の辺のカーテン：null（無い／開いている）か、ドレープを描くための種
function curtainAt(fl, x, y, d) {
  const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
  const [cx, cy] = inMap(fl, x, y) ? [x, y] : [nx, ny]; // 校舎の内側のマス
  const r = roomAt(fl, cx, cy);
  if (!r || NO_CURTAIN_ROOMS.includes(r.name)) return null;
  const seed = edgeHash(fl, x, y, d), mode = CURTAIN[r.name];
  if (!state.flags.reveal || mode === 'closed') return seed;
  if (mode === 'partial' && (Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0) % 5 < 2) return seed; // 4割ほど閉まったまま
  return null;
}
const isFace = e => e !== OPEN;               // 見た目として面がある（壁・扉・窓）
const isBlocking = e => e === WALL || e === WIN || e === FENCE; // 通れない

// 壁の飾り：マス(x,y)から d を向いたときに見える壁の面に何を貼るか（すべて直線の長方形）
//   教室の黒板／廊下の掲示板・ポスター・消火栓／部屋のポスター。指定があればそれを優先
function decoAt(fl, x, y, d) {
  const e = edgeAt(fl, x, y, d), F = MAPS[fl], a = areaAt(fl, x, y);
  if (e === DOOR) return F.deco[x + ',' + y + ',' + d] === 'glassdoor' ? 'glassdoor' : null; // 扉に付けるのはガラス扉だけ
  if (e !== WALL) return null;
  if (!a || a.outdoor) return null;
  const man = F.deco[x + ',' + y + ',' + d]; if (man) return man;
  if (F.stairWalls.has(edgeKey(x, y, d))) return null;
  if (/組$/.test(a.name) && d === (a.board ?? 1)) return 'board';
  if (a.hiwin && !areaAt(fl, x + DIRS[d][0], y + DIRS[d][1])) return 'hiwin';
  let h = (x * 374761393 + y * 668265263 + d * 2246822519 + fl * 3266489917) >>> 0; // 位置で決まる乱数
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; h = (h ^ (h >>> 16)) >>> 0;
  if (a.kind === 'hall' && a.name !== '昇降口') {
    const k = h % 16;
    return k < 4 ? 'bulletin' : k < 7 ? 'poster' : k < 9 ? 'posters' : k === 9 ? 'hydrant' : null;
  }
  if (a.kind === 'room' && !a.solid && !/トイレ/.test(a.name)) return h % 7 === 0 ? 'poster' : h % 7 === 1 ? 'clock' : null;
  return null;
}

// ---------------------------------------------------------------------
//  Characters / spells / monsters
// ---------------------------------------------------------------------
function mkChar(o) {
  return Object.assign({ lv: 1, exp: 0, defend: false, spells: [] }, o, { hp: o.maxhp, mp: o.maxmp });
}
const HERO = () => mkChar({ id: 'hero', name: L('あなた'), cls: L('生徒'), maxhp: 20, maxmp: 0, atk: [3, 8], ac: 7, agi: 10, grow: { hp: [4, 8], mp: 0 } });
const RECRUITS = {
  saeki: () => mkChar({ id: 'saeki', name: L('佐伯'), cls: L('教員'), maxhp: 15, maxmp: 8, atk: [2, 6], ac: 8, agi: 7, spells: ['heal', 'scold'], grow: { hp: [3, 6], mp: 3 } }),
  mizuno: () => mkChar({ id: 'mizuno', name: L('水野'), cls: L('図書委員'), maxhp: 10, maxmp: 10, atk: [1, 4], ac: 9, agi: 12, spells: ['spark', 'thunder'], grow: { hp: [2, 4], mp: 4 } }),
};
// 回復の量（戦闘中も、探索中の H も同じ）
const healAmt = c => rnd(5, 9) + Math.floor(c.lv / 2), chorusAmt = c => rnd(3, 5) + Math.floor(c.lv / 2);
const SPELLS = {
  heal: { name: L('手当て'), mp: 3 },
  scold: { name: L('一喝'), mp: 3 },
  spark: { name: L('火花'), mp: 2 },
  thunder: { name: L('雷鳴'), mp: 4 },
  lecture: { name: L('まどろみ'), mp: 2 },  // 敵1体を確実に近く眠らせる
  quiz: { name: L('残響'), mp: 4 },         // 敵全体に小ダメージ
  chorus: { name: L('歌声'), mp: 5 },       // 仲間全員を少し回復
  drill: { name: L('身構え'), mp: 3 },      // この回、仲間全員が身を守る
};
// 敵：学校の備品が勝手に動く（ポルターガイスト）。目や口は描かない
//   img：画像（image/enemy/）。imgs があれば 1 体ずつ違う画像／cm・up：大きさと、床から浮いている高さ（cm）
//   どの敵も床から少し浮いている。軽いもの（ボール・紙・小物）ははっきり浮かせる
//   zoom：戦闘で描くときの倍率（無ければ 30cm 未満 3 倍・60cm 未満 2 倍）
//   fl：出る階／rooms：名前がこれに合う部屋・場所では、その敵が出やすい
//   重いもの・人の形のもの・刃物や火など攻撃的なものは強い
const E = n => 'image/enemy/enemy_' + n + '.png';
const MONS = {
  // ---- 教室・廊下 ----
  paper:    { name: L('プリント'),         zoom: 2, imgs: Array.from({ length: 13 }, (_, i) => E('paper_' + String(i + 1).padStart(2, '0'))), cm: 32, up: [90, 170], fl: [1, 2, 3], rooms: /組|廊下|職員室|図書|放送|進路/, hp: [2, 3], atk: [1, 2], ac: 9, agi: 13, exp: 2, grp: [3, 4] },
  eraser:   { name: L('黒板消し'),         img: E('eraser'),       cm: 18,  up: 130, fl: [1],       rooms: /組/,                hp: [2, 4],   atk: [1, 2],  ac: 9, agi: 12, exp: 3,  grp: [2, 4] },
  chair:    { name: L('椅子'),             img: E('chair'),        cm: 80,  up: 25,   fl: [1, 2],    rooms: /組|自習室/,         hp: [5, 8],   atk: [1, 4],  ac: 8, agi: 8,  exp: 6,  grp: [1, 3] },
  mop:      { name: L('モップ'),           img: E('mop'),          cm: 130, up: 20,   fl: [1, 2],    rooms: /廊下|トイレ|用務員/, hp: [5, 8],  atk: [1, 4],  ac: 8, agi: 8,  exp: 6,  grp: [1, 3] },
  desk:     { name: L('机'),               img: E('desk'),         cm: 75,  up: 20,   fl: [1, 2],    rooms: /組|職員室|自習室/,  hp: [11, 15], atk: [2, 5],  ac: 6, agi: 4,  exp: 13, grp: [1, 2] },
  globe:    { name: L('地球儀'),           img: E('globe'),        cm: 50,  up: 100,  fl: [2],       rooms: /組|図書|社会/,      hp: [7, 10],  atk: [1, 4],  ac: 7, agi: 8,  exp: 9,  grp: [1, 3] },
  extinguisher: { name: L('消火器'),       img: E('extinguisher'), cm: 60,  up: 60,  fl: [2, 3, 4], rooms: /廊下|階段/,         hp: [14, 18], atk: [3, 8],  ac: 5, agi: 6,  exp: 20, grp: [1, 2] },
  // ---- 体育館 ----
  bball:    { name: L('バスケットボール'), img: E('basketball'),   cm: 25,  up: 110,  fl: [1, 5],    rooms: /体育館/,            hp: [3, 5],   atk: [1, 3],  ac: 8, agi: 11, exp: 4,  grp: [2, 4] },
  vball:    { name: L('バレーボール'),     img: E('volleyball'),   cm: 21,  up: 120,  fl: [1, 5],    rooms: /体育館|屋上/,       hp: [3, 5],   atk: [1, 3],  ac: 8, agi: 12, exp: 4,  grp: [2, 4] },
  beam:     { name: L('平均台'),           img: E('balance_beam'), cm: 60,  up: 20,   fl: [1],       rooms: /体育館/,            hp: [12, 16], atk: [2, 6],  ac: 6, agi: 4,  exp: 14, grp: [1, 2] },
  vault:    { name: L('跳び箱'),           img: E('vaulting_box'), cm: 100, up: 15,   fl: [1, 2],    rooms: /体育館/,            hp: [16, 20], atk: [3, 6],  ac: 5, agi: 3,  exp: 18, grp: [1, 1] },
  bat:      { name: L('バット'),           img: E('bat'),          cm: 85,  up: 80,  fl: [4, 5],    rooms: /体育館|屋上/,       hp: [13, 17], atk: [4, 9],  ac: 6, agi: 11, exp: 25, grp: [1, 3] },
  kendo:    { name: L('竹刀と剣道着'),     img: E('kendo'),        cm: 172, up: 15,   fl: [3, 4, 5], rooms: /体育館|鐘楼/,       hp: [22, 28], atk: [4, 11], ac: 3, agi: 11, exp: 38, grp: [1, 2] },
  // ---- 理科室・化学室 ----
  flask:    { name: L('フラスコ'),         img: E('flask'),        cm: 30,  up: 110,  fl: [3],       rooms: /理科|化学/,         hp: [7, 10],  atk: [2, 5],  ac: 7, agi: 10, exp: 11, grp: [2, 3] },
  burner:   { name: L('アルコールランプ'), img: E('alcohol_lamp'), cm: 20,  up: 110,  fl: [3],       rooms: /理科|化学/,         hp: [9, 13],  atk: [4, 8],  ac: 6, agi: 9,  exp: 17, grp: [1, 3] },
  model:    { name: L('人体模型'),         img: E('anatomical_model'), cm: 165, up: 15, fl: [1, 2],  rooms: /理科/,               hp: [13, 17], atk: [2, 6],  ac: 6, agi: 6,  exp: 16, grp: [1, 2] },
  skel:     { name: L('骨格標本'),         img: E('skeleton'),     cm: 170, up: 15,   fl: [2, 3, 4], rooms: /理科|化学/,         hp: [15, 20], atk: [3, 8],  ac: 5, agi: 9,  exp: 22, grp: [1, 3] },
  // ---- 美術室 ----
  portrait: { name: L('音楽家の肖像画'),   img: E('portrait'),     cm: 110, up: 70,  fl: [2, 3],    rooms: /音楽|美術/,         hp: [12, 16], atk: [2, 9],  ac: 4, agi: 8,  exp: 22, grp: [1, 2] },
  david:    { name: L('ダビデ像'),         img: E('david'),        cm: 175, up: 10,   fl: [2, 3],    rooms: /美術/,              hp: [24, 30], atk: [3, 9],  ac: 3, agi: 4,  exp: 34, grp: [1, 1] },
  thinker:  { name: L('考える人'),         img: E('thinker'),      cm: 130, up: 10,   fl: [3, 4],    rooms: /美術/,              hp: [28, 34], atk: [4, 10], ac: 2, agi: 3,  exp: 40, grp: [1, 1] },
  // ---- 音楽室 ----
  recorder: { name: L('リコーダー'),       zoom: 3, img: E('recorder'),     cm: 35,  up: 110,  fl: [1, 2],    rooms: /音楽|組/,           hp: [4, 7],   atk: [1, 3],  ac: 7, agi: 12, exp: 6,  grp: [2, 4] },
  cymbal:   { name: L('シンバル'),         img: E('cymbals'),      cm: 40,  up: 120, fl: [2, 3],    rooms: /音楽/,              hp: [10, 14], atk: [2, 7],  ac: 5, agi: 9,  exp: 15, grp: [1, 2] },
  tuba:     { name: L('チューバ'),         img: E('tuba'),         cm: 100, up: 50,  fl: [2, 3],    rooms: /音楽/,              hp: [18, 24], atk: [3, 8],  ac: 4, agi: 4,  exp: 26, grp: [1, 2] },
  drums:    { name: L('ドラムセット'),     img: E('drums'),        cm: 110, up: 15,   fl: [3, 4],    rooms: /音楽/,              hp: [26, 32], atk: [3, 10], ac: 3, agi: 5,  exp: 38, grp: [1, 1] },
  piano:    { name: L('ピアノ'),           img: E('piano'),        cm: 130, up: 10,   fl: [4],       rooms: /音楽/,              hp: [36, 44], atk: [5, 12], ac: 2, agi: 2,  exp: 55, grp: [1, 1] },
  // ---- 技術室の工具 ----
  hammer:   { name: L('かなづち'),         zoom: 3, img: E('hammer'),       cm: 35,  up: 110,  fl: [3],       rooms: /技術/,              hp: [11, 15], atk: [4, 8],  ac: 5, agi: 8,  exp: 20, grp: [1, 3] },
  saw:      { name: L('のこぎり'),         img: E('saw'),          cm: 60,  up: 90,  fl: [3, 4],    rooms: /技術|家庭科/,       hp: [12, 16], atk: [4, 10], ac: 5, agi: 10, exp: 26, grp: [1, 2] },
  // ---- ラスボス：鐘の番人（鐘のそばに立ち、鐘を鳴らし続けている） ----
  bell:     { name: L('鐘の番人'),         img: E('time_warden_boss'), cm: 215, up: 10, fl: [], hp: [80, 80], atk: [5, 11], ac: 3, agi: 9, exp: 240, grp: [1, 1], boss: true },
};
// 敵の実際の大きさ：cm＝画像の縦の高さ、up＝床から浮いている高さ（cm）。人物の立ち絵と同じ縮尺で描く
const MON_SIZE = Object.fromEntries(Object.entries(MONS).map(([k, m]) => [k, { cm: m.cm, up: Array.isArray(m.up) ? (m.up[0] + m.up[1]) / 2 : m.up }]));
function encounterKind(fl, area) {
  const all = Object.keys(MONS).filter(k => !MONS[k].boss);
  const floor = all.filter(k => MONS[k].fl.includes(fl));
  const room = area ? all.filter(k => MONS[k].rooms && MONS[k].rooms.test(area.name) && Math.min(...MONS[k].fl) <= fl) : [];
  return pick(room.length && (Math.random() < 0.7 || !floor.length) ? room : floor.length ? floor : all);
}

// ---------------------------------------------------------------------
//  Utils
// ---------------------------------------------------------------------
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIR_NAME = [L('北'), L('東'), L('南'), L('西')];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SPD = 380;

let state, mode = 'explore', battle = null, menuOpts = [], dialogQ = null;

const START = [4, 2]; // A棟1F 保健室のベッドの脇
function newGame() {
  state = {
    fl: 1, x: START[0], y: START[1], dir: 2,
    party: [HERO()], flags: {}, items: [], history: [], time: 0,
    seen: Object.fromEntries(Object.keys(MAPS).map(k => [k, new Set()])),  // 見たマス
    seenE: Object.fromEntries(Object.keys(MAPS).map(k => [k, new Set()])), // 見た壁（辺）
    cool: 6, room: null,
  };
}

const itemAt = (fl, x, y) => ITEMS.find(it => it.fl === fl && it.x === x && it.y === y && !state.flags['got_' + it.id] && questVisible(it.quest) && (!it.cond || it.cond(state))) || null;
// 仲間になった人物や、まだ始まっていない話の人物は、その場にいない。
const npcVisible = n => !n.hide?.(state) && questVisible(n.quest);
function npcAt(fl, x, y) {
  return NPCS.find(n => n.fl === fl && n.x === x && n.y === y && npcVisible(n)) || null;
}
function roomHasPerson(fl, room) {
  return NPCS.some(n => n.fl === fl && !n.foe && !n.boss && roomAt(fl, n.x, n.y) === room && npcVisible(n));
}
const aliveParty = () => state.party.filter(c => c.hp > 0);

// ---------------------------------------------------------------------
//  Rendering: wireframe first-person view
// ---------------------------------------------------------------------
const cv = document.getElementById('view');
const g = cv.getContext('2d');
// 画面 640x470（16:10 から正方形へ約4割寄せ）。1マスの見た目は正方形（横縦比 1.0）
const VW = 640, VH = 470, CX = 320, CY = 235, FY = 235, FX = FY;
const DEPTH = 16, LAT = 6; // 見える奥行きと左右の範囲（体育館や屋上のような広い場所のため広め）

function P(lat, d, h) { d = Math.max(d, 0.08); return [CX + lat / d * FX, CY - h / d * FY]; }
function lerp2(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
// face from e1 (screen-left end) to e2 (screen-right end), each [lat, d]
function quad(e1, e2, u0, u1, h0, h1) {
  const a = lerp2(e1, e2, u0), b = lerp2(e1, e2, u1);
  return [P(a[0], a[1], h1), P(b[0], b[1], h1), P(b[0], b[1], h0), P(a[0], a[1], h0)];
}
function path(pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
function lineCol(d) { return `rgba(255,255,255,${clamp(1.08 - d / 6.5, 0.18, 1)})`; }

// --- 空と街並み：方位（東→西）で滑らかに変わるパノラマ ---
// 空は無限遠なので、画面の各列の色は「その列の視線の方位」だけで決まる。
// 西（夕日側）が最も明るく、東が最も暗い。間は連続的に補間する。
// 夜の手前：上は紺、下へ暗い紫、地平の際だけ暗い赤。きれいな時間はもう過ぎた、少し不安な明るさ（オレンジは使わない）
const SKY_EAST = [[0, '#070b1c'], [0.4, '#0b0e24'], [0.68, '#140f27'], [0.86, '#1c0e24'], [1, '#26101e']];
const SKY_WEST = [[0, '#0b1430'], [0.4, '#181842'], [0.68, '#2a1a42'], [0.86, '#421a36'], [1, '#621c28']];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixCol = (a, b, t) => { const A = hex(a), B = hex(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };
// 方位 az（度, 北=0 東=90 南=180 西=270）→ 西らしさ 0..1
// 東西の差は控えめに：0..1 の範囲を中間(0.5)へ6割寄せる（東 0.3 〜 西 0.7）
const westness = az => 0.4 * Math.pow((1 + Math.cos((az - 270) * Math.PI / 180)) / 2, 1.6) + 0.6 * 0.5;
const colAzimuth = (dir, x) => dir * 90 + Math.atan((x - CX) / FX) * 180 / Math.PI;
const azToX = (dir, az) => { const r = ((az - dir * 90) % 360 + 540) % 360 - 180; if (Math.abs(r) > 80) return null; return CX + Math.tan(r * Math.PI / 180) * FX; };

function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// 360°分の建物（単位：度）。空に星は描かない。画面中央付近で 1度 ≒ FX*π/180 px
const PX_PER_DEG = FX * Math.PI / 180;
const PANO = (() => {
  const R = seeded(4242), far = [], near = [];
  for (let i = 0; i < 420; i++) R(); // 以前ここで星を作っていた分の乱数を空読みして、街並みの形を変えない
  // 遠景：横長が基本、ごくたまに小さな縦長
  for (let az = 0; az < 360;) {
    let w, h;
    if (R() < 0.06) { w = 3 + R() * 3; h = 10 + R() * 9; } else { w = 6 + R() * 16; h = 3 + R() * 7; }
    w /= PX_PER_DEG; h *= 0.5 + 1.1 * (0.5 + 0.5 * Math.sin(az * 4 * Math.PI / 180 + 1.3)); far.push({ az, w, h }); az += w;
  }
  // 近景：まばらに少し大きめの横長（屋上の塔屋つき）
  for (let az = R() * 15; az < 360;) {
    const w = (16 + R() * 30) / PX_PER_DEG, h = 10 + R() * 12;
    near.push({ az, w, h, roof: R() < 0.5 ? { o: R() * (w - 12 / PX_PER_DEG), w: (6 + R() * 6) / PX_PER_DEG } : null });
    az += w + (R() < 0.4 ? R() * 6 : 20 + R() * 90) / PX_PER_DEG;
  }
  // 遠くの山並み（方位の関数）：いくつかの正弦波の和。0 未満は地平線に沈む
  const waves = Array.from({ length: 7 }, (_, i) => ({ k: [3, 5, 8, 13, 21, 34, 55][i], a: [7, 6, 5, 3.5, 2.5, 1.5, 0.8][i], p: R() * Math.PI * 2 }));
  const ridge = az => Math.max(0, 13 + waves.reduce((v, w) => v + w.a * (1 - 2 * Math.abs(Math.sin(w.k * (az + 60) * Math.PI / 360 + w.p))), 0));
  return { far, near, ridge };
})();

const skyCanvases = {}, townCanvases = {};
function buildSky(dir) {
  const c = document.createElement('canvas'); c.width = VW; c.height = VH;
  let x = c.getContext('2d');
  const STRIP = 4;
  for (let sx = 0; sx < VW; sx += STRIP) {
    const t = westness(colAzimuth(dir, sx + STRIP / 2));
    const gr = x.createLinearGradient(0, 0, 0, CY + 4);
    SKY_EAST.forEach(([o, col], i) => gr.addColorStop(o, mixCol(col, SKY_WEST[i][1], t)));
    x.fillStyle = gr; x.fillRect(sx, 0, STRIP, CY + 4);
  }
  skyCanvases[dir] = c;

  const c2 = document.createElement('canvas'); c2.width = VW; c2.height = VH;
  x = c2.getContext('2d');
  const rect = (az, w, top, bottom) => {
    const x0 = azToX(dir, az), x1 = azToX(dir, az + w);
    if (x0 === null || x1 === null || x1 < x0) return;
    x.fillRect(x0, top, x1 - x0 + 0.5, bottom - top);
  };
  x.fillStyle = '#2a0e16';
  x.beginPath(); x.moveTo(0, CY + 1);
  for (let sx = 0; sx <= VW; sx += 2) x.lineTo(sx, CY - PANO.ridge(colAzimuth(dir, sx)));
  x.lineTo(VW, CY + 1); x.closePath(); x.fill();
  x.fillStyle = '#1a0a10';
  for (const bl of PANO.far) rect(bl.az, bl.w, CY - bl.h, CY + 1);
  x.fillStyle = '#050307';
  x.fillRect(0, CY, VW, VH - CY);
  for (const bl of PANO.near) {
    rect(bl.az, bl.w, CY - bl.h, CY + 1);
    if (bl.roof) rect(bl.az + bl.roof.o, bl.roof.w, CY - bl.h - 3, CY - bl.h);
  }
  townCanvases[dir] = c2;
}
[0, 1, 2, 3].forEach(buildSky);

function drawWindow(e1, e2, d, curtain) {
  const q = quad(e1, e2, 0.1, 0.9, -0.12, 0.4);
  if (curtain != null) {
    // 閉じたカーテン：枠の中は黒、下から伸びる高さの違う縦線（ひだ）
    g.strokeStyle = lineCol(d); g.lineWidth = 1.5;
    path(q); g.stroke();
    // ひだ5本：どの窓も同じパターン。pos＝窓の幅に対する位置（両端から離し、間隔を少しばらつかせる）、ht＝高さ
    const DRAPE = [{ pos: 0.18, ht: 0.62 }, { pos: 0.35, ht: 0.7 }, { pos: 0.5, ht: 0.45 }, { pos: 0.67, ht: 0.53 }, { pos: 0.82, ht: 0.74 }];
    g.lineWidth = 1;
    for (const { pos, ht } of DRAPE) {
      const u = 0.1 + 0.8 * pos;
      const a = quad(e1, e2, u, u, -0.12, -0.12 + 0.52 * ht);
      g.beginPath(); g.moveTo(...a[3]); g.lineTo(...a[0]); g.stroke();
    }
    return;
  }
  // 窓の奥（外の校舎の影など）は、遠い順に描く仕組みですでに描かれている。
  // まだ何も無い（透明な）所にだけ、空と街並みを後ろから敷く（destination-over）
  g.save(); path(q); g.clip(); g.globalCompositeOperation = 'destination-over';
  // 空は無限遠：窓の向きではなく、プレイヤーの視線方向のパノラマを使う
  g.drawImage(townCanvases[state.dir], 0, 0);
  g.drawImage(skyCanvases[state.dir], 0, 0);
  g.restore();
  g.strokeStyle = lineCol(d); g.lineWidth = 1.5;
  path(q); g.stroke();
  // 外枠＋中央の縦桟1本（引き違い窓）
  const m2 = quad(e1, e2, 0.5, 0.5, -0.12, 0.4); g.beginPath(); g.moveTo(...m2[0]); g.lineTo(...m2[3]); g.stroke();
}
function drawDoor(e1, e2, d) {
  g.strokeStyle = lineCol(d); g.lineWidth = 1.5;
  path(quad(e1, e2, 0.22, 0.78, -0.5, 0.3)); g.stroke();
  path(quad(e1, e2, 0.3, 0.7, 0.05, 0.22)); g.stroke();          // glass slot
  path(quad(e1, e2, 0.36, 0.64, 0.34, 0.42)); g.stroke();        // name plate
  const k = quad(e1, e2, 0.68, 0.7, -0.08, -0.04); path(k); g.stroke(); // handle
}
// 昇降口のガラス扉：床から天井近くまでのガラス。隣のマスの扉とつながって 1 枚の大きな扉の並びに見える
//   1 マスに両開きの扉 1 組（真ん中に縦の框）。腰の高さに押し手の横棒、上に欄間の横桟。ガラス越しに外が見える
const GD = { u0: 0, u1: 1, h0: -0.47, h1: 0.44 }; // 横は面いっぱい（隣のマスの扉と枠を共有してつながる）
function drawGlassDoor(e1, e2, d) {
  const q = quad(e1, e2, GD.u0, GD.u1, GD.h0, GD.h1);
  g.save(); path(q); g.clip(); g.globalCompositeOperation = 'destination-over';
  g.drawImage(townCanvases[state.dir], 0, 0); g.drawImage(skyCanvases[state.dir], 0, 0);
  g.restore();
  g.strokeStyle = lineCol(d); g.lineWidth = 1.5;
  const ln = (u0, h0, u1, h1) => { const a = quad(e1, e2, u0, u1, h0, h1); g.beginPath(); g.moveTo(...a[3]); g.lineTo(...a[1]); g.stroke(); };
  path(q); g.stroke();                       // 枠
  ln(0.5, GD.h0, 0.5, 0.3);                  // 両開きの合わせ目
  ln(GD.u0, 0.3, GD.u1, 0.3);                // 欄間との境
  g.lineWidth = 1;
  ln(0.12, -0.08, 0.42, -0.08); ln(0.58, -0.08, 0.88, -0.08); // 押し手の横棒
  ln(GD.u0, -0.38, GD.u1, -0.38);            // 下の蹴板
}
// edgeL / edgeR：画面上で左右の縦線を描くか（同一平面で壁が続く場合は描かない）
function drawFence(e1, e2, d, edgeL, edgeR) {
  // 高さ 1.2m 相当（h -0.5 〜 0.02）。上下の横木と細い縦桟、端には太めの支柱
  g.strokeStyle = lineCol(d); g.lineWidth = 1.2;
  const ln = (u0, h0, u1, h1) => { const a = quad(e1, e2, u0, u1, h0, h1); g.beginPath(); g.moveTo(...a[3]); g.lineTo(...a[1]); g.stroke(); };
  ln(0, 0.02, 1, 0.02); ln(0, -0.04, 1, -0.04); ln(0, -0.46, 1, -0.46);
  for (let i = 1; i < 8; i++) ln(i / 8, -0.46, i / 8, -0.04);
  g.lineWidth = 2;
  if (edgeL) ln(0, -0.5, 0, 0.02);
  if (edgeR) ln(1, -0.5, 1, 0.02);
}
// 壁に貼る飾り：quad の (u, h) で長方形を並べるだけ
function drawDeco(e1, e2, d, type, edgeL, edgeR, top = 0.5) {
  g.strokeStyle = lineCol(d); g.lineWidth = 1.2;
  const box = (u0, u1, h0, h1) => { path(quad(e1, e2, u0, u1, h0, h1)); g.stroke(); };
  const ln = (u0, h0, u1, h1) => { const a = quad(e1, e2, u0, u1, h0, h1); g.beginPath(); g.moveTo(...a[3]); g.lineTo(...a[1]); g.stroke(); };
  if (type === 'hiwin') {
    const h0 = top - 0.75, h1 = top - 0.2, q = quad(e1, e2, 0.08, 0.92, h0, h1);
    g.save(); path(q); g.clip(); g.drawImage(skyCanvases[state.dir], 0, 0); g.drawImage(townCanvases[state.dir], 0, 0); g.restore();
    g.strokeStyle = lineCol(d); g.lineWidth = 1.2; path(q); g.stroke();
    ln(0.5, h0, 0.5, h1);
    return;
  }
  if (type === 'board') { // 黒板：壁いっぱいに続く。端の面だけ縦の枠
    const u0 = edgeL ? 0.08 : 0, u1 = edgeR ? 0.92 : 1;
    ln(u0, 0.3, u1, 0.3); ln(u0, -0.1, u1, -0.1); ln(u0, -0.13, u1, -0.13); // 上枠・下枠・チョーク受け
    if (edgeL) ln(u0, -0.13, u0, 0.3);
    if (edgeR) ln(u1, -0.13, u1, 0.3);
  } else if (type === 'bulletin') { // 掲示板：枠と、貼られた紙
    box(0.1, 0.9, -0.05, 0.3);
    box(0.16, 0.36, 0.08, 0.25); box(0.42, 0.58, 0.02, 0.26); box(0.64, 0.84, 0.1, 0.24); box(0.66, 0.8, -0.01, 0.07);
  } else if (type === 'poster') {
    box(0.36, 0.64, -0.02, 0.26); ln(0.4, 0.2, 0.6, 0.2); ln(0.4, 0.16, 0.56, 0.16);
  } else if (type === 'posters') {
    box(0.18, 0.4, 0.0, 0.24); box(0.56, 0.8, 0.04, 0.22);
  } else if (type === 'hydrant') { // 消火栓の箱
    box(0.3, 0.7, -0.42, -0.02); box(0.36, 0.64, -0.36, -0.16); ln(0.36, -0.08, 0.64, -0.08);
  } else if (type === 'safe') { // 金庫：床に置いた箱と、丸くない（四角い）ダイヤル
    box(0.28, 0.72, -0.5, -0.02); box(0.42, 0.58, -0.32, -0.16); ln(0.5, -0.24, 0.5, -0.18); ln(0.64, -0.3, 0.64, -0.18);
  } else if (type === 'clock7') { // 7時を指す時計（ここだけ）
    box(0.43, 0.57, 0.3, 0.44); ln(0.5, 0.37, 0.5, 0.425); ln(0.5, 0.37, 0.48, 0.335);
  } else if (type === 'clock') { // 四角い時計
    box(0.43, 0.57, 0.3, 0.44); ln(0.5, 0.37, 0.5, 0.425); ln(0.5, 0.37, 0.52, 0.335); // 5時：長い針は12、短い針は5の方向
  } else if (type === 'hoop') { // バスケットゴール：板と、その下のリング（四角）。床から約 3m
    const b = top > 0.5 ? 0.62 : 0.12;
    box(0.3, 0.7, b, b + 0.3); box(0.42, 0.58, b + 0.06, b + 0.18); box(0.44, 0.56, b - 0.04, b);
  } else if (type === 'mirror') {
    box(0.18, 0.82, -0.05, 0.32); ln(0.3, 0.05, 0.42, 0.22); ln(0.36, 0.02, 0.5, 0.22);
  }
}
// ext：外（校舎の外の何もない所）から見た面。窓の外に見える別の棟の外壁で、黒い影として塗るだけ（線も窓も描かない）
function drawFace(e1, e2, kind, d, edgeL = true, edgeR = true, curtain = null, deco = null, top = 0.5, ext = false) {
  if (ext) { if (kind !== FENCE) { path(quad(e1, e2, 0, 1, -0.5, top)); g.fillStyle = '#000'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke(); g.lineJoin = 'miter'; } return; } // 縁を太めに黒でなぞり、奥の線がちょうど境目に重なっても透けないように
  if (kind === FENCE) { drawFence(e1, e2, d, edgeL, edgeR); return; }
  const q = quad(e1, e2, 0, 1, -0.5, top);
  // 黒で塗り＋左右の縦の辺も黒でなぞる（隣の面との継ぎ目から奥の線が透けないように）
  // カーテンの無い窓は、ガラスの所をくり抜いて塗る（奥が見えるように）
  g.beginPath(); g.moveTo(...q[0]); for (const p of q.slice(1)) g.lineTo(...p); g.closePath();
  if (kind === DOOR && deco === 'glassdoor') { const w = quad(e1, e2, GD.u0, GD.u1, GD.h0, GD.h1); g.moveTo(...w[0]); for (const p of w.slice(1)) g.lineTo(...p); g.closePath(); }
  if (kind === WIN && curtain == null) { const w = quad(e1, e2, 0.1, 0.9, -0.12, 0.4); g.moveTo(...w[0]); for (const p of w.slice(1)) g.lineTo(...p); g.closePath(); }
  g.fillStyle = '#000'; g.fill('evenodd'); g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(...q[0]); g.lineTo(...q[3]); g.moveTo(...q[1]); g.lineTo(...q[2]); g.stroke(); // 縦の継ぎ目だけ
  g.strokeStyle = lineCol(d); g.lineWidth = 1.5;
  // 端を少し延ばして（square）、隣の面の黒い縦なぞりで天井際・床際の線が途切れないように
  const seg = (a, b) => { g.lineCap = 'square'; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); g.lineCap = 'butt'; };
  seg(q[0], q[1]); seg(q[3], q[2]);           // 天井際・床際
  if (edgeL) seg(q[0], q[3]);
  if (edgeR) seg(q[1], q[2]);
  if (kind === WIN) drawWindow(e1, e2, d, curtain);
  else if (kind === DOOR) deco === 'glassdoor' ? drawGlassDoor(e1, e2, d) : drawDoor(e1, e2, d);
  else if (deco) drawDeco(e1, e2, d, deco, edgeL, edgeR, top);
}
// 階段（ソリッド）。局所座標 u：進む方向 0..2（2マス）、v：横 -A..A、h：高さ
// 上り：床 -0.5 から天井 +0.5 へ。下り：床 -0.5 から下の階の床 -1.5 へ（床に開いた吹き抜け）
const STEPS = 7, STAIR_A = 0.5;
function drawStairSolid(st) {
  const [sx, sy] = DIRS[st.dir], [tx, ty] = DIRS[(st.dir + 1) % 4];
  const ox = st.x - sx * 0.5 - state.x, oy = st.y - sy * 0.5 - state.y; // 手前の辺の中心（自分からの相対）
  if (ox * sx + oy * sy <= 0) return; // 外側から階段の側壁や奥の壁を透かさない
  const [fx, fy] = DIRS[state.dir], [rx, ry] = DIRS[(state.dir + 1) % 4];
  // 局所 (u,v,h) → 視点座標 [横, 奥行, 高さ]
  const V = (u, v, h) => { const wx = ox + sx * u + tx * v, wy = oy + sy * u + ty * v; return [wx * rx + wy * ry, wx * fx + wy * fy, h]; };
  const N = (nu, nv, nh) => { const wx = sx * nu + tx * nv, wy = sy * nu + ty * nv; return [wx * rx + wy * ry, wx * fx + wy * fy, nh]; };
  // 視点より後ろにかかる面を切ってから投影する。
  const near = 0.08;
  const project = points => {
    const projected = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if (a[1] >= near) projected.push(P(...a));
      if ((a[1] >= near) !== (b[1] >= near)) {
        const t = (near - a[1]) / (b[1] - a[1]);
        projected.push(P(a[0] + (b[0] - a[0]) * t, near, a[2] + (b[2] - a[2]) * t));
      }
    }
    return projected;
  };
  const opening = project([[0, -0.5, -0.5], [0, 0.5, -0.5], [0, 0.5, 0.5], [0, -0.5, 0.5]].map(q => V(...q)));
  if (opening.length < 3) return;
  const hole = st.up ? null : project([[0, -0.5], [2, -0.5], [2, 0.5], [0, 0.5]].map(([u, v]) => V(u, v, -0.5)));
  if (hole && hole.length < 3) return;
  const surface = (pts, n) => {
    const p = pts.map(q => V(...q)), nn = N(...n), c = p[0];
    if (nn[0] * -c[0] + nn[1] * -c[1] + nn[2] * -c[2] <= 1e-6) return;
    const face = project(p);
    if (face.length < 3) return;
    path(face); g.fill(); g.stroke();
  };
  g.save();
  path(opening); g.clip();
  g.lineJoin = 'bevel'; g.lineWidth = 1.5; g.fillStyle = '#000'; g.strokeStyle = '#fff';
  const A = STAIR_A, stepDepth = 2 / STEPS, floor = -0.5;
  const height = step => floor + (st.up ? step : -step) / STEPS;
  const profile = [];
  for (let k = 0; k < STEPS; k++) {
    profile.push([k * stepDepth, height(k + 1)], [(k + 1) * stepDepth, height(k + 1)]);
  }
  // 壁に接する奥と側面を先に描き、その上に入口から見える段を重ねる。
  if (hole) {
    path(hole); g.fill(); g.clip();
    surface([[2, -A, floor], [2, A, floor], [2, A, height(STEPS)], [2, -A, height(STEPS)]], [-1, 0, 0]);
    const side = [[0, floor], ...profile, [2, floor]];
    surface(side.map(([u, h]) => [u, -A, h]), [0, 1, 0]);
    surface(side.map(([u, h]) => [u, A, h]), [0, -1, 0]);
  }
  // 入口からは奥の段ほど先。各段は奥行きのある踏み板、手前の蹴込みの順。
  for (let k = STEPS - 1; k >= 0; k--) {
    const u0 = k * stepDepth, u1 = (k + 1) * stepDepth, h = height(k + 1);
    surface([[u0, -A, h], [u0, A, h], [u1, A, h], [u1, -A, h]], [0, 0, 1]);
    if (st.up) surface([[u0, -A, height(k)], [u0, A, height(k)], [u0, A, h], [u0, -A, h]], [-1, 0, 0]);
  }
  // 上り階段：天井に開いた穴（枠だけ）。マス2つ分の幅・長さ、天井の高さ h=+0.5
  if (st.up) {
    const c = [[0, -0.5], [2, -0.5], [2, 0.5], [0, 0.5]].map(([u, v]) => V(u, v, 0.5));
    g.strokeStyle = lineCol(Math.max(0.5, Math.min(...c.map(q => q[1])))); g.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      if (a[1] < near || b[1] < near) continue; // 自分より後ろにかかる辺は描かない
      g.beginPath(); g.moveTo(...P(...a)); g.lineTo(...P(...b)); g.stroke();
    }
  }
  g.restore();
}
// --- 家具：マス中心 (l,f)。寸法はワールド座標（hx 東西・hy 南北の半分）で、向きに合わせて回す ---
// 1 = 約 230cm（天井高）。床 h=-0.5
const FURN = {
  bed: { hx: 0.26, hy: 0.39, top: -0.5 + 0.22 },  // 幅120×長さ180×高さ50cm（横縦比 2:3）、頭は北
  desk: { hx: 0.14, hy: 0.1, top: -0.5 + 0.31 },  // 天板65×45cm、高さ72cm
};
function viewHalf(kind) {
  const p = FURN[kind], sideways = DIRS[state.dir][0] !== 0; // 東西を向いていると南北の長さが横幅になる
  return sideways ? [p.hy, p.hx] : [p.hx, p.hy]; // [横, 奥行]
}
// ベッド・机：天板（板1枚）と、四隅から床へ下ろす直線の脚4本
// 天板の角は lineJoin='bevel' にして、鋭角の角が尖って脚の位置からはみ出さないようにする
// 直方体の備品：見えている面だけ黒で塗って白線、面ごとに直線の模様
const BOX = {
  getabako: { hx: 0.45, hy: 0.2, h: 0.78 },  // 下駄箱：横長の棚、小さな仕切りが並ぶ
  getabako_ns: { hx: 0.2, hy: 0.45, h: 0.78 }, // 南北に長い下駄箱
  stall: { hx: 0.45, hy: 0.45, h: 0.86 },    // トイレの個室
  sink: { hx: 0.4, hy: 0.2, h: 0.36 },       // 洗面台
  stage: { hx: 0.5, hy: 0.5, h: 0.26 },      // 体育館のステージ
  tank: { hx: 0.5, hy: 0.5, h: 0.95 },       // 屋上の給水タンク
  unit: { hx: 0.32, hy: 0.22, h: 0.32 },     // 室外機
};
function drawBox(prop, l, f) {
  const [kind, door] = prop.split(':'), p = BOX[kind]; if (!p) return;
  const sideways = DIRS[state.dir][0] !== 0, a = sideways ? p.hy : p.hx, b = sideways ? p.hx : p.hy;
  const x0 = l - a, x1 = l + a, d0 = f - b, d1 = f + b, h0 = -0.5, h1 = -0.5 + p.h;
  g.strokeStyle = lineCol(f); g.lineWidth = 1.5; g.fillStyle = '#000'; g.lineJoin = 'bevel';
  const faces = []; // [端1, 端2, その面が向いている方角]
  if (x0 > 0) faces.push([[x0, d1], [x0, d0], (state.dir + 3) % 4]);
  if (x1 < 0) faces.push([[x1, d0], [x1, d1], (state.dir + 1) % 4]);
  if (d0 > 0.1) faces.push([[x0, d0], [x1, d0], (state.dir + 2) % 4]);
  for (const [e1, e2, fd] of faces) {
    path(quad(e1, e2, 0, 1, h0, h1)); g.fill(); g.stroke();
    const w = Math.hypot(e2[0] - e1[0], e2[1] - e1[1]);
    const ln = (u0, hh0, u1, hh1) => { const q = quad(e1, e2, u0, u1, hh0, hh1); g.beginPath(); g.moveTo(...q[3]); g.lineTo(...q[1]); g.stroke(); };
    const rect = (u0, u1, hh0, hh1) => { path(quad(e1, e2, u0, u1, hh0, hh1)); g.stroke(); };
    g.lineWidth = 1;
    if (kind.startsWith('getabako')) { const n = Math.max(2, Math.round(w / 0.15)); for (let i = 1; i < n; i++) ln(i / n, h0, i / n, h1); for (const t of [0.25, 0.5, 0.75]) ln(0, h0 + p.h * t, 1, h0 + p.h * t); }
    else if (kind === 'stall' && (door == null || +door === fd)) { rect(0.18, 0.82, h0 + 0.04, h1 - 0.04); ln(0.72, h0 + 0.4, 0.76, h0 + 0.4); }
    else if (kind === 'stage') { ln(0, h1 - 0.05, 1, h1 - 0.05); }
    else if (kind === 'tank') { for (const t of [0.3, 0.6, 0.85]) ln(0, h0 + p.h * t, 1, h0 + p.h * t); rect(0.4, 0.6, h1 - 0.25, h1 - 0.05); }
    else if (kind === 'unit') { rect(0.1, 0.6, h0 + 0.05, h1 - 0.05); for (const t of [0.3, 0.5, 0.7]) ln(0.1, h0 + p.h * t, 0.6, h0 + p.h * t); }
    else if (kind === 'sink') { ln(0, h1 - 0.06, 1, h1 - 0.06); }
    g.lineWidth = 1.5;
  }
  if (h1 < 0) { // 上面
    path([P(x0, d0, h1), P(x1, d0, h1), P(x1, d1, h1), P(x0, d1, h1)]); g.fill(); g.stroke();
    if (kind === 'sink') { const ia = a * 0.55, ib = b * 0.55; path([P(l - ia, f - ib, h1), P(l + ia, f - ib, h1), P(l + ia, f + ib, h1), P(l - ia, f + ib, h1)]); g.stroke(); }
  }
  g.lineJoin = 'miter';
}
// プール：床に開いた水槽。水面（h -0.78）と、見える内壁。コースロープは南北に直線
function drawPool(X, Y, WP, wline, f) {
  const H = -0.78, isP = (x, y) => propAt(state.fl, x, y) === 'pool';
  const col = lineCol(f);
  const corners = [[X - 0.5, Y - 0.5], [X + 0.5, Y - 0.5], [X + 0.5, Y + 0.5], [X - 0.5, Y + 0.5]];
  // 水槽は床の開口部の中だけに描く（手前の柵や壁の下からはみ出さないように）
  const open = corners.map(([x, y]) => WP(x, y, -0.5)), clip = open.every(Boolean);
  if (clip) { g.save(); path(open); g.clip(); }
  const water = corners.map(([x, y]) => WP(x, y, H));
  if (water.every(Boolean)) { path(water); g.fillStyle = '#000'; g.fill(); }
  // 内壁：隣がプールでない辺。視点の側を向いていれば描く（壁の内側の法線と視線で判定）
  const sides = [[0, -1, 0, 1], [1, 0, 1, 2], [0, 1, 2, 3], [-1, 0, 3, 0]]; // dx,dy,角i,角j
  for (const [dx, dy, i, j] of sides) {
    if (isP(X + dx, Y + dy)) continue;
    const [ax, ay] = corners[i], [bx, by] = corners[j];
    // 内側を向く法線は (-dx,-dy)。視点が内側の向きにあれば見える
    const vx = state.x - (ax + bx) / 2, vy = state.y - (ay + by) / 2;
    if (-dx * vx + -dy * vy > 0) {
      const q = [WP(ax, ay, -0.5), WP(bx, by, -0.5), WP(bx, by, H), WP(ax, ay, H)];
      if (q.every(Boolean)) { path(q); g.fillStyle = '#000'; g.fill(); g.strokeStyle = col; g.lineWidth = 1.2; g.stroke(); }
    } else wline(ax, ay, bx, by, -0.5, col); // 縁
    wline(ax, ay, bx, by, H, col);
  }
  // コースロープ（各マスの西の境、隣もプールなら）
  if (isP(X - 1, Y)) wline(X - 0.5, Y - 0.5, X - 0.5, Y + 0.5, H + 0.01, 'rgba(255,255,255,0.45)');
  if (clip) g.restore();
}
function drawTable(kind, l, f) {
  const [a, b] = viewHalf(kind), top = FURN[kind].top;
  const x0 = l - a, x1 = l + a, d0 = f - b, d1 = f + b;
  g.strokeStyle = lineCol(f); g.lineWidth = 1.5; g.fillStyle = '#000'; g.lineJoin = 'bevel';
  for (const [x, d] of [[x0, d1], [x1, d1], [x0, d0], [x1, d0]]) { g.beginPath(); g.moveTo(...P(x, d, top)); g.lineTo(...P(x, d, -0.5)); g.stroke(); }
  path([P(x0, d0, top), P(x1, d0, top), P(x1, d1, top), P(x0, d1, top)]); g.fill(); g.stroke();
  g.lineJoin = 'miter';
}
// 落とし物：画像があれば床に置いた絵（幅 w は実物より少し大きめ）、なければ小さな箱
function drawItem(l, f, it) {
  const im = ITEM_IMG[it.id] && getImage(ITEM_IMG[it.id].src);
  if (im) {
    const w = ITEM_IMG[it.id].w, h = w * im.naturalHeight / im.naturalWidth;
    const a = P(l - w / 2, f, -0.5 + h), b = P(l + w / 2, f, -0.5);
    g.imageSmoothingEnabled = false; g.drawImage(im, a[0], a[1], b[0] - a[0], b[1] - a[1]);
    return;
  }
  const a = 0.1, h0 = -0.5, h1 = -0.42;
  g.strokeStyle = lineCol(f); g.fillStyle = '#000'; g.lineWidth = 1.5;
  path([P(l - a, f - a, h1), P(l + a, f - a, h1), P(l + a, f + a, h1), P(l - a, f + a, h1)]); g.fill(); g.stroke();
  path([P(l - a, f - a, h1), P(l + a, f - a, h1), P(l + a, f - a, h0), P(l - a, f - a, h0)]); g.fill(); g.stroke();
}
function drawHanging(l, f, dc) {
  const im = getImage(dc.img); if (!im) return;
  const h = dc.w * im.naturalHeight / im.naturalWidth;
  const a = P(l - dc.w / 2, f, 0.5), b = P(l + dc.w / 2, f, 0.5 - h);
  g.imageSmoothingEnabled = false; g.drawImage(im, a[0], a[1], b[0] - a[0], b[1] - a[1]);
}
function drawPerson(l, f, col) {
  g.strokeStyle = col; g.fillStyle = '#000'; g.lineWidth = Math.max(1, 2.2 / f);
  const line = (a, b) => { g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); };
  line(P(l - 0.05, f, -0.2), P(l - 0.07, f, -0.5)); line(P(l + 0.05, f, -0.2), P(l + 0.07, f, -0.5));
  path([P(l - 0.13, f, 0.08), P(l + 0.13, f, 0.08), P(l + 0.1, f, -0.22), P(l - 0.1, f, -0.22)]); g.fill(); g.stroke();
  line(P(l - 0.13, f, 0.07), P(l - 0.17, f, -0.18)); line(P(l + 0.13, f, 0.07), P(l + 0.17, f, -0.18));
  const hc = P(l, f, 0.18); g.beginPath(); g.arc(hc[0], hc[1], 0.08 / f * FX * 0.9, 0, Math.PI * 2); g.fill(); g.stroke();
}
// --- キャラ画像（ドット絵）：透過PNG、黒塗り＋白線。読み込み完了で再描画 ---
const IMAGES = {};
function getImage(src) {
  if (!IMAGES[src]) {
    const im = new Image();
    im.onload = () => { if (state) render(); };
    im.src = src; IMAGES[src] = im;
  }
  const im = IMAGES[src];
  return im.complete && im.naturalWidth ? im : null;
}
// 床に立つ立ち絵（足元 h=-0.5）。画像の縦＝身長 ht(cm)。保健の先生 158cm が 0.688（1マス=1.0）になる縮尺
const CM = 0.86 * 0.8 / 158;
function drawSprite(l, f, im, ht = 158) {
  const top = P(l, f, -0.5 + ht * CM), bot = P(l, f, -0.5);
  const h = bot[1] - top[1], w = h * im.naturalWidth / im.naturalHeight;
  g.imageSmoothingEnabled = false;
  g.drawImage(im, top[0] - w / 2, top[1], w, h);
}
function drawBellIcon(l, f) {
  g.strokeStyle = '#fff'; g.fillStyle = '#000'; g.lineWidth = Math.max(1, 2.5 / f);
  const pts = [P(l - 0.08, f, 0.3), P(l + 0.08, f, 0.3), P(l + 0.14, f, 0.0), P(l + 0.22, f, -0.12), P(l - 0.22, f, -0.12), P(l - 0.14, f, 0.0)];
  path(pts); g.fill(); g.stroke();
  const a = P(l, f, 0.3), b = P(l, f, 0.5); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
}

const TALK_DIST = 0.42; // 会話中に相手を表示する距離（隣のマスは 1.0）
function drawNpc(n, l, f) {
  const im = n.img && getImage(n.img);
  if (im) drawSprite(l, f, im, n.ht); else if (n.boss) drawBellIcon(l, f); else drawPerson(l, f, '#fff');
}
// 校舎の影：上下 2 階までの棟と、同じ階でも視界の範囲（DEPTH・LAT）の外にある棟を、
// マスごとの箱（床から天井まで）として黒く塗る。窓の外に、実際の位置どおりの影が見える。
// 線も窓も描かない（距離が近くても影だけ）。上下の階は 1 階ぶんの高さ（1）ずつずらす
const SIL_RANGE = 26, SIL_FLOORS = 2;
function convexHull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function drawSilhouettes(fx, fy, rx, ry) {
  g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineWidth = 1.2; g.lineJoin = 'round';
  for (const key of Object.keys(MAPS)) {
    const fl = +key, dz = fl - state.fl;
    if (Math.abs(dz) > SIL_FLOORS) continue;
    const F = MAPS[fl];
    for (let y = 0; y < F.H; y++) for (let x = 0; x < F.W; x++) {
      const a = F.grid[y][x]; if (!a) continue;
      const dx = x - state.x, dy = y - state.y;
      if (Math.abs(dx) + Math.abs(dy) > SIL_RANGE) continue;
      const dep = dx * fx + dy * fy, lat = dx * rx + dy * ry;
      if (dep + 0.5 < 0.1) continue; // 後ろ
      if (dz === 0 && dep >= 0 && dep <= DEPTH && Math.abs(lat) <= LAT) continue; // 同じ階の視界の範囲内は、ふつうの描画にまかせる
      const d0 = Math.max(0.1, dep - 0.5), d1 = dep + 0.5, h0 = -0.5 + dz, h1 = (dz === 0 && a.ceil ? a.ceil : 0.5) + dz; // 上下の階は天井の高さ 1 で切る（体育館が上の階に突き抜けないように）
      const pts = [];
      for (const L of [lat - 0.5, lat + 0.5]) for (const D of [d0, d1]) for (const H of [h0, h1]) pts.push(P(L, D, H));
      path(convexHull(pts)); g.fill(); g.stroke(); // 縁も黒でなぞって、隣の影とのすき間から空が透けないように
    }
  }
}
function renderView() {
  // 描画は 640x470 の論理座標。キャンバス実寸（1.3倍）に合わせて拡大し、線をくっきり保つ
  g.setTransform(cv.width / VW, 0, 0, cv.height / VH, 0, 0);
  // 透明から描き始め、最後に何も描かれなかった所を黒で埋める（窓の奥に空を敷けるように）
  g.clearRect(0, 0, VW, VH);
  const dir = state.dir, [fx, fy] = DIRS[dir], [rx, ry] = DIRS[(dir + 1) % 4];
  const here = areaAt(state.fl, state.x, state.y);
  // 1) 校舎の影：上下の階の棟と、視界の範囲より外にある同じ階の棟を、黒い箱の影として先に描く
  drawSilhouettes(fx, fy, rx, ry);
  // 2) 自分のいる階の床と天井を黒で塗る（外の影が床・天井ごしに透けないように）。屋外は床だけ
  for (let f = 0; f <= DEPTH; f++) for (let l = -LAT; l <= LAT; l++) {
    const x = state.x + fx * f + rx * l, y = state.y + fy * f + ry * l, a = areaAt(state.fl, x, y);
    if (!a) continue;
    const d0 = Math.max(0.1, f - 0.5), d1 = f + 0.5, top = here && here.ceil && a === here ? here.ceil : 0.5;
    g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineWidth = 1.2;
    path([P(l - 0.5, d0, -0.5), P(l + 0.5, d0, -0.5), P(l + 0.5, d1, -0.5), P(l - 0.5, d1, -0.5)]); g.fill(); g.stroke();
    if (!a.outdoor) { path([P(l - 0.5, d0, top), P(l + 0.5, d0, top), P(l + 0.5, d1, top), P(l - 0.5, d1, top)]); g.fill(); g.stroke(); }
  }
  // 世界座標（マスの中心が整数）→ 画面。自分より後ろは null
  const WP = (X, Y, h) => { const dx = X - state.x, dy = Y - state.y, dd = dx * fx + dy * fy; return dd < 0.12 ? null : P(dx * rx + dy * ry, dd, h); };
  const wline = (X0, Y0, X1, Y1, h, col) => {
    // 手前で切れる線は、見える所まで縮める
    let a = [X0, Y0], b = [X1, Y1];
    const dep = p => (p[0] - state.x) * fx + (p[1] - state.y) * fy;
    if (dep(a) < 0.12 && dep(b) < 0.12) return;
    if (dep(a) < 0.12) { const t = (0.12 - dep(a)) / (dep(b) - dep(a)); a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    if (dep(b) < 0.12) { const t = (0.12 - dep(b)) / (dep(a) - dep(b)); b = [b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t]; }
    const p = WP(a[0], a[1], h), q = WP(b[0], b[1], h); if (!p || !q) return;
    g.strokeStyle = col; g.lineWidth = 1.2; g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke();
  };
  // 床の線（体育館のコート）
  for (const [x0, y0, x1, y1] of MAPS[state.fl].lines) {
    const c = 'rgba(255,255,255,0.55)', X0 = x0 - 0.5, Y0 = y0 - 0.5, X1 = x1 - 0.5, Y1 = y1 - 0.5, MX = (X0 + X1) / 2;
    wline(X0, Y0, X1, Y0, -0.5, c); wline(X1, Y0, X1, Y1, -0.5, c); wline(X1, Y1, X0, Y1, -0.5, c); wline(X0, Y1, X0, Y0, -0.5, c);
    wline(MX, Y0, MX, Y1, -0.5, c);
  }
  // 面の飾り：見ている側のマス (f,l) から side を向いた壁
  const DC = (f, l, side) => decoAt(state.fl, wx(f, l), wy(f, l), (dir + side) % 4);
  const TOP = (f, l) => (here && here.ceil && areaAt(state.fl, wx(f, l), wy(f, l)) === here ? here.ceil : 0.5);
  const wx = (f, l) => state.x + fx * f + rx * l, wy = (f, l) => state.y + fy * f + ry * l;
  // 相対マス (f 前方, l 右) の辺。side：0 奥 / 1 右 / 2 手前 / 3 左
  const E = (f, l, side) => edgeAt(state.fl, wx(f, l), wy(f, l), (dir + side) % 4);
  const CU = (f, l, side) => curtainAt(state.fl, wx(f, l), wy(f, l), (dir + side) % 4);
  const order = [];
  for (let l = LAT; l >= 1; l--) order.push(-l, l);
  order.push(0);
  const talking = dialogQ && dialogQ.npc;
  // 視線に平行な面：画面左端 e1／右端 e2。右側の壁は奥が左、左側の壁は手前が左
  const sideFace = (lat, f, e, nFar, nNear, cu) => {
    if (!isFace(e)) return;
    const vl = lat > 0 ? Math.round(lat - 0.5) : Math.round(lat + 0.5); // 見ている側のマス
    const dc = DC(f, vl, lat > 0 ? 1 : 3), tp = TOP(f, vl), ext = !inMap(state.fl, wx(f, vl), wy(f, vl));
    if (lat > 0) drawFace([lat, f + 0.5], [lat, f - 0.5], e, f, !isFace(nFar), !isFace(nNear), cu, dc, tp, ext);
    else drawFace([lat, f - 0.5], [lat, f + 0.5], e, f, !isFace(nNear), !isFace(nFar), cu, dc, tp, ext);
  };
  // 面の端の縦線は、同じ直線上に面が続く場合は描かない（角・端だけ線を引く）
  for (let f = DEPTH; f >= 0; f--) {
    for (const l of order) {
      // 奥の辺（正面向きの面）
      const far = E(f, l, 0);
      if (isFace(far)) drawFace([l - 0.5, f + 0.5], [l + 0.5, f + 0.5], far, f + 0.5, !isFace(E(f, l - 1, 0)), !isFace(E(f, l + 1, 0)), far === WIN ? CU(f, l, 0) : null, DC(f, l, 0), TOP(f, l), !inMap(state.fl, wx(f, l), wy(f, l)));
      // マスの中身（階段・人）
      if (f >= 1 && inMap(state.fl, wx(f, l), wy(f, l))) {
        const sa = stairAt(state.fl, wx(f, l), wy(f, l));
        // 2マスの階段は、奥の壁を描き終えた入口側のマスで一度だけ描く。
        if (sa?.i === 0) drawStairSolid(sa.st);
        const pr = propAt(state.fl, wx(f, l), wy(f, l));
        if (pr === 'pool') drawPool(wx(f, l), wy(f, l), WP, wline, f);
        else if (pr === 'bed' || pr === 'desk') drawTable(pr, l, f);
        else if (pr) drawBox(pr, l, f);
        const it = itemAt(state.fl, wx(f, l), wy(f, l));
        if (it) drawItem(l, f, it);
        // 吊るされた物（鐘楼の鐘など）：天井から下げる
        for (const dc of DECOR) if (dc.fl === state.fl && dc.x === wx(f, l) && dc.y === wy(f, l) && !(dc.hide && dc.hide(state))) drawHanging(l, f, dc);
        const n = npcAt(state.fl, wx(f, l), wy(f, l));
        if (n && Math.abs(l) <= 1 && n !== talking && !battle) drawNpc(n, l, f); // 戦闘中は戦闘の敵だけを描く
      }
      // 横の辺（視線に平行な面）。辺 lat=k+0.5 は一意に描く：右側(l>=1)はマスの左辺、左側(l<=-1)はマスの右辺
      if (l >= 1) sideFace(l - 0.5, f, E(f, l, 3), E(f + 1, l, 3), E(f - 1, l, 3), E(f, l, 3) === WIN ? CU(f, l, 3) : null);
      if (l <= -1) sideFace(l + 0.5, f, E(f, l, 1), E(f + 1, l, 1), E(f - 1, l, 1), E(f, l, 1) === WIN ? CU(f, l, 1) : null);
    }
  }
  // 3) 仕上げ：屋外では空と街並みを後ろに敷く。それでも何も無い所（遠い廊下の先など）は黒
  g.save(); g.globalCompositeOperation = 'destination-over';
  if (here && here.outdoor) { g.drawImage(townCanvases[dir], 0, 0); g.drawImage(skyCanvases[dir], 0, 0); }
  g.fillStyle = '#000'; g.fillRect(0, 0, VW, VH);
  g.restore();
  // 会話中：相手を目の前に寄せて大きく表示
  if (talking && !battle) drawNpc(dialogQ.npc, 0, TALK_DIST);
  const held = dialogQ && dialogQ.item && ITEM_IMG[dialogQ.item] && getImage(ITEM_IMG[dialogQ.item].src);
  if (held && !battle) {
    const w = 220, h = w * held.naturalHeight / held.naturalWidth;
    g.imageSmoothingEnabled = false; g.drawImage(held, CX - w / 2, CY - h / 2 - 40, w, h);
  }
  if (battle) renderBattle();
}

// ---------------------------------------------------------------------
//  戦闘の敵の描画
// ---------------------------------------------------------------------

// 被弾時の赤い点滅用：画像の不透明部分だけを塗った版をキャッシュ
const TINTS = {};
function tinted(im, col) {
  const key = im.src + col;
  if (!TINTS[key]) {
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 1; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
    TINTS[key] = c;
  }
  return TINTS[key];
}
// 敵を、目の前の床に立つ実物大で描く（探索画面の背景と同じ遠近）
//   奥行き：1マス先（小さい敵は少し手前）。前が壁ならその手前まで
//   左右：通路の幅（±0.35 マス）に収まるよう並べ、数が多いときは前後に少しずらす
function enemySpots(n, kind) {
  const sz = MON_SIZE[kind] || { cm: 160 };
  const base = 0.5; // 主人公（あなた）と同じマスの中、すぐ目の前。大きく見える（頭や足もとが画面の外で切れてもよい）
  // 3体までは横一列、それより多いときは後ろにもう1列（前列3体・後列は残り）。後列は前列のすき間に入る
  const front = Math.min(3, n), back = n - front, out = [];
  const row = (k, f, shift) => { const gap = Math.min(0.36, 0.72 / Math.max(1, k - 1)); for (let i = 0; i < k; i++) out.push({ l: (i - (k - 1) / 2) * gap + shift, f }); };
  row(front, base, 0); if (back) row(back, base + 0.35, back % 2 ? 0.18 : 0); // 後列は前列のすき間に見えるようずらす
  return out;
}
function drawEnemyAt(kind, l, f, flash, e) {
  const m = MONS[kind], sz = MON_SIZE[kind] || { cm: 160 }, src = (e && e.img) || m.img || (m.imgs && m.imgs[0]), im = src && getImage(src);
  // 小さな敵（黒板消し・リコーダーなど）は、目の前に寄ってきている体で大きく描く（30cm 未満は 3 倍、60cm 未満は 2 倍）
  const vis = m.zoom || (sz.cm < 30 ? 3 : sz.cm < 60 ? 2 : 1); // zoom があればその倍率（細長くて小さく見えるものなど）
  // すぐ目の前（同じマス）では、床に近い所は画面の下（メッセージの裏）に隠れる。
  //   低いものは床から 70cm ほどまで浮かせて見えるようにする（天井 215cm を超えない範囲で）
  const htCm = sz.cm * vis, upCm = Math.max((e && e.up != null ? e.up : sz.up) || 0, Math.min(70, 215 - htCm));
  const up = upCm * CM, ht = htCm * CM;
  const top = P(l, f, -0.5 + up + ht), bot = P(l, f, -0.5 + up);
  const h = bot[1] - top[1];
  if (!im) { // 画像がまだ無い：大きさどおりの直線の箱で仮に表示
    const hw = Math.max(0.08, sz.cm * vis * CM * 0.35), y0 = -0.5 + up, y1 = y0 + ht;
    const q = [P(l - hw, f, y1), P(l + hw, f, y1), P(l + hw, f, y0), P(l - hw, f, y0)];
    path(q); g.fillStyle = '#000'; g.fill(); g.strokeStyle = flash ? '#fff' : 'rgba(255,255,255,0.8)'; g.lineWidth = flash ? 3 : 1.5; g.stroke();
    if (flash) { g.fillStyle = '#fff'; path(q); g.fill(); }
    return top;
  }
  const w = h * im.naturalWidth / im.naturalHeight;
  g.imageSmoothingEnabled = false;
  g.drawImage(flash ? tinted(im, '#fff') : im, top[0] - w / 2, top[1], w, h);
  return top;
}
// スマホ（縦画面、またはタッチ操作）では、画面の中の文字を 1.5 倍に
// 画面の操作ボタン（スマホ）を使っているか。使っているときは、文の中にキーの名前を出さない
const PC_Q = matchMedia('(hover:hover) and (pointer:fine)'); // マウスのある PC では、ボタンが出ていてもキーの案内は残す
const usePad = () => !PC_Q.matches && getComputedStyle(document.getElementById('pad')).display !== 'none';
const MOBILE_Q = matchMedia('(max-width:700px) and (orientation:portrait), (pointer:coarse)');
const textScale = () => (MOBILE_Q.matches ? 1.5 : 1);
function renderBattle() {
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, VW, VH);
  const m = MONS[battle.kind];
  const n = battle.enemies.length;
  // 鐘楼の鐘（探索画面に描かれているので、戦闘では重ねない）
  const spots = enemySpots(n, battle.kind);
  // 奥の敵から順に描く
  battle.enemies.map((e, i) => ({ e, p: spots[i] })).sort((a, b) => b.p.f - a.p.f).forEach(({ e, p }) => {
    if (e.hp <= 0) return;
    const top = drawEnemyAt(battle.kind, p.l, p.f, e.flash, e);
    if (e.sleep > 0) { g.fillStyle = '#fff'; g.font = `${Math.round(18 * textScale())}px DotGothic16, monospace`; g.textAlign = 'center'; g.fillText('Zz', top[0] + 24, top[1] + 4); }
  });
  // 画面上の「敵の名前 ×数」は出さない
}

// ---------------------------------------------------------------------
//  Minimap / HUD
// ---------------------------------------------------------------------
const mc = document.getElementById('map'), mg = mc.getContext('2d');
// オートマップ：実際に立ったマスだけを記録（地図に描かれるのは、そのマスの四方の壁だけ）
// オートマップ：視界に入った範囲だけを記録する
//   ・前方2マスまで（2マス先のマスの向こう側の壁＝こちらを向いた壁まで）
//   ・左右は前方の距離と同じだけ広がる扇形。自分の真横と後ろは記録しない
//   ・視線は「何もない辺」だけを通る（壁・閉じた扉・窓の向こうは記録しない）
//   ・記録する壁は、各マスの奥と左右の辺（こちらに背を向けた辺は見えないので記録しない）
const SIGHT = 2;
function markSeen() {
  const fl = state.fl, S = state.seen[fl], SE = state.seenE[fl], dir = state.dir;
  const [fx, fy] = DIRS[dir], [rx, ry] = DIRS[(dir + 1) % 4];
  const cx = (f, l) => state.x + fx * f + rx * l, cy = (f, l) => state.y + fy * f + ry * l;
  const vis = new Set(['0,0']), q = [[0, 0]];
  while (q.length) {
    const [f, l] = q.shift();
    for (const [df, dl, side] of [[1, 0, 0], [0, 1, 1], [0, -1, 3]]) {
      const nf = f + df, nl = l + dl, k = nf + ',' + nl;
      if (nf > SIGHT || Math.abs(nl) > nf || vis.has(k)) continue;
      if (edgeAt(fl, cx(f, l), cy(f, l), (dir + side) % 4) !== OPEN || !inMap(fl, cx(nf, nl), cy(nf, nl))) continue;
      vis.add(k); q.push([nf, nl]);
    }
  }
  for (const k of vis) {
    const [f, l] = k.split(',').map(Number), x = cx(f, l), y = cy(f, l);
    S.add(x + ',' + y);
    for (const side of [0, 1, 3]) SE.add(edgeKey(x, y, (dir + side) % 4));
  }
}
function renderMap() {
  // 表示されている大きさに合わせて描く（縦画面では幅いっぱいに大きく出る）。1マスは幅 24 マス分が収まる大きさ
  const dpr = window.devicePixelRatio || 1, W = mc.clientWidth || 240, H = mc.clientHeight || 150, cs = Math.max(10, W / 24);
  if (mc.width !== Math.round(W * dpr) || mc.height !== Math.round(H * dpr)) { mc.width = Math.round(W * dpr); mc.height = Math.round(H * dpr); }
  mg.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawMap(mg, W, H, cs, Math.round(W / 2 - (state.x + 0.5) * cs), Math.round(H / 2 - (state.y + 0.5) * cs), state.fl, true); // 部屋の名前も出す
  if (mode === 'bigmap') renderBigMap();
}
// 地図に描くマス：歩いて見たマス。見取り図があればその階の全部
function knownCells(fl) {
  if (!mapKnown(fl)) return state.seen[fl];
  const F = MAPS[fl], out = new Set(state.seen[fl]);
  for (let y = 0; y < F.H; y++) for (let x = 0; x < F.W; x++) if (F.grid[y][x]) out.add(x + ',' + y);
  return out;
}
// 地図を描く：cs＝1マスの大きさ、(ox, oy)＝マス (0,0) の左上の位置
function drawMap(mg, W, H, cs, ox, oy, fl = state.fl, labels = false) { // fl：描く階（全画面の地図では、いる階以外も描ける）
  const F = MAPS[fl], k1 = cs / 10, S = knownCells(fl);
  mg.fillStyle = '#000'; mg.fillRect(0, 0, W, H);
  const seen = (x, y) => S.has(x + ',' + y);
  for (let y = 0; y < F.H; y++) for (let x = 0; x < F.W; x++) {
    if (!seen(x, y)) continue;
    const px = ox + x * cs, py = oy + y * cs;
    const n = npcAt(fl, x, y);
    const pr = propAt(fl, x, y);
    if (pr) { mg.fillStyle = '#fff'; pr === 'bed' ? mg.fillRect(px + 3 * k1, py + k1, cs - 6 * k1, cs - 2 * k1) : mg.fillRect(px + 3 * k1, py + 3 * k1, cs - 6 * k1, cs - 6 * k1); }
    if (n) { mg.fillStyle = '#fff'; mg.beginPath(); mg.arc(px + cs / 2, py + cs / 2, 3 * k1, 0, 7); mg.fill(); }
  }
  const knownStairWalls = new Set();
  for (const st of F.stairs) {
    const [ex, ey] = stairEntry(st); if (!seen(ex, ey)) continue;
    for (const edge of stairWallEdges(st.x, st.y, st.dir)) knownStairWalls.add(edgeKey(...edge));
    mg.fillStyle = '#fff'; mg.font = `${cs}px monospace`; mg.textAlign = 'center';
    for (const [x, y] of stairCells(st)) mg.fillText(st.up ? '▲' : '▼', ox + x * cs + cs / 2, oy + y * cs + cs - 2 * k1);
  }
  // 辺：どちらかの側のマスに立ったことがあれば描く
  // 白一色：壁＝実線、窓＝点線、扉＝壁の切れ目（両端だけ短い壁）
  mg.lineWidth = Math.max(2, 2 * k1 * 0.8); mg.strokeStyle = '#fff';
  const seg = (k, x0, y0, x1, y1) => {
    if (k === OPEN || k === DOOR) return;
    mg.setLineDash(k === WIN ? [2 * k1, 2 * k1] : k === FENCE ? [k1, 3 * k1] : []); mg.beginPath(); mg.moveTo(x0, y0); mg.lineTo(x1, y1); mg.stroke(); mg.setLineDash([]);
  };
  const SE = state.seenE[fl], all = mapKnown(fl);
  for (let y = 0; y <= F.H; y++) for (let x = 0; x < F.W; x++) if (all ? seen(x, y) || seen(x, y - 1) : SE.has('h' + x + ',' + y) || knownStairWalls.has('h' + x + ',' + y)) {
    const k = F.h[y][x], px = ox + x * cs, py = oy + y * cs;
    if (k === DOOR) { seg(WALL, px, py, px + 3 * k1, py); seg(WALL, px + cs - 3 * k1, py, px + cs, py); } else seg(k, px, py, px + cs, py);
  }
  for (let y = 0; y < F.H; y++) for (let x = 0; x <= F.W; x++) if (all ? seen(x, y) || seen(x - 1, y) : SE.has('v' + x + ',' + y) || knownStairWalls.has('v' + x + ',' + y)) {
    const k = F.v[y][x], px = ox + x * cs, py = oy + y * cs;
    if (k === DOOR) { seg(WALL, px, py, px, py + 3 * k1); seg(WALL, px, py + cs - 3 * k1, px, py + cs); } else seg(k, px, py, px, py + cs);
  }
  if (labels) drawRoomLabels(mg, F, S, cs, ox, oy);
  if (fl !== state.fl) return; // 自分の印は、いる階だけ
  const px = ox + state.x * cs + cs / 2, py = oy + state.y * cs + cs / 2, [dx, dy] = DIRS[state.dir];
  mg.fillStyle = '#ffffff'; mg.beginPath();
  mg.moveTo(px + dx * 5 * k1, py + dy * 5 * k1); mg.lineTo(px + (-dx * 3 - dy * 4) * k1, py + (-dy * 3 + dx * 4) * k1); mg.lineTo(px + (-dx * 3 + dy * 4) * k1, py + (-dy * 3 - dx * 4) * k1); mg.closePath(); mg.fill();
}
function drawRoomLabels(ctx, floor, known, cs, ox, oy) {
  const size = clamp(Math.round(cs * 0.6), 11, 17);
  const rows = Math.ceil((size + 5) / cs);
  const covered = (a, x, y) => {
    for (let dy = 0; dy < rows; dy++) {
      if (floor.grid[y + dy]?.[x] !== a || !known.has(x + ',' + (y + dy))) return false;
    }
    return true;
  };
  const spans = new Map();
  for (let y = 0; y < floor.H; y++) for (let x = 0; x < floor.W; x++) {
    const a = floor.grid[y][x];
    if (a?.kind !== 'room' || !covered(a, x, y)) continue;
    let end = x + 1;
    while (covered(a, end, y)) end++;
    const width = end - x;
    if (!spans.has(a) || spans.get(a).width < width) spans.set(a, { x, y, width });
    x = end - 1;
  }
  ctx.font = size + 'px DotGothic16, "MS Gothic", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [a, { x, y, width }] of spans) {
    const nm = L(a.name), w = Math.ceil(ctx.measureText(nm).width) + 4;
    if (w > width * cs - 4) continue;
    const px = ox + (x + width / 2) * cs, py = oy + y * cs + (size + 6) / 2;
    ctx.fillStyle = '#000'; ctx.fillRect(px - w / 2, py - size / 2 - 1, w, size + 2);
    ctx.fillStyle = '#fff'; ctx.fillText(nm, px, py);
  }
  ctx.textBaseline = 'alphabetic';
}
// 全画面の地図：判明済みの範囲を表示し、階ごとに拡大・ドラッグできる。
const bigEl = document.getElementById('bigmap'), bc = document.getElementById('bigmapCanvas'), bg = bc.getContext('2d');
const bigFloorsEl = document.getElementById('bigmapFloors'), bigClose = document.getElementById('bigmapClose');
const bigOut = document.getElementById('bigmapOut'), bigFit = document.getElementById('bigmapFit'), bigIn = document.getElementById('bigmapIn');
const BIG_ZOOMS = [1, 1.5, 2.25, 3.375, 5];
let bigFl = 1, bigZoom = 0, bigCenter = null, bigScale = 1, mapDrag = null;
const visitedFloors = () => Object.keys(MAPS).map(Number).filter(k => knownCells(k).size > 0 || k === state.fl);
function renderBigMap() {
  const dpr = window.devicePixelRatio || 1, W = bc.clientWidth, H = bc.clientHeight;
  if (!W || !H) return;
  const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
  if (bc.width !== pw || bc.height !== ph) { bc.width = pw; bc.height = ph; }
  bg.setTransform(dpr, 0, 0, dpr, 0, 0);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of knownCells(bigFl)) {
    const [x, y] = c.split(',').map(Number);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
  }
  if (bigFl === state.fl) {
    x0 = Math.min(x0, state.x); x1 = Math.max(x1, state.x + 1);
    y0 = Math.min(y0, state.y); y1 = Math.max(y1, state.y + 1);
  }
  const midX = (x0 + x1) / 2, midY = (y0 + y1) / 2;
  const margin = 12, innerW = Math.max(1, W - margin * 2), innerH = Math.max(1, H - margin * 2);
  const fit = Math.min(40, innerW / (x1 - x0), innerH / (y1 - y0));
  bigScale = Math.min(144, fit * BIG_ZOOMS[bigZoom]);
  const center = bigCenter || { x: midX, y: midY };
  const dx = Math.max(0, (x1 - x0 - innerW / bigScale) / 2), dy = Math.max(0, (y1 - y0 - innerH / bigScale) / 2);
  bigCenter = { x: clamp(center.x, midX - dx, midX + dx), y: clamp(center.y, midY - dy, midY + dy) };
  drawMap(bg, W, H, bigScale, W / 2 - bigCenter.x * bigScale, H / 2 - bigCenter.y * bigScale, bigFl, true);
  bigOut.disabled = bigFit.disabled = bigZoom === 0;
  bigIn.disabled = bigZoom === BIG_ZOOMS.length - 1 || bigScale === 144;
}
function fitBigMap() {
  bigZoom = 0; bigCenter = null;
  renderBigMap();
}
function selectBigFloor(fl) {
  if (bigFl !== fl) { bigFl = fl; fitBigMap(); }
  for (const b of bigFloorsEl.querySelectorAll('button')) b.setAttribute('aria-pressed', +b.dataset.fl === fl);
}
bigFloorsEl.addEventListener('click', e => {
  const b = e.target.closest('button[data-fl]');
  if (b) selectBigFloor(+b.dataset.fl);
});
function bigMapStep(d) {
  const fls = visitedFloors();
  selectBigFloor(fls[clamp(fls.indexOf(bigFl) + d, 0, fls.length - 1)]);
}
function openBigMap() {
  if (mode !== 'explore') return;
  bigFl = state.fl; mode = 'bigmap'; bigEl.style.display = 'flex';
  bigFloorsEl.innerHTML = visitedFloors().map(fl => `<button type="button" data-fl="${fl}" aria-pressed="${fl === bigFl}">${MAPS[fl].name}</button>`).join('');
  fitBigMap();
  bigClose.focus({ preventScroll: true });
}
function closeBigMap() {
  if (mode !== 'bigmap') return;
  mode = 'explore'; bigEl.style.display = 'none'; mapDrag = null; render();
  mc.focus({ preventScroll: true });
}
// ドラッグ直後にブラウザがクリックを省いても、タップでボタンを押せるようにする。
bigEl.addEventListener('pointerup', e => {
  if (e.pointerType !== 'touch') return;
  const button = e.target.closest('button');
  if (button && document.elementFromPoint(e.clientX, e.clientY)?.closest('button') === button) button.click();
});
bigOut.addEventListener('click', () => { bigZoom--; renderBigMap(); });
bigIn.addEventListener('click', () => { bigZoom++; renderBigMap(); });
bigFit.addEventListener('click', fitBigMap);
bc.addEventListener('pointerdown', e => {
  if (e.button !== 0 || mapDrag) return;
  mapDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  bc.setPointerCapture(e.pointerId);
});
bc.addEventListener('pointermove', e => {
  if (mapDrag?.id !== e.pointerId) return;
  bigCenter.x -= (e.clientX - mapDrag.x) / bigScale;
  bigCenter.y -= (e.clientY - mapDrag.y) / bigScale;
  mapDrag.x = e.clientX; mapDrag.y = e.clientY;
  renderBigMap();
});
bc.addEventListener('lostpointercapture', e => { if (mapDrag?.id === e.pointerId) mapDrag = null; });
mc.addEventListener('pointerup', openBigMap);
mc.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault(); e.stopPropagation(); openBigMap();
});
bigClose.addEventListener('click', closeBigMap);
window.addEventListener('resize', () => { fitHeight(); if (mode === 'bigmap') renderBigMap(); else if (state) renderMap(); keepLeft(); });
// 横にずれて表示されていたら左端に戻す（iPhone の Safari 対策。フォントの読み込み後や画面の回転後にも確かめる）
function keepLeft() { if (window.scrollX) window.scrollTo(0, window.scrollY); }
// 画面の高さ：見えている高さを CSS に渡す（ホーム画面から開いた iPhone では 100dvh がずれることがあるため）
function fitHeight() {
  const h = Math.round((window.visualViewport && window.visualViewport.height) || window.innerHeight);
  if (document.documentElement.style.getPropertyValue('--appH') !== h + 'px') { document.documentElement.style.setProperty('--appH', h + 'px'); if (state) renderMap(); }
  if (window.scrollY && usePad()) window.scrollTo(window.scrollX, 0);
}
fitHeight();
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitHeight);
if (document.fonts) document.fonts.ready.then(() => { if (state) renderMap(); keepLeft(); });
window.addEventListener('orientationchange', () => setTimeout(() => { fitHeight(); keepLeft(); }, 300));
function renderHUD() {
  // プレイ画面の右上（内側）に現在地：例「B棟 1F 保健室 [2, 1] 南」
  document.getElementById('loc').textContent = `${placeName(state.fl, state.x, state.y)} [${state.x}, ${state.y}] ${DIR_NAME[state.dir]}`;
  document.getElementById('loc').style.display = battle ? 'none' : ''; // 戦闘中は隠す
  const rows = state.party.map(c => `<tr class="${c.hp <= 0 ? 'dead' : ''}" title="${c.cls} / AC ${c.ac}"><td>${c.name}</td><td class="num">${c.lv}</td>` +
    `<td class="num">${c.hp}/${c.maxhp}</td><td class="num">${c.maxmp ? c.mp : '-'}</td>` +
    `<td>${c.hp <= 0 ? L('不能') : c.defend ? L('防御') : 'OK'}</td></tr>`).join('');
  document.getElementById('party').innerHTML =
    '<tr><th>Name</th><th>Lv</th><th>HP</th><th>MP</th><th>Status</th></tr>' + rows;
}
function render() {
  fitHeight();
  updatePad();
  updateQuestLocks(); renderView(); renderMap(); renderHUD(); checkCap(); saveSoon(); }

// ---------------------------------------------------------------------
//  Log / dialog / command menu
// ---------------------------------------------------------------------
const logEl = document.getElementById('log');
// メッセージは画面の中に一時的に出す（複数行）。一定時間で消える
const LOG_MAX = 5, LOG_MS = 3500;
const HISTORY_MAX = 300;
function remember(text) {
  if (!state) return;
  state.history.push(text);
  if (state.history.length > HISTORY_MAX) state.history.splice(0, state.history.length - HISTORY_MAX);
}
function log(msg, cls = '') {
  const d = document.createElement('div'); d.textContent = msg; if (cls) d.className = cls;
  logEl.appendChild(d);
  while (logEl.children.length > LOG_MAX) logEl.removeChild(logEl.firstChild);
  setTimeout(() => { d.classList.add('fade'); setTimeout(() => d.remove(), 400); }, LOG_MS);
}
const dlgEl = document.getElementById('dialog');
const dialogNotice = text => ({ text }); // ダイアログに表示するシステム通知
// npc を渡すと、会話中はそのキャラを目の前（近距離）に大きく表示する
function showDialog(lines, cb, npc, item) {
  dialogQ = { lines: lines.slice(), cb, prev: mode, npc, item };
  mode = 'dialog';
  if (npc || item) render();
  advanceDialog();
}
function advanceDialog() {
  if (!dialogQ) return;
  if (!dialogQ.lines.length) {
    const { cb, prev } = dialogQ; dialogQ = null; dlgEl.style.display = 'none';
    mode = prev === 'dialog' ? 'explore' : prev;
    render(); if (cb) cb(); return;
  }
  const entry = dialogQ.lines.shift();
  const story = typeof entry === 'string';
  const line = story ? entry : entry.text;
  const reward = line.startsWith('★');
  if (story) remember(reward ? line.replace('★ ', '') : line);
  dlgEl.innerHTML = '';
  // ★ で始まる行（手に入れた・受け取った）は、その物の絵を左に出す
  const got = line.startsWith('★') && Object.keys(ITEM_IMG).find(id => ITEM_NAME[id] && line.includes(ITEM_NAME[id]));
  if (got) { const p = document.createElement('img'); p.src = ITEM_IMG[got].src; p.className = 'itemicon'; dlgEl.appendChild(p); }
  const t = document.createElement('div'); t.className = 'text'; t.textContent = line; dlgEl.appendChild(t);
  const nx = document.createElement('div'); nx.className = 'next'; nx.textContent = (dialogQ.lines.length ? '▼' : '■') + (usePad() ? '' : ' Space'); dlgEl.appendChild(nx); // スマホ（画面のボタン）ではキーの名前を出さない
  dlgEl.style.display = 'block';
  if (reward) log(line.replace('★ ', ''), 'good');
}
dlgEl.addEventListener('click', advanceDialog);

const cmdEl = document.getElementById('cmd');
let menuCur = 0; // キーボードで選んでいる行動・選択肢（W A S D で動かし、Space で決める）
function setMenu(title, opts) {
  menuOpts = opts; menuCur = 0;
  cmdEl.innerHTML = '';
  if (title) { const s = document.createElement('span'); s.className = 'who'; s.textContent = title; cmdEl.appendChild(s); }
  opts.forEach(([label, fn], i) => {
    const b = document.createElement('button'); b.textContent = `${i + 1} ${label}`; b.onclick = () => { if (mode === 'battle' || mode === 'choice') fn(); };
    cmdEl.appendChild(b);
  });
  showMenuCur();
  updatePad();
}
function showMenuCur() { cmdEl.querySelectorAll('button').forEach((b, i) => b.classList.toggle('cur', i === menuCur)); }
// 選択肢・戦闘の行動：W A（↑ ←）で前、S D（↓ →）で次、Space・Enter で決める。M・Esc は戻る
function menuCursorKey(k) {
  const n = menuOpts.length; if (!n) return false;
  if (['w', 'W', 'a', 'A', 'q', 'Q', 'ArrowUp', 'ArrowLeft'].includes(k)) { menuCur = (menuCur + n - 1) % n; showMenuCur(); return true; }
  if (['s', 'S', 'd', 'D', 'e', 'E', 'ArrowDown', 'ArrowRight'].includes(k)) { menuCur = (menuCur + 1) % n; showMenuCur(); return true; }
  if ([' ', 'Enter', 'NumpadEnter'].includes(k)) { menuOpts[Math.min(menuCur, n - 1)][1](); return true; }
  return false;
}
// 会話のあとに選択肢を出す。数字キー・画面のボタン・スマホのボタンで選ぶ。Esc・M は最後の選択肢（いいえ）
function showChoice(title, opts) {
  mode = 'choice';
  setMenu(title, opts.map(([label, fn]) => [label, () => { clearMenu(); mode = 'explore'; fn(); render(); }]));
  render();
}
function clearMenu() { menuOpts = []; cmdEl.innerHTML = ''; updatePad(); }
// スマホの操作ボタン：戦闘で行動を選ぶ間は、上2段が行動 1〜6、M が「戻る」になる
const padBtns = [...document.querySelectorAll('#pad button:not(.extra)')], PAD_DEFAULT = padBtns.map(b => b.innerHTML); // 戦闘・選択肢で 1〜5 になる 5 つ（移動のボタンは除く）
function updatePad() {
  const battleMenu = menuOpts.length > 0;
  document.getElementById('pad').classList.toggle('battle', battleMenu || !!battle); // 横画面で並びを切り替える
  padBtns.forEach((b, i) => {
    b.classList.toggle('word', !battleMenu && !!battle && !!battle.auto && i === 0); // 「オート」は数字より小さい、文字用の大きさ
    if (!battleMenu && battle && battle.auto) { b.innerHTML = i === 0 ? L('オート<span>止める</span>') : ''; b.disabled = i !== 0; return; } // オート中：左端で止める
    if (!battleMenu && battle) { b.innerHTML = ''; b.disabled = true; return; } // 戦闘中で行動を選んでいない間（敵味方が動いている間）は空
    if (!battleMenu) { b.innerHTML = PAD_DEFAULT[i]; b.disabled = false; return; }
    const o = menuOpts[i];
    b.innerHTML = o ? `${i + 1}<span>${o[0]}</span>` : '';
    b.disabled = !o;
  });
  fitPadLabels();
}
// ボタンの中の行動名が入りきらないときは、改行せずに文字を小さくする
function fitPadLabels() {
  for (const sp of document.querySelectorAll('#pad button span')) {
    sp.style.fontSize = '';
    const b = sp.parentElement, room = b.clientWidth - 4;
    if (room <= 0) continue;
    let size = parseFloat(getComputedStyle(sp).fontSize);
    while (sp.scrollWidth > room && size > 7) { size -= 1; sp.style.fontSize = size + 'px'; }
  }
}
window.addEventListener('resize', () => fitPadLabels());
function shake() { const w = document.getElementById('viewWrap'); w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); }

// ---------------------------------------------------------------------
//  Exploration
// ---------------------------------------------------------------------
const CURTAIN_LINES = [L('カーテンが閉まっている。'), L('外は見えない。')];
// 窓の外に空が見えているか。目の前の窓なら、描いた画面のガラス部分に空の色がどれだけあるかで判定。
// 横の窓（平行移動でぶつかった時）は、外のすぐ近くに校舎があるかで判定
function skyVisible(x, y, d) {
  if (x === state.x && y === state.y && d === state.dir) {
    const sc = cv.width / VW, x0 = Math.round((CX - 180) * sc), y0 = Math.round(60 * sc), w = Math.round(360 * sc), h = Math.round(220 * sc);
    const px = g.getImageData(x0, y0, w, h).data; let sky = 0, n = 0;
    for (let i = 0; i < px.length; i += 4 * 7) { n++; const r = px[i], gg = px[i + 1], b = px[i + 2]; if (r + gg + b > 30 && !(r === gg && gg === b)) sky++; }
    return sky / n > 0.15;
  }
  for (let k = 1; k <= 3; k++) {
    const cx = x + DIRS[d][0] * k, cy = y + DIRS[d][1] * k;
    if (areaAt(state.fl, cx, cy) || (k <= 2 && MAPS[state.fl + 1] && areaAt(state.fl + 1, cx, cy))) return false;
  }
  return true;
}
// 窓を調べた時の文。外が校舎でふさがっていれば、夕焼けには触れない
const windowLine = (x, y, d) => {
  if (edgeAt(state.fl, x, y, d) === FENCE) return L('柵の向こうに、空がある。');
  if (curtainAt(state.fl, x, y, d) != null) return pick(CURTAIN_LINES);
  return skyVisible(x, y, d) ? pick(WINDOW_LINES) : L('窓は開かない。');
};
// 鍵のかかった扉の文。鐘楼の扉だけは、向こうで鐘が鳴っている
const lockLine = lk => (lk === 'bellopen' ? L('扉には鍵がかかっている。向こうで、鐘が鳴っている。') : L('扉には鍵がかかっている。'));
const WINDOW_LINES = [L('夜が近づいている。'), L('遠くに街が見える。'), L('窓は開かない。')];

// offset: 0 前進 / 2 後退 / 3 左平行 / 1 右平行（向きは変えない）
function move(offset) {
  const d = (state.dir + offset) % 4;
  const nx = state.x + DIRS[d][0], ny = state.y + DIRS[d][1];
  const e = edgeAt(state.fl, state.x, state.y, d);
  if (e === DOOR && !inMap(state.fl, nx, ny)) { if (!askExit(state.fl, state.x, state.y, d)) log(L('扉は開かない。'), 'sys'); return; }
  if (isBlocking(e) || !inMap(state.fl, nx, ny)) { log(e === WIN || e === FENCE ? windowLine(state.x, state.y, d) : L('壁だ。'), 'sys'); return; }
  const lk = e === DOOR && lockAt(state.fl, state.x, state.y, d);
  if (lk && !state.flags[lk]) { log(lockLine(lk), 'sys'); return; }
  if (e === DOOR && offset !== 0) { log(L('扉は正面を向いて通る。'), 'sys'); return; }
  if (e === DOOR) log(L('扉を開けた。'), 'sys');
  const sa = stairAt(state.fl, nx, ny);
  if (sa) {
    if (offset === 0 && sa.i === 0 && sa.st.dir === d) { useStairs(sa.st); return; }
    log(L('階段の側面だ。'), 'sys'); return;
  }
  const pr = propAt(state.fl, nx, ny);
  if (pr) { log({ bed: L('ベッドがある。'), desk: L('机がある。'), getabako: L('下駄箱が並んでいる。'), getabako_ns: L('下駄箱が並んでいる。'), stall: L('トイレの個室だ。'), sink: L('洗面台がある。'), stage: L('ステージだ。'), tank: L('給水タンクだ。'), unit: L('室外機が並んでいる。'), pool: L('プールだ。') }[pr.split(':')[0]] || L('何かがある。'), 'sys'); return; }
  const n = npcAt(state.fl, nx, ny);
  if (n) { log(usePad() ? L`${n.name}がいる。` : L`${n.name}がいる。［Space］`, 'sys'); return; }
  state.x = nx; state.y = ny;
  afterStep();
}
// 玄関（昇降口のガラス扉）：番人を倒したあとなら、ここから帰ってゲームを終える
const isFrontDoor = (fl, x, y, d) => fl === 1 && x === 0 && y >= 7 && y <= 9 && d === 3;
function askExit(fl, x, y, d) {
  if (!state.flags.bossDown || !isFrontDoor(fl, x, y, d)) return false;
  showChoice(L('ゲームがおわりになります。よろしいですか？'), [[L('はい'), () => playEnding()], [L('いいえ'), () => {}]]);
  return true;
}
// エンディング：人物を一人ずつ出して、最後に「おしまい」
//   Space・クリック・画面のボタンで次へ進める（待っていても進む）
const ENDING_CAST = () => {
  const npc = id => NPCS.find(n => n.id === id);
  const ids = ['nurse', ...TEACHERS.map(t => 't_' + t.key), 'mizuno', 'ichinen', 'youmu', 's2a', 'rika', 'art', 'shisho', 'senpai', 'shinnyu', 'housou',
    'genkan', 'basket', 'jukensei', 'cooking', 'kaichou', 'shinro', 'kagaku', 'tenmon', 'bell'];
  return ids.map(npc).filter(Boolean).map(n => ({ name: n.id === 'mizuno' ? L('水野') : n.name, img: n.id === 'art' ? 'image/chara_art_club.png' : n.img }));
};
let endingStep = null;
function playEnding() {
  // 終わったら保存を消す：次に開くと、はじめから
  restarting = true; try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  mode = 'ending';
  const el = document.getElementById('ending'), pic = el.querySelector('img'), cap = el.querySelector('.name'), fin = el.querySelector('.fin');
  const cast = ENDING_CAST();
  let i = -1, timer = 0;
  el.classList.add('on'); fin.classList.remove('on');
  const show = () => {
    clearTimeout(timer); i++;
    if (i < cast.length) {
      el.classList.remove('show'); void el.offsetWidth;
      pic.src = cast[i].img; cap.textContent = cast[i].name; el.classList.add('show');
      timer = setTimeout(show, 2600);
    } else if (i === cast.length) {
      el.classList.remove('show'); fin.classList.add('on'); endingStep = null; // おしまい：ここで終わる
    }
  };
  endingStep = show;
  show();
}
function turn(delta) { state.dir = (state.dir + delta + 4) % 4; markSeen(); render(); stairHint(); checkReveal(); }
function stairHint() { const st = stairAhead(); if (st) log((st.up ? L('上り階段だ。') : L('下り階段だ。')) + (usePad() ? '' : L('［5］')), 'sys'); }
// 昇り降り：つながる階の同じ id の階段の手前のマスへ。向きは階段に背を向ける
function useStairs(st) {
  const fl = +Object.keys(MAPS).find(k => +k !== state.fl && MAPS[k].stairs.some(t => t.id === st.id));
  const dst = MAPS[fl].stairs.find(t => t.id === st.id);
  const [ex, ey] = stairEntry(dst);
  Object.assign(state, { fl, x: ex, y: ey, dir: (dst.dir + 2) % 4, room: null, cool: 3 });
  if (state.flags.got_keys && fl !== 5) state.flags.tenmonPool = true; // 鍵束を拾って屋上を出たら、天文部員はプールサイドへ（events.js）
  log(L`${st.up ? L('階段を上った') : L('階段を下りた')}。${MAPS[fl].name}`, 'sys');
  markSeen(); render();
}
// きっかけ：廊下の窓の目の前（距離0）で外を向いた瞬間、部屋のカーテンが開く
function checkReveal() {
  if (state.flags.reveal || battle || mode !== 'explore') return;
  if (edgeAt(state.fl, state.x, state.y, state.dir) !== WIN || curtainAt(state.fl, state.x, state.y, state.dir) != null) return;
  if (!skyVisible(state.x, state.y, state.dir)) return; // 外が校舎でふさがっている窓では起きない
  state.flags.reveal = true;
  showDialog([L('夜が近づいている。')], () => render());
}

function afterStep() {
  markSeen();
  const a = areaAt(state.fl, state.x, state.y), r = roomAt(state.fl, state.x, state.y);
  const rn = placeName(state.fl, state.x, state.y);
  if (a && a.name === '鐘楼') state.flags.bellRoom = true; // 進捗の「鐘楼にたどり着いた」は、鐘楼の部屋に入ったとき
  if (rn !== state.room) { state.room = rn; if (a) log(`― ${a.bld ? L(a.bld) + ' ' : ''}${L(a.name)} ―`, 'sys'); }
  render();
  const it = itemAt(state.fl, state.x, state.y);
  if (it) {
    state.flags['got_' + it.id] = true;
    if (it.get) it.get(); state.items.push(it.id);
    showDialog([...it.text, L`★ ${ITEM_NAME[it.id]}を 手に入れた`, ...mateChime('item:' + it.id, state)], () => render(), null, it.id);
    return;
  }
  stairHint();
  checkReveal();
  if (mode !== 'explore') return;
  state.cool--;
  if (state.flags.bossDown) return; // 番人を倒したら、もう敵は出ない
  if (r?.safe || state.cool > 0) return;
  // 話の中で怪異が起きている部屋だけ、人がいても指定の敵が出る。
  const poltergeist = r?.poltergeist?.(state);
  if (r && !poltergeist && !r.foes && roomHasPerson(state.fl, r)) return; // foes の部屋（屋上）は、人がいても出る
  if (Math.random() < 0.09) {
    const k = poltergeist || encounterKind(state.fl, a);
    startBattle(k, groupSize(MONS[k]));
  }
}

function interact() {
  const fx = state.x + DIRS[state.dir][0], fy = state.y + DIRS[state.dir][1];
  const ahead = edgeAt(state.fl, state.x, state.y, state.dir);
  const lkAhead = ahead === DOOR && lockAt(state.fl, state.x, state.y, state.dir);
  const shut = lkAhead && !state.flags[lkAhead]; // 鍵のかかった扉の向こうの人には話しかけられない（扉の錠を調べる）
  const n = !isBlocking(ahead) && !shut && npcAt(state.fl, fx, fy);
  if (n) {
    const lines = [...n.talk(state), ...mateChime(n.id, state)]; // 連れている先生が、続けて手がかりを話すことがある
    showDialog(lines, () => { if (n.after) n.after(state); render(); }, n);
    return;
  }
  // 調べるもの（掲示・黒板・錠など）
  const ex = examineAt(state);
  if (ex) { showDialog(ex.talk(state), () => { if (ex.after) ex.after(state); render(); }); return; }
  const st = stairAhead();
  if (st) { useStairs(st); return; }
  if (ahead === WIN || ahead === FENCE) { log(windowLine(state.x, state.y, state.dir), 'sys'); return; }
  if (ahead === DOOR && askExit(state.fl, state.x, state.y, state.dir)) return;
  if (ahead === DOOR) {
    const lk = lockAt(state.fl, state.x, state.y, state.dir);
    log(!inMap(state.fl, fx, fy) ? L('扉は開かない。') : lk && !state.flags[lk] ? lockLine(lk) : L('扉だ。'), 'sys'); return;
  }
  partyTalk();
}
// 仲間と話す：前に誰も何もない時。話す相手を選び、回復を頼める
function partyTalk() {
  const mates = state.party.slice(1);
  if (!mates.length) { log(L('特に何もない。'), 'sys'); return; }
  if (mates.length === 1) { mateTalk(mates[0]); return; }
  showChoice(L('誰と話す？'), [...mates.map(c => [c.name, () => mateTalk(c)]), [L('やめる'), () => {}]]);
}
const canHeal = c => c.hp > 0 && ((c.spells.includes('heal') && c.mp >= SPELLS.heal.mp) || (c.spells.includes('chorus') && c.mp >= SPELLS.chorus.mp));
function mateTalk(c) {
  // 話の手がかりがあるときはそれを話す。そのあとも、回復は頼める
  const q = c.id && c.id.startsWith('t_') && teacherQuestTalk(c.id.slice(2), state);
  const hurt = state.party.filter(t => t.hp > 0 && t.hp < t.maxhp * 0.6).length, down = state.party.filter(t => t.hp <= 0).length;
  let line;
  if (c.hp <= 0) line = dialogNotice(L`${c.name}は 倒れたまま、目を閉じている。`);
  else if (down) line = L`${c.name}「倒れている人がいる。保健室まで戻ったほうがいい」`;
  else if (hurt) line = L`${c.name}「ずいぶん傷だらけね。少し休もうか」`;
  else if (c.mp < c.maxmp * 0.3) line = L`${c.name}「少し疲れてきた。呪文は、あまり使えないかも」`;
  else line = pick([L`${c.name}「まだ大丈夫。行こう」`, L`${c.name}「チャイム、まだ鳴ってるね」`, L`${c.name}「離れないで歩こう」`]);
  const opts = [];
  // 回復の呪文を知っていれば、いつでも頼める（怪我人がいない・力が足りないときは、選んだあとにそう知らせる）
  if (c.hp > 0 && (c.spells.includes('heal') || c.spells.includes('chorus'))) opts.push([c.spells.includes('heal') ? L('手当てを頼む') : L('歌声を頼む'), () => fieldHeal(c)]);
  const face = c.hp > 0 ? NPCS.find(n => n.id === c.id) : null; // 話している相手の姿（職員室・図書室にいたときと同じ絵）
  showDialog(q || [line], () => { if (opts.length) showChoice(L`${c.name}に頼む？`, [...opts, [L('なんでもない'), () => {}]]); render(); }, face);
}

// 全員を全回復。何が満タンになったかの文（なければ null）を返す
function healAll() {
  const hp = state.party.some(c => c.hp < c.maxhp), mp = state.party.some(c => c.mp < c.maxmp);
  state.party.forEach(c => { c.hp = c.maxhp; c.mp = c.maxmp; });
  return hp && mp ? L('体力とMPが回復した。') : hp ? L('体力が回復した。') : mp ? L('MPが回復した。') : null;
}

function fieldHeal(by) {
  const ok = c => !by || c === by;
  const caster = state.party.find(c => ok(c) && c.hp > 0 && c.spells.includes('heal') && c.mp >= SPELLS.heal.mp);
  const choir = !caster && state.party.find(c => ok(c) && c.hp > 0 && c.spells.includes('chorus') && c.mp >= SPELLS.chorus.mp);
  if (choir) {
    if (!state.party.some(c => c.hp > 0 && c.hp < c.maxhp)) { log(L('誰も怪我をしていない。'), 'sys'); return; }
    choir.mp -= SPELLS.chorus.mp;
    for (const t of aliveParty()) t.hp = Math.min(t.maxhp, t.hp + chorusAmt(choir));
    log(L('みんな 回復した'), 'good'); render(); return;
  }
  if (!caster) { log(by ? L`${by.name}は 呪文の力が足りない。` : L('手当てできる人がいない。'), 'sys'); return; }
  const tgt = state.party.filter(c => c.hp > 0 && c.hp < c.maxhp).sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
  if (!tgt) { log(L('誰も怪我をしていない。'), 'sys'); return; }
  caster.mp -= SPELLS.heal.mp;
  const amt = Math.min(tgt.maxhp - tgt.hp, healAmt(caster));
  tgt.hp += amt;
  log(L`${caster.name}が ${tgt.name}を手当てした`, 'good');
  render();
}

// ---------------------------------------------------------------------
//  Battle (Wizardry-style: input all commands, then resolve by speed)
// ---------------------------------------------------------------------
const hitChance = (lv, ac) => clamp(0.38 + 0.04 * ac + 0.03 * lv, 0.1, 0.95);
const enemiesAlive = () => battle.enemies.filter(e => e.hp > 0);

// 壁を向いたまま襲われたら、敵が来られる空いた方へ向き直る（左右を優先、なければ後ろ）
function faceOpenSide() {
  const freeIn = d => { let k = 0; for (let x = state.x, y = state.y; k < 3 && edgeAt(state.fl, x, y, d) === OPEN; k++) { x += DIRS[d][0]; y += DIRS[d][1]; } return k; };
  if (freeIn(state.dir) > 0) return;
  const cand = [1, 3, 2].map(t => (state.dir + t) % 4).sort((a, b) => freeIn(b) - freeIn(a));
  if (freeIn(cand[0]) > 0) state.dir = cand[0];
}
// パーティの人数による敵の強さの補正（2人を基準）
//   ・出てくる数：最大4体（人数では増やさない）
//   ・1人増えるごとに：HP 3割増し、攻撃力 15%増し、経験値 3割増し（3人 1.3倍／4人 1.6倍）
//   ・ボス（鐘の番人）の HP：100 + 30×人数（2人 160 / 3人 190 / 4人 220）、攻撃力も同じ割合で増える。1ターンに 2 回動き、眠らない
const ENEMY_MAX = 4;
const partyExtra = () => Math.max(0, state.party.length - 2);
const groupSize = m => Math.min(ENEMY_MAX, rnd(m.grp[0], m.grp[1]));
const hpMul = () => 1 + 0.3 * partyExtra(), atkMul = () => 1 + 0.15 * partyExtra(), expMul = () => 1 + 0.3 * partyExtra();
const enemyHP = m => (m.boss ? 100 + 30 * state.party.length : Math.round(rnd(m.hp[0], m.hp[1]) * hpMul()));
const enemyAtk = m => m.atk.map(v => Math.max(1, Math.round(v * atkMul())));
// 敵が現れたときの文：ふだんからそこにある物なので「あらわれた」ではなく、動き出した・飛んできた など

const APPEAR = {
  paper: L('舞い上がった'), eraser: L('飛んできた'), chair: L('動き出した'), mop: L('立ち上がった'), desk: L('動き出した'),
  globe: L('浮かび上がった'), extinguisher: L('飛んできた'), bball: L('飛んできた'), vball: L('飛んできた'),
  beam: L('起き上がった'), vault: L('動き出した'), bat: L('飛んできた'), kendo: L('構えた'), flask: L('浮かび上がった'), burner: L('浮かび上がった'),
  model: L('動き出した'), skel: L('動き出した'), portrait: L('浮かび上がった'), david: L('動き出した'), thinker: L('顔を上げた'),
  recorder: L('飛んできた'), cymbal: L('飛んできた'), tuba: L('浮かび上がった'), drums: L('動き出した'), piano: L('動き出した'),
  hammer: L('飛んできた'), saw: L('飛んできた'),
};
// 出現時にその場から動き出す備品は、戦闘後に動きを止める。
const STATIONARY_ENEMIES = new Set(['chair', 'mop', 'desk', 'beam', 'vault', 'model', 'skel', 'portrait', 'david', 'thinker', 'drums', 'piano']);
const appearLine = (kind, m) => L`${m.name}が ${APPEAR[kind] || L('動き出した')}。`; // 数は言わない
async function startBattle(kind, n, onWin) {
  const m = MONS[kind];
  mode = 'busy';
  battle = {
    kind, boss: !!m.boss, cmds: [], ci: 0, onWin, expMul: expMul(),
    enemies: Array.from({ length: Math.min(n, ENEMY_MAX) }, () => { const hp = enemyHP(m); return { name: m.name, hp, maxhp: hp, atk: enemyAtk(m), ac: m.ac, agi: m.agi, lv: state.fl, boss: !!m.boss, sleep: 0, flash: false,
      img: m.imgs ? pick(m.imgs) : m.img, up: Array.isArray(m.up) ? rnd(m.up[0], m.up[1]) : m.up }; }),
  };
  state.cool = 6;
  faceOpenSide();
  shake(); render();
  log(m.boss ? L`${m.name}が 襲いかかってきた！` : appearLine(battle.kind, m), 'warn');
  await sleep(500);
  beginInput();
}
function beginInput() {
  battle.cmds = []; battle.ci = 0; mode = 'battle';
  if (battle.auto) { autoChoose(); return; }
  promptNext();
}
// オート戦闘：全員の行動を自動で決めて、戦闘が終わるまで続ける。途中で何か押すと止まり、次の回から手で選ぶ
//   回復できる仲間は、HP が 4 割を切った人がいれば回復。それ以外は全員たたかう
function autoPlan(c) {
  const weak = aliveParty().some(t => t.hp < t.maxhp * 0.4);
  if (weak && c.spells.includes('heal') && c.mp >= SPELLS.heal.mp) return { t: 'spell', id: 'heal' };
  if (weak && c.spells.includes('chorus') && c.mp >= SPELLS.chorus.mp) return { t: 'spell', id: 'chorus' };
  return { t: 'fight' };
}
function autoChoose() {
  clearMenu(); mode = 'busy';
  state.party.forEach((c, i) => { if (i >= battle.ci && c.hp > 0) battle.cmds[i] = autoPlan(c); });
  battle.ci = state.party.length;
  setTimeout(() => { if (battle) runRound(); }, 250);
}
function startAuto() { battle.auto = true; log(L('― オート戦闘 ―'), 'sys'); autoChoose(); }
function stopAuto() { if (battle && battle.auto) { battle.auto = false; log(L('オートを止めた。'), 'sys'); updatePad(); } }
function promptNext() {
  while (battle.ci < state.party.length && state.party[battle.ci].hp <= 0) battle.ci++;
  if (battle.ci >= state.party.length) { runRound(); return; }
  showBattleMenu('main');
}
function showBattleMenu(kind) {
  const c = state.party[battle.ci];
  if (kind === 'main') {
    setMenu(L`${c.name}の行動：`, [
      [L('たたかう'), () => choose({ t: 'fight' })],
      [L('じゅもん'), () => c.spells.length ? showBattleMenu('spell') : log(L`${c.name}は じゅもんを知らない`, 'sys')],
      [L('ぼうぎょ'), () => choose({ t: 'defend' })],
      [L('にげる'), () => runAway()],
      canBack() ? [L('もどる'), () => backInput()] : [L('オート'), () => startAuto()],
    ]);
  } else {
    setMenu(L`${c.name}のじゅもん：`, [
      ...c.spells.map(id => [`${SPELLS[id].name} (${SPELLS[id].mp})`, () => c.mp >= SPELLS[id].mp ? choose({ t: 'spell', id }) : log(L('MPが足りない'), 'sys')]),
      [L('もどる'), () => showBattleMenu('main')],
    ]);
  }
}
function choose(cmd) { battle.cmds[battle.ci] = cmd; battle.ci++; promptNext(); }
const canBack = () => { for (let i = battle.ci - 1; i >= 0; i--) if (state.party[i].hp > 0) return true; return false; };
function backInput() {
  let i = battle.ci - 1;
  while (i >= 0 && state.party[i].hp <= 0) i--;
  if (i >= 0) { battle.ci = i; showBattleMenu('main'); }
}

async function runRound() {
  mode = 'busy'; clearMenu();
  const actors = [];
  state.party.forEach((c, i) => {
    if (c.hp <= 0) return;
    c.defend = battle.cmds[i].t === 'defend';
    actors.push({ p: true, c, cmd: battle.cmds[i], ini: c.agi + rnd(1, 8) });
  });
  battle.enemies.forEach(e => { if (e.hp > 0) actors.push({ p: false, e, ini: e.agi + rnd(1, 8) }); });
  actors.sort((a, b) => b.ini - a.ini);
  renderHUD();
  for (const a of actors) {
    if (!enemiesAlive().length || !aliveParty().length) break;
    if (a.p) { if (a.c.hp > 0) await partyAct(a.c, a.cmd); }
    else if (a.e.hp > 0) await enemyAct(a.e);
    render();
  }
  state.party.forEach(c => (c.defend = false));
  await endCheck();
}
async function endCheck() {
  if (!enemiesAlive().length) return victory();
  if (!aliveParty().length) return defeat();
  render(); beginInput();
}

async function hurtEnemy(e, dmg) {
  e.hp -= dmg; e.flash = true; if (e.sleep && Math.random() < 0.5) e.sleep = 0;
  render(); log(L`${e.name}に ${dmg} のダメージ`);
  await sleep(SPD); e.flash = false;
  if (e.hp <= 0) {
    e.hp = 0;
    const result = STATIONARY_ENEMIES.has(battle.kind) ? L('動かなくなった') : L('消えた');
    log(e.boss ? L`${e.name}を たおした` : L`${e.name}は ${result}`, 'good');
  }
  render(); await sleep(SPD / 3);
}
async function partyAct(c, cmd) {
  if (cmd.t === 'defend') { log(L`${c.name}は 身を守っている`); await sleep(SPD / 2); return; }
  if (cmd.t === 'fight') {
    const e = pick(enemiesAlive());
    log(L`${c.name}の こうげき`); await sleep(SPD);
    if (e.sleep > 0 || Math.random() < hitChance(c.lv, e.ac)) await hurtEnemy(e, rnd(c.atk[0], c.atk[1]) + Math.floor(c.lv / 2));
    else { log(L('  ……はずれた')); await sleep(SPD); }
    return;
  }
  const sp = SPELLS[cmd.id];
  if (c.mp < sp.mp) { log(L`${c.name}は 気力が足りない`); await sleep(SPD); return; }
  c.mp -= sp.mp; renderHUD();
  log(L`${c.name}は ${sp.name}を となえた`, 'warn'); await sleep(SPD);
  if (cmd.id === 'heal') {
    const t = aliveParty().sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
    const amt = Math.min(t.maxhp - t.hp, healAmt(c)); t.hp += amt;
    log(L`${c.name}が ${t.name}を手当てした`, 'good'); renderHUD(); await sleep(SPD);
  } else if (cmd.id === 'scold') {
    for (const e of enemiesAlive()) {
      if (!e.boss && Math.random() < 0.65) { e.sleep = rnd(1, 3); log(L`${e.name}は 眠った`); }
      else log(L`${e.name}には 効かなかった`);
      render(); await sleep(SPD / 2);
    }
  } else if (cmd.id === 'spark') {
    await hurtEnemy(pick(enemiesAlive()), rnd(6, 11) + c.lv);
  } else if (cmd.id === 'thunder') {
    for (const e of enemiesAlive()) await hurtEnemy(e, rnd(4, 8) + c.lv);
  } else if (cmd.id === 'lecture') {
    const e = pick(enemiesAlive());
    if (!e.boss && Math.random() < 0.9) { e.sleep = rnd(2, 3); log(L`${e.name}は 眠った`); } else log(L`${e.name}には 効かなかった`);
    render(); await sleep(SPD);
  } else if (cmd.id === 'quiz') {
    for (const e of enemiesAlive()) await hurtEnemy(e, rnd(2, 5) + Math.floor(c.lv / 2));
  } else if (cmd.id === 'chorus') {
    for (const t of aliveParty()) { const amt = Math.min(t.maxhp - t.hp, chorusAmt(c)); t.hp += amt; }
    log(L('みんな 回復した'), 'good'); renderHUD(); await sleep(SPD);
  } else if (cmd.id === 'drill') {
    aliveParty().forEach(t => { t.defend = true; });
    log(L('全員が 身構えた'), 'good'); renderHUD(); await sleep(SPD);
  }
}
function pickTarget() {
  const alive = aliveParty();
  const w = alive.map((c, i) => Math.max(1, 3 - i)); // front rank gets hit more
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < alive.length; i++) { r -= w[i]; if (r <= 0) return alive[i]; }
  return alive[0];
}
async function damageChar(c, dmg) {
  if (c.defend) dmg = Math.ceil(dmg / 2);
  c.hp = Math.max(0, c.hp - dmg); shake(); renderHUD();
  log(L`${c.name}は ${dmg} のダメージを受けた`, 'bad');
  if (c.hp <= 0) log(L`${c.name}は 倒れた……`, 'bad');
  await sleep(SPD);
}
async function enemyAct(e) {
  if (e.boss) { await bossAct(e); if (e.hp > 0 && aliveParty().length) await bossAct(e); return; } // 番人は 1 ターンに 2 回動く
  if (e.sleep > 0) { e.sleep--; log(L`${e.name}は 眠っている`, 'sys'); await sleep(SPD / 2); return; }
  const c = pickTarget();
  log(L`${e.name}の こうげき`); await sleep(SPD);
  if (Math.random() < hitChance(e.lv, c.ac)) await damageChar(c, rnd(e.atk[0], e.atk[1]));
  else { log(L`  ${c.name}は かわした`); await sleep(SPD); }
}
async function bossAct(e) {
  if (Math.random() < 0.3) {
    log(L('番人が 鐘を打った。ゴォォン……'), 'warn'); shake(); await sleep(SPD * 1.5);
    // 「最後の放送」を聞いていれば、鐘の響きが弱い
    for (const c of aliveParty()) await damageChar(c, state.flags.q3done ? rnd(2, 5) : rnd(4, 8));
    return;
  }
  const c = pickTarget();
  log(L`${e.name}の こうげき`); await sleep(SPD);
  if (Math.random() < hitChance(e.lv, c.ac)) await damageChar(c, rnd(e.atk[0], e.atk[1]));
  else { log(L`  ${c.name}は かわした`); await sleep(SPD); }
}
async function runAway() {
  if (mode !== 'battle') return;
  mode = 'busy'; clearMenu();
  log(L('逃げ出した……')); await sleep(SPD);
  if (!battle.boss && Math.random() < 0.6) {
    log(L('逃げきれた。'), 'sys'); battle = null; mode = 'explore'; render(); return;
  }
  log(L('回りこまれた'), 'bad'); await sleep(SPD);
  for (const e of enemiesAlive()) { if (!aliveParty().length) break; await enemyAct(e); render(); }
  await endCheck();
}
// 次のレベルまでの経験値（合計）：Lv2 14 / Lv3 70 / Lv4 200 / Lv5 430 / Lv6 770 / Lv7 1260 / Lv8 1920
//   元の式（6lv³ + 14lv²）のおよそ 7 割。Lv3 からは 10 の位でそろえる
const needExp = lv => (lv <= 1 ? 14 : Math.round((6 * lv * lv * lv + 14 * lv * lv) * 0.07) * 10);
function levelUps() {
  for (const c of state.party) {
    while (c.hp > 0 && c.exp >= needExp(c.lv)) {
      c.lv++;
      const hp = rnd(c.grow.hp[0], c.grow.hp[1]), ac = c.lv % 2 === 0 ? 1 : 0;
      c.maxhp += hp; c.hp += hp; c.maxmp += c.grow.mp; c.mp += c.grow.mp;
      c.atk = [c.atk[0] + 1, c.atk[1] + 1]; c.ac -= ac;
      (c.gains = c.gains || []).push({ hp, mp: c.grow.mp, ac });
      log(L`${c.name}は レベル${c.lv}に上がった！`, 'good');
    }
  }
}
// 見取り図：手に入れた階だけ、地図に全部描く（歩いた記録 seen は増やさないので、探索率はそのまま）
function revealMap(fl) { state.flags.mapFl = state.flags.mapFl || {}; state.flags.mapFl[fl] = true; }
const mapKnown = fl => !!(state.flags.mapFl && state.flags.mapFl[fl]);
async function victory() {
  const m = MONS[battle.kind];
  const total = Math.round(m.exp * battle.enemies.length * battle.expMul);
  const alive = aliveParty();
  const share = Math.max(1, Math.floor(total / alive.length));
  const wasBoss = battle.boss, onWin = battle.onWin;
  battle = null; render();
  log(L`勝った。経験値 ${share}`, 'good');
  alive.forEach(c => { c.exp += share; });
  levelUps();
  mode = 'explore';
  if (onWin) onWin();
  render();
  if (wasBoss) {
    state.flags.bossDown = true;
    showDialog([
      L('番人の手から、大槌が落ちた。'),
      L('次の音は、鳴らなかった。'),
      L('窓の外の赤が、消えていく。'),
    ]);
  }
}
function levelDown(c) {
  if (c.lv <= 1) { c.exp = 0; return false; }
  // 記録が無い（古い保存データ）ときは、平均的な伸びの分を戻す
  const g = (c.gains && c.gains.pop()) || { hp: Math.round((c.grow.hp[0] + c.grow.hp[1]) / 2), mp: c.grow.mp, ac: c.lv % 2 === 0 ? 1 : 0 };
  c.lv--;
  c.maxhp = Math.max(1, c.maxhp - g.hp); c.maxmp = Math.max(0, c.maxmp - g.mp);
  c.atk = [Math.max(1, c.atk[0] - 1), Math.max(1, c.atk[1] - 1)]; c.ac += g.ac;
  c.exp = c.lv >= 2 ? needExp(c.lv - 1) : 0;
  c.hp = Math.min(c.hp, c.maxhp); c.mp = Math.min(c.mp, c.maxmp);
  return true;
}
// 全滅：そのとき連れていた全員のレベルが 1 下がる（鐘の番人に負けたときは下がらない）
//   連れていなかった仲間はそのまま。持ち物や進み具合は失わない
async function defeat() {
  log(L('パーティは全滅した……'), 'bad');
  await sleep(800);
  const wasBoss = battle && battle.boss; // 鐘の番人に負けたときだけは、レベルを下げない
  battle = null; mode = 'explore';
  const down = wasBoss ? [] : state.party.filter(levelDown).map(c => dialogNotice(L`${c.name}は レベル${c.lv}に下がった……`));
  // 途中で閉じられても、保健室で回復した状態から再開できるよう、先に戻して保存しておく
  Object.assign(state, { fl: 1, x: START[0], y: START[1], dir: 2, room: null, cool: 6 });
  healAll(); markSeen(); saveGame();
  showDialog([dialogNotice(L('パーティは全滅した……')), L('……気がつくと、保健室のベッドの上だった。'), ...down], () => render());
}

// ---------------------------------------------------------------------
//  Input
// ---------------------------------------------------------------------
const menuEl = document.getElementById('menu'), menuBody = document.getElementById('menuBody');
const MENU_TABS = ['help', 'prog', 'log', 'restart'];
let menuTab = 'prog';
function toggleMenu(open) {
  if (open === undefined) open = mode !== 'menu';
  if (open && mode !== 'explore') return;
  mode = open ? 'menu' : 'explore';
  menuEl.style.display = open ? 'flex' : 'none';
  // スマホ（画面のボタン）では、メニューが操作ボタンを覆うので、下に大きな「閉じる」を出す（キーの説明は出さない）
  const cl = menuEl.querySelector('.close');
  if (open) { cl.classList.toggle('btn', usePad()); cl.textContent = usePad() ? L('閉じる') : L('M・Esc 閉じる ／ ← → 切り替え ／ ↑ ↓ スクロール（ここをタップでも閉じる）'); }
  if (open) showMenuTab(menuTab);
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// サブシナリオ：名前・始まったフラグ・終わったフラグ
const QUESTS = [
  [L('片方の上履き'), 'q1', 'q1done'], [L('逃げた人体模型'), 'q2', 'q2done'], [L('最後の放送'), 'q3', 'q3done'],
  [L('卒業アルバム'), 'q4', 'q4done'], [L('迷子の新入生'), 'q5', 'q5done'], [L('見つめる肖像画'), 'q6', 'q6done'], [L('用務員の鍵束'), 'q7', 'q7done'],
];
// 進捗：体験したことだけを並べる（まだ起きていない本筋・始まっていない話・行っていない階は出さない。全体の数や広さもわからないようにする）
function progressHTML() {
  const f = state.flags;
  const t = Math.floor(state.time / 60), time = L`${Math.floor(t / 60)}時間${String(t % 60).padStart(2, '0')}分`;
  const main = [
    [f.metNurse, L('保健の先生と話した')], [f.hadTeacher || f.saeki, L('職員室の先生が仲間になった')], [f.reveal, L('窓の外の空を見た')],
    [f.mizuno, L('水野が仲間になった')], [f.bellRoom, L('鐘楼にたどり着いた')], [f.bossDown, L('鐘の番人を倒した')],
  ].filter(([b]) => b).map(([, t]) => `<div>■ ${t}</div>`);
  if (!f.bossDown) main.push(L('<div>□ ？？？</div>')); // 本筋がまだ終わっていないことだけを示す（中身は出さない）
  const quests = QUESTS.filter(([, a, b]) => f[a] || f[b]).map(([n, , b]) => `<div>${f[b] ? L`■ ${n}　達成` : L`□ ${n}　進行中`}</div>`);
  const floors = Object.keys(MAPS).filter(k => state.seen[k] && state.seen[k].size > 0).map(k => MAPS[k].name);
  return L`<div>現在地：${esc(placeName(state.fl, state.x, state.y))}</div>
    <div>連れて行ける人数：${partyCap()}人</div>
    <div>プレイ時間：${time}</div>
    <h4>本筋</h4>${main.join('')}
    <h4>頼まれごと</h4>${quests.join('') || L('<div>まだ何もない</div>')}
    <h4>行った階</h4><div>${floors.join(L('　')) || L('なし')}</div>
    <h4>持ち物</h4><div>${state.items.length ? state.items.map(i => esc(ITEM_NAME[i])).join(L('、')) : L('なし')}</div>`;
}
function showMenuTab(tab) {
  menuTab = tab;
  menuEl.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  if (tab === 'help') {
    menuBody.innerHTML = document.getElementById('helpText').innerHTML;
    // 言語の切り替え：保存して読み込み直し、ヘルプを開いたところから続ける
    menuBody.querySelectorAll('[data-lang]').forEach(b => {
      b.classList.toggle('on', b.dataset.lang === LANG);
      b.onclick = () => {
        if (b.dataset.lang === LANG) return;
        saveGame();
        try { sessionStorage.setItem('chime.langResume', '1'); } catch (e) {}
        setLang(b.dataset.lang);
      };
    });
  }
  else if (tab === 'prog') menuBody.innerHTML = progressHTML();
  else if (tab === 'log') menuBody.innerHTML = state.history.length ? state.history.map(t => `<div>${esc(t)}</div>`).join('') : L('<div>まだ何もない</div>');
  else menuBody.innerHTML = L('<div>タイトル画面に戻ります。進み具合は保存されていて、「つづきから」で続けられます。</div><div class="restart"><button id="restartBtn">タイトルに戻る</button></div>') + (usePad() ? '' : L('<div style="margin-top:6px">（Space・Enter でも選べる）</div>'));
  menuBody.scrollTop = tab === 'log' ? menuBody.scrollHeight : 0;
  const rb = document.getElementById('restartBtn');
  if (rb) rb.onclick = askRestart;
}
// はじめから：確認を 2 回出す（念押し）。消したら保存を止めて読み込み直す
let restarting = false;
// メニューの「タイトルに戻る」：保存してからタイトル画面へ（データは消さない）
function askRestart() {
  toggleMenu(false);
  saveGame();
  document.getElementById('log').innerHTML = '';
  showTitle(true);
}
// メニュー内の操作：← → でタブ、↑ ↓ でスクロール、M・Esc で閉じる
function menuKey(k) {
  const i = MENU_TABS.indexOf(menuTab);
  if (['m', 'M', 'Escape'].includes(k)) toggleMenu(false);
  else if (['ArrowLeft', 'Numpad4', 'Numpad1', '4', '1', 'a', 'A', 'q', 'Q'].includes(k)) showMenuTab(MENU_TABS[(i + MENU_TABS.length - 1) % MENU_TABS.length]);
  else if (['ArrowRight', 'Numpad6', 'Numpad3', '6', '3', 'd', 'D', 'e', 'E'].includes(k)) showMenuTab(MENU_TABS[(i + 1) % MENU_TABS.length]);
  else if ([' ', 'Enter', 'NumpadEnter'].includes(k) && menuTab === 'restart') askRestart();
  else if (['ArrowUp', 'Numpad5', 'Numpad8', '8', '5', 'w', 'W'].includes(k)) menuBody.scrollTop -= 80;
  else if (['ArrowDown', 'Numpad2', '2', 's', 'S'].includes(k)) menuBody.scrollTop += 80;
}
menuEl.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); showMenuTab(b.dataset.tab); }));
menuEl.querySelector('.close').addEventListener('click', () => toggleMenu(false));

// ---------------------------------------------------------------------
//  保存と再開：ブラウザの保存領域（localStorage）に自動で保存する。
//  PC・スマホのブラウザ・iPhone のホーム画面から開いた場合のどれでも、次に開くと続きから始まる
//  （ブラウザごと・ホーム画面のアプリごとに別々に保存される）
// ---------------------------------------------------------------------
const SAVE_KEY = 'chime.save.v1';
// 旧セーブの履歴は文章だけなので、既知の通知の文型を取り除く。
const LEGACY_NOTICE_PATTERNS = [
  /^― .+ ―$/,
  /^(?:ゴツン。)?壁だ。$|^扉(?:だ。.*|を開け(?:た|て通り抜けた)。|は開かない。|は正面を向いて通る。|には鍵がかかっている。)$|^横移動では扉を通れない。$/,
  /^(?:上り|下り)階段だ。.*$|^階段(?:の側面だ。|を(?:上った|下りた)。.+)$|^.+がいる。(?:［[^］]+］(?:で話しかける)?)?$/,
  /^(?:ベッドがある|机がある|下駄箱が並んでいる|トイレの個室だ|洗面台がある|ステージだ|給水タンクだ|室外機が並んでいる|プールだ|プールの水が、.*|何かがある|特に何もない)。$/,
  /^(?:カーテンが閉まっている|カーテンの隙間からも、外の様子はうかがえない|外は見えない|窓は開かない|窓は固く閉ざされ、びくともしない|遠くに街が見える)。$/,
  /^(?:窓の外は、夜になりきれない空だ|窓の外は燃えるような夕焼けだ|遠くの街並みが、?暗い赤の底に沈んでいる|遠くの街並みが茜色に沈んでいく|(?:紺から暗い紫|紫からオレンジ)へ――空の色?が、?(?:どこか落ち着かない|ゆっくり滲んでいる)|柵の向こうに、(?:空がある|夜になりきれない空が広がっている))。$/,
  /が (?:舞い上がった|飛んできた|動き出した|立ち上がった|浮かび上がった|起き上がった|構えた|顔を上げた|襲いかかってきた|\d+体 あらわれた|あらわれた)[。！]$/,
  /(?:の こうげき|を たおした|は (?:身を守っている|気力が足りない|眠った|眠っている|縮みあがって眠ってしまった|まどろみに 落ちた|(?:ひらりと)?かわした|消えた|動かなくなった|じゅもんを知らない)|には 効かなかった|を となえた)[。！]?$/,
  /^(?:番人が (?:大槌で)?鐘を打った。.*|……はずれた|MPが足りない|全員が 身構えた|逃げ出した……|(?:うまく)?逃げきれた。|(?:しかし )?回りこまれた|しかし 回りこまれてしまった！|パーティは全滅した……)$/,
  /^(?:オートを止めた。|オート戦闘を止めた。.*|勝った。経験値 \d+|敵を全滅させた！.*)$|(?:に \d+ のダメージ|は \d+ のダメージを受けた|は 倒れた……|は 倒れたまま、目を閉じている。|は レベル\d+に(?:上がった！|下がった……))$/,
  /^(?:(?:体力(?:とMP)?|MP)が回復した。|誰も怪我をしていない。|手当てできる人がいない。|回復の呪文を使える仲間がいない|みんな ?回復した|仲間全員の HP が 回復した)$|(?:を手当てした| HP が回復した|HPが \d+ 回復した|は \d+ 回復した)$/,
  /^★ (?:頼れる仲間が増え、)?\d+人で行動できるようになった$|が ?仲間に加わった！?$|^(?:カードを束に戻した。|開かない。|……何も起きない。)$|^「[^」]+」が貼ってある。$/,
];
function legacyStoryHistory(history) {
  let windowRecorded = false;
  return history.filter(text => {
    const line = text.trim();
    // 最初に外を見た場面と窓の通常通知で同じ文を使っていた。
    if (line === '夜が近づいている。') {
      if (windowRecorded) return false;
      windowRecorded = true;
    }
    return !LEGACY_NOTICE_PATTERNS.some(pattern => pattern.test(line));
  });
}

const setsToArrays = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v]]));
function saveGame() {
  if (!state || battle || restarting || mode === 'title') return; // タイトル画面では保存しない。戦闘中は保存しない（戦闘前の状態から再開）
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, at: Date.now(), state: { ...state, seen: setsToArrays(state.seen), seenE: setsToArrays(state.seenE) } })); } catch (e) { /* 保存できない環境では何もしない */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) return false;
    const save = JSON.parse(raw), s = save.state;
    const toSets = o => Object.fromEntries(Object.keys(MAPS).map(k => [k, new Set((o && o[k]) || [])]));
    s.seen = toSets(s.seen); s.seenE = toSets(s.seenE);
    s.items = s.items || []; s.time = s.time || 0; s.flags = s.flags || {};
    s.history = Array.isArray(s.history) ? s.history.filter(t => typeof t === 'string') : [];
    if (!(save.v >= 2)) s.history = legacyStoryHistory(s.history);
    if (s.flags.saeki && !s.flags.teacher) { // 旧版：佐伯先生がいたら、そのまま先生枠に
      const c = (s.party || []).find(c => c.id === 'saeki');
      s.teachers = { saeki: c || null }; if (c) { c.id = 't_saeki'; c.cls = L('体育'); s.flags.teacher = 'saeki'; s.flags.hadTeacher = true; } else delete s.teachers.saeki;
    }
    if (!MAPS[s.fl] || !inMap(s.fl, s.x, s.y)) Object.assign(s, { fl: 1, x: START[0], y: START[1], dir: 2 }); // 校舎の形が変わって位置が無くなったら保健室から
    const savedStair = stairAt(s.fl, s.x, s.y);
    if (savedStair) { // 階段の配置が変わった旧セーブは、出入口へ移す
      [s.x, s.y] = stairEntry(savedStair.st);
      s.dir = (savedStair.st.dir + 2) % 4;
    }
    state = s;
    s.teachers = s.teachers || {};
    s.party = s.party.map(c => {
      if (!c.id || c.id === 'hero') return c;
      const k = c.id === 'mizuno' ? 'mizuno' : c.id.startsWith('t_') ? c.id.slice(2) : null;
      if (!k) return c;
      if (!s.teachers[k]) s.teachers[k] = c;
      return s.teachers[k];
    });
    // 名前と教科は、いま表示している言葉で持ち直す（言葉を切り替えたとき・旧版の「Player」）
    for (const c of [...s.party, ...Object.values(s.teachers)]) {
      if (!c) continue;
      const src = c.id === 'hero' ? HERO() : c.id === 'mizuno' ? RECRUITS.mizuno() : c.id && c.id.startsWith('t_') ? teacherOf(c.id.slice(2)) : null;
      if (src) { c.name = src.name; c.cls = src.cls; }
    }
    if (s.flags.mizuno) s.flags.metMizuno = true;
    for (const c of [...s.party, ...Object.values(s.teachers)]) if (c && c.spells) c.spells = [...new Set(c.spells.map(id => (id === 'chalk' ? 'spark' : id)))];
    return true;
  } catch (e) { return false; }
}
// 動いたら少し待って保存。タブを閉じる・アプリを切り替えるときにも保存
var saveTimer = 0;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveGame, 400); }
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
window.addEventListener('pagehide', saveGame);
// プレイ時間（画面が見えている間だけ数える）
setInterval(() => { if (state && !document.hidden && mode !== 'title') state.time++; }, 1000);
setInterval(saveGame, 15000);
function handleKey(k) {
  if (mode === 'ending') { if (endingStep && [' ', 'Enter', 'NumpadEnter', 'z'].includes(k)) endingStep(); return; }
  if (battle && battle.auto) { stopAuto(); return; }
  if (mode === 'menu') { menuKey(k); return; }
  if (mode === 'bigmap') {
    if (['Escape', 'm', 'M', ' ', 'Enter', 'Backspace'].includes(k)) closeBigMap();
    else if (['ArrowRight', 'ArrowUp', 'Numpad6', 'Numpad8', 'd', 'D', 'w', 'W', 'e', 'E'].includes(k)) bigMapStep(1);
    else if (['ArrowLeft', 'ArrowDown', 'Numpad4', 'Numpad2', 'a', 'A', 's', 'S', 'q', 'Q'].includes(k)) bigMapStep(-1);
    return;
  }
  if (mode === 'dialog') { if ([' ', 'Enter', 'NumpadEnter', 'z'].includes(k)) advanceDialog(); return; }
  if (mode === 'choice') {
    const i = parseInt(k, 10);
    if (i >= 1 && i <= menuOpts.length) menuOpts[i - 1][1]();
    else if (['Escape', 'm', 'M', 'Backspace'].includes(k)) menuOpts[menuOpts.length - 1][1]();
    else menuCursorKey(k);
    return;
  }
  if (mode === 'battle') {
    const i = parseInt(k, 10);
    if (i >= 1 && i <= menuOpts.length) menuOpts[i - 1][1]();
    else if (['Escape', 'Backspace', 'm', 'M'].includes(k)) backInput();
    else menuCursorKey(k);
    return;
  }
  if (mode !== 'explore') return;
  switch (k) {
    case 'Numpad5': case 'ArrowUp': case 'w': case 'W': move(0); break;
    case 'Numpad2': case 'ArrowDown': case 's': case 'S': move(2); break;
    case 'Numpad4': case 'ArrowLeft': case 'a': case 'A': turn(-1); break;
    case 'Numpad6': case 'ArrowRight': case 'd': case 'D': turn(1); break;
    case 'Numpad1': case 'q': case 'Q': move(3); break;
    case 'Numpad3': case 'e': case 'E': move(1); break;
    case ' ': case 'Enter': case 'NumpadEnter': interact(); break;
    case 'h': case 'H': fieldHeal(); break;
    case 'm': case 'M': toggleMenu(true); break;
  }
}
// スマホ用の操作ボタン：押した瞬間に反応する。場面によって意味が変わる
//   会話中：どれを押しても次へ / メニュー中：閉じる / 戦闘中：M がひとつ戻る（行動は画面内のボタンで選ぶ）
document.querySelectorAll('#pad button').forEach(b => {
  b.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 120);
    const k = b.dataset.k;
    if (mode === 'ending') { if (endingStep) endingStep(); return; }
    if (mode === 'dialog') { advanceDialog(); return; }
    if (mode === 'menu') { menuKey(k); return; }
    if (mode === 'bigmap') { closeBigMap(); return; }
    if (battle && battle.auto) { stopAuto(); return; }
    if (mode === 'battle' || mode === 'choice') { const o = menuOpts[padBtns.indexOf(b)]; if (o) o[1](); return; } // 移動のボタンは何もしない（隠れている）
    const pos = `${state.fl},${state.x},${state.y}`;
    handleKey(k);
    if (HOLD_KEYS.includes(k) && mode === 'explore' && `${state.fl},${state.x},${state.y}` !== pos) startHold(b, k, ev.pointerId);
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, stopHold);
});
// 移動のボタン（前・後ろ・横）は押しっぱなしで歩き続ける（回転は 1 回ずつ）
//   進めなかったとき・会話や戦闘が始まったときは止まる。指を離し直すまで再開しない
const HOLD_KEYS = ['Numpad5', 'Numpad2', 'Numpad1', 'Numpad3'], HOLD_MS = 500;
let holdTimer = null;
function startHold(b, k, pid) {
  stopHold();
  try { b.setPointerCapture(pid); } catch (e) {} // 指がボタンの外にずれても、離すまでは押したまま
  holdTimer = setInterval(() => {
    if (mode !== 'explore' || battle) { stopHold(); return; }
    const pos = `${state.fl},${state.x},${state.y}`;
    b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 120);
    handleKey(k);
    if (`${state.fl},${state.x},${state.y}` === pos || mode !== 'explore') stopHold(); // 壁・扉・人などで進めなかった
  }, HOLD_MS);
}
function stopHold() { clearInterval(holdTimer); holdTimer = null; }
window.addEventListener('blur', stopHold);
document.addEventListener('visibilitychange', stopHold);
// 長押しで出るメニュー（コピー・画像の保存など）を出さない
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('selectstart', e => e.preventDefault());
// ダブルタップでの拡大・ピンチでの拡大を止める（iPhone の Safari は viewport の指定だけでは止まらないため）
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  if (bigEl.contains(e.target)) {
    if (e.target.closest('button')) e.preventDefault(); // 地図ボタンは pointerup で反応済み
    return;
  }
  const now = Date.now(); if (now - lastTouchEnd < 350) e.preventDefault(); lastTouchEnd = now;
}, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
// iPhone の Safari は「拡大しない」指定を無視してダブルタップで拡大するので、タップする所では touchstart を止める
//   （操作ボタン・プレイ画面・ステータス・地図。ボタンの動作は pointerdown / pointerup で受けているので影響しない）
for (const el of [...document.querySelectorAll('#pad button'), document.getElementById('view'), document.getElementById('party'), mc])
  el.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
document.addEventListener('touchstart', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false }); // 2本指の拡大
window.addEventListener('keydown', e => {
  if (appsDlg.classList.contains('on')) { appsKey(e); return; } // アプリ一覧への確認：ゲームのキーは効かない
  if (mode === 'title' || licenseEl.classList.contains('on')) { titleKey(e); return; }
  if (mode === 'bigmap' && e.target instanceof HTMLButtonElement && bigEl.contains(e.target) && [' ', 'Enter'].includes(e.key)) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  // テンキー：探索中は e.code（NumLock の有無に関係なく）で移動。戦闘・会話中は数字として扱う
  if ((mode === 'explore' || mode === 'menu' || mode === 'bigmap') && /^Numpad[1-8]$|^NumpadEnter$/.test(e.code)) { e.preventDefault(); handleKey(e.code); return; }
  if ((mode === 'battle' || mode === 'choice') && /^Numpad\d$/.test(e.code)) { handleKey(e.code.slice(-1)); return; }
  // Q W E A S D M・Space は、日本語入力がオンでも同じように効くよう e.code で読む
  const letter = { KeyQ: 'q', KeyW: 'w', KeyE: 'e', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyM: 'm', KeyH: 'h', Space: ' ' }[e.code];
  if (letter && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); handleKey(letter); return; }
  handleKey(e.key);
});

// ---------------------------------------------------------------------
//  タイトル画面と License
// ---------------------------------------------------------------------
const titleEl = document.getElementById('title'), titleBtns = titleEl.querySelector('.btns');
const licenseEl = document.getElementById('license'), copyrightEl = document.getElementById('copyright');
document.getElementById('build').textContent = `build ${BUILD}`;
function setTitleButtons(opts, ask, pick = 0) { // pick：はじめに選んでおく選択肢
  titleBtns.innerHTML = ask ? `<div class="ask">${ask}</div>` : '';
  opts.forEach(([label, fn]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = fn;
    b.addEventListener('focus', () => markTitleCur(b)); b.addEventListener('pointerenter', () => markTitleCur(b));
    titleBtns.appendChild(b);
  });
  const first = titleBtns.querySelectorAll('button')[pick]; markTitleCur(first); first.focus();
}
// 選んでいる選択肢に印（濃く表示）。フォーカスの表示はブラウザによって出ないことがあるので、自分で付ける
function markTitleCur(b) { titleBtns.querySelectorAll('button').forEach(x => x.classList.toggle('cur', x === b)); }
function titleCur() { return titleBtns.querySelector('button.cur') || titleBtns.querySelector('button'); }
function showTitle(hasSave) {
  mode = 'title'; titleEl.classList.add('on');
  // 進み具合があるときだけ「はじめから」を出す。消す前に 2 回確かめる
  const main = () => setTitleButtons(hasSave
    ? [[L('つづきから'), () => startFromTitle(true)], [L('はじめから'), () => setTitleButtons([
        [L('はい'), () => setTitleButtons([[L('消してはじめから'), () => startFromTitle(false)], [L('やめる'), main]], L('本当によろしいですか？<br>消したデータは元に戻せません。'), 1)],
        [L('いいえ'), main]], L('保存されているデータが消えます。<br>はじめからやり直しますか？'), 1)]] // 消す確認は、はじめ「いいえ」「やめる」を選んでおく
    : [[L('ベッドから出る'), () => startFromTitle(false)]]);
  main();
}
function startFromTitle(cont) {
  titleEl.classList.remove('on');
  document.activeElement?.blur();
  mode = 'explore';
  if (cont) { render(); log(L('― 続きから再開した ―'), 'sys'); return; }
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  newGame(); markSeen(); state.room = placeName(1, START[0], START[1]);
  render();
  showDialog([
    L('……目を覚ますと、保健室のベッドの上だった。'),
    L('下校時刻は、とうに過ぎている。'),
    L('どこか遠くで、チャイムが鳴っている。'),
  ]);
}
// タイトル画面のキー：W S（↑ ↓）で選び、Space・Enter で決める。Tab でも移動できる（著作権の表示にも届く）
//   License が開いているときは、Esc・Space・Enter で閉じる
function titleKey(e) {
  if (licenseEl.classList.contains('on')) {
    if (['Escape', 'Enter', ' '].includes(e.key) || e.code === 'Space') { e.preventDefault(); closeLicense(); }
    else if (e.key === 'Tab') { e.preventDefault(); licenseEl.querySelector('.close').focus(); } // 開いている間は Close から出ない
    return;
  }
  const btns = [...titleBtns.querySelectorAll('button')];
  if (e.key === 'Tab') return; // Tab での移動はブラウザに任せる
  if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
    if (document.activeElement instanceof HTMLButtonElement && titleEl.contains(document.activeElement)) return; // 選んでいるボタンをそのまま押す
    e.preventDefault(); titleCur().click(); return; // フォーカスがないときは、印の付いている選択肢
  }
  const i = btns.indexOf(titleCur());
  const go = b => { markTitleCur(b); b.focus(); };
  if (['KeyW', 'KeyA', 'KeyQ'].includes(e.code) || ['ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); go(btns[(i + btns.length - 1) % btns.length]); }
  else if (['KeyS', 'KeyD', 'KeyE'].includes(e.code) || ['ArrowDown', 'ArrowRight'].includes(e.key)) { e.preventDefault(); go(btns[(i + 1) % btns.length]); }
}
function openLicense() { licenseEl.classList.add('on'); licenseEl.querySelector('.close').focus(); }
function closeLicense() { licenseEl.classList.remove('on'); copyrightEl.focus(); }
copyrightEl.addEventListener('click', openLicense);
licenseEl.querySelector('.close').addEventListener('click', closeLicense);
licenseEl.addEventListener('click', e => { if (e.target === licenseEl) closeLicense(); }); // 枠の外を押したら閉じる

// タイトル画面の右上：アプリ一覧へ移動するボタン（アイコンは文字のデータから描く。# が白）
const APPS_ICON = [
  '......###...###.',
  '.....#...#.#...#',
  '.....#...#.#...#',
  '.....#..#..#..#.',
  '.....#..#..#..#.',
  '....##..####..#.',
  '..##.......#..#.',
  '.#............#.',
  '#.............#.',
  '#..............#',
  '############...#',
  '............#..#',
  '.###########...#',
  '.#............#.',
  '..##........##..',
  '....########....'
];
const appsBtn = document.getElementById('appsBtn'), appsDlg = document.getElementById('appsDlg');
{
  const ctx = appsBtn.querySelector('canvas').getContext('2d');
  ctx.fillStyle = '#fff';
  APPS_ICON.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') ctx.fillRect(x, y, 1, 1); }));
}
appsDlg.querySelector('.msg').textContent = L('アプリ一覧に移動します。\nこのゲームを離れますがよろしいですか？');
function openApps() { appsDlg.classList.add('on'); appsDlg.querySelector('.no').focus(); } // 誤って移動しないよう、はじめは No
function closeApps() { appsDlg.classList.remove('on'); appsBtn.focus(); }
appsBtn.addEventListener('click', openApps);
appsDlg.querySelector('.yes').addEventListener('click', () => { location.href = 'https://daisuqe.github.io/'; });
appsDlg.querySelector('.no').addEventListener('click', closeApps);
appsDlg.addEventListener('click', e => { if (e.target === appsDlg) closeApps(); }); // 外側を押したら閉じる
// 確認の間のキー：A D・W S・← → で Yes / No を選び、Space・Enter で押す。Esc・M で閉じる
function appsKey(e) {
  const yes = appsDlg.querySelector('.yes'), no = appsDlg.querySelector('.no');
  if (e.key === 'Escape' || e.code === 'KeyM') { e.preventDefault(); closeApps(); return; }
  if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === no ? yes : no).focus(); return; }
  if (['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyQ', 'KeyE'].includes(e.code) || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault(); (document.activeElement === no ? yes : no).focus(); return;
  }
  if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
    if (document.activeElement === yes || document.activeElement === no) return; // 選んでいるボタンをそのまま押す
    e.preventDefault(); no.focus();
  }
}

// ---------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------
NPCS.forEach(n => [...(n.imgs || []), n.img].forEach(s => s && getImage(s)));
Object.values(ITEM_IMG).forEach(v => getImage(v.src));
Object.values(MONS).forEach(m => [m.img, ...(m.imgs || [])].forEach(s => s && getImage(s)));
Object.values(ITEM_IMG).forEach(i => getImage(i.src)); DECOR.forEach(d => getImage(d.img));
const hasSave = loadGame();
if (!hasSave) { newGame(); markSeen(); }
state.room = placeName(state.fl, state.x, state.y);
render();
// 言語を切り替えて読み込み直したときは、タイトルを出さずにヘルプを開いたところから
let langResume = false;
try { langResume = sessionStorage.getItem('chime.langResume') === '1'; sessionStorage.removeItem('chime.langResume'); } catch (e) {}
if (langResume && hasSave) { startFromTitle(true); menuTab = 'help'; toggleMenu(true); }
else showTitle(hasSave);
// fonts may load late; redraw once they do
if (document.fonts) document.fonts.ready.then(() => render());

'use strict';
// =====================================================================
//  Chime — 放課後の校舎ダンジョン（プロトタイプ）
//  校舎データは school.js、人物・サブシナリオは events.js
// =====================================================================
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
  if (edgeAt(fl, x, y, d) !== WALL) return null;
  const F = MAPS[fl], a = areaAt(fl, x, y);
  if (!a || a.outdoor) return null;
  const man = F.deco[x + ',' + y + ',' + d]; if (man) return man;
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
const HERO = () => mkChar({ id: 'hero', name: 'Player', cls: '生徒', maxhp: 20, maxmp: 0, atk: [3, 8], ac: 7, agi: 10, grow: { hp: [4, 8], mp: 0 } });
const RECRUITS = {
  saeki: () => mkChar({ id: 'saeki', name: '佐伯', cls: '教員', maxhp: 15, maxmp: 8, atk: [2, 6], ac: 8, agi: 7, spells: ['heal', 'scold'], grow: { hp: [3, 6], mp: 3 } }),
  mizuno: () => mkChar({ id: 'mizuno', name: '水野', cls: '図書委員', maxhp: 10, maxmp: 10, atk: [1, 4], ac: 9, agi: 12, spells: ['spark', 'thunder'], grow: { hp: [2, 4], mp: 4 } }),
};
const SPELLS = {
  heal: { name: '手当て', mp: 2 },
  scold: { name: '一喝', mp: 3 },
  spark: { name: '火花', mp: 2 },
  thunder: { name: '雷鳴', mp: 4 },
  lecture: { name: '長い話', mp: 2 },     // 敵1体を確実に近く眠らせる
  chalk: { name: 'チョーク投げ', mp: 2 }, // 敵1体にダメージ
  quiz: { name: '抜き打ちテスト', mp: 4 }, // 敵全体に小ダメージ
  chorus: { name: '合唱', mp: 4 },       // 仲間全員を少し回復
  drill: { name: '避難訓練', mp: 3 },    // この回、仲間全員が身を守る
};
const MONS = {
  shoe:     { name: '呪いの上履き', img: 'image/monster_cursed_shoe.png', ih: 95, lift: 0, hp: [3, 5],   atk: [1, 3],  ac: 8, agi: 8,  exp: 4,   shape: 'shoe',     grp: [2, 4] },
  dust:     { name: 'ほこりの精', img: 'image/monster_dust_spirit.png', ih: 85, lift: 30,   hp: [2, 4],   atk: [1, 2],  ac: 9, agi: 12, exp: 3,   shape: 'dust',     grp: [2, 5] },
  model:    { name: '人体模型', img: 'image/monster_anatomical_model.png', ih: 230, lift: 0,     hp: [7, 11],  atk: [2, 5],  ac: 7, agi: 6,  exp: 10,  shape: 'model',    grp: [1, 2] },
  skel:     { name: '骨格標本', img: 'image/monster_skeleton_.png', ih: 245, lift: 0,     hp: [10, 15], atk: [2, 7],  ac: 6, agi: 9,  exp: 16,  shape: 'skeleton', grp: [1, 3] },
  homework: { name: '宿題の亡霊', img: 'image/monster_homework_wraith.png', ih: 205, lift: 20,   hp: [8, 12],  atk: [2, 5],  ac: 5, agi: 11, exp: 14,  shape: 'ghost',    grp: [1, 3] },
  book:     { name: '人喰い辞書', img: 'image/monster_man_eating_dictionary.png', ih: 115, lift: 20,   hp: [6, 10],  atk: [3, 6],  ac: 6, agi: 10, exp: 12,  shape: 'book',     grp: [1, 3] },
  shadow:   { name: '黒板の影', img: 'image/monster_blackboard_shadow.png', ih: 255, lift: 0,     hp: [14, 20], atk: [3, 8],  ac: 5, agi: 10, exp: 26,  shape: 'shadow',   grp: [1, 3] },
  portrait: { name: '見つめる肖像画', img: 'image/monster_watching_portrait_.png', ih: 165, lift: 50, hp: [12, 16], atk: [2, 9], ac: 4, agi: 8,  exp: 22,  shape: 'portrait', grp: [1, 2] },
  // ゾンビ（人の大きさ）
  wander:   { name: 'さまよう生徒', img: 'image/zombie_01_wanderer-realistic.png', ih: 240, lift: 0,  hp: [6, 9],   atk: [1, 4],  ac: 8, agi: 5,  exp: 7,   shape: 'model',    grp: [1, 3] },
  gaper:    { name: 'うめく亡者', img: 'image/zombie_07_gaper-realistic.png', ih: 245, lift: 0,     hp: [8, 11],  atk: [2, 5],  ac: 7, agi: 6,  exp: 10,  shape: 'model',    grp: [1, 3] },
  longarm:  { name: '手長の亡者', img: 'image/zombie_04_longarm-realistic.png', ih: 255, lift: 0,   hp: [10, 14], atk: [2, 7],  ac: 6, agi: 8,  exp: 15,  shape: 'model',    grp: [1, 2] },
  fungal:   { name: 'キノコ憑き', img: 'image/zombie_05_fungal_host-realistic.png', ih: 245, lift: 0, hp: [12, 16], atk: [2, 6],  ac: 6, agi: 5,  exp: 17,  shape: 'model',    grp: [1, 2] },
  boneshell:{ name: '半骨の亡者', img: 'image/zombie_08_bone_shell-realistic.png', ih: 245, lift: 0, hp: [14, 19], atk: [3, 8],  ac: 5, agi: 8,  exp: 24,  shape: 'skeleton', grp: [1, 2] },
  kimono:   { name: '着物の亡者', img: 'image/zombie_09_grave_risen_japanese.png', ih: 235, lift: 0, hp: [15, 20], atk: [3, 9],  ac: 5, agi: 9,  exp: 27,  shape: 'model',    grp: [1, 2] },
  // ラスボス：鐘の番人（鐘を守り、槌で打ち鳴らす）
  bell:     { name: '鐘の番人', img: 'image/monster_time_warden_boss.png', ih: 260, lift: 0,     hp: [80, 80], atk: [5, 11], ac: 3, agi: 9,  exp: 240, shape: 'bell',     grp: [1, 1], boss: true },
};
// 敵の実際の大きさ：cm＝画像の縦の高さ、up＝床から浮いている高さ（cm）。人物の立ち絵と同じ縮尺で描く
const MON_SIZE = {
  shoe: { cm: 30 }, dust: { cm: 40, up: 45 }, model: { cm: 165 }, skel: { cm: 170 }, homework: { cm: 150, up: 20 },
  book: { cm: 45, up: 70 }, shadow: { cm: 180 }, portrait: { cm: 110, up: 70 },
  wander: { cm: 168 }, gaper: { cm: 172 }, longarm: { cm: 185 }, fungal: { cm: 165 }, boneshell: { cm: 170 }, kimono: { cm: 160 },
  bell: { cm: 215 },
};
const FLOOR_MONS = {
  1: ['shoe', 'dust', 'model', 'wander', 'gaper'],
  2: ['model', 'skel', 'homework', 'book', 'gaper', 'longarm', 'fungal'],
  3: ['skel', 'shadow', 'portrait', 'homework', 'boneshell', 'kimono'],
  4: ['shadow', 'boneshell', 'kimono'],
  5: ['skel', 'shadow', 'kimono'],
};

// ---------------------------------------------------------------------
//  Utils
// ---------------------------------------------------------------------
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const DIR_NAME = ['北', '東', '南', '西'];
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

const itemAt = (fl, x, y) => ITEMS.find(it => it.fl === fl && it.x === x && it.y === y && !state.flags['got_' + it.id]) || null;
function npcAt(fl, x, y) {
  return NPCS.find(n => n.fl === fl && n.x === x && n.y === y && !(n.hide && n.hide(state))) || null;
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
const SKY_EAST = [[0, '#101c36'], [0.4, '#16162e'], [0.68, '#201024'], [0.86, '#2e0e18'], [1, '#420e14']];
const SKY_WEST = [[0, '#1c2e52'], [0.4, '#2c2046'], [0.68, '#641e34'], [0.86, '#ac2a2c'], [1, '#e04a36']];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixCol = (a, b, t) => { const A = hex(a), B = hex(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };
// 方位 az（度, 北=0 東=90 南=180 西=270）→ 西らしさ 0..1
// 東西の差は控えめに：0..1 の範囲を中間(0.5)へ6割寄せる（東 0.3 〜 西 0.7）
const westness = az => 0.4 * Math.pow((1 + Math.cos((az - 270) * Math.PI / 180)) / 2, 1.6) + 0.6 * 0.5;
const colAzimuth = (dir, x) => dir * 90 + Math.atan((x - CX) / FX) * 180 / Math.PI;
const azToX = (dir, az) => { const r = ((az - dir * 90) % 360 + 540) % 360 - 180; if (Math.abs(r) > 80) return null; return CX + Math.tan(r * Math.PI / 180) * FX; };

function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// 360°分の星と建物（単位：度）。画面中央付近で 1度 ≒ FX*π/180 px
const PX_PER_DEG = FX * Math.PI / 180;
const PANO = (() => {
  const R = seeded(4242), stars = [], far = [], near = [];
  for (let i = 0; i < 140; i++) stars.push({ az: R() * 360, y: R() * CY * 0.4, a: 0.15 + R() * 0.35 });
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
  return { stars, far, near, ridge };
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
  for (const st of PANO.stars) {
    const px = azToX(dir, st.az); if (px === null || px < 0 || px > VW) continue;
    x.fillStyle = 'rgba(220,230,255,' + st.a + ')'; x.fillRect(px, st.y, 1, 1);
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
  g.save(); path(q); g.clip();
  // 空は無限遠：窓の向きではなく、プレイヤーの視線方向のパノラマを使う
  g.drawImage(skyCanvases[state.dir], 0, 0);
  g.drawImage(townCanvases[state.dir], 0, 0);
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
  } else if (type === 'clock') { // 四角い時計
    box(0.43, 0.57, 0.3, 0.44); ln(0.5, 0.37, 0.5, 0.42); ln(0.5, 0.37, 0.54, 0.37);
  } else if (type === 'hoop') { // バスケットゴール：板と、その下のリング（四角）。床から約 3m
    const b = top > 0.5 ? 0.62 : 0.12;
    box(0.3, 0.7, b, b + 0.3); box(0.42, 0.58, b + 0.06, b + 0.18); box(0.44, 0.56, b - 0.04, b);
  } else if (type === 'mirror') {
    box(0.18, 0.82, -0.05, 0.32); ln(0.3, 0.05, 0.42, 0.22); ln(0.36, 0.02, 0.5, 0.22);
  }
}
function drawFace(e1, e2, kind, d, edgeL = true, edgeR = true, curtain = null, deco = null, top = 0.5) {
  if (kind === FENCE) { drawFence(e1, e2, d, edgeL, edgeR); return; }
  const q = quad(e1, e2, 0, 1, -0.5, top);
  // 黒で塗り＋左右の縦の辺も黒でなぞる（隣の面との継ぎ目から奥の線が透けないように）
  path(q); g.fillStyle = '#000'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(...q[0]); g.lineTo(...q[3]); g.moveTo(...q[1]); g.lineTo(...q[2]); g.stroke(); // 縦の継ぎ目だけ
  g.strokeStyle = lineCol(d); g.lineWidth = 1.5;
  // 端を少し延ばして（square）、隣の面の黒い縦なぞりで天井際・床際の線が途切れないように
  const seg = (a, b) => { g.lineCap = 'square'; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); g.lineCap = 'butt'; };
  seg(q[0], q[1]); seg(q[3], q[2]);           // 天井際・床際
  if (edgeL) seg(q[0], q[3]);
  if (edgeR) seg(q[1], q[2]);
  if (kind === WIN) drawWindow(e1, e2, d, curtain);
  else if (kind === DOOR) drawDoor(e1, e2, d);
  else if (deco) drawDeco(e1, e2, d, deco, edgeL, edgeR, top);
}
// 階段（ソリッド）。局所座標 u：進む方向 0..2（2マス）、v：横 -A..A、h：高さ
// 上り：床 -0.5 から天井 +0.5 へ。下り：床 -0.5 から下の階の床 -1.5 へ（床に開いた吹き抜け）
const STEPS = 7, STAIR_A = 0.44;
function drawStairSolid(st) {
  const [sx, sy] = DIRS[st.dir], [tx, ty] = DIRS[(st.dir + 1) % 4];
  const ox = st.x - sx * 0.5 - state.x, oy = st.y - sy * 0.5 - state.y; // 手前の辺の中心（自分からの相対）
  const [fx, fy] = DIRS[state.dir], [rx, ry] = DIRS[(state.dir + 1) % 4];
  // 局所 (u,v,h) → 視点座標 [横, 奥行, 高さ]
  const V = (u, v, h) => { const wx = ox + sx * u + tx * v, wy = oy + sy * u + ty * v; return [wx * rx + wy * ry, wx * fx + wy * fy, h]; };
  const N = (nu, nv, nh) => { const wx = sx * nu + tx * nv, wy = sy * nu + ty * nv; return [wx * rx + wy * ry, wx * fx + wy * fy, nh]; };
  const faces = [];
  const add = (pts, n) => {
    const p = pts.map(q => V(...q)), nn = N(...n), c = p[0];
    if (nn[0] * -c[0] + nn[1] * -c[1] + nn[2] * -c[2] <= 1e-6) return; // 裏向きは描かない（視点は原点）
    const m = p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length, a[2] + q[2] / p.length], [0, 0, 0]);
    faces.push({ p, dist: Math.hypot(m[0], m[1], m[2]), dmin: Math.min(...p.map(q => q[1])) });
  };
  const A = STAIR_A, dd = 2 / STEPS, rh = 1 / STEPS;
  if (st.up) {
    const prof = [[0, -0.5]];
    for (let k = 0; k < STEPS; k++) {
      const u0 = k * dd, u1 = u0 + dd, h0 = -0.5 + k * rh, h1 = h0 + rh;
      add([[u0, -A, h0], [u0, A, h0], [u0, A, h1], [u0, -A, h1]], [-1, 0, 0]); // 蹴込み
      add([[u0, -A, h1], [u0, A, h1], [u1, A, h1], [u1, -A, h1]], [0, 0, 1]);  // 踏み板
      prof.push([u0, h1], [u1, h1]);
    }
    prof.push([2, -0.5]);
    add(prof.map(([u, h]) => [u, -A, h]), [0, -1, 0]); // 側面（段々の形）
    add(prof.map(([u, h]) => [u, A, h]).reverse(), [0, 1, 0]);
  } else {
    const prof = [[0, -0.5], [2, -0.5]];
    const low = [];
    for (let k = 0; k < STEPS; k++) {
      const u0 = k * dd, u1 = u0 + dd, h1 = -0.5 - (k + 1) * rh, h0 = h1 + rh;
      add([[u0, -A, h1], [u0, A, h1], [u1, A, h1], [u1, -A, h1]], [0, 0, 1]);  // 踏み板
      add([[u0, -A, h0], [u0, A, h0], [u0, A, h1], [u0, -A, h1]], [1, 0, 0]);  // 段の落ち（奥向き）
      low.push([u0, h1], [u1, h1]);
    }
    add([[2, -A, -0.5], [2, A, -0.5], [2, A, -1.5], [2, -A, -1.5]], [-1, 0, 0]); // 吹き抜けの奥の壁
    const wall = prof.concat(low.slice().reverse()); // 床の高さ〜段の上の、吹き抜けの側壁
    add(wall.map(([u, h]) => [u, -A, h]), [0, 1, 0]);
    add(wall.map(([u, h]) => [u, A, h]), [0, -1, 0]);
  }
  faces.sort((a, b) => b.dist - a.dist);
  g.lineJoin = 'bevel'; g.lineWidth = 1.5; g.fillStyle = '#000'; g.strokeStyle = '#fff';
  // 下り階段は床に開いた穴の中だけに描く（床下の部分が手前の壁の下からはみ出さないように）
  const hole = !st.up && [[0, -0.5], [2, -0.5], [2, 0.5], [0, 0.5]].map(([u, v]) => V(u, v, -0.5));
  const clip = hole && hole.every(q => q[1] > 0.06);
  if (clip) { g.save(); path(hole.map(q => P(...q))); g.clip(); }
  for (const fc of faces) {
    if (fc.p.every(q => q[1] < 0.06)) continue; // 自分より後ろ
    path(fc.p.map(q => P(...q))); g.fill(); g.stroke();
  }
  if (clip) g.restore();
  // 上り階段：天井に開いた穴（枠だけ）。マス2つ分の幅・長さ、天井の高さ h=+0.5
  if (st.up) {
    const c = [[0, -0.5], [2, -0.5], [2, 0.5], [0, 0.5]].map(([u, v]) => V(u, v, 0.5));
    g.strokeStyle = lineCol(Math.max(0.5, Math.min(...c.map(q => q[1])))); g.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      if (a[1] < 0.06 || b[1] < 0.06) continue; // 自分より後ろにかかる辺は描かない
      g.beginPath(); g.moveTo(...P(...a)); g.lineTo(...P(...b)); g.stroke();
    }
  }
  g.lineJoin = 'miter';
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
  stall: { hx: 0.45, hy: 0.45, h: 0.86 },    // トイレの個室
  sink: { hx: 0.4, hy: 0.2, h: 0.36 },       // 洗面台
  stage: { hx: 0.5, hy: 0.5, h: 0.26 },      // 体育館のステージ
  tank: { hx: 0.5, hy: 0.5, h: 0.95 },       // 屋上の給水タンク
  unit: { hx: 0.32, hy: 0.22, h: 0.32 },     // 室外機
};
function drawBox(kind, l, f) {
  const p = BOX[kind]; if (!p) return;
  const sideways = DIRS[state.dir][0] !== 0, a = sideways ? p.hy : p.hx, b = sideways ? p.hx : p.hy;
  const x0 = l - a, x1 = l + a, d0 = f - b, d1 = f + b, h0 = -0.5, h1 = -0.5 + p.h;
  g.strokeStyle = lineCol(f); g.lineWidth = 1.5; g.fillStyle = '#000'; g.lineJoin = 'bevel';
  const faces = [];
  if (x0 > 0) faces.push([[x0, d1], [x0, d0]]);
  if (x1 < 0) faces.push([[x1, d0], [x1, d1]]);
  if (d0 > 0.1) faces.push([[x0, d0], [x1, d0]]);
  for (const [e1, e2] of faces) {
    path(quad(e1, e2, 0, 1, h0, h1)); g.fill(); g.stroke();
    const w = Math.hypot(e2[0] - e1[0], e2[1] - e1[1]);
    const ln = (u0, hh0, u1, hh1) => { const q = quad(e1, e2, u0, u1, hh0, hh1); g.beginPath(); g.moveTo(...q[3]); g.lineTo(...q[1]); g.stroke(); };
    const rect = (u0, u1, hh0, hh1) => { path(quad(e1, e2, u0, u1, hh0, hh1)); g.stroke(); };
    g.lineWidth = 1;
    if (kind === 'getabako') { const n = Math.max(2, Math.round(w / 0.15)); for (let i = 1; i < n; i++) ln(i / n, h0, i / n, h1); for (const t of [0.25, 0.5, 0.75]) ln(0, h0 + p.h * t, 1, h0 + p.h * t); }
    else if (kind === 'stall') { rect(0.18, 0.82, h0 + 0.04, h1 - 0.04); ln(0.72, h0 + 0.4, 0.76, h0 + 0.4); }
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
function renderView() {
  // 描画は 640x470 の論理座標。キャンバス実寸（1.3倍）に合わせて拡大し、線をくっきり保つ
  g.setTransform(cv.width / VW, 0, 0, cv.height / VH, 0, 0);
  g.fillStyle = "#000"; g.fillRect(0, 0, VW, VH);
  const dir = state.dir, [fx, fy] = DIRS[dir], [rx, ry] = DIRS[(dir + 1) % 4];
  // 屋外（屋上・プール）では空と街並みが背景になる
  const here = areaAt(state.fl, state.x, state.y);
  if (here && here.outdoor) { g.drawImage(skyCanvases[dir], 0, 0); g.drawImage(townCanvases[dir], 0, 0); }
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
    const dc = DC(f, vl, lat > 0 ? 1 : 3), tp = TOP(f, vl);
    if (lat > 0) drawFace([lat, f + 0.5], [lat, f - 0.5], e, f, !isFace(nFar), !isFace(nNear), cu, dc, tp);
    else drawFace([lat, f - 0.5], [lat, f + 0.5], e, f, !isFace(nNear), !isFace(nFar), cu, dc, tp);
  };
  // 面の端の縦線は、同じ直線上に面が続く場合は描かない（角・端だけ線を引く）
  for (let f = DEPTH; f >= 0; f--) {
    for (const l of order) {
      // 奥の辺（正面向きの面）
      const far = E(f, l, 0);
      if (isFace(far)) drawFace([l - 0.5, f + 0.5], [l + 0.5, f + 0.5], far, f + 0.5, !isFace(E(f, l - 1, 0)), !isFace(E(f, l + 1, 0)), far === WIN ? CU(f, l, 0) : null, DC(f, l, 0), TOP(f, l));
      // マスの中身（階段・人）
      if (f >= 1 && inMap(state.fl, wx(f, l), wy(f, l))) {
        const sa = stairAt(state.fl, wx(f, l), wy(f, l));
        if (sa) {
          // もう一方のマスの (f,l)。こちらが先（f が大きい、同じなら |l| が大きい）なら描く
          const [ox2, oy2] = stairCells(sa.st)[1 - sa.i], dx = ox2 - state.x, dy = oy2 - state.y;
          const f2 = dx * fx + dy * fy, l2 = dx * rx + dy * ry;
          if (f > f2 || (f === f2 && Math.abs(l) > Math.abs(l2))) drawStairSolid(sa.st);
        }
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
//  Monster wireframes
// ---------------------------------------------------------------------
function drawMonster(shape, x, y, s, col) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.strokeStyle = col; g.fillStyle = '#000'; g.lineWidth = 2 / s;
  const L = (...p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); };
  const C = (cx, cy, r, fill = true) => { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); if (fill) g.fill(); g.stroke(); };
  const eyes = (y0, dx, r = 4) => { C(-dx, y0, r); C(dx, y0, r); g.fillStyle = col; g.beginPath(); g.arc(-dx, y0, r / 2.5, 0, 7); g.arc(dx, y0, r / 2.5, 0, 7); g.fill(); g.fillStyle = '#000'; };
  switch (shape) {
    case 'shoe':
      g.beginPath(); g.moveTo(-60, 0); g.lineTo(65, 0); g.quadraticCurveTo(92, -6, 78, -34); g.lineTo(18, -46); g.lineTo(-38, -58);
      g.quadraticCurveTo(-68, -52, -60, 0); g.closePath(); g.fill(); g.stroke();
      L(-62, -10, 82, -10); L(40, -40, 50, -2); g.beginPath(); g.ellipse(-12, -50, 26, 7, -0.15, 0, 7); g.stroke();
      eyes(-30, 14, 5);
      L(54, -18, 60, -12, 66, -18, 72, -12, 78, -18);
      break;
    case 'dust': {
      g.beginPath();
      for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2, r = 42 + (i % 2 ? 10 : -2) + Math.sin(i * 2.3) * 5; g.lineTo(Math.cos(a) * r, -45 + Math.sin(a) * r * 0.85); }
      g.closePath(); g.fill(); g.stroke(); eyes(-50, 14, 6); L(-10, -28, 0, -32, 10, -28); break;
    }
    case 'model':
      C(0, -175, 22); L(0, -197, 0, -153);
      g.beginPath(); g.rect(-34, -150, 68, 90); g.fill(); g.stroke(); L(0, -150, 0, -60);
      C(14, -128, 8, false); g.beginPath(); g.ellipse(18, -100, 10, 14, 0, 0, 7); g.stroke(); L(4, -80, 30, -76);
      L(-34, -145, -55, -95, -48, -60); L(34, -145, 55, -95, 50, -62);
      L(-20, -60, -24, -10); L(20, -60, 24, -10); L(-40, 0, 40, 0); L(0, -10, 0, 0); L(-24, -10, 24, -10);
      eyes(-180, 9, 4); break;
    case 'skeleton':
      C(0, -178, 22); g.beginPath(); g.rect(-12, -160, 24, 12); g.stroke(); eyes(-182, 9, 6);
      L(0, -148, 0, -60);
      for (let i = 0; i < 5; i++) { const yy = -140 + i * 14, w = 34 - i * 3; g.beginPath(); g.ellipse(0, yy, w, 6, 0, Math.PI, 0, true); g.stroke(); }
      L(-36, -144, -52, -100, -46, -58); L(36, -144, 52, -100, 46, -58);
      g.beginPath(); g.ellipse(0, -58, 26, 10, 0, 0, 7); g.stroke();
      L(-16, -52, -20, -4, -30, 0); L(16, -52, 20, -4, 30, 0); break;
    case 'ghost':
      g.beginPath(); g.moveTo(-50, -20); g.quadraticCurveTo(-58, -170, 0, -175); g.quadraticCurveTo(58, -170, 50, -20);
      for (let i = 0; i < 5; i++) g.quadraticCurveTo(40 - i * 20, -5 - (i % 2) * 20, 30 - i * 20, -20);
      g.closePath(); g.fill(); g.stroke(); eyes(-125, 16, 7);
      g.beginPath(); g.ellipse(0, -95, 9, 12, 0, 0, 7); g.stroke();
      g.save(); g.translate(45, -80); g.rotate(0.25); g.beginPath(); g.rect(-18, -26, 36, 50); g.fill(); g.stroke();
      for (let i = 0; i < 5; i++) L(-12, -16 + i * 9, 12, -16 + i * 9); g.restore(); break;
    case 'book':
      g.beginPath(); g.moveTo(-80, -40); g.lineTo(0, -10); g.lineTo(80, -40); g.lineTo(80, -120); g.lineTo(0, -95); g.lineTo(-80, -120); g.closePath(); g.fill(); g.stroke();
      L(0, -95, 0, -10);
      for (let i = 0; i < 6; i++) { L(-70, -104 + i * 10 + i * 2, -12, -82 + i * 10); L(12, -82 + i * 10, 70, -104 + i * 10 + i * 2); }
      L(-6, -90, 0, -78, 6, -90); L(-6, -60, 0, -48, 6, -60); L(-6, -30, 0, -18, 6, -30);
      eyes(-135, 20, 7); break;
    case 'shadow':
      g.beginPath(); g.rect(-75, -200, 150, 110); g.fill(); g.stroke(); L(-80, -88, 80, -88);
      g.beginPath(); g.moveTo(-30, -92); g.quadraticCurveTo(-34, -180, 0, -185); g.quadraticCurveTo(34, -180, 30, -92); g.stroke();
      g.setLineDash([4, 4]); L(-50, -110, -20, -170); L(40, -120, 60, -180); g.setLineDash([]);
      eyes(-150, 11, 5); L(-30, -88, -40, 0); L(30, -88, 40, 0); L(-40, 0, 40, 0); break;
    case 'portrait':
      g.beginPath(); g.rect(-60, -200, 120, 150); g.fill(); g.stroke(); g.beginPath(); g.rect(-50, -190, 100, 130); g.stroke();
      g.beginPath(); g.ellipse(0, -130, 26, 34, 0, 0, 7); g.stroke();
      L(-26, -138, -36, -170, 0, -178, 36, -170, 26, -138);
      eyes(-135, 11, 5); L(-10, -110, 10, -110); L(-40, -60, -30, -80, 30, -80, 40, -60);
      L(-30, -50, -30, 0); L(30, -50, 30, 0); L(-50, 0, 50, 0); break;
    case 'bell':
      L(-90, -240, 90, -240); L(0, -240, 0, -215);
      g.beginPath(); g.moveTo(-30, -215); g.lineTo(30, -215); g.quadraticCurveTo(52, -200, 55, -120); g.quadraticCurveTo(60, -70, 95, -55);
      g.lineTo(-95, -55); g.quadraticCurveTo(-60, -70, -55, -120); g.quadraticCurveTo(-52, -200, -30, -215); g.closePath(); g.fill(); g.stroke();
      L(-80, -65, 80, -65); L(-60, -100, 60, -100);
      L(20, -205, 30, -170, 18, -140, 28, -110);
      C(0, -38, 14); L(0, -55, 0, -52);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(-22, -150, 6, 0, 7); g.arc(22, -150, 6, 0, 7); g.fill();
      break;
  }
  g.restore();
}

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
// 画像があれば画像、なければワイヤーフレーム。戻り値は頭の上端の y
function drawEnemy(m, x, y, s, flash) {
  const im = m.img && getImage(m.img);
  if (!im) { drawMonster(m.shape, x, y, s, '#fff'); return y - 170 * s; }
  const h = m.ih * s, w = h * im.naturalWidth / im.naturalHeight, top = y - m.lift * s - h;
  g.imageSmoothingEnabled = false;
  g.drawImage(flash ? tinted(im, '#fff') : im, x - w / 2, top, w, h);
  return top;
}
// 敵を、目の前の床に立つ実物大で描く（探索画面の背景と同じ遠近）
//   奥行き：ふつう 1.5 マス先、小さい敵は 1 マス先、ボスは立っていた場所（約1マス先）。前が壁ならその手前まで
//   左右：通路の幅（±0.35 マス）に収まるよう並べ、数が多いときは前後に少しずらす
function enemySpots(n, kind) {
  const sz = MON_SIZE[kind] || { cm: 160 };
  let free = 0; // 正面に何マス空いているか
  for (let x = state.x, y = state.y; free < 3 && edgeAt(state.fl, x, y, state.dir) === OPEN; free++) { x += DIRS[state.dir][0]; y += DIRS[state.dir][1]; }
  const base = Math.min(MONS[kind].boss ? 1.1 : sz.cm < 60 ? 1.0 : 1.5, free + 0.45);
  // 3体までは横一列、それより多いときは後ろにもう1列（前列3体・後列は残り）。後列は前列のすき間に入る
  const front = Math.min(3, n), back = n - front, out = [];
  const row = (k, f, shift) => { const gap = Math.min(0.36, 0.72 / Math.max(1, k - 1)); for (let i = 0; i < k; i++) out.push({ l: (i - (k - 1) / 2) * gap + shift, f }); };
  row(front, base, 0); if (back) row(back, base + 0.7, back % 2 ? 0.18 : 0); // 後列は前列のすき間に見えるようずらす
  return out;
}
function drawEnemyAt(kind, l, f, flash) {
  const m = MONS[kind], sz = MON_SIZE[kind] || { cm: 160 }, im = m.img && getImage(m.img);
  const up = (sz.up || 0) * CM, ht = sz.cm * CM;
  const top = P(l, f, -0.5 + up + ht), bot = P(l, f, -0.5 + up);
  const h = bot[1] - top[1];
  if (!im) { drawMonster(m.shape, bot[0], bot[1], h / 240, '#fff'); return top; }
  const w = h * im.naturalWidth / im.naturalHeight;
  g.imageSmoothingEnabled = false;
  g.drawImage(flash ? tinted(im, '#fff') : im, top[0] - w / 2, top[1], w, h);
  return top;
}
function renderBattle() {
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, VW, VH);
  const m = MONS[battle.kind];
  const n = battle.enemies.length;
  // 鐘楼の鐘（探索画面に描かれているので、戦闘では重ねない）
  const spots = enemySpots(n, battle.kind);
  // 奥の敵から順に描く
  battle.enemies.map((e, i) => ({ e, p: spots[i] })).sort((a, b) => b.p.f - a.p.f).forEach(({ e, p }) => {
    if (e.hp <= 0) return;
    const top = drawEnemyAt(battle.kind, p.l, p.f, e.flash);
    if (e.sleep > 0) { g.fillStyle = '#fff'; g.font = '18px DotGothic16, monospace'; g.textAlign = 'center'; g.fillText('Zz', top[0] + 24, top[1] + 4); }
  });
  const alive = battle.enemies.filter(e => e.hp > 0).length;
  g.font = '18px DotGothic16, monospace'; g.textAlign = 'center';
  const label = `${m.name}  ×${alive}`;
  const w = g.measureText(label).width + 28;
  g.fillStyle = '#000'; g.fillRect(CX - w / 2, 12, w, 30); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(CX - w / 2, 12, w, 30);
  g.fillStyle = '#fff'; g.fillText(label, CX, 33);
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
  const F = MAPS[state.fl], cs = 10, ox = Math.round(mc.width / 2 - (state.x + 0.5) * cs), oy = Math.round(mc.height / 2 - (state.y + 0.5) * cs), S = state.seen[state.fl];
  mg.fillStyle = '#000'; mg.fillRect(0, 0, mc.width, mc.height);
  const seen = (x, y) => S.has(x + ',' + y);
  for (let y = 0; y < F.H; y++) for (let x = 0; x < F.W; x++) {
    if (!seen(x, y)) continue;
    const px = ox + x * cs, py = oy + y * cs;
    const n = npcAt(state.fl, x, y);
    const pr = propAt(state.fl, x, y);
    if (pr) { mg.fillStyle = '#fff'; pr === 'bed' ? mg.fillRect(px + 3, py + 1, cs - 6, cs - 2) : mg.fillRect(px + 3, py + 3, cs - 6, cs - 6); }
    if (n) { mg.fillStyle = '#fff'; mg.beginPath(); mg.arc(px + cs / 2, py + cs / 2, 3, 0, 7); mg.fill(); }
  }
  for (const st of F.stairs) {
    const [ex, ey] = stairEntry(st); if (!seen(ex, ey) && !state.flags.mapAll) continue;
    mg.fillStyle = '#fff'; mg.font = '10px monospace'; mg.textAlign = 'center';
    for (const [x, y] of stairCells(st)) mg.fillText(st.up ? '▲' : '▼', ox + x * cs + cs / 2, oy + y * cs + cs - 2);
  }
  // 辺：どちらかの側のマスに立ったことがあれば描く
  // 白一色：壁＝実線、窓＝点線、扉＝壁の切れ目（両端だけ短い壁）
  mg.lineWidth = 2; mg.strokeStyle = '#fff';
  const seg = (k, x0, y0, x1, y1) => {
    if (k === OPEN || k === DOOR) return;
    mg.setLineDash(k === WIN ? [2, 2] : k === FENCE ? [1, 3] : []); mg.beginPath(); mg.moveTo(x0, y0); mg.lineTo(x1, y1); mg.stroke(); mg.setLineDash([]);
  };
  const SE = state.seenE[state.fl], all = state.flags.mapAll;
  for (let y = 0; y <= F.H; y++) for (let x = 0; x < F.W; x++) if (all ? seen(x, y) || seen(x, y - 1) : SE.has('h' + x + ',' + y)) {
    const k = F.h[y][x], px = ox + x * cs, py = oy + y * cs;
    if (k === DOOR) { seg(WALL, px, py, px + 3, py); seg(WALL, px + cs - 3, py, px + cs, py); seg(DOOR, px + 3, py, px + cs - 3, py); } else seg(k, px, py, px + cs, py);
  }
  for (let y = 0; y < F.H; y++) for (let x = 0; x <= F.W; x++) if (all ? seen(x, y) || seen(x - 1, y) : SE.has('v' + x + ',' + y)) {
    const k = F.v[y][x], px = ox + x * cs, py = oy + y * cs;
    if (k === DOOR) { seg(WALL, px, py, px, py + 3); seg(WALL, px, py + cs - 3, px, py + cs); seg(DOOR, px, py + 3, px, py + cs - 3); } else seg(k, px, py, px, py + cs);
  }
  const px = ox + state.x * cs + cs / 2, py = oy + state.y * cs + cs / 2, [dx, dy] = DIRS[state.dir];
  mg.fillStyle = '#ffffff'; mg.beginPath();
  mg.moveTo(px + dx * 5, py + dy * 5); mg.lineTo(px - dx * 3 - dy * 4, py - dy * 3 + dx * 4); mg.lineTo(px - dx * 3 + dy * 4, py - dy * 3 - dx * 4); mg.closePath(); mg.fill();
}
function renderHUD() {
  // プレイ画面の右上（内側）に現在地：例「B棟 1F 保健室 [2, 1] 南」
  document.getElementById('loc').textContent = `${placeName(state.fl, state.x, state.y)} [${state.x}, ${state.y}] ${DIR_NAME[state.dir]}`;
  document.getElementById('loc').style.display = battle ? 'none' : ''; // 戦闘中は敵の名前と重ならないよう隠す
  const rows = state.party.map(c => `<tr class="${c.hp <= 0 ? 'dead' : ''}" title="${c.cls} / AC ${c.ac}"><td>${c.name}</td><td class="num">${c.lv}</td>` +
    `<td class="num">${c.hp}/${c.maxhp}</td><td class="num">${c.maxmp ? c.mp : '-'}</td>` +
    `<td>${c.hp <= 0 ? '不能' : c.defend ? '防御' : 'OK'}</td></tr>`).join('');
  document.getElementById('party').innerHTML =
    '<tr><th>Name</th><th>Lv</th><th>HP</th><th>MP</th><th>Status</th></tr>' + rows;
}
function render() { renderView(); renderMap(); renderHUD(); checkCap(); saveSoon(); }

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
  remember(msg.trim());
  const d = document.createElement('div'); d.textContent = msg; if (cls) d.className = cls;
  logEl.appendChild(d);
  while (logEl.children.length > LOG_MAX) logEl.removeChild(logEl.firstChild);
  setTimeout(() => { d.classList.add('fade'); setTimeout(() => d.remove(), 400); }, LOG_MS);
}
const dlgEl = document.getElementById('dialog');
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
  const line = dialogQ.lines.shift();
  if (!line.startsWith('★')) remember(line); // ★ の行は log() 側で残る
  dlgEl.innerHTML = '';
  if (dialogQ.portrait) {
    const p = document.createElement('img'); p.src = dialogQ.portrait; p.className = 'portrait'; dlgEl.appendChild(p);
  }
  const t = document.createElement('div'); t.className = 'text'; t.textContent = line; dlgEl.appendChild(t);
  const nx = document.createElement('div'); nx.className = 'next'; nx.textContent = dialogQ.lines.length ? '▼ Space' : '■ Space'; dlgEl.appendChild(nx);
  dlgEl.style.display = 'block';
  if (line.startsWith('★')) log(line.replace('★ ', ''), 'good');
}
dlgEl.addEventListener('click', advanceDialog);

const cmdEl = document.getElementById('cmd');
function setMenu(title, opts) {
  menuOpts = opts;
  cmdEl.innerHTML = '';
  if (title) { const s = document.createElement('span'); s.className = 'who'; s.textContent = title; cmdEl.appendChild(s); }
  opts.forEach(([label, fn], i) => {
    const b = document.createElement('button'); b.textContent = `${i + 1} ${label}`; b.onclick = () => { if (mode === 'battle' || mode === 'choice') fn(); };
    cmdEl.appendChild(b);
  });
  updatePad();
}
// 会話のあとに選択肢を出す。数字キー・画面のボタン・スマホのボタンで選ぶ。Esc・M は最後の選択肢（いいえ）
function showChoice(title, opts) {
  mode = 'choice';
  setMenu(title, opts.map(([label, fn]) => [label, () => { clearMenu(); mode = 'explore'; fn(); render(); }]));
  render();
}
function clearMenu() { menuOpts = []; cmdEl.innerHTML = ''; updatePad(); }
// スマホの操作ボタン：戦闘で行動を選ぶ間は、上2段が行動 1〜6、M が「戻る」になる
const padBtns = [...document.querySelectorAll('#pad button')], PAD_DEFAULT = padBtns.map(b => b.innerHTML);
function updatePad() {
  const battleMenu = menuOpts.length > 0;
  document.getElementById('pad').classList.toggle('battle', battleMenu); // 横画面で並びを切り替える
  padBtns.forEach((b, i) => {
    if (!battleMenu) { b.innerHTML = PAD_DEFAULT[i]; b.disabled = false; return; }
    const o = i < 6 && menuOpts[i];
    b.innerHTML = o ? `${i + 1}<span>${o[0]}</span>` : i === 6 ? (mode === 'choice' ? 'M<span>やめる</span>' : 'M<span>戻る</span>') : '';
    b.disabled = !o && i !== 6;
  });
}
function shake() { const w = document.getElementById('viewWrap'); w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); }

// ---------------------------------------------------------------------
//  Exploration
// ---------------------------------------------------------------------
const CURTAIN_LINES = ['カーテンが閉まっている。', 'カーテンの隙間からも、外の様子はうかがえない。'];
const windowLine = (x, y, d) => edgeAt(state.fl, x, y, d) === FENCE ? '柵の向こうに、夕焼けの空が広がっている。' : pick(curtainAt(state.fl, x, y, d) != null ? CURTAIN_LINES : WINDOW_LINES);
const WINDOW_LINES = ['窓の外は燃えるような夕焼けだ。', '遠くの街並みが茜色に沈んでいく。', '窓は固く閉ざされ、びくともしない。', '紫からオレンジへ――空はずっと同じ色のままだ。'];

// offset: 0 前進 / 2 後退 / 3 左平行 / 1 右平行（向きは変えない）
function move(offset) {
  const d = (state.dir + offset) % 4;
  const nx = state.x + DIRS[d][0], ny = state.y + DIRS[d][1];
  const e = edgeAt(state.fl, state.x, state.y, d);
  if (isBlocking(e) || !inMap(state.fl, nx, ny)) { log(e === WIN || e === FENCE ? windowLine(state.x, state.y, d) : 'ゴツン。壁だ。', 'sys'); return; }
  const lk = e === DOOR && lockAt(state.fl, state.x, state.y, d);
  if (lk && !state.flags[lk]) { log('扉には鍵がかかっている。', 'sys'); return; }
  if (e === DOOR) log('扉を開けて通り抜けた。', 'sys');
  const sa = stairAt(state.fl, nx, ny);
  if (sa) {
    if (offset === 0 && sa.i === 0 && sa.st.dir === d) { useStairs(sa.st); return; }
    log('階段の側面だ。', 'sys'); return;
  }
  const pr = propAt(state.fl, nx, ny);
  if (pr) { log({ bed: 'ベッドがある。', desk: '机がある。', getabako: '下駄箱が並んでいる。', stall: 'トイレの個室だ。', sink: '洗面台がある。', stage: 'ステージだ。', tank: '給水タンクだ。', unit: '室外機が並んでいる。', pool: 'プールの水が、夕焼けを映している。' }[pr] || '何かがある。', 'sys'); return; }
  const n = npcAt(state.fl, nx, ny);
  if (n) { log(`${n.name}がいる。［Space］で話しかける`, 'sys'); return; }
  state.x = nx; state.y = ny;
  afterStep();
}
function turn(delta) { state.dir = (state.dir + delta + 4) % 4; markSeen(); render(); stairHint(); checkReveal(); }
function stairHint() { const st = stairAhead(); if (st) log(st.up ? '上り階段だ。［5］で上る' : '下り階段だ。［5］で下りる', 'sys'); }
// 昇り降り：つながる階の同じ id の階段の手前のマスへ。向きは階段に背を向ける
function useStairs(st) {
  const fl = +Object.keys(MAPS).find(k => +k !== state.fl && MAPS[k].stairs.some(t => t.id === st.id));
  const dst = MAPS[fl].stairs.find(t => t.id === st.id);
  const [ex, ey] = stairEntry(dst);
  Object.assign(state, { fl, x: ex, y: ey, dir: (dst.dir + 2) % 4, room: null, cool: 3 });
  log(`${st.up ? '階段を上った' : '階段を下りた'}。${MAPS[fl].name}`, 'sys');
  markSeen(); render();
}
// きっかけ：廊下の窓の目の前（距離0）で外を向いた瞬間、部屋のカーテンが開く
function checkReveal() {
  if (state.flags.reveal || battle || mode !== 'explore') return;
  if (edgeAt(state.fl, state.x, state.y, state.dir) !== WIN || curtainAt(state.fl, state.x, state.y, state.dir) != null) return;
  state.flags.reveal = true;
  showDialog([
    '窓の外は、燃えるような夕焼けだった。',
    '紫からオレンジへ――見たこともないほど鮮やかな空。',
  ], () => render());
}

function afterStep() {
  markSeen();
  const a = areaAt(state.fl, state.x, state.y), r = roomAt(state.fl, state.x, state.y);
  const rn = placeName(state.fl, state.x, state.y);
  if (rn !== state.room) { state.room = rn; if (a) log(`― ${a.bld ? a.bld + ' ' : ''}${a.name} ―`, 'sys'); }
  render();
  const it = itemAt(state.fl, state.x, state.y);
  if (it) {
    state.flags['got_' + it.id] = true;
    if (it.get) it.get(); else state.items.push(it.id);
    showDialog([...it.text, `★ ${ITEM_NAME[it.id]}を 手に入れた`], () => render(), null, it.id);
    return;
  }
  stairHint();
  checkReveal();
  if (mode !== 'explore') return;
  state.cool--;
  const safe = r && r.safe;
  if (!safe && state.cool <= 0 && Math.random() < 0.09) {
    const list = FLOOR_MONS[state.fl], k = pick(list), m = MONS[k];
    startBattle(k, groupSize(m));
  }
}

function interact() {
  const fx = state.x + DIRS[state.dir][0], fy = state.y + DIRS[state.dir][1];
  const ahead = edgeAt(state.fl, state.x, state.y, state.dir);
  const n = !isBlocking(ahead) && npcAt(state.fl, fx, fy);
  if (n) {
    const lines = n.talk(state);
    showDialog(lines, () => { if (n.after) n.after(state); render(); }, n);
    return;
  }
  const st = stairAhead();
  if (st) { useStairs(st); return; }
  if (ahead === WIN || ahead === FENCE) { log(windowLine(state.x, state.y, state.dir), 'sys'); return; }
  if (ahead === DOOR) { log('扉だ。前に進めば通り抜けられる。', 'sys'); return; }
  log('特に何もない。', 'sys');
}

function healAll() { state.party.forEach(c => { c.hp = c.maxhp; c.mp = c.maxmp; }); }

function fieldHeal() {
  const caster = state.party.find(c => c.hp > 0 && c.spells.includes('heal') && c.mp >= SPELLS.heal.mp);
  const choir = !caster && state.party.find(c => c.hp > 0 && c.spells.includes('chorus') && c.mp >= SPELLS.chorus.mp);
  if (choir) {
    if (!state.party.some(c => c.hp > 0 && c.hp < c.maxhp)) { log('誰も怪我をしていない。', 'sys'); return; }
    choir.mp -= SPELLS.chorus.mp;
    for (const t of aliveParty()) t.hp = Math.min(t.maxhp, t.hp + rnd(4, 7) + Math.floor(choir.lv / 2));
    log(`${choir.name}の合唱。仲間全員の HP が回復した`, 'good'); render(); return;
  }
  if (!caster) { log('回復の呪文を使える仲間がいない（またはMP不足）', 'sys'); return; }
  const tgt = state.party.filter(c => c.hp > 0 && c.hp < c.maxhp).sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
  if (!tgt) { log('誰も怪我をしていない。', 'sys'); return; }
  caster.mp -= SPELLS.heal.mp;
  const amt = Math.min(tgt.maxhp - tgt.hp, rnd(8, 14) + caster.lv);
  tgt.hp += amt;
  log(`${caster.name}の手当て。${tgt.name}のHPが ${amt} 回復した`, 'good');
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
//   ・ボス（鐘の番人）の HP：50 + 20×人数（2人 90 / 3人 110 / 4人 130）、攻撃力も同じ割合で増える
const ENEMY_MAX = 4;
const partyExtra = () => Math.max(0, state.party.length - 2);
const groupSize = m => Math.min(ENEMY_MAX, rnd(m.grp[0], m.grp[1]));
const hpMul = () => 1 + 0.3 * partyExtra(), atkMul = () => 1 + 0.15 * partyExtra(), expMul = () => 1 + 0.3 * partyExtra();
const enemyHP = m => (m.boss ? 50 + 20 * state.party.length : Math.round(rnd(m.hp[0], m.hp[1]) * hpMul()));
const enemyAtk = m => m.atk.map(v => Math.max(1, Math.round(v * atkMul())));
async function startBattle(kind, n, onWin) {
  const m = MONS[kind];
  mode = 'busy';
  battle = {
    kind, boss: !!m.boss, cmds: [], ci: 0, onWin, expMul: expMul(),
    enemies: Array.from({ length: Math.min(n, ENEMY_MAX) }, () => { const hp = enemyHP(m); return { name: m.name, hp, maxhp: hp, atk: enemyAtk(m), ac: m.ac, agi: m.agi, lv: state.fl, boss: !!m.boss, sleep: 0, flash: false }; }),
  };
  state.cool = 6;
  faceOpenSide();
  shake(); render();
  const cnt = battle.enemies.length;
  log(m.boss ? `${m.name}が 襲いかかってきた！` : `${m.name}が ${cnt > 1 ? cnt + '体 ' : ''}あらわれた！`, 'warn');
  await sleep(500);
  beginInput();
}
function beginInput() { battle.cmds = []; battle.ci = 0; mode = 'battle'; promptNext(); }
function promptNext() {
  while (battle.ci < state.party.length && state.party[battle.ci].hp <= 0) battle.ci++;
  if (battle.ci >= state.party.length) { runRound(); return; }
  showBattleMenu('main');
}
function showBattleMenu(kind) {
  const c = state.party[battle.ci];
  if (kind === 'main') {
    setMenu(`${c.name}の行動：`, [
      ['たたかう', () => choose({ t: 'fight' })],
      ['じゅもん', () => c.spells.length ? showBattleMenu('spell') : log(`${c.name}は じゅもんを知らない`, 'sys')],
      ['ぼうぎょ', () => choose({ t: 'defend' })],
      ['にげる', () => runAway()],
    ]);
  } else {
    setMenu(`${c.name}のじゅもん：`, [
      ...c.spells.map(id => [`${SPELLS[id].name} (${SPELLS[id].mp})`, () => c.mp >= SPELLS[id].mp ? choose({ t: 'spell', id }) : log('MPが足りない', 'sys')]),
      ['もどる', () => showBattleMenu('main')],
    ]);
  }
}
function choose(cmd) { battle.cmds[battle.ci] = cmd; battle.ci++; promptNext(); }
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
  render(); log(`${e.name}に ${dmg} のダメージ`);
  await sleep(SPD); e.flash = false;
  if (e.hp <= 0) { e.hp = 0; log(`${e.name}を たおした！`, 'good'); }
  render(); await sleep(SPD / 3);
}
async function partyAct(c, cmd) {
  if (cmd.t === 'defend') { log(`${c.name}は 身を守っている`); await sleep(SPD / 2); return; }
  if (cmd.t === 'fight') {
    const e = pick(enemiesAlive());
    log(`${c.name}の こうげき！`); await sleep(SPD);
    if (e.sleep > 0 || Math.random() < hitChance(c.lv, e.ac)) await hurtEnemy(e, rnd(c.atk[0], c.atk[1]) + Math.floor(c.lv / 2));
    else { log('  ……はずれた'); await sleep(SPD); }
    return;
  }
  const sp = SPELLS[cmd.id];
  if (c.mp < sp.mp) { log(`${c.name}は 気力が足りない！`); await sleep(SPD); return; }
  c.mp -= sp.mp; renderHUD();
  log(`${c.name}は ${sp.name}を となえた！`, 'warn'); await sleep(SPD);
  if (cmd.id === 'heal') {
    const t = aliveParty().sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
    const amt = Math.min(t.maxhp - t.hp, rnd(8, 14) + c.lv); t.hp += amt;
    log(`${t.name}のHPが ${amt} 回復した`, 'good'); renderHUD(); await sleep(SPD);
  } else if (cmd.id === 'scold') {
    for (const e of enemiesAlive()) {
      if (Math.random() < (e.boss ? 0.2 : 0.65)) { e.sleep = rnd(1, 3); log(`${e.name}は 縮みあがって眠ってしまった`); }
      else log(`${e.name}には 効かなかった`);
      render(); await sleep(SPD / 2);
    }
  } else if (cmd.id === 'spark') {
    await hurtEnemy(pick(enemiesAlive()), rnd(6, 11) + c.lv);
  } else if (cmd.id === 'thunder') {
    for (const e of enemiesAlive()) await hurtEnemy(e, rnd(4, 8) + c.lv);
  } else if (cmd.id === 'lecture') {
    const e = pick(enemiesAlive());
    if (Math.random() < (e.boss ? 0.3 : 0.9)) { e.sleep = rnd(2, 3); log(`${e.name}は 話の長さに 眠ってしまった`); } else log(`${e.name}には 効かなかった`);
    render(); await sleep(SPD);
  } else if (cmd.id === 'chalk') {
    await hurtEnemy(pick(enemiesAlive()), rnd(5, 9) + c.lv);
  } else if (cmd.id === 'quiz') {
    for (const e of enemiesAlive()) await hurtEnemy(e, rnd(2, 5) + Math.floor(c.lv / 2));
  } else if (cmd.id === 'chorus') {
    for (const t of aliveParty()) { const amt = Math.min(t.maxhp - t.hp, rnd(4, 7) + Math.floor(c.lv / 2)); t.hp += amt; }
    log('仲間全員の HP が 回復した', 'good'); renderHUD(); await sleep(SPD);
  } else if (cmd.id === 'drill') {
    aliveParty().forEach(t => { t.defend = true; });
    log('全員が 身を低くして 守りを固めた', 'good'); renderHUD(); await sleep(SPD);
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
  log(`${c.name}は ${dmg} のダメージを受けた`, 'bad');
  if (c.hp <= 0) log(`${c.name}は 倒れた……`, 'bad');
  await sleep(SPD);
}
async function enemyAct(e) {
  if (e.sleep > 0) { e.sleep--; log(`${e.name}は 眠っている`, 'sys'); await sleep(SPD / 2); return; }
  if (e.boss && Math.random() < 0.35) {
    log('番人が 大槌で鐘を打ち鳴らした！ ゴォォォン……', 'warn'); shake(); await sleep(SPD * 1.5);
    // 「最後の放送」を聞いていれば、鐘の響きが弱い
    for (const c of aliveParty()) await damageChar(c, state.flags.q3done ? rnd(1, 3) : rnd(3, 7));
    return;
  }
  const c = pickTarget();
  log(`${e.name}の こうげき！`); await sleep(SPD);
  if (Math.random() < hitChance(e.lv, c.ac)) await damageChar(c, rnd(e.atk[0], e.atk[1]));
  else { log(`  ${c.name}は ひらりとかわした`); await sleep(SPD); }
}
async function runAway() {
  if (mode !== 'battle') return;
  mode = 'busy'; clearMenu();
  log('逃げ出した……'); await sleep(SPD);
  if (!battle.boss && Math.random() < 0.6) {
    log('うまく逃げきれた。', 'sys'); battle = null; mode = 'explore'; render(); return;
  }
  log('しかし 回りこまれてしまった！', 'bad'); await sleep(SPD);
  for (const e of enemiesAlive()) { if (!aliveParty().length) break; await enemyAct(e); render(); }
  await endCheck();
}
const needExp = lv => 15 * lv * lv;
function levelUps() {
  for (const c of state.party) {
    while (c.hp > 0 && c.exp >= needExp(c.lv)) {
      c.lv++;
      const hp = rnd(c.grow.hp[0], c.grow.hp[1]), ac = c.lv % 2 === 0 ? 1 : 0;
      c.maxhp += hp; c.hp += hp; c.maxmp += c.grow.mp; c.mp += c.grow.mp;
      c.atk = [c.atk[0] + 1, c.atk[1] + 1]; c.ac -= ac;
      (c.gains = c.gains || []).push({ hp, mp: c.grow.mp, ac });
      log(`${c.name}は レベル${c.lv}に上がった！`, 'good');
    }
  }
}
// 見取り図：全階の歩けるマスを「見た」ことにする（壁が描かれる）
function revealAllMaps() {
  state.flags.mapAll = true;
  for (const k of Object.keys(MAPS)) { const F = MAPS[k];
    for (let y = 0; y < F.H; y++) for (let x = 0; x < F.W; x++) if (F.grid[y][x]) state.seen[k].add(x + ',' + y); }
}
async function victory() {
  const m = MONS[battle.kind];
  const total = Math.round(m.exp * battle.enemies.length * battle.expMul);
  const alive = aliveParty();
  const share = Math.max(1, Math.floor(total / alive.length));
  const wasBoss = battle.boss, onWin = battle.onWin;
  battle = null; render();
  log(`敵を全滅させた！ ひとりあたり 経験値 ${share}`, 'good');
  alive.forEach(c => { c.exp += share; });
  levelUps();
  mode = 'explore';
  if (onWin) onWin();
  render();
  if (wasBoss) {
    state.flags.bossDown = true;
    showDialog([
      '番人が崩れ落ちると、鳴りやまなかった鐘の音が ふっと途切れた。',
      '窓の外で、夕焼けがゆっくりと夜の藍色に溶けていく……',
      '― プロトタイプはここまで ―',
      '（このまま探索を続けられます）',
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
// 全滅：そのとき連れていた全員のレベルが 1 下がる
//   連れていなかった仲間はそのまま。持ち物や進み具合は失わない
async function defeat() {
  log('パーティは全滅した……', 'bad');
  await sleep(800);
  battle = null; mode = 'explore';
  const down = state.party.filter(levelDown).map(c => `${c.name}は レベル${c.lv}に下がった……`);
  showDialog(['パーティは全滅した……', '……気がつくと、保健室のベッドの上だった。', ...(down.length ? down : ['（これ以上レベルは下がらなかった）'])], () => {
    Object.assign(state, { fl: 1, x: START[0], y: START[1], dir: 2, room: null, cool: 6 });
    healAll(); markSeen(); render(); saveGame();
  });
}

// ---------------------------------------------------------------------
//  Input
// ---------------------------------------------------------------------
const menuEl = document.getElementById('menu'), menuBody = document.getElementById('menuBody');
const MENU_TABS = ['help', 'prog', 'log'];
let menuTab = 'prog';
function toggleMenu(open) {
  if (open === undefined) open = mode !== 'menu';
  if (open && mode !== 'explore') return;
  mode = open ? 'menu' : 'explore';
  menuEl.style.display = open ? 'flex' : 'none';
  if (open) showMenuTab(menuTab);
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// サブシナリオ：名前・始まったフラグ・終わったフラグ
const QUESTS = [
  ['片方の上履き', 'q1', 'q1done'], ['逃げた人体模型', 'q2', 'q2done'], ['最後の放送', 'q3', 'q3done'],
  ['卒業アルバム', 'q4', 'q4done'], ['迷子の新入生', 'q5', 'q5done'], ['見つめる肖像画', 'q6', 'q6done'], ['用務員の鍵束', 'q7', 'q7done'],
];
function progressHTML() {
  const f = state.flags, mark = b => (b ? '■' : '□');
  const t = Math.floor(state.time / 60), time = `${Math.floor(t / 60)}時間${String(t % 60).padStart(2, '0')}分`;
  const main = [
    [f.metNurse, '保健の先生と話した'], [f.hadTeacher || f.saeki, '職員室の先生が仲間になった'], [f.reveal, '窓の外の夕焼けを見た'],
    [f.mizuno, '水野が仲間になった'], [state.seen[4] && state.seen[4].size > 0, '鐘楼にたどり着いた'], [f.bossDown, '鐘の番人を倒した'],
  ];
  const quests = QUESTS.map(([n, a, b]) => f[b] ? `■ ${n}　達成` : f[a] ? `□ ${n}　進行中` : '□ ？？？');
  const floors = Object.keys(MAPS).map(k => {
    const F = MAPS[k]; let all = 0; for (const row of F.grid) for (const c of row) if (c) all++;
    const n = state.seen[k] ? state.seen[k].size : 0;
    return `${F.name} ${n ? Math.min(100, Math.round(n / all * 100)) + '%' : '未踏'}`;
  });
  const done = QUESTS.filter(q => f[q[2]]).length;
  return `<div>現在地：${esc(placeName(state.fl, state.x, state.y))}</div>
    <div>連れて行ける人数：${partyCap()}人（最大${PARTY_MAX}人）</div>
    <div>プレイ時間：${time}</div>
    <h4>本筋</h4>${main.map(([b, t]) => `<div>${mark(b)} ${t}</div>`).join('')}
    <h4>サブシナリオ（${done}/7）</h4>${quests.map(q => `<div>${q}</div>`).join('')}
    <h4>探索</h4><div>${floors.join('　')}</div>
    <h4>持ち物</h4><div>${state.items.length ? state.items.map(i => esc(ITEM_NAME[i])).join('、') : 'なし'}</div>
    <div class="restart"><button id="restartBtn">はじめからやり直す</button></div>`;
}
function showMenuTab(tab) {
  menuTab = tab;
  menuEl.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  if (tab === 'help') menuBody.innerHTML = document.getElementById('helpText').innerHTML;
  else if (tab === 'prog') menuBody.innerHTML = progressHTML();
  else menuBody.innerHTML = state.history.length ? state.history.map(t => `<div>${esc(t)}</div>`).join('') : '<div>まだ何もない</div>';
  menuBody.scrollTop = tab === 'log' ? menuBody.scrollHeight : 0;
  const rb = document.getElementById('restartBtn');
  if (rb) rb.onclick = () => { if (confirm('保存されている続きを消して、はじめからやり直しますか？')) { localStorage.removeItem(SAVE_KEY); location.reload(); } };
}
// メニュー内の操作：← → でタブ、↑ ↓ でスクロール、M・Esc で閉じる
function menuKey(k) {
  const i = MENU_TABS.indexOf(menuTab);
  if (['m', 'M', 'Escape'].includes(k)) toggleMenu(false);
  else if (['ArrowLeft', 'Numpad4', 'Numpad1', '4', '1', 'a'].includes(k)) showMenuTab(MENU_TABS[(i + 2) % 3]);
  else if (['ArrowRight', 'Numpad6', 'Numpad3', '6', '3', 'd'].includes(k)) showMenuTab(MENU_TABS[(i + 1) % 3]);
  else if (['ArrowUp', 'Numpad5', 'Numpad8', '8', '5', 'w'].includes(k)) menuBody.scrollTop -= 80;
  else if (['ArrowDown', 'Numpad2', '2', 's'].includes(k)) menuBody.scrollTop += 80;
}
menuEl.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); showMenuTab(b.dataset.tab); }));
menuEl.querySelector('.close').addEventListener('click', () => toggleMenu(false));

// ---------------------------------------------------------------------
//  保存と再開：ブラウザの保存領域（localStorage）に自動で保存する。
//  PC・スマホのブラウザ・iPhone のホーム画面から開いた場合のどれでも、次に開くと続きから始まる
//  （ブラウザごと・ホーム画面のアプリごとに別々に保存される）
// ---------------------------------------------------------------------
const SAVE_KEY = 'chime.save.v1';
const setsToArrays = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v]]));
function saveGame() {
  if (!state || battle) return; // 戦闘中は保存しない（戦闘前の状態から再開）
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, at: Date.now(), state: { ...state, seen: setsToArrays(state.seen), seenE: setsToArrays(state.seenE) } })); } catch (e) { /* 保存できない環境では何もしない */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) return false;
    const s = JSON.parse(raw).state;
    const toSets = o => Object.fromEntries(Object.keys(MAPS).map(k => [k, new Set((o && o[k]) || [])]));
    s.seen = toSets(s.seen); s.seenE = toSets(s.seenE);
    s.items = s.items || []; s.history = s.history || []; s.time = s.time || 0; s.flags = s.flags || {};
    if (s.flags.saeki && !s.flags.teacher) { // 旧版：佐伯先生がいたら、そのまま先生枠に
      const c = (s.party || []).find(c => c.id === 'saeki');
      s.teachers = { saeki: c || null }; if (c) { c.id = 't_saeki'; c.cls = '体育'; s.flags.teacher = 'saeki'; s.flags.hadTeacher = true; } else delete s.teachers.saeki;
    }
    if (!MAPS[s.fl] || !inMap(s.fl, s.x, s.y)) return false; // 校舎の形が変わって位置が無効なら、はじめから
    state = s;
    s.teachers = s.teachers || {};
    s.party = s.party.map(c => {
      if (!c.id || c.id === 'hero') return c;
      const k = c.id === 'mizuno' ? 'mizuno' : c.id.startsWith('t_') ? c.id.slice(2) : null;
      if (!k) return c;
      if (!s.teachers[k]) s.teachers[k] = c;
      return s.teachers[k];
    });
    if (s.flags.mizuno) s.flags.metMizuno = true;
    return true;
  } catch (e) { return false; }
}
// 動いたら少し待って保存。タブを閉じる・アプリを切り替えるときにも保存
var saveTimer = 0;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveGame, 400); }
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
window.addEventListener('pagehide', saveGame);
// プレイ時間（画面が見えている間だけ数える）
setInterval(() => { if (state && !document.hidden) state.time++; }, 1000);
setInterval(saveGame, 15000);
function handleKey(k) {
  if (mode === 'menu') { menuKey(k); return; }
  if (mode === 'dialog') { if (k === ' ' || k === 'Enter' || k === 'z') advanceDialog(); return; }
  if (mode === 'choice') {
    const i = parseInt(k, 10);
    if (i >= 1 && i <= menuOpts.length) menuOpts[i - 1][1]();
    else if (['Escape', 'm', 'M', 'Backspace'].includes(k)) menuOpts[menuOpts.length - 1][1]();
    return;
  }
  if (mode === 'battle') {
    const i = parseInt(k, 10);
    if (i >= 1 && i <= menuOpts.length) menuOpts[i - 1][1]();
    else if (k === 'Escape' || k === 'Backspace') backInput();
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
    if (mode === 'dialog') { advanceDialog(); return; }
    if (mode === 'menu') { menuKey(k); return; }
    if (mode === 'battle' || mode === 'choice') {
      const i = padBtns.indexOf(b);
      if (i < 6 && menuOpts[i]) menuOpts[i][1]();
      else if (i === 6) mode === 'battle' ? backInput() : menuOpts[menuOpts.length - 1][1]();
      return;
    }
    handleKey(k);
  });
});
// 長押しで出るメニュー（コピー・画像の保存など）を出さない
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('selectstart', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  // テンキー：探索中は e.code（NumLock の有無に関係なく）で移動。戦闘・会話中は数字として扱う
  if ((mode === 'explore' || mode === 'menu') && /^Numpad[1-8]$|^NumpadEnter$/.test(e.code)) { e.preventDefault(); handleKey(e.code); return; }
  if ((mode === 'battle' || mode === 'choice') && /^Numpad\d$/.test(e.code)) { handleKey(e.code.slice(-1)); return; }
  handleKey(e.key);
});

// ---------------------------------------------------------------------
//  Boot
// ---------------------------------------------------------------------
NPCS.forEach(n => n.img && getImage(n.img));
Object.values(MONS).forEach(m => m.img && getImage(m.img));
Object.values(ITEM_IMG).forEach(i => getImage(i.src)); DECOR.forEach(d => getImage(d.img));
if (loadGame()) {
  state.room = placeName(state.fl, state.x, state.y);
  render();
  log('― 続きから再開した ―', 'sys');
} else {
newGame();
markSeen();
state.room = placeName(1, START[0], START[1]);
render();
showDialog([
  '……目を覚ますと、保健室のベッドの上だった。',
  '窓の外は、紫からオレンジへと滲む夕焼け。下校時刻はとうに過ぎている。',
  'どこかで、鳴りやまないチャイムの音がする。',
  '（保健の先生は部屋の西側にいる。隣の職員室には誰か残っているだろうか）',
  '（M でメニュー）',
]);
}
// fonts may load late; redraw once they do
if (document.fonts) document.fonts.ready.then(() => render());

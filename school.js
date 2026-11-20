'use strict';
// =====================================================================
//  Chime — 校舎データ（A〜D棟・1F〜4F）
//  壁はマスとマスの「境界（辺）」にあり厚さを持たない（Wizardry 方式）
//  辺の種類：OPEN 何もない / WALL 壁 / DOOR 扉（通れる）/ WIN 外壁の窓
//
//  各階は「区画（部屋・廊下）」を並べて作る。辺は区画から自動で決まる：
//    同じ区画どうし → 何もない / 別の区画どうし → 壁 / 区画と虚空 → 窓
//  そのうえで door（扉）・link（壁を抜いてつなぐ）で上書きする。
//
//  この校舎は現実離れしている：階ごとに棟の位置も向きもまるで違い、
//  下に何もない場所に上の階が浮かんでいる（floating な区画）。
//  階段：2マス使うソリッド。stairs(id, x, y, dir, up)：(x,y) から dir 方向へ2マス。
//        同じ id の階段どうしがつながる（隣の階とは限らない）
// =====================================================================
const OPEN = 0, WALL = 1, DOOR = 2, WIN = 3, FENCE = 4; // FENCE：屋外（屋上・プール）の柵。向こうが透けて見える

// 辺のキー：マス(x,y)の d 側。南・東の辺は隣のマスの北・西の辺として数える
function edgeKey(x, y, d) {
  if (d === 2) return 'h' + x + ',' + (y + 1);
  if (d === 0) return 'h' + x + ',' + y;
  if (d === 1) return 'v' + (x + 1) + ',' + y;
  return 'v' + x + ',' + y;
}

function makeFloor(name, W, H, build) {
  const F = {
    name, W, H, areas: [], cells: {}, props: {}, stairs: [], locks: {}, deco: {}, lines: [],
    grid: Array.from({ length: H }, () => Array(W).fill(null)), // マス → 区画（null は虚空）
  };
  const over = [];
  const fill = (a, x0, y0, x1, y1) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) F.grid[y][x] = a;
  };
  const area = o => { const a = Object.assign({ kind: 'room', safe: false, floating: false, outdoor: false, bld: '' }, o); a.id = F.areas.length; F.areas.push(a); return a; };
  const api = {
    // 部屋（長方形）
    room(name, bld, x0, y0, x1, y1, opt = {}) { const a = area({ name, bld, kind: 'room', ...opt }); fill(a, x0, y0, x1, y1); return a; },
    // 廊下：折れ線の点を順につないだ1マス幅の通路（曲がっていてよい）
    hall(name, bld, pts, opt = {}) {
      const a = area({ name, bld, kind: 'hall', ...opt });
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[Math.min(i + 1, pts.length - 1)];
        fill(a, x0, y0, x1, y1);
      }
      return a;
    },
    rect: (a, x0, y0, x1, y1) => fill(a, x0, y0, x1, y1), // 区画にマスを足す（ホールなど）
    door: (x, y, d, lock) => { over.push([x, y, d, DOOR]); if (lock) F.locks[edgeKey(x, y, d)] = lock; },
    link: (x, y, d) => over.push([x, y, d, OPEN]),
    wall: (x, y, d) => over.push([x, y, d, WALL]),
    stairs: (id, x, y, dir, up) => F.stairs.push({ id, x, y, dir, up }),
    prop: (kind, ...xy) => { for (let i = 0; i < xy.length; i += 2) F.props[xy[i] + ',' + xy[i + 1]] = kind; },
    // 壁の飾りを指定（'board' 黒板 / 'bulletin' 掲示板 / 'poster' / 'hydrant' 消火栓 / 'clock' 時計 / 'hoop' バスケットゴール / 'mirror' 鏡）
    deco: (x, y, d, type) => { F.deco[x + ',' + y + ',' + d] = type; },
    // 床の線（体育館のコートなど）：マスの境界で囲む長方形
    court: (x0, y0, x1, y1) => F.lines.push([x0, y0, x1 + 1, y1 + 1]),
    // 教室の机：5×4 の教室（北に扉）なら 2列×2行、扉の列を通路に空ける
    desks(x0, y0, x1, y1) {
      for (let x = x0 + 1; x < x1; x += 2) for (let y = y0 + 1; y < y1; y++) F.props[x + ',' + y] = 'desk';
    },
  };
  build(api);
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? F.grid[y][x] : null);
  // 校舎に囲まれた狭い空き地（盤面の外とつながらず、POCKET_MAX マス未満）を探す
  const POCKET_MAX = 40, outside = new Set(), pocket = new Set();
  const isVoid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !F.grid[y][x];
  const flood = (sx, sy, set) => { const q = [[sx, sy]], cells = [[sx, sy]]; set.add(sx + ',' + sy);
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
      if (isVoid(nx, ny) && !set.has(k)) { set.add(k); q.push([nx, ny]); cells.push([nx, ny]); } } }
    return cells; };
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (isVoid(x, y) && !outside.has(x + ',' + y)) flood(x, y, outside);
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (isVoid(x, y) && !outside.has(x + ',' + y)) flood(x, y, outside);
  const done = new Set(outside);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isVoid(x, y) && !done.has(x + ',' + y)) {
    const cells = flood(x, y, done);
    if (cells.length < POCKET_MAX) cells.forEach(([cx, cy]) => pocket.add(cx + ',' + cy));
  }
  F.pocket = pocket;
  // 虚空との境は、屋内なら窓、屋外なら柵。ただし狭い空き地に面する所は壁
  const kind = (a, b, vx, vy) => (!a && !b ? OPEN : !a || !b ? (pocket.has(vx + ',' + vy) ? WALL : (a || b).outdoor ? FENCE : (a || b).solid ? WALL : WIN) : a === b ? OPEN : WALL);
  F.h = Array.from({ length: H + 1 }, (_, y) => Array.from({ length: W }, (_, x) => { const a = at(x, y - 1), b = at(x, y); return kind(a, b, x, a ? y : y - 1); }));
  F.v = Array.from({ length: H }, (_, y) => Array.from({ length: W + 1 }, (_, x) => { const a = at(x - 1, y), b = at(x, y); return kind(a, b, a ? x : x - 1, y); }));
  for (const [x, y, d, k] of over) {
    if (d === 0) F.h[y][x] = k; else if (d === 2) F.h[y + 1][x] = k;
    else if (d === 3) F.v[y][x] = k; else F.v[y][x + 1] = k;
  }
  return F;
}

const MAPS = {
  // ---------------- 1F：ここだけはふつうの学校の配置 ----------------
  // 北に A棟（管理棟）、南に B棟（1年の教室）、東に C棟（特別教室）、南東に D棟（図書）。
  // 棟どうしは渡り廊下でつながる。
  1: makeFloor('1F', 40, 28, m => {
    const A = 'A棟', B = 'B棟', C = 'C棟', D = 'D棟';
    const aCor = m.hall('廊下', A, [[2, 4], [24, 4]]); m.rect(aCor, 21, 1, 24, 3);
    m.room('保健室', A, 2, 1, 5, 3, { safe: true }); m.door(4, 3, 2); m.door(5, 2, 1); // 職員室への内扉（職員室の通路に出る）
    m.prop('bed', 3, 1, 4, 1, 5, 1); m.prop('desk', 2, 1);
    // 職員室：横 10 マス・奥行き 4 マス（北へ 1 マス張り出す）
    //   真ん中に机を寄せた大きな島（横 6×縦 2）。島のまわりはぐるりと通路で、どこからでも回り込める
    //   先生は島の自分の席のところと、窓ぎわ・壁ぎわに立つ（events.js の TEACHERS の x, y）
    m.room('職員室', A, 6, 0, 15, 3, { safe: true }); m.door(8, 3, 2);
    m.prop('desk', 8, 1, 10, 1, 11, 1, 13, 1, 8, 2, 9, 2, 11, 2, 12, 2);
    m.room('校長室', A, 16, 1, 17, 3); m.door(16, 3, 2); m.prop('desk', 17, 1);
    m.room('放送室', A, 18, 1, 20, 3); m.door(19, 3, 2, 'open_q3'); m.prop('desk', 20, 1);
    m.room('用務員室', A, 19, 5, 20, 7, { safe: true }); m.door(19, 5, 0);
    m.stairs('A12', 23, 2, 0, true);
    // トイレ：A棟の廊下の南側
    //   個室は 'stall:向き'（扉のある面の向き 0 北 1 東 2 南 3 西）
    m.room('男子トイレ', A, 13, 5, 15, 8); m.door(14, 5, 0);
    m.prop('stall:3', 15, 6, 15, 7, 15, 8); m.prop('sink', 13, 7, 13, 8); m.deco(13, 7, 3, 'mirror'); m.deco(13, 8, 3, 'mirror');
    m.room('女子トイレ', A, 16, 5, 18, 8); m.door(17, 5, 0);
    m.prop('stall:1', 16, 6, 16, 7, 16, 8); m.prop('sink', 18, 7, 18, 8); m.deco(18, 7, 1, 'mirror'); m.deco(18, 8, 1, 'mirror');

    m.hall('渡り廊下', '', [[6, 5], [6, 11]]); m.link(6, 4, 2); m.link(6, 11, 2);

    const bCor = m.hall('廊下', B, [[2, 12], [24, 12]]); m.rect(bCor, 22, 13, 24, 16);
    // 昇降口：校舎の西の端（横 6・縦 7 マス）。西の壁に外への扉が 3 つ（開かない）。下駄箱が南北に 2 列
    //   南側は B棟の廊下へ広く開いている
    const gen = m.hall('昇降口', B, [[0, 5], [5, 5]]); m.rect(gen, 0, 5, 5, 11);
    for (let x = 2; x <= 5; x++) m.link(x, 11, 2);
    for (const y of [6, 8, 10]) m.door(0, y, 3, 'never');
    m.prop('getabako_ns', 2, 6, 2, 7, 2, 8, 2, 9, 4, 6, 4, 7, 4, 8, 4, 9);
    [['1年A組', 2], ['1年B組', 7], ['1年C組', 12], ['1年D組', 17]].forEach(([n, x]) => {
      m.room(n, B, x, 13, x + 4, 16); m.door(x + 2, 13, 0); m.desks(x, 13, x + 4, 16);
    });
    m.stairs('B12', 23, 14, 2, true);
    // 体育館：B棟の階段ホールから渡り廊下で
    m.hall('渡り廊下', '', [[22, 17], [22, 21], [18, 21]]); m.link(22, 16, 2);
    m.room('体育館', '', 2, 19, 17, 26, { solid: true, ceil: 2.0, hiwin: true }); m.door(17, 21, 1);
    m.prop('stage', 2, 20, 2, 21, 2, 22, 2, 23, 2, 24, 2, 25);
    m.court(4, 20, 15, 25);
    m.deco(10, 19, 0, 'hoop'); m.deco(10, 26, 2, 'hoop'); m.deco(9, 19, 0, 'clock');

    m.hall('渡り廊下', '', [[25, 4], [26, 4]]); m.link(24, 4, 1); m.link(26, 4, 1);
    m.hall('渡り廊下', '', [[25, 12], [26, 12]]); m.link(24, 12, 1); m.link(26, 12, 1);

    const cCor = m.hall('廊下', C, [[27, 1], [27, 20]]); m.rect(cCor, 28, 17, 32, 20);
    m.room('理科室', C, 28, 1, 32, 4); m.door(28, 2, 3); m.prop('desk', 30, 1, 30, 3);
    m.room('理科準備室', C, 28, 5, 32, 6); m.door(28, 5, 3); m.door(31, 4, 2);
    m.room('音楽室', C, 28, 7, 32, 10); m.door(28, 8, 3);
    m.room('音楽準備室', C, 28, 11, 32, 12); m.door(28, 11, 3, 'keys');
    m.room('家庭科室', C, 28, 13, 32, 16); m.door(28, 14, 3); m.prop('desk', 30, 14, 30, 15);
    m.stairs('C12', 30, 18, 1, true);
    // プール：屋外。まわりは柵
    const pool = m.room('プール', '', 34, 8, 39, 19, { outdoor: true }); m.rect(pool, 33, 18, 33, 18);
    m.door(32, 18, 1);
    for (let y = 10; y <= 17; y++) for (let x = 35; x <= 38; x++) m.prop('pool', x, y);

    m.hall('渡り廊下', '', [[27, 21], [27, 22]]); m.link(27, 20, 2); m.link(27, 22, 2);

    const dCor = m.hall('廊下', D, [[20, 23], [38, 23]]); m.rect(dCor, 36, 20, 38, 22);
    m.room('図書室', D, 20, 24, 28, 27); m.door(24, 24, 0); m.prop('desk', 22, 25, 22, 26, 27, 25, 27, 26);
    m.room('司書室', D, 29, 24, 31, 27); m.door(30, 24, 0, 'open_q4');
    m.room('自習室', D, 32, 24, 38, 27); m.door(35, 24, 0); m.prop('desk', 34, 26, 36, 26);
    m.stairs('D13', 37, 21, 0, true); // D棟の階段は 2F を飛ばして 3F に出る
  }),

  // ---------------- 2F：1F とまるで違う配置。下に何もない廊下が宙を折れ曲がる ----------------
  2: makeFloor('2F', 40, 28, m => {
    const A = 'A棟', B = 'B棟', C = 'C棟';
    // A棟2F：1F の A棟は東西に長いのに、ここでは南北に長い。しかも 1F の中庭の上にある
    const aCor = m.hall('廊下', A, [[6, 8], [6, 26]]); m.rect(aCor, 2, 23, 5, 26);
    [['2年A組', 8], ['2年B組', 12], ['2年C組', 16]].forEach(([n, y]) => {
      m.room(n, A, 2, y, 5, y + 3, { board: 0 }); m.door(5, y + 1, 1); m.prop('desk', 3, y + 2, 3, y + 3, 4, y + 3);
    });
    m.room('生徒会室', A, 2, 20, 5, 22); m.door(5, 21, 1); m.prop('desk', 3, 21);
    m.stairs('A12', 3, 24, 2, false);
    m.room('トイレ', A, 7, 21, 9, 23); m.door(7, 22, 3); m.prop('stall:3', 9, 21, 9, 22, 9, 23); m.prop('sink', 7, 21); m.deco(7, 21, 0, 'mirror');
    // 空中廊下：何度も直角に折れながら、何もない宙を渡っていく
    const sky = m.hall('空中廊下', '', [[7, 26], [14, 26], [14, 19], [20, 19], [20, 10], [16, 10], [16, 2]], { floating: true });
    m.rect(sky, 21, 10, 23, 10);
    m.link(6, 26, 1); m.link(16, 2, 1); m.link(23, 10, 1);
    // B棟2F：1F の A棟の真上あたりに、なぜか東西向きで
    const bCor = m.hall('廊下', B, [[17, 2], [36, 2]]); m.rect(bCor, 34, 3, 36, 6);
    [['2年D組', 17], ['2年E組', 22], ['2年F組', 27]].forEach(([n, x]) => {
      m.room(n, B, x, 3, x + 4, 6); m.door(x + 2, 3, 0); m.desks(x, 3, x + 4, 6);
    });
    m.room('進路指導室', B, 32, 3, 33, 6); m.door(32, 3, 0);
    m.stairs('B12', 35, 4, 2, false);
    m.stairs('B23', 34, 5, 0, true);
    // C棟2F：1F の C棟とは向きが 90 度ちがう
    const cCor = m.hall('廊下', C, [[24, 10], [36, 10]], { floating: true }); m.rect(cCor, 33, 11, 36, 14);
    m.room('美術室', C, 24, 11, 29, 14, { floating: true }); m.door(26, 11, 0); m.door(29, 12, 1);
    m.prop('desk', 25, 13, 27, 13);
    m.room('美術準備室', C, 30, 11, 32, 14, { floating: true }); m.door(31, 11, 0);
    m.stairs('C12', 34, 12, 2, false);
    m.stairs('C23', 36, 12, 2, true);
  }),

  // ---------------- 3F：同じ教室がどこまでも並ぶ廊下と、宙に浮いた D棟 ----------------
  3: makeFloor('3F', 40, 28, m => {
    const B = 'B棟', C = 'C棟', D = 'D棟';
    // B棟3F：「3年E組」が延々と続く
    const bCor = m.hall('廊下', B, [[2, 8], [34, 8]]); m.rect(bCor, 35, 4, 38, 8);
    [2, 7, 12, 17, 22, 27].forEach(x => { m.room('3年E組', B, x, 9, x + 4, 12); m.door(x + 2, 9, 0); m.desks(x, 9, x + 4, 12); });
    m.stairs('B23', 37, 5, 2, false);
    m.stairs('BR', 35, 6, 0, true); // 屋上へ
    // 空中渡り廊下
    const sky = m.hall('空中渡り廊下', '', [[33, 9], [33, 14], [21, 14]], { floating: true });
    m.rect(sky, 24, 15, 24, 20); m.rect(sky, 25, 20, 25, 20);
    m.link(33, 8, 2); m.link(20, 14, 1); m.link(25, 20, 1);
    // C棟3F
    const cCor = m.hall('廊下', C, [[2, 14], [20, 14]]); m.rect(cCor, 17, 15, 20, 18);
    m.room('3年A組', C, 2, 15, 6, 18); m.door(4, 15, 0); m.desks(2, 15, 6, 18);
    m.room('3年B組', C, 7, 15, 11, 18); m.door(9, 15, 0); m.prop('desk', 8, 16, 10, 16, 8, 17);
    m.room('化学室', C, 12, 15, 16, 18); m.door(14, 15, 0); m.prop('desk', 13, 16, 15, 16, 13, 17, 15, 17);
    m.stairs('C23', 18, 16, 2, false);
    // D棟3F：その下の 2F・1F には何もない
    const dCor = m.hall('廊下', D, [[26, 20], [38, 20]], { floating: true }); m.rect(dCor, 36, 21, 38, 26);
    m.room('視聴覚室', D, 26, 21, 31, 25, { floating: true }); m.door(28, 21, 0); m.prop('desk', 27, 23, 28, 23, 29, 23, 30, 23);
    m.room('放送準備室', D, 32, 21, 35, 23, { floating: true }); m.door(33, 21, 0);
    m.stairs('D13', 37, 22, 2, false);
    m.stairs('X34', 36, 25, 2, true);
  }),

  // ---------------- 4F：鐘楼。どの棟の上でもない宙に浮いている ----------------
  4: makeFloor('4F', 40, 28, m => {
    const cor = m.hall('廊下', '', [[20, 9], [20, 4], [10, 4], [10, 14], [4, 14]], { floating: true }); m.rect(cor, 20, 10, 20, 11);
    m.room('鐘楼', '', 2, 15, 7, 21, { floating: true }); m.door(4, 14, 2);
    m.stairs('X34', 20, 10, 2, false);
  }),

  // ---------------- 屋上：まわりは柵。塔屋（階段室）から出る ----------------
  5: makeFloor('RF', 40, 28, m => {
    m.room('屋上', '', 6, 4, 30, 20, { outdoor: true });
    m.room('塔屋', 'B棟', 16, 10, 19, 13); m.door(19, 11, 1);
    m.stairs('BR', 17, 11, 2, false);
    m.prop('tank', 8, 6, 9, 6, 8, 7, 9, 7);
    m.prop('unit', 24, 17, 25, 17, 26, 17, 24, 6, 25, 6);
  }),
};

// 区画の取得
const areaAt = (fl, x, y) => { const F = MAPS[fl]; return x >= 0 && y >= 0 && x < F.W && y < F.H ? F.grid[y][x] : null; };
const inMap = (fl, x, y) => !!areaAt(fl, x, y); // 歩ける（どこかの区画に属する）マス
function roomAt(fl, x, y) { const a = areaAt(fl, x, y); return a && a.kind === 'room' ? a : null; }
// 辺の取得：マス(x,y)の d 側（0北 1東 2南 3西）。範囲外は OPEN
function edgeAt(fl, x, y, d) {
  const F = MAPS[fl];
  if (d === 0 || d === 2) { const yy = d === 0 ? y : y + 1; return yy >= 0 && yy <= F.H && x >= 0 && x < F.W ? F.h[yy][x] : OPEN; }
  const xx = d === 3 ? x : x + 1; return y >= 0 && y < F.H && xx >= 0 && xx <= F.W ? F.v[y][xx] : OPEN;
}
const lockAt = (fl, x, y, d) => MAPS[fl].locks[edgeKey(x, y, d)] || null;
const propAt = (fl, x, y) => MAPS[fl].props[x + ',' + y] || null;
// 現在地の表示名：「B棟 1F 保健室」「1F 渡り廊下」
function placeName(fl, x, y) {
  const a = areaAt(fl, x, y);
  return (a && a.bld ? a.bld + ' ' : '') + MAPS[fl].name + ' ' + (a ? a.name : '');
}

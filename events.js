'use strict';
// =====================================================================
//  Chime — 人物・落とし物・サブシナリオ
//  NPCS：話しかける相手（img が無い／読めないときは棒人間で代わりに表示）
//        foe を持つものは「固定の敵」：話しかけると戦闘になり、勝つと消える
//  ITEMS：床に落ちている物。上に乗ると拾う
//
//  サブシナリオ（7本）。どれも 2 人以上が関わり、職員室の先生に話を聞いたり、謎解きをしたりして進む
//   1 片方の上履き   1年生 → 保健の先生 → 空中廊下の上履き → 1年生（紙切れ） → 用務員
//   2 逃げた人体模型 理科の先生 → 理科室の黒板 → 準備室の錠（札の順） → 人体模型 → 理科の先生
//   3 最後の放送     放送部員 → 先輩（写真を見せるとテープ） → 校長室の金庫（違う時計） → 放送部員 → 鐘楼の扉が開く
//   4 卒業アルバム   司書 → 先輩（はぐらかす） → 黒田先生 → 貸出カード → 先輩 → 司書（写真）
//   5 迷子の新入生   新入生 → 3年E組の掲示物（時間割） → 新入生（封筒） → 放送部員
//   6 見つめる肖像画 美術部員（肖像画に乗っ取られている） → 緑川先生 → 2階トイレの鏡 → 肖像画 → 美術部員
//   7 用務員の鍵束   用務員 → 2年A組の生徒 → 用務員に確認 → 屋上の鍵束 → 用務員（校長室の合鍵）
//  裏の顔：3年の先輩（1979年の放送委員。テープを隠している）、美術部員（乗っ取られている）
// =====================================================================

// --- 持ち物 ---
const hasItem = id => state.items.includes(id);
const takeItem = id => { state.items = state.items.filter(i => i !== id); };
const ITEM_NAME = {
  shoe: '名前入りの上履き', keys: '用務員の鍵束', tape: '最終下校の放送テープ', album: '1979年度 卒業アルバム',
  bag: '新入生のカバン', omamori: 'お守り', badge: '校章バッジ', bookmark: '古い栞', map: '2階の見取り図',
  memo: '古い紙切れ', mirror: '洗面台の鏡', photo: '集合写真の写し', letter: '古い封筒', equipkey: '機材の鍵',
};
// 落とし物の画像と、床に置いたときの幅（1 = 1マス。小さい物は見えるよう少し大きめ）
const ITEM_IMG = {
  shoe: { src: 'image/item_shoe.png', w: 0.26 }, keys: { src: 'image/item_keys.png', w: 0.15 },
  tape: { src: 'image/item_casete.png', w: 0.18 }, album: { src: 'image/item_album.png', w: 0.3 },
  bag: { src: 'image/item_bag.png', w: 0.36 }, badge: { src: 'image/item_badge.png', w: 0.15 },
  memo: { src: 'image/item_memo.png' }, mirror: { src: 'image/item_mirror.png' }, photo: { src: 'image/item_photo.png' },
  letter: { src: 'image/item_letter.png' }, equipkey: { src: 'image/item_equipkey.png' },
};
// 吊るされた飾り：鐘楼の鐘（番人の脇）
const DECOR = [
  { fl: 4, x: 6, y: 19, img: 'image/chime.png', w: 0.45 },
];
// --- ごほうび ---
function rewardExp(n) { aliveParty().forEach(c => { c.exp += n; }); levelUps(); }
function rewardAll(fn) { state.party.forEach(fn); }

const ITEMS = [
  // cond：拾えるようになる条件（話がそこまで進むと、そこに落ちている）
  { id: 'shoe', quest: 'q1', fl: 2, x: 11, y: 10, cond: s => s.flags.q1s >= 2, text: ['床に、上履きが片方だけ落ちている。', 'かかとに「1-A」とある。'] },
  { id: 'keys', quest: 'q7', fl: 5, x: 6, y: 10, cond: s => s.flags.q7s >= 4, text: ['給水タンクのそばに、鍵束が落ちている。', 'タグに「用務員室」とある。'] },
  { id: 'badge', fl: 1, x: 31, y: 12, cond: s => s.flags.gakufu, text: ['楽譜の下に、校章バッジがあった。'], get() { const p = state.party[0]; p.atk = [p.atk[0] + 2, p.atk[1] + 2]; } },
];

// ===================== 職員室の先生（1人だけ連れて行ける。職員室で交代できる） =====================
//   key：名前の元 / x,y：職員室で立っている場所 / cls：教科 / spells：使える呪文 / line：最初のひとこと
//   画像は image/chara_<key>.png。無ければ棒人間で表示。ht は身長（cm）
const TEACHERS = [
  { key: 'saeki', name: '佐伯', cls: '体育', x: 6, y: 1, ht: 178,
    st: { maxhp: 14, maxmp: 8, atk: [2, 6], ac: 8, agi: 7, grow: { hp: [3, 6], mp: 3 } }, spells: ['heal', 'scold'],
    line: '「なんだ、まだ残っていたのか。生徒を一人で歩かせるわけにはいかん」', note: '力が強い' },
  { key: 'furukawa', name: '古川', cls: '国語', x: 9, y: 1, ht: 162,
    st: { maxhp: 11, maxmp: 10, atk: [1, 4], ac: 9, agi: 8, grow: { hp: [2, 4], mp: 4 } }, spells: ['lecture', 'scold'],
    line: '「長い放課後ね。ああいうのは、眠らせてしまえばいいのよ」', note: '敵を眠らせるのが得意' },
  { key: 'sanada', name: '真田', cls: '数学', x: 12, y: 1, ht: 178,
    st: { maxhp: 12, maxmp: 9, atk: [2, 5], ac: 8, agi: 10, grow: { hp: [2, 5], mp: 3 } }, spells: ['spark', 'quiz'],
    line: '「確率的に考えて、二人の方が生き残る。行こう」', note: '攻めが得意' },
  { key: 'shiraishi', name: '白石', cls: '音楽', x: 15, y: 0, ht: 163,
    st: { maxhp: 10, maxmp: 11, atk: [1, 4], ac: 9, agi: 9, grow: { hp: [2, 4], mp: 4 } }, spells: ['chorus', 'scold'],
    line: '「あの鐘の音、いい音よね。最後まで聴いてみたくて」', note: '全員を回復できる' },
  { key: 'kuroda', name: '黒田', cls: '社会', x: 15, y: 2, ht: 176,
    st: { maxhp: 13, maxmp: 7, atk: [2, 5], ac: 7, agi: 8, grow: { hp: [3, 5], mp: 2 } }, spells: ['drill', 'spark'],
    line: '「この学校の古い記録は、俺が一番知っている。離れずについてこい」', note: '打たれ強い、全員を守れる' },
  { key: 'aoyama', name: '青山', cls: '英語', x: 6, y: 3, ht: 165,
    st: { maxhp: 11, maxmp: 9, atk: [1, 5], ac: 9, agi: 11, grow: { hp: [2, 4], mp: 3 } }, spells: ['heal', 'spark'],
    line: '「Don\'t worry. 先生がついてるから」', note: '素早い' },
  { key: 'midorikawa', name: '緑川', cls: '美術', x: 10, y: 2, ht: 172,
    st: { maxhp: 10, maxmp: 11, atk: [1, 4], ac: 9, agi: 10, grow: { hp: [2, 4], mp: 4 } }, spells: ['lecture', 'chorus'],
    line: '「この空の色、まだ描ききれてないんだ。歩きながら見ていこう」', note: '眠らせる呪文と全員の回復' },
  { key: 'akai', name: '赤井', cls: '家庭科', x: 13, y: 2, ht: 155,
    st: { maxhp: 12, maxmp: 9, atk: [1, 5], ac: 8, agi: 9, grow: { hp: [3, 5], mp: 3 } }, spells: ['heal', 'drill'],
    line: '「お腹すいてない？ ……冗談よ。危ないから、ついていくわ」', note: '回復と守りで支える' },
];
const teacherOf = key => TEACHERS.find(t => t.key === key);
// ===================== 仲間（先生と水野） =====================
//   パーティは Player を入れて最大 4 人。はじめは 2 人まで（Player＋仲間 1 人）で、
//   サブシナリオを 2 本解決すると 3 人、4 本で 4 人まで連れて行けるようになる
//   一度仲間にした人は、外しても経験やレベルを覚えていて、元の場所（職員室・図書室）に戻る
const PARTY_MAX = 4;
function partyCap() {
  const done = ['q1done', 'q2done', 'q3done', 'q4done', 'q5done', 'q6done', 'q7done'].filter(f => state.flags[f]).length;
  return Math.min(PARTY_MAX, 2 + (done >= 2 ? 1 : 0) + (done >= 4 ? 1 : 0));
}
// 連れて行ける人数が増えたら知らせる（render のたびに確かめる）
function checkCap() {
  const cap = partyCap();
  if (!state.flags.cap) state.flags.cap = cap;
  if (cap > state.flags.cap) { state.flags.cap = cap; log(`★ ${cap}人で行動できるようになった`, 'good'); }
}
const mateId = key => (key === 'mizuno' ? 'mizuno' : 't_' + key);
const mateKey = id => (id === 'mizuno' ? 'mizuno' : id.slice(2));
const mateName = key => (key === 'mizuno' ? '水野' : teacherOf(key).name + '先生');
const inParty = key => state.party.some(c => c.id === mateId(key));
function mateChar(key) {
  state.teachers = state.teachers || {};
  if (!state.teachers[key]) {
    if (key === 'mizuno') state.teachers[key] = RECRUITS.mizuno();
    else { const t = teacherOf(key); state.teachers[key] = mkChar({ id: 't_' + key, name: t.name, cls: t.cls, spells: t.spells.slice(), ...JSON.parse(JSON.stringify(t.st)) }); }
  }
  return state.teachers[key];
}
function addMate(key, outKey) {
  if (outKey) state.party = state.party.filter(c => c.id !== mateId(outKey));
  state.party.push(mateChar(key));
  if (key === 'mizuno') state.flags.mizuno = true; else state.flags.hadTeacher = true;
  log(outKey ? `${mateName(outKey)}と交代して、${mateName(key)}が仲間に加わった` : `${mateName(key)}が 仲間に加わった`, 'good');
  // 外れた仲間は、元いた部屋に戻って待っている。どこへ行ったかを伝える
  if (outKey) {
    const n = NPCS.find(n => n.id === mateId(outKey)), room = n && areaAt(n.fl, n.x, n.y);
    showDialog([`${mateName(outKey)}は ${room ? room.name : '元の場所'}へ戻っていった。`, `${mateName(key)}が 仲間に加わった。`]);
  }
}
// 誘う：空きがあれば「はい／いいえ」、いっぱいなら誰と交代するかを選ぶ
// 誘うときに見せる、その人の教科・呪文・得意なこと（物語の文ではなく、選ぶときの案内）
function mateInfo(key) {
  // 例：佐伯先生（体育、手当て、一喝、力が強い）
  if (key === 'mizuno') return `${mateName(key)}（${['図書委員', ...['spark', 'thunder'].map(i => SPELLS[i].name), '素早い'].join('、')}）`;
  const t = teacherOf(key);
  return `${mateName(key)}（${[t.cls, ...t.spells.map(i => SPELLS[i].name), t.note].join('、')}）`;
}
function offerJoin(key) {
  const cap = partyCap();
  if (state.party.length < cap) { showChoice(`${mateInfo(key)}
一緒に来てもらう？`, [['はい', () => addMate(key)], ['いいえ', () => {}]]); return; }
  const mates = state.party.slice(1).map(c => mateKey(c.id));
  showChoice(`${mateInfo(key)}
連れて行けるのは${cap}人まで。誰と交代する？`, [...mates.map(k => [`${mateName(k)}と交代`, () => addMate(key, k)]), ['やめる', () => {}]]);
}
function teacherNPC(t) {
  return {
    id: 't_' + t.key, fl: 1, x: t.x, y: t.y, name: t.name + '先生', img: `image/chara_${t.key}.png`, ht: t.ht,
    hide: s => inParty(t.key),
    talk(s) { return teacherQuestTalk(t.key, s) || [`${t.name}先生${t.line}`]; },
    after() { offerJoin(t.key); }, // 手がかりを話したあとも誘う（手がかりは次の段階に進むまで何度でも話す）
  };
}

// ===================== サブシナリオの進み方 =====================
//   同時に進められるのは 2 本まで。この順に、終わるたび次の 1 本が「始まる」
//   始まっていない話の人物・落とし物・敵は、まだそこにいない（放送室・司書室は鍵がかかっている）
//   始まった話は、保健の先生がヒントをくれる（話しかけるたびに 1 つ）
const QUEST_ORDER = ['q7', 'q1', 'q2', 'q6', 'q4', 'q5', 'q3'];
const QUEST_MAX_OPEN = 2;
function openQuests() {
  const f = state.flags, done = q => f[q + 'done'];
  const open = QUEST_ORDER.filter(q => !done(q) && f[q]); // すでに頼まれている話
  for (const q of QUEST_ORDER) if (open.length < QUEST_MAX_OPEN && !done(q) && !open.includes(q)) open.push(q);
  return open;
}
const questVisible = q => !q || state.flags[q + 'done'] || openQuests().includes(q);
// 鍵のかかった部屋の扉（放送室・司書室）は、その話が始まると開く
function updateQuestLocks() { for (const q of QUEST_ORDER) state.flags['open_' + q] = questVisible(q); }
// 場所は「何棟・何階」と部屋の種類まで。教室（◯年◯組）は「教室」とだけ言い、それ以外の部屋は名前で言う
const QUEST_HINT = {
  q7: '「用務員さんに鍵束を見なかったか聞かれたの。A棟1階の用務員室にいるわ」',
  q1: '「B棟1階の教室の前を通ったら、生徒の声がしたわ」',
  q2: '「理科の先生、C棟1階の理科室に戻るって。理科準備室から物音がするそうよ」',
  q6: '「C棟2階の美術室に、まだ生徒が残ってるみたい」',
  q4: '「司書さんが、返ってこない本があるって言ってたわ。D棟1階の司書室にいるはずよ」',
  q5: '「B棟3階の教室のあたりに、下級生がいるみたい」',
  q3: '「A棟1階の放送室の子に、下校放送のテープを見なかったか聞かれたの」',
};
// 保健の先生のヒント：話しかけるたびに 1 つ。いま役に立つものを順番に、聞き逃しても何度でも話す
//   どれも今の進み具合から決まる（終わった話のヒントは出ない）。まだ聞いていないものが先
//   頼まれたあとも、その話の「いまの段階」で次に行く場所を話す
function questStageHints(q, s) {
  const f = s.flags;
  if (!f[q]) return [q];
  switch (q) {
    case 'q7': return [hasItem('keys') ? 'q7c' : f.q7s >= 4 ? 'q7b' : f.q7s === 2 ? 'q7back' : 'q7a'];
    case 'q1': return [hasItem('shoe') ? 'q1c' : hasItem('memo') ? 'q1d' : f.q1s <= 2 && !f.got_shoe ? 'q1see' : null];
    case 'q2': return [f.q2fight ? 'q2c' : f.q2open ? 'q2b' : 'q2a'];
    case 'q6': return [f.q6fight ? 'q6d' : hasItem('mirror') ? 'q6c' : f.q6s >= 2 ? 'q6m' : 'q6b'];
    case 'q4': return hasItem('album') ? ['q4c'] : f.q4s >= 4 ? (f.q4got ? [] : ['q4b']) : ['q4a', ...(f.q4kuroda ? [] : ['q4k'])];
    case 'q5': return [hasItem('letter') ? 'q5d' : hasItem('bag') ? 'q5c' : f.q5found ? null : 'q5a'];
    case 'q3': {
      if (hasItem('tape') && hasItem('equipkey')) return ['q3d'];
      const l = [];
      if (!hasItem('tape')) l.push(hasItem('photo') ? 'q3p' : 'q3t');
      if (!hasItem('equipkey')) l.push(f.kouchou ? 'q3s' : 'q3k');
      return l;
    }
  }
  return [];
}
function nurseHintList(s) {
  const f = s.flags, list = [];
  for (const q of openQuests()) for (const h of questStageHints(q, s)) if (h && !list.includes(h)) list.push(h);
  if (f.q3done && !f.bossDown) list.push('bell');
  if (f.q2done && !f.gakufu) list.push('badge');
  return list;
}
const NURSE_HINT = {
  ...QUEST_HINT,
  q7a: '「用務員さん、二階の教室を見回ったって。A棟2階の教室に、まだ残ってる子がいたわ」',
  q7back: '「用務員さん、二階のあとにどこかへ寄ったのかもね。もう一度聞いてみたら？」',
  q7b: '「屋上へは、B棟3階から上がれるわ」',
  q7c: '「その鍵束、用務員さんのね。A棟1階の用務員室に届けてあげて」',
  q1see: '「上履きなら見たわ。階段の方へ跳ねていったの。A棟とB棟をつなぐ2階の渡り廊下を見てみたら？」',
  q1c: '「その上履き、B棟1階の教室の1年生のね。届けてあげて」',
  q1d: '「その紙切れ、用務員室の印があるのね。A棟1階の用務員室へ持っていってみたら」',
  q2a: '「理科準備室の錠、薬品の札なんですって。理科室の黒板に何か書いてなかった？」',
  q2b: '「理科準備室の扉が開いたって。中に何かいるみたい。気をつけてね」',
  q2c: '「理科の先生が、C棟1階の理科室で待ってたわ」',
  q6b: '「美術準備室の肖像画のこと、緑川先生が気にしてたわ。美術の先生だもの、何か知ってるかも」',
  q6m: '「緑川先生の言ってた鏡、A棟2階のトイレのことね」',
  q6c: '「鏡があるなら、C棟2階の美術準備室へ」',
  q6d: '「C棟2階の美術室の子が、あなたを待ってたわ」',
  q4a: '「司書さん、図書室の机に貸出カードを出してあるって。D棟1階の図書室よ」',
  q4k: '「古い記録のことなら、黒田先生が詳しいわ」',
  q4b: '「3年B組なら、C棟3階の教室ね。3年の先輩がいたわ」',
  q4c: '「そのアルバム、D棟1階の司書室に返してあげて」',
  q5a: '「時間割の貼ってある教室……B棟3階の教室の、廊下の掲示を見てみたら」',
  q5c: '「そのカバン、B棟3階の新入生の子のね」',
  q5d: '「その封筒、放送部の子宛てでしょう。A棟1階の放送室よ」',
  q3t: '「テープのこと、3年の先輩が何か知ってるみたい。昔の写真でもあれば、話してくれるかも」',
  q3p: '「その写真、C棟3階の教室の先輩に見せてみたら」',
  q3k: '「校長室の鍵なら、用務員さんが持ってるはずよ」',
  q3s: '「校長室の金庫、時計の錠なんですって。D棟3階の視聴覚室に、ひとつだけ違う時計があるそうよ」',
  q3d: '「テープと鍵がそろったのね。A棟1階の放送室へ」',
  bell: '「放送のあと、上の方で重い扉の開く音がしたの。4階の廊下の突き当たりよ」',
  badge: '「白石先生が、C棟1階の音楽準備室で古い校章バッジを探してたわ。鍵穴のところに小さな鍵盤があったって」',
};
function questHints(s) {
  const list = nurseHintList(s);
  if (!list.length) return [];
  // まだ聞いていないものを先に。全部聞いたあとは、順番にくり返す
  const heard = s.flags.nurseHeard = s.flags.nurseHeard || {};
  const k = list.find(h => !heard[h]) || list[(s.flags.nurseTurn || 0) % list.length];
  heard[k] = true; s.flags.nurseTurn = (s.flags.nurseTurn || 0) + 1;
  if (k === 'q1see') s.flags.q1s = 2; // 上履きを見た話を聞くと、上履きが落ちている
  return [NURSE_HINT[k]];
}

const NPCS = [
  ...TEACHERS.map(teacherNPC),
  // ===================== 本筋 =====================
  { id: 'nurse', fl: 1, x: 2, y: 2, name: '保健の先生', img: 'image/chara_teacher_hospital.png', ht: 158,
    talk(s) {
      const first = !s.flags.metNurse; s.flags.metNurse = true;
      const healed = healAll(); // 満タンになったものがあれば、先生の言葉のあとに知らせる
      const recoveryNotice = healed ? [dialogNotice(healed)] : [];
      const hints = first && s.flags.q1s !== 1 ? [] : questHints(s);
      if (!(s.flags.hadTeacher || s.flags.saeki) && !s.flags.bossDown) return [ // 先生を仲間にするまでは、最初の話を何度でも
        '保健の先生「起きられたのね。どこか痛む？」',
        '「廊下で倒れていたの。覚えてる？」',
        '「あなたを運んだときも、時計は五時だったの。まだ針が動いてない」',
        '「ほら。また同じチャイム」',
        '「廊下に出るなら、隣の職員室で先生を呼んでね。ひとりで行かないで」',
        '「何か困ったことがあったら、私に相談してね」',
        ...recoveryNotice, ...hints,
      ];
      if (s.flags.bossDown) return ['保健の先生「もう帰れるだろうから、帰りなさい」', '「時計は、まだ五時を過ぎたばかりのようね」', ...recoveryNotice, ...hints];
      const greeting = healed ? '保健の先生「戻ってきてくれてよかった。まず座って。手当てするね」' : '保健の先生「おかえり。ここで少し休んでいく？」';
      return [greeting, ...recoveryNotice, ...hints];
    } },
  { id: 'mizuno', fl: 1, x: 25, y: 25, name: '図書委員', img: 'image/chara_mizuno.png', ht: 152, hide: () => inParty('mizuno'),
    talk(s) {
      if (s.flags.mizuno) return ['水野「……調べものの続き、いつでも手伝う」']; // 一度仲間になるまでは、最初の話を何度でも
      s.flags.metMizuno = true;
      return [
        '図書委員の水野「……静かに。本たちが、いいところを読んでるの」',
        '「この学校の古い記録に、“終わらないチャイム”の話があった」',
        '「鐘楼の鐘、一度近くで見てみたかったの」',
        '「調べたいことがあるの。私もついていきたい」',
      ];
    },
    after() { offerJoin('mizuno'); } },
  { id: 's2a', fl: 2, x: 4, y: 1, name: '2年の生徒', img: 'image/chara_student_year2.png', ht: 170,
    talk(s) {
      const f = s.flags;
      if (f.q7s === 1 || f.q7s === 2) {
        f.q7s = 2;
        return [
          '生徒「鍵束は見てないよ。でも、B棟で用務員さんが上の階から降りてくるのを見たよ」',
          '「二階で落としたとは限らないんじゃない？ もう一度、用務員さんに聞いてみたら」',
        ];
      }
      return ['生徒「帰ろうと思ってたんだけど、空がずっとこの色でさ」', '「チャイムが鳴り終わったら帰るよ」'];
    } },
  { id: 'bell', fl: 4, x: 4, y: 20, name: '鐘の番人', img: 'image/enemy/enemy_time_warden_boss.png', ht: 200, boss: true, hide: s => s.flags.bossDown,
    talk(s) { return [
      '天井から、鐘が吊るされている。',
      'そばに、大きな人影が立っている。',
      ...(s.flags.q3done ? [
        '番人「……聞こえた。今度は最後まで」',
        '番人は大槌を下ろした。',
        '鐘がひとりでに鳴った。',
        '番人は、槌を握った手を押さえた。',
      ] : ['番人「……鐘を止めに来たか。この夕暮れは、終わらせぬ」']),
      '番人が 大槌を振り上げた――！',
    ]; },
    after() { startBattle('bell', 1); } },

  // ===================== 校舎に残っている生徒たち（話の筋には関わらない） =====================
  //   話が次の段階に進むまでは、話しかけるたびに同じことを話す。番人を倒すと、言うことが変わる
  //   画像は image/chara_<id>.png（無ければ棒人間）
  { id: 'genkan', fl: 1, x: 3, y: 8, name: '外靴の生徒', img: 'image/chara_genkan.png', ht: 168,
    talk: s => s.flags.bossDown
      ? ['生徒「チャイム、止まったね」', '「……帰ろうか」']
      : ['生徒「靴、もう履き替えちゃった」', '「扉が開いたら、すぐ帰れるように」'] },
  { id: 'basket', fl: 1, x: 12, y: 22, name: 'バスケ部員', img: 'image/chara_basket.png', ht: 172,
    talk: s => s.flags.bossDown
      ? ['バスケ部員「入った」', '「……でも、もう一本だけ」']
      : ['バスケ部員「あと一本入ったら帰るよ」', '「さっきから、ずっとあと一本」'] },
  { id: 'jukensei', fl: 1, x: 37, y: 25, name: '受験生', img: 'image/chara_jukensei.png', ht: 156,
    talk: s => s.flags.bossDown
      ? ['受験生「ページの番号が、ちゃんと増えてる」']
      : ['受験生「この問題集、最後のページまで解いたんだ」', '「めくったら、また一ページ目だった」', '「……まあ、そういうものだよね」'] },
  { id: 'cooking', fl: 1, x: 32, y: 15, name: '調理部員', img: 'image/chara_cooking.png', ht: 154,
    talk: s => s.flags.bossDown
      ? ['調理部員「焼けたみたい。いいにおい」']
      : ['調理部員「クッキーを焼いてるの」', '「オーブンの時計が五時のままで、焼けたのかどうかわからない」', '「ひとつ食べる？ ……まだ生地だけど」'] },
  { id: 'kaichou', fl: 2, x: 20, y: 2, name: '生徒会長', img: 'image/chara_kaichou.png', ht: 170,
    talk: s => s.flags.bossDown
      ? ['生徒会長「書けた。明日、読むね」']
      : ['生徒会長「明日の朝会で読む原稿を書いてるんだ」', '「“明日”って書くと、そこで手が止まるんだ」'] },
  { id: 'shinro', fl: 2, x: 21, y: 14, name: '順番待ちの生徒', img: 'image/chara_shinro.png', ht: 157,
    talk: s => s.flags.bossDown
      ? ['生徒「呼ばれた気がする。……行ってくるね」']
      : ['生徒「面談の順番を待ってるんだ」', '「前の人が入ったきり、出てこない」', '「この部屋、誰もいないけど」'] },
  { id: 'kagaku', fl: 3, x: 30, y: 9, name: '化学部員', img: 'image/chara_kagaku.png', ht: 168,
    talk: s => s.flags.bossDown
      ? ['化学部員「……色が、戻っちゃった」', '「まあいいか。また明日やろう」']
      : ['化学部員「試験管の色が変わるのを待ってるんだ」', '「赤くなったら完成。窓の外と同じくらいの赤」'] },
  { id: 'tenmon', fl: 5, x: 20, y: 12, name: '天文部員', img: 'image/chara_tenmon.png', ht: 162,
    talk: s => s.flags.bossDown ? ['天文部員「暗くなってきた。やっと夜だね」']
      : s.flags.q3done ? ['天文部員「さっきの放送、ここまで聞こえたよ」', '「街の方で、明かりがひとつついた」']
      : ['天文部員「星を見に来たんだけど、ずっとこの空で」', '「望遠鏡は街の方に向けてるの。誰か手を振ってないかなって」'] },

  // ===================== 1 片方の上履き（1年生・保健の先生・用務員） =====================
  { id: 'ichinen', quest: 'q1', fl: 1, x: 4, y: 16, name: '1年生', img: 'image/chara_1nen.png', ht: 150, hide: s => s.flags.q1done,
    talk(s) {
      const f = s.flags;
      if (hasItem('shoe')) return [
        '1年生「わたしの上履き！ ありがとう」',
        '「……あれ、中に紙が入ってる。わたしのじゃないよ」',
        '「字がかすれてる。裏に『用務員室』って印があるから、見せた方がいいかも」',
        '「これ、お守り。持っていって」',
        '★ 古い紙切れと お守りを 受け取った',
      ];
      if (f.q1s >= 4) return ['1年生「紙切れ、用務員さんに見せた？」'];
      if (f.q1 && f.q1s >= 2) return ['1年生「上履き、どこまで行っちゃったんだろう」'];
      if (f.q1) return ['1年生「上履きが片方、ぴょんぴょん跳ねて逃げちゃったの」', '「保健室の方に跳ねてったの。先生、見てないかな」'];
      f.q1 = true; f.q1s = 1;
      return [
        '1年生「上履きが片方、ぴょんぴょん跳ねて逃げちゃったの」',
        '「保健室の方に跳ねてったの。先生、見てないかな」',
      ];
    },
    after(s) { if (hasItem('shoe')) { takeItem('shoe'); state.items.push('memo', 'omamori'); rewardAll(c => { c.ac--; }); s.flags.q1s = 4; } } },

  // ===================== 2 逃げた人体模型（理科の先生・黒板・準備室の錠） =====================
  { id: 'rika', quest: 'q2', fl: 1, x: 32, y: 2, name: '理科の先生', img: 'image/chara_rika.png', ht: 172,
    talk(s) {
      const f = s.flags;
      if (f.q2done) return ['理科の先生「準備室は片付いたよ。模型たちも、しばらくはおとなしいだろう」'];
      if (f.q2fight) return [
        '理科の先生「止めてくれたのか。助かった」',
        '「これは気付け薬だ。昔の薬品棚にあったものだが、よく効くよ」',
        '★ 気付け薬を もらった',
      ];
      if (f.q2open) return ['理科の先生「準備室の方で、さっき錠の音がしたな。扉が開いても、気をつけてくれ」'];
      f.q2 = true; // 錠が開くまでは、何度でも同じ話
      return [
        '理科の先生「人体模型が二体、準備室に歩いて入るのを見たんだ」',
        '「追いかけたら扉が開かなくてね。錠に、見慣れない札がはまってる」',
        '「札にある名前は、実験に使った薬品だ。黒板の記録が手がかりになるかもしれん」',
      ];
    },
    after(s) { if (s.flags.q2fight && !s.flags.q2done) { s.flags.q2done = true; rewardAll(c => { c.maxhp += 3; c.hp += 3; }); rewardExp(20); } } },
  { id: 'q2foe', quest: 'q2', fl: 1, x: 31, y: 5, name: '人体模型', img: 'image/enemy/enemy_anatomical_model.png', ht: 165, foe: true, hide: s => s.flags.q2fight,
    talk(s) { return s.flags.bossDown ? ['人体模型が二体、立っている。', 'もう動かない。'] : ['人体模型が二体、こちらを向いた。']; },
    after(s) { if (s.flags.bossDown) { s.flags.q2fight = true; return; } startBattle('model', 2, () => { state.flags.q2fight = true; }); } }, // 番人を倒したあとは動かない

  // ===================== 3 最後の放送（放送部員・3年の先輩・校長室の金庫） =====================
  //   放送部員は最初から放送室にいる。話が始まるのは、ほかの話がおおむね終わってから
  { id: 'housou', fl: 1, x: 18, y: 1, name: '放送部員', img: 'image/chara_housou.png', ht: 160,
    talk(s) {
      const f = s.flags;
      if (hasItem('letter')) {
        // 封筒を渡すと迷子の話が終わる。そのとき放送の話が始められるなら、続けて頼む（話しかけ直さなくてよい）
        const was = f.q5done; f.q5done = true; this.startQ3 = !f.q3 && openQuests().includes('q3'); f.q5done = was;
        return [
          '放送部員「私に？ ……ずいぶん古い封筒だね」',
          '「“3年B組の生徒がテープを抜くのを見た。今日は流したくない、と言っていた”」',
          '「……1979年の日付。誰が書いたんだろう」',
          ...(this.startQ3 ? [
            '「……ねえ。最後の下校放送を、流さなきゃいけないの」',
            '「いるのは、テープと、機材の鍵」',
            '「放送卓に『機材の鍵は校長室の金庫へ』ってメモが貼ってあった」',
            '「テープは、手紙に出てきた3年B組の人が知ってるかも」',
          ] : []),
        ];
      }
      if (f.q3done) return ['放送部員「放送、ちゃんと届いたかな」'];
      if (hasItem('tape') && hasItem('equipkey')) return [
        '放送部員「テープ、かけるね」',
        '――ザザ……「下校の時刻です。気をつけて帰ってください」',
        'テープが止まった。チャイムも、一拍だけ途切れた。',
        '放送部員「……また鳴った。でも、さっきと音が違う」',
        '「鐘楼の方、見てきてくれる？」',
      ];
      if (f.q3) {
        const tapeLine = f.knowTape ? '「テープは、手紙に出てきた3年B組の人が知ってるかも」' : '「テープのケースはあるけど、中は空だった」';
        if (hasItem('tape')) return ['放送部員「あとは機材の鍵」', '「放送卓に『機材の鍵は校長室の金庫へ』ってメモが貼ってあった」'];
        if (hasItem('equipkey')) return ['放送部員「あとはテープ」', tapeLine];
        return ['放送部員「いるのは、テープと、機材の鍵」', '「放送卓に『機材の鍵は校長室の金庫へ』ってメモが貼ってあった」', tapeLine];
      }
      if (!openQuests().includes('q3')) return [
        '放送部員「最後の下校放送を流す準備をしてるの」',
        '「……でも、まだそのときじゃない気がする」',
      ];
      f.q3 = true;
      return [
        '放送部員「最後の下校放送を、流さなきゃいけないの」',
        '「いるのは、テープと、機材の鍵」',
        '「放送卓に『機材の鍵は校長室の金庫へ』ってメモが貼ってあった」',
        f.knowTape ? '「手紙に出てきた3年B組の人が、テープのことを知ってるかも」' : '「テープのケースはあるけど、中は空だった」',
      ];
    },
    after(s) {
      if (hasItem('letter')) { takeItem('letter'); s.flags.knowTape = true; if (this.startQ3) s.flags.q3 = true; if (!s.flags.q5done) { s.flags.q5done = true; rewardExp(30); } return; }
      if (hasItem('tape') && hasItem('equipkey') && !s.flags.q3done) { takeItem('tape'); takeItem('equipkey'); s.flags.q3done = true; s.flags.bellopen = true; rewardExp(25); }
    } },

  // ===================== 4 卒業アルバム（司書・3年の先輩・黒田先生・貸出カード） =====================
  { id: 'shisho', quest: 'q4', fl: 1, x: 30, y: 26, name: '司書', img: 'image/chara_sisyo.png', ht: 160,
    talk(s) {
      const f = s.flags;
      if (f.q4done) return ['司書「アルバム、ちゃんと棚に戻しておいたわ」'];
      if (hasItem('album')) return [
        '司書「返ってきた……1979年度の卒業アルバム」',
        '「この子……このアルバムを見に来た生徒にそっくり」',
        '「アルバムは棚に戻すわ。写真の写しだけ、持っていって」',
        '「それと、これ。読みかけの気持ちを、なくさないように」',
        '★ 集合写真の写しと 古い栞を もらった',
      ];
      if (f.q4s >= 4) return ['司書「アルバム、見つかりそう？」'];
      if (f.q4) return ['司書「図書室の机に、貸出カードを出してあるの」', '「最後の日付と、借りた人の名前を見てきてくれない？」'];
      f.q4 = true; f.q4s = 1;
      return [
        '司書「1979年度の卒業アルバムが、ずっと返ってこないの」',
        '「図書室の机に、貸出カードを出してあるの」',
        '「悪いけど、最後の日付と、借りた人の名前を見てきてくれない？」',
      ];
    },
    after(s) { if (hasItem('album') && !s.flags.q4done) { takeItem('album'); state.items.push('photo', 'bookmark'); rewardAll(c => { if (c.maxmp) { c.maxmp += 2; c.mp += 2; } }); s.flags.q4done = true; rewardExp(15); } } },
  { id: 'senpai', fl: 3, x: 30, y: 6, name: '3年の先輩', img: 'image/chara_senior_year3.png', ht: 150,
    talk(s) {
      const f = s.flags;
      if (hasItem('photo')) return [
        '先輩に、集合写真の写しを見せた。',
        '先輩「……まだ俺が写ってるのか。七九年の三年B組だよ」',
        '「隣のやつと、卒業式の日にけんかした」',
        '「明日、教室で謝ればいいと思ってた。でも、あの日が最後だったんだよな」',
        '「放送を流したら、もう会えない気がして。テープを抜いたのは俺だ」',
        '先輩は写真を受け取り、テープを差し出した。',
        '「……流してくれ。今度は、最後まで聞く」',
        '★ 最終下校の放送テープを 受け取った',
      ];
      if (f.senpaiDone) {
        if (f.bossDown) return ['先輩「……じゃあな。俺も、そろそろ帰るよ」'];
        if (f.q3done) return ['先輩「聞こえたよ。……ちゃんと最後まで聞いた」'];
        return ['先輩「……チャイム、まだ鳴ってるな」'];
      }
      if (f.q4s >= 4 && !f.q4got) return [
        '先輩「……3年B組、か」',
        '「わかったよ。アルバムは俺が持ってる」',
        '「開かないで返してくれ。……頼む」',
        '★ 1979年度 卒業アルバムを 受け取った',
      ];
      if (f.q3 && !hasItem('tape')) return ['先輩「テープ？ ……知らないな」', '「放送なんて、流さなくてもいいだろ」'];
      if (f.q4s >= 1 && f.q4s < 4) { f.q4lie = true; return ['先輩「アルバム？ 知らないな」', '「図書室の奥にでも、紛れてるんじゃないか」']; }
      return [
        '先輩「この上の鐘楼には、近づかない方がいい」',
        '「俺は、鐘が鳴り終わったら帰るつもりだ」',
        '「……行くなら、しっかり鍛えてからにしな」',
      ];
    },
    after(s) {
      if (hasItem('photo')) { takeItem('photo'); state.items.push('tape'); s.flags.senpaiDone = true; return; }
      if (s.flags.q4s >= 4 && !s.flags.q4got) { s.flags.q4got = true; state.items.push('album'); }
    } },

  // ===================== 5 迷子の新入生（新入生・3年E組の掲示物・放送部員） =====================
  { id: 'shinnyu', quest: 'q5', fl: 3, x: 2, y: 8, name: '新入生', img: 'image/chara_sinnnyuusei.png', ht: 155, hide: s => s.flags.q5s >= 3,
    talk(s) {
      const f = s.flags;
      if (hasItem('bag')) return [
        '新入生「ぼくのカバン！ ありがとうございます」',
        '「……あ、中に封筒が。放送部の先輩に渡してって、頼まれてたんです」',
        '「誰に頼まれたのか、思い出せないんですけど」',
        '「ぼく、もう帰らないと。代わりに渡してもらえますか」',
        '★ 古い封筒を 預かった',
        '新入生は、走っていった。',
      ];
      if (f.q5) return ['新入生「3年E組にカバンを置いてきたんです。どの3年E組だったか……」', '「その教室、時間割が貼ってあったのは覚えてるんです」'];
      f.q5 = true; f.q5s = 1;
      return [
        '新入生「すみません。ここ、3年の教室ですよね……？」',
        '「3年E組にカバンを置いてきたんですけど、どの3年E組だったか……」',
        '「その教室、時間割が貼ってあったのは覚えてるんです」',
      ];
    },
    after(s) { if (hasItem('bag')) { takeItem('bag'); state.items.push('letter'); s.flags.q5s = 3; rewardExp(10); } } },

  // ===================== 6 見つめる肖像画（美術部員＝肖像画に乗っ取られている・緑川先生・鏡） =====================
  { id: 'art', quest: 'q6', fl: 2, x: 30, y: 3, name: '美術部員', ht: 155, imgs: ['image/chara_art_club.png', 'image/chara_art_club_possessed.png'],
    get img() { return state && !state.flags.q6fight ? 'image/chara_art_club_possessed.png' : 'image/chara_art_club.png'; }, // 肖像画を倒すまでは乗っ取られた姿
    talk(s) {
      const f = s.flags;
      if (f.q6done) return ['美術部員「もう、誰にも見られてない感じがする。……ありがとう」'];
      if (f.q6fight) return [
        '美術部員「……あれ？ わたし、何を言ってたんだろう」',
        '「ずっと、あの肖像画に見られてた気がする。頭の中から」',
        '「ありがとう。これ、わたしが描いたこの階の見取り図」',
        '★ 2階の見取り図を もらった',
      ];
      if (!f.q6) { f.q6 = true; f.q6s = 1; } // 肖像画を倒すまでは、何度でも同じ話
      return [
        '美術部員「……ねえ、準備室には何もないよ」',
        '声が、ときどき低くなる。',
        '机の上の紙が、ひとりでに浮き上がった。',
        '「それより、屋上の柵の外を見てきて。……とても、きれいだから」',
      ];
    },
    after(s) { if (s.flags.q6fight && !s.flags.q6done) { s.flags.q6done = true; state.items.push('map'); revealMap(2); rewardExp(20); } } },
  { id: 'q6foe', quest: 'q6', fl: 2, x: 31, y: 7, name: '肖像画', img: 'image/enemy/enemy_portrait.png', ht: 120, foe: true, hide: s => s.flags.q6fight,
    talk(s) {
      if (s.flags.bossDown) return ['肖像画は、ただの絵に戻っていた。'];
      if (hasItem('mirror')) return ['鏡を向けると、肖像画が身をよじった。'];
      const told = inParty('midorikawa') && teacherQuestTalk('midorikawa', state);
      return ['肖像画と目が合った。', '体が動かない。目をそらした。', ...(told || [])];
    },
    after(s) { if (s.flags.bossDown) { if (hasItem('mirror')) takeItem('mirror'); s.flags.q6fight = true; return; } if (!hasItem('mirror')) return; takeItem('mirror'); startBattle('portrait', 1, () => { state.flags.q6fight = true; }); } },

  // ===================== 7 用務員の鍵束（用務員・2年A組の生徒・屋上） =====================
  { id: 'youmu', quest: 'q7', fl: 1, x: 20, y: 6, name: '用務員', img: 'image/chara_caretaker.png', ht: 165,
    talk(s) {
      const f = s.flags;
      if (hasItem('memo')) return [
        '用務員「これは……わしが若い頃に書いたメモだ」',
        '「“下校の放送が終わると、番人が鐘楼の扉を開ける”」',
        '「あの日は放送がなかった。あとで鐘楼を見に行ったが、扉は開かなかったよ」',
      ];
      if (hasItem('keys')) return [
        '用務員「おお、わしの鍵束だ。助かったよ」',
        '「『用務員室』の札も付いてる。間違いないよ」',
        '「校長室の合鍵だ。放送機材の鍵を金庫にしまうのを前に手伝ってね。必要になったら使いな」',
        '★ 校長室の合鍵を もらった',
      ];
      if (f.q7done) return ['用務員「校長室の金庫は、時計の錠でな。わしには開け方がわからん」'];
      if (f.q7s >= 4) return ['用務員「屋上の給水タンクのそばだ。手袋をはめ直したのは、あそこだったと思う」', '「上の階で、大けがをした先生もいる。上へ行くなら、気をつけてな」'];
      if (f.q7s >= 2) {
        f.q7s = 4; // 旧版でも 4 から鍵束を拾える
        return [
          '用務員「上から降りてきた？ ……そうだ、二階のあとで屋上に寄ったんだった」',
          '「給水タンクのそばで手袋をはめ直したんだ。鍵束はそのとき、足元に置いた気がする」',
          '「上の階で、大けがをした先生もいる。上へ行くなら、気をつけてな」',
        ];
      }
      f.q7 = true; f.q7s = 1; // 2年の生徒に聞くまでは、何度でも同じ話
      return [
        '用務員「二階の教室を見回ったんだ。そのどこかで鍵束を落としたんだと思うんだが」',
        '「二階へ行く用があったら、ついでに探してくれないか」',
      ];
    },
    after(s) {
      if (hasItem('memo')) { takeItem('memo'); if (!s.flags.q1done) { s.flags.q1done = true; rewardExp(15); } return; }
      if (hasItem('keys') && !s.flags.q7done) { takeItem('keys'); s.flags.q7done = true; s.flags.kouchou = true; rewardExp(15); }
    } },
];

// ===================== 調べるもの（壁の掲示・黒板・机の上・錠のかかった扉など） =====================
//   その場所（x,y）で、その向き（d：0 北 1 東 2 南 3 西）を向いて「話す」と調べる
//   deco：その壁に描く飾り。talk：読める文。after：読んだあとに起きること
const EXAMINES = [
  // --- 2 理科室の黒板と、理科準備室の錠 ---
  { fl: 1, x: 28, y: 1, d: 3, deco: 'board',
    talk: () => ['黒板に、薬品の重さが書いてある。', '硫黄 4　酢酸 1　石灰 3　食塩 2', '「棚は、軽いものから」'] },
  ...[[31, 4, 2], [27, 5, 1]].map(([x, y, d]) => ({ fl: 1, x, y, d, cond: s => s.flags.q2 && !s.flags.q2open,
    talk: () => ['錠に、薬品の札が4枚ある。', '並べる順で開くらしい。'],
    after: () => askSeq('札を並べる', ['酢酸', '食塩', '石灰', '硫黄'], ['酢酸', '食塩', '石灰', '硫黄'],
      () => { state.flags.q2open = true; showDialog(['カチリ、と錠が外れた。']); }) })),
  // --- 音楽室の黒板と、音楽準備室の錠（校章バッジ） ---
  { fl: 1, x: 30, y: 7, d: 0, deco: 'board',
    talk: () => ['黒板に、音符が4つ書いてある。', 'レ　ド　ソ　ミ', '端に「右から」とある。'] },
  { fl: 1, x: 27, y: 11, d: 1, cond: s => !s.flags.gakufu,
    talk: () => ['錠に、鍵盤が4つある。'],
    after: () => askSeq('鍵盤を押す', ['ド', 'レ', 'ミ', 'ソ'], ['ミ', 'ソ', 'ド', 'レ'],
      () => { state.flags.gakufu = true; showDialog(['ポロン、と音がして、錠が外れた。']); }) },
  // --- 4 図書室の貸出カード ---
  { fl: 1, x: 23, y: 25, d: 3, cond: s => s.flags.q4s >= 1 && s.flags.q4s < 4,
    talk: () => ['机に、貸出カードが散らばっている。'],
    after: () => showChoice('最後に借りたのは？', [
      ['相沢　3月2日　1年', () => showDialog([dialogNotice('カードを束に戻した。')])],
      ['木下　2月28日　2年', () => showDialog([dialogNotice('カードを束に戻した。')])],
      ['（名前がにじんでいる）　3月14日　3年B組', () => { state.flags.q4s = 4; showDialog(['名前はにじんで読めない。', '★ 最後に借りたのは、3年B組の生徒だった']); }],
      ['相沢　3月9日　1年', () => showDialog([dialogNotice('カードを束に戻した。')])],
    ]) },
  // --- 5 3年E組の掲示物（時間割が貼ってある教室に、カバン） ---
  ...[[2, 13], [7, 13], [12, 13], [17, 13], [2, 8], [7, 8], [12, 8], [17, 8]].map(([x0, y0], i) => {
    const south = y0 === 13, x = x0 + 1, y = south ? 13 : 11, d = south ? 0 : 2, hit = x0 === 12 && south; // 廊下側の壁（扉の横）
    const notes = ['「今月の目標　廊下は静かに」', '「遠足のしおり」', '「保健だより」', '「清掃当番表」', '「図書室だより」', '「学級目標　ひとりひとりが主役」', '「進路説明会のお知らせ」'];
    return { fl: 3, x, y, d, deco: 'bulletin',
      talk: s => hit ? ['時間割が貼ってある。', ...(s.flags.q5 && !s.flags.q5found ? ['机に、カバンが掛かっている。', '★ 新入生のカバンを 見つけた'] : [])]
                     : [dialogNotice(`${notes[i % notes.length]}が貼ってある。`)],
      after: s => { if (hit && s.flags.q5 && !s.flags.q5found) { s.flags.q5found = true; state.items.push('bag'); } } };
  }),
  // --- 6 2階のトイレの鏡 ---
  ...[7, 8].map(y => ({ fl: 2, x: 14, y, d: 3, cond: s => s.flags.q6s >= 2 && !hasItem('mirror') && !s.flags.q6fight,
    talk: () => ['小さな鏡だ。下の留め具が外れている。', '★ 洗面台の鏡を 外して持った'], after: () => state.items.push('mirror') })),
  // --- 3 校長室の金庫と、ひとつだけ違う時計 ---
  { fl: 1, x: 17, y: 2, d: 1, deco: 'safe', cond: s => !hasItem('equipkey') && !s.flags.q3done,
    talk: () => ['金庫がある。ダイヤルは時計の形だ。'],
    after: () => showChoice('ダイヤルを合わせる', ['3時', '5時', '7時', '9時'].map(t => [t, () => {
      if (t !== '7時') { showDialog([dialogNotice('開かない。')]); return; }
      state.items.push('equipkey'); showDialog(['金庫が開いた。', '★ 機材の鍵を 手に入れた']);
    }])) },
  { fl: 3, x: 30, y: 24, d: 0, deco: 'clock7', talk: () => ['この時計だけ、7時を指している。'] },
];
// 調べるものの飾りを、その壁に描く
for (const e of EXAMINES) if (e.deco) MAPS[e.fl].deco[`${e.x},${e.y},${e.d}`] = e.deco;
// 今いる所・向きで調べられるもの
const examineAt = s => EXAMINES.find(e => e.fl === s.fl && e.x === s.x && e.y === s.y && e.d === s.dir && (!e.cond || e.cond(s))) || null;
// 順番に選ぶ錠：選んだものを並べて見せ、answer と同じ並びなら ok
function askSeq(title, opts, answer, ok) {
  const picks = [];
  const step = () => {
    if (picks.length === answer.length) { if (picks.every((p, i) => p === answer[i])) ok(); else showDialog([dialogNotice('……何も起きない。')]); return; }
    showChoice(`${title}：${picks.length ? picks.join('・') : '―'}`, [...opts.map(o => [o, () => { picks.push(o); step(); }]), ['やめる', () => {}]]);
  };
  step();
}

// ===================== 職員室の先生の話（話の途中で、先生に聞かないとわからないこと） =====================
//   職員室で話しかけても、仲間として連れている時に話しかけても同じことを話す
function teacherQuestTalk(key, s) {
  const f = s.flags;
  if (key === 'midorikawa' && f.q6 && (f.q6s || 1) <= 2 && !hasItem('mirror') && !f.q6fight) { f.q6s = 2; return [
    '緑川先生「準備室で絵を片づけてたら、肖像画の目がこっちを追ってきたの」',
    '「向かいの鏡に絵が映ったときだけ、目が止まったわ。二階のトイレの鏡なら、小さいから持っていけるかも」',
  ]; }
  if (key === 'shiraishi' && f.got_badge) { return [
    '白石先生「その校章、見つけてくれたのね」',
    '「私がここの生徒だったころのものなの。あの日、鐘の音を聞きながらなくしたのよ」',
    '「あなたが持っていて。まだ放課後は続いてるから」',
  ]; }
  if (key === 'kuroda' && f.q4s >= 1 && f.q4s < 4) { f.q4kuroda = true; return [
    '黒田先生「古い放送当番表を見たことがある。1979年度の最終日は、3年B組が当番だった」',
    '「その日の放送日誌は空欄だった。誰が当番だったかまでは覚えてないな」',
    '「貸出カードを調べるなら、名前より日付を見ることだ」',
  ]; }
  return null;
}

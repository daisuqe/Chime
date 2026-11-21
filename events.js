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
//   7 用務員の鍵束   用務員 → 2年の生徒（嘘） → 白石先生 → 2年の生徒 → 空中廊下の鍵束 → 用務員（校長室の合鍵）
//  裏の顔：3年の先輩（1979年の放送委員。テープを隠している）、2年の生徒（ずるい）、美術部員（乗っ取られている）
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
  { id: 'shoe', quest: 'q1', fl: 2, x: 11, y: 10, cond: s => s.flags.q1s >= 2, text: ['床に、上履きが片方だけ落ちている。', 'かかとに「1-A」と書かれた名前の欄がある。'] },
  { id: 'keys', quest: 'q7', fl: 2, x: 9, y: 6, cond: s => s.flags.q7s >= 4, text: ['曲がり角の陰に、鍵束が押しこまれている。', 'タグに「用務員室」とある。'] },
  { id: 'badge', fl: 1, x: 31, y: 12, cond: s => s.flags.gakufu, text: ['楽譜の山の下に、古い校章バッジが埋もれていた。'], get() { const p = state.party[0]; p.atk = [p.atk[0] + 2, p.atk[1] + 2]; } },
];

// ===================== 職員室の先生（1人だけ連れて行ける。職員室で交代できる） =====================
//   key：名前の元 / x,y：職員室で立っている場所 / cls：教科 / spells：使える呪文 / line：最初のひとこと
//   画像は image/chara_<key>.png。無ければ棒人間で表示。ht は身長（cm）
const TEACHERS = [
  { key: 'saeki', name: '佐伯', cls: '体育', x: 6, y: 1, ht: 178,
    st: { maxhp: 16, maxmp: 8, atk: [3, 7], ac: 8, agi: 7, grow: { hp: [3, 6], mp: 3 } }, spells: ['heal', 'scold'],
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
    st: { maxhp: 14, maxmp: 7, atk: [2, 6], ac: 7, agi: 8, grow: { hp: [3, 5], mp: 2 } }, spells: ['drill', 'spark'],
    line: '「この学校の古い記録は、俺が一番知っている。離れずについてこい」', note: '打たれ強い。全員を守れる' },
  { key: 'aoyama', name: '青山', cls: '英語', x: 6, y: 3, ht: 165,
    st: { maxhp: 11, maxmp: 9, atk: [1, 5], ac: 9, agi: 11, grow: { hp: [2, 4], mp: 3 } }, spells: ['heal', 'spark'],
    line: '「Don\'t worry. 先生がついてるから」', note: '素早い' },
  { key: 'midorikawa', name: '緑川', cls: '美術', x: 10, y: 2, ht: 172,
    st: { maxhp: 10, maxmp: 11, atk: [1, 4], ac: 9, agi: 10, grow: { hp: [2, 4], mp: 4 } }, spells: ['lecture', 'chorus'],
    line: '「夕焼けの色、まだ描ききれてないんだ。歩きながら見ていこう」', note: '眠らせる呪文と全員の回復' },
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
  if (cap > state.flags.cap) { state.flags.cap = cap; log(`★ 頼れる仲間が増え、${cap}人で行動できるようになった`, 'good'); }
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
  log(outKey ? `${mateName(outKey)}と交代して、${mateName(key)}が仲間に加わった` : `${mateName(key)}が 仲間に加わった！`, 'good');
  // 外れた仲間は、元いた部屋に戻って待っている。どこへ行ったかを伝える
  if (outKey) {
    const n = NPCS.find(n => n.id === mateId(outKey)), room = n && areaAt(n.fl, n.x, n.y);
    showDialog([`${mateName(outKey)}は ${room ? room.name : '元の場所'}へ戻っていった。`, `${mateName(key)}が 仲間に加わった。`]);
  }
}
// 誘う：空きがあれば「はい／いいえ」、いっぱいなら誰と交代するかを選ぶ
function offerJoin(key) {
  const cap = partyCap();
  if (state.party.length < cap) { showChoice(`${mateName(key)}に一緒に来てもらう？`, [['はい', () => addMate(key)], ['いいえ', () => {}]]); return; }
  const mates = state.party.slice(1).map(c => mateKey(c.id));
  showChoice(`連れて行けるのは${cap}人まで。誰と交代する？`, [...mates.map(k => [`${mateName(k)}と交代`, () => addMate(key, k)]), ['やめる', () => {}]]);
}
function teacherNPC(t) {
  return {
    id: 't_' + t.key, fl: 1, x: t.x, y: t.y, name: t.name + '先生', img: `image/chara_${t.key}.png`, ht: t.ht,
    hide: s => inParty(t.key),
    talk(s) { const q = teacherQuestTalk(t.key, s); if (q) { this.told = true; return q; } this.told = false; return [`${t.name}先生${t.line}`]; },
    after() { if (!this.told) offerJoin(t.key); }, // 話の手がかりを話したときは、誘わない
  };
}

// ===================== サブシナリオの進み方 =====================
//   同時に進められるのは 2 本まで。この順に、終わるたび次の 1 本が「始まる」
//   始まっていない話の人物・落とし物・敵は、まだそこにいない（放送室・司書室は鍵がかかっている）
//   新しく始まった話は、保健の先生がヒントをくれる
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
const QUEST_HINT = {
  q7: '「用務員さんが、さっきから何か探してたみたい」',
  q1: '「1年A組に、1年生の子がまだ残ってるって聞いたわ」',
  q2: '「理科室に先生が戻ってきたみたい。準備室が騒がしいって」',
  q6: '「美術室で、美術部の子が絵を描いているのを見た人がいるの」',
  q4: '「司書室の鍵が開いてたわ。司書さん、何か困ってるみたい」',
  q5: '「3年の教室のあたりで、新入生の子を見かけたって」',
  q3: '「放送部の子が、最後の放送を流したがってたわ」',
};
// まだ伝えていないヒントを 1 つだけ返す（一度伝えたら繰り返さない）
//   保健室に来るたびに 1 つまで。保健室を出て、また戻ってくると次の 1 つ（nurseHinted は保健室の外に出ると消える）
function questHints(s) {
  if (s.flags.nurseHinted) return [];
  const q = openQuests().find(q => !s.flags[q] && !s.flags['hint_' + q]);
  let line = null;
  if (s.flags.q1s === 1) { s.flags.q1s = 2; line = '「上履き？ さっき保健室の前を跳ねていったわ。階段を上って、宙に浮いた廊下のほうへ」'; }
  else if (q) { s.flags['hint_' + q] = true; line = QUEST_HINT[q]; }
  else if (s.flags.q2done && !s.flags.gakufu && !s.flags.hint_badge) { s.flags.hint_badge = true; line = '「音楽準備室には、古い校章バッジがしまってあるそうよ。扉は、音で開くんですって」'; }
  if (!line) return [];
  s.flags.nurseHinted = true;
  return [line];
}

const NPCS = [
  ...TEACHERS.map(teacherNPC),
  // ===================== 本筋 =====================
  { id: 'nurse', fl: 1, x: 2, y: 2, name: '保健の先生', img: 'image/chara_teacher_hospital.png', ht: 158,
    talk(s) {
      const first = !s.flags.metNurse; s.flags.metNurse = true;
      const healed = healAll(); // 満タンになったものがあれば、先生の言葉のあとに知らせる
      const hints = first ? [] : questHints(s);
      if (first) s.flags.nurseHinted = true;
      return first ? [
        '保健の先生「気がついた？ 廊下で倒れていたのよ」',
        '「五時のチャイム、まだ鳴ってるわね」',
        '「隣の職員室に、まだ先生が何人か残っているはずよ。誰か一人についてきてもらいなさい」',
        ...hints,
      ].concat(healed ? [healed] : []) : ['保健の先生「無理はしないでね。ほら、少し休んでいきなさい」', ...(healed ? [healed] : []), ...hints];
    } },
  { id: 'mizuno', fl: 1, x: 25, y: 25, name: '図書委員', img: 'image/chara_mizuno.png', ht: 152, hide: () => inParty('mizuno'),
    talk(s) {
      if (s.flags.metMizuno) return ['水野「……調べものの続き、いつでも手伝う」'];
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
      if (f.q7s === 1) { f.q7s = 2; return ['生徒「鍵束？ ああ、見たよ。屋上の給水タンクのそばに落ちてた」', '「……たぶんね」']; }
      if (f.q7s === 2) return ['生徒「屋上、見てきた？ 風が強かったでしょ」'];
      if (f.q7s === 3) { f.q7s = 4; return [
        '生徒「……白石先生に見られてたのか」',
        '「ごめん。じゃらじゃら鳴るのが面白くて、空中廊下の曲がり角に押しこんだんだ」',
        '「用務員さんには、僕が見つけたって言っといてよ」',
      ]; }
      return ['生徒「帰ろうと思ってたんだけど、夕焼けがきれいでさ」', '「チャイムが鳴り終わったら帰るよ」'];
    } },
  { id: 'bell', fl: 4, x: 4, y: 20, name: '鐘の番人', img: 'image/enemy/enemy_time_warden_boss.png', ht: 200, boss: true, hide: s => s.flags.bossDown,
    talk(s) { return [
      '鐘楼の天井から、古い校内放送の鐘が吊るされている。',
      'その傍らに、フードを目深にかぶった大きな人影が立っていた。',
      s.flags.q3done ? '番人「……下校の放送が、聞こえた」'
                     : '番人「……鐘を止めに来たか。この夕暮れは、終わらせぬ」',
      '番人が 大槌を振り上げた――！',
    ]; },
    after() { startBattle('bell', 1); } },

  // ===================== 1 片方の上履き（1年生・保健の先生・用務員） =====================
  { id: 'ichinen', quest: 'q1', fl: 1, x: 4, y: 16, name: '1年生', img: 'image/chara_1nen.png', ht: 150, hide: s => s.flags.q1done,
    talk(s) {
      const f = s.flags;
      if (hasItem('shoe')) return [
        '1年生「わたしの上履き！ ありがとう」',
        '「……あれ、中に紙が入ってる。わたしのじゃないよ」',
        '「字が古くて読めない。用務員さんの字に、ちょっと似てる」',
        '「これ、お守り。持っていって」',
        '★ 古い紙切れと お守りを 受け取った',
      ];
      if (f.q1s >= 4) return ['1年生「紙切れ、用務員さんに見せた？」'];
      if (f.q1) return ['1年生「上履き、どこまで行っちゃったんだろう」'];
      f.q1 = true; f.q1s = 1;
      return [
        '1年生「上履きが片方、ぴょんぴょん跳ねて逃げちゃったの」',
        '「どこへ行ったのか……保健の先生なら、見てたかも」',
      ];
    },
    after(s) { if (hasItem('shoe')) { takeItem('shoe'); state.items.push('memo', 'omamori'); rewardAll(c => { c.ac--; }); s.flags.q1s = 4; } } },

  // ===================== 2 逃げた人体模型（理科の先生・黒板・準備室の錠） =====================
  { id: 'rika', quest: 'q2', fl: 1, x: 32, y: 2, name: '理科の先生', img: 'image/chara_rika.png', ht: 172,
    talk(s) {
      const f = s.flags;
      if (f.q2done) return ['理科の先生「準備室は片付いたよ。模型たちも、しばらくはおとなしいだろう」'];
      if (f.q2fight) return [
        '理科の先生「止めてくれたのか！ 助かった」',
        '「これは気付け薬だ。昔の薬品棚にあったものだが、よく効くよ」',
        '★ 気付け薬で、みんなの体が少し丈夫になった',
      ];
      if (f.q2open) return ['理科の先生「錠が開いたのか。……中の模型を、頼むよ」'];
      if (f.q2) return ['理科の先生「黒板に、何か書いた気がするんだが」'];
      f.q2 = true;
      return [
        '理科の先生「人体模型が二体、準備室に立てこもってしまってね」',
        '「準備室の扉は、薬品棚と同じ錠なんだ。札を正しい順に並べれば開く」',
        '「その順番を、忘れてしまった。……黒板に、何か書いた気がする」',
      ];
    },
    after(s) { if (s.flags.q2fight && !s.flags.q2done) { s.flags.q2done = true; rewardAll(c => { c.maxhp += 3; c.hp += 3; }); rewardExp(20); } } },
  { id: 'q2foe', quest: 'q2', fl: 1, x: 31, y: 5, name: '人体模型', img: 'image/enemy/enemy_anatomical_model.png', ht: 165, foe: true, hide: s => s.flags.q2fight,
    talk() { return ['棚の陰から、人体模型が二体、ぎくしゃくと振り向いた――！']; },
    after() { startBattle('model', 2, () => { state.flags.q2fight = true; }); } },

  // ===================== 3 最後の放送（放送部員・3年の先輩・校長室の金庫） =====================
  //   放送部員は最初から放送室にいる。話が始まるのは、ほかの話がおおむね終わってから
  { id: 'housou', fl: 1, x: 18, y: 1, name: '放送部員', img: 'image/chara_housou.png', ht: 160,
    talk(s) {
      const f = s.flags;
      if (hasItem('letter')) return [
        '放送部員「……手紙？ 1年生の子から？」',
        '「“テープは、3年B組のあいつが持っている。あいつは、放送が流れるのを怖がっている”」',
        '「……1979年の日付。誰が書いたんだろう」',
      ];
      if (f.q3done) return ['放送部員「放送、ちゃんと届いたかな」'];
      if (hasItem('tape') && hasItem('equipkey')) return [
        '放送部員「テープも、鍵も……そろった。流すね」',
        '――ザザ……「下校の時刻になりました。校内に残っている生徒は、すみやかに下校しましょう」',
        '放送部員「……鐘の音が、ほんの少し遠くなった」',
        '遠くで、重い扉の錠が外れる音がした。',
      ];
      if (f.q3) return [`放送部員「${hasItem('tape') ? '機材の鍵は、校長室の金庫の中' : hasItem('equipkey') ? 'あとはテープ' : 'テープと、機材の鍵'}。そろったら来て」`];
      if (!openQuests().includes('q3')) return [
        '放送部員「最後の下校放送を流す準備をしてるの」',
        '「……でも、まだそのときじゃない気がする」',
      ];
      f.q3 = true;
      return [
        '放送部員「最後の下校放送を、流さなきゃいけないの」',
        '「いるのは、テープと、機材の鍵」',
        '「機材の鍵は、校長室の金庫にしまわれたって聞いた」',
        f.knowTape ? '「テープは……手紙のとおりなら、3年B組の先輩ね」' : '「テープは、誰かが持っていったみたい」',
      ];
    },
    after(s) {
      if (hasItem('letter')) { takeItem('letter'); s.flags.knowTape = true; if (!s.flags.q5done) { s.flags.q5done = true; rewardExp(30); } return; }
      if (hasItem('tape') && hasItem('equipkey') && !s.flags.q3done) { takeItem('tape'); takeItem('equipkey'); s.flags.q3done = true; s.flags.bellopen = true; rewardExp(25); }
    } },

  // ===================== 4 卒業アルバム（司書・3年の先輩・黒田先生・貸出カード） =====================
  { id: 'shisho', quest: 'q4', fl: 1, x: 30, y: 26, name: '司書', img: 'image/chara_sisyo.png', ht: 160,
    talk(s) {
      const f = s.flags;
      if (f.q4done) return ['司書「アルバム、ちゃんと棚に戻しておいたわ」'];
      if (hasItem('album')) return [
        '司書「返ってきた……！ 1979年度の卒業アルバム」',
        '「最後の集合写真。……この子、今も3年の教室にいる子にそっくり」',
        '「アルバムは棚に戻すわ。写真の写しだけ、持っていって」',
        '「それと、これ。読みかけの気持ちを、なくさないように」',
        '★ 集合写真の写しと 古い栞を もらった',
      ];
      if (f.q4) return ['司書「貸出カードは、図書室の机の上にあるわ」'];
      f.q4 = true; f.q4s = 1;
      return [
        '司書「1979年度の卒業アルバムが、ずっと返ってこないの」',
        '「最後に借りた人は、図書室の貸出カードを見ればわかるはずなんだけど」',
        '「カードの束がばらばらで、わたしには見分けがつかなくて」',
      ];
    },
    after(s) { if (hasItem('album') && !s.flags.q4done) { takeItem('album'); state.items.push('photo', 'bookmark'); rewardAll(c => { if (c.maxmp) { c.maxmp += 2; c.mp += 2; } }); s.flags.q4done = true; rewardExp(15); } } },
  { id: 'senpai', fl: 3, x: 30, y: 6, name: '3年の先輩', img: 'image/chara_senior_year3.png', ht: 150,
    talk(s) {
      const f = s.flags;
      if (hasItem('photo')) return [
        '先輩に、集合写真の写しを見せた。',
        '先輩「……写ってたか」',
        '「そうだよ。俺は、あの年の3年B組だ。放送委員だった」',
        '「あの日、テープを流さなかったのは俺だ。流したら、全部終わってしまう気がして」',
        '「番人を、ずっと待たせてるのも知ってる」',
        '「……テープは返す。流すかどうかは、お前たちが決めてくれ」',
        '★ 最終下校の放送テープを 受け取った',
      ];
      if (f.senpaiDone) return ['先輩「……チャイム、まだ鳴ってるな」'];
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
        '新入生は、階段のほうへ駆けていった。',
      ];
      if (f.q5) return ['新入生「時間割の貼ってある教室です。たぶん……」'];
      f.q5 = true; f.q5s = 1;
      return [
        '新入生「先輩、ここ3年の教室ですよね……？」',
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
      if (f.q6) return ['美術部員「……準備室には、来ないで」', '美術部員の声が、低く濁っている。'];
      f.q6 = true; f.q6s = 1;
      return [
        '美術部員「……ねえ、準備室には何もないよ」',
        '美術部員の声が、ときどき別の誰かのように低くなる。',
        '「それより、屋上の柵の外を見てきて。……とても、きれいだから」',
      ];
    },
    after(s) { if (s.flags.q6fight && !s.flags.q6done) { s.flags.q6done = true; state.items.push('map'); revealMap(2); rewardExp(20); } } },
  { id: 'q6foe', quest: 'q6', fl: 2, x: 31, y: 7, name: '肖像画', img: 'image/enemy/enemy_portrait.png', ht: 120, foe: true, hide: s => s.flags.q6fight,
    talk() {
      if (hasItem('mirror')) return ['鏡を向けると、肖像画が額の中で身をよじった――！'];
      return ['肖像画と、目が合った。', '……体が重い。目をそらして、後ずさった。'];
    },
    after() { if (!hasItem('mirror')) return; takeItem('mirror'); startBattle('portrait', 1, () => { state.flags.q6fight = true; }); } },

  // ===================== 7 用務員の鍵束（用務員・2年の生徒＝ずるい・白石先生） =====================
  { id: 'youmu', quest: 'q7', fl: 1, x: 20, y: 6, name: '用務員', img: 'image/chara_caretaker.png', ht: 165,
    talk(s) {
      const f = s.flags;
      if (hasItem('memo')) return [
        '用務員「これは……わしが若い頃に書いたメモだ」',
        '「“鐘楼の扉は、下校の放送が流れたときに開く”」',
        '「あの日、放送は流れなかった。それからずっと、扉は閉じたままなんだ」',
      ];
      if (hasItem('keys')) return [
        '用務員「おお、わしの鍵束！ 助かったよ」',
        '「2年の子が見つけた？ ……そうかい」',
        '「礼に、校長室の合鍵を渡しておこう。金庫には、昔の放送の道具がしまってあるそうだ」',
        '★ 校長室の合鍵を もらった',
      ];
      if (f.q7done) return ['用務員「校長室の金庫は、時計の錠でな。わしには開け方がわからん」'];
      if (f.q7) return ['用務員「2年の子には、会えたかい」'];
      f.q7 = true; f.q7s = 1;
      return [
        '用務員「鍵束を落としちまってね」',
        '「さっき、2年の子が何か知ってる顔でこっちを見てたんだが……」',
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
    talk: () => ['黒板の隅に、薬品の重さが書き残されている。', '硫黄 4　酢酸 1　石灰 3　食塩 2', '「棚は、軽いものから」'] },
  ...[[31, 4, 2], [27, 5, 1]].map(([x, y, d]) => ({ fl: 1, x, y, d, cond: s => s.flags.q2 && !s.flags.q2open,
    talk: () => ['扉の錠に、薬品の札が4枚はめこまれている。', '並べる順番を決めると、錠が外れるらしい。'],
    after: () => askSeq('札を並べる', ['酢酸', '食塩', '石灰', '硫黄'], ['酢酸', '食塩', '石灰', '硫黄'],
      () => { state.flags.q2open = true; showDialog(['カチリ、と錠が外れた。']); }) })),
  // --- 音楽室の黒板と、音楽準備室の錠（校章バッジ） ---
  { fl: 1, x: 30, y: 7, d: 0, deco: 'board',
    talk: () => ['黒板に、音符が4つだけ書き残されている。', 'レ　ド　ソ　ミ', '端に小さく「右から」とある。'] },
  { fl: 1, x: 27, y: 11, d: 1, cond: s => !s.flags.gakufu,
    talk: () => ['扉の錠に、小さな鍵盤が4つ並んでいる。'],
    after: () => askSeq('鍵盤を押す', ['ド', 'レ', 'ミ', 'ソ'], ['ミ', 'ソ', 'ド', 'レ'],
      () => { state.flags.gakufu = true; showDialog(['ポロン、と音がして、錠が外れた。']); }) },
  // --- 4 図書室の貸出カード ---
  { fl: 1, x: 23, y: 25, d: 3, cond: s => s.flags.q4s >= 1 && s.flags.q4s < 4,
    talk: () => ['机の上に、1979年度の卒業アルバムの貸出カードが散らばっている。'],
    after: () => showChoice('最後に借りたのは？', [
      ['相沢　3月2日　1年', () => showDialog(['カードを束に戻した。'])],
      ['木下　2月28日　2年', () => showDialog(['カードを束に戻した。'])],
      ['（名前がにじんでいる）　3月14日　3年B組', () => { state.flags.q4s = 4; showDialog(['名前はにじんで読めない。', '★ 最後に借りたのは、3年B組の生徒だった']); }],
      ['相沢　3月9日　1年', () => showDialog(['カードを束に戻した。'])],
    ]) },
  // --- 5 3年E組の掲示物（時間割が貼ってある教室に、カバン） ---
  ...[[2, 13], [7, 13], [12, 13], [17, 13], [2, 8], [7, 8], [12, 8], [17, 8]].map(([x0, y0], i) => {
    const south = y0 === 13, x = x0 + 1, y = south ? 13 : 11, d = south ? 0 : 2, hit = x0 === 12 && south; // 廊下側の壁（扉の横）
    const notes = ['「今月の目標　廊下は静かに」', '「遠足のしおり」', '「保健だより」', '「清掃当番表」', '「図書室だより」', '「学級目標　ひとりひとりが主役」', '「進路説明会のお知らせ」'];
    return { fl: 3, x, y, d, deco: 'bulletin',
      talk: s => hit ? ['掲示物：時間割。月曜の1時間目に「放送」とある。', ...(s.flags.q5 && !s.flags.q5found ? ['机の脇に、学生カバンが掛かっている。', '★ 新入生のカバンを 見つけた'] : [])]
                     : [`掲示物：${notes[i % notes.length]}`],
      after: s => { if (hit && s.flags.q5 && !s.flags.q5found) { s.flags.q5found = true; state.items.push('bag'); } } };
  }),
  // --- 6 2階のトイレの鏡 ---
  { fl: 2, x: 14, y: 7, d: 3, cond: s => s.flags.q6s >= 2 && !hasItem('mirror') && !s.flags.q6fight,
    talk: () => ['洗面台の鏡が、外れかけている。', '★ 洗面台の鏡を 外して持った'], after: () => state.items.push('mirror') },
  // --- 7 屋上の給水タンク（2年の生徒の嘘） ---
  { fl: 5, x: 6, y: 10, d: 3, cond: s => s.flags.q7s === 2, talk: () => ['給水タンクのまわりを探したが、何も落ちていない。'] },
  // --- 3 校長室の金庫と、ひとつだけ違う時計 ---
  { fl: 1, x: 17, y: 2, d: 1, deco: 'safe', cond: s => !hasItem('equipkey') && !s.flags.q3done,
    talk: () => ['古い金庫がある。ダイヤルに、時計の文字盤が描かれている。'],
    after: () => showChoice('ダイヤルを合わせる', ['3時', '5時', '7時', '9時'].map(t => [t, () => {
      if (t !== '7時') { showDialog(['ダイヤルは、びくともしない。']); return; }
      state.items.push('equipkey'); showDialog(['金庫が開いた。', '★ 機材の鍵を 手に入れた']);
    }])) },
  { fl: 3, x: 30, y: 24, d: 0, deco: 'clock7', talk: () => ['壁の時計。この時計だけ、針が7時を指している。'] },
];
// 調べるものの飾りを、その壁に描く
for (const e of EXAMINES) if (e.deco) MAPS[e.fl].deco[`${e.x},${e.y},${e.d}`] = e.deco;
// 今いる所・向きで調べられるもの
const examineAt = s => EXAMINES.find(e => e.fl === s.fl && e.x === s.x && e.y === s.y && e.d === s.dir && (!e.cond || e.cond(s))) || null;
// 順番に選ぶ錠：選んだものを並べて見せ、answer と同じ並びなら ok
function askSeq(title, opts, answer, ok) {
  const picks = [];
  const step = () => {
    if (picks.length === answer.length) { if (picks.every((p, i) => p === answer[i])) ok(); else showDialog(['……何も起きない。']); return; }
    showChoice(`${title}：${picks.length ? picks.join('・') : '―'}`, [...opts.map(o => [o, () => { picks.push(o); step(); }]), ['やめる', () => {}]]);
  };
  step();
}

// ===================== 職員室の先生の話（話の途中で、先生に聞かないとわからないこと） =====================
//   職員室で話しかけても、仲間として連れている時に話しかけても同じことを話す
function teacherQuestTalk(key, s) {
  const f = s.flags;
  if (key === 'shiraishi' && f.q7s >= 1 && f.q7s < 3) { f.q7s = 3; return [
    '白石先生「鍵束？ さっき2年の子が、じゃらじゃら鳴らして空中廊下を走っていったわよ」',
    '「あの子、ときどき平気で嘘をつくのよね」',
  ]; }
  if (key === 'midorikawa' && f.q6s === 1) { f.q6s = 2; return [
    '緑川先生「美術準備室の肖像画？ あれは、自分の顔を見るのをひどく嫌うの」',
    '「鏡でも向けてやれば、おとなしくなるかもしれないわね」',
  ]; }
  if (key === 'kuroda' && f.q4s >= 1 && f.q4s < 4 && !f.q4kuroda) { f.q4kuroda = true; return [
    '黒田先生「1979年度……最後の下校放送が流れなかった年だ」',
    '「その年の3年B組に、放送委員がいた。名前の記録が、なぜか残っていない」',
    '「貸出カードを調べるなら、名前より日付を見ることだ」',
  ]; }
  return null;
}

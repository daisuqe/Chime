'use strict';
// =====================================================================
//  Chime — 人物・落とし物・サブシナリオ
//  NPCS：話しかける相手（img が無い／読めないときは棒人間で代わりに表示）
//        foe を持つものは「固定の敵」：話しかけると戦闘になり、勝つと消える
//  ITEMS：床に落ちている物。上に乗ると拾う
//
//  サブシナリオ（7本）
//   1 片方の上履き      1年生（B棟1F 1年A組）   … 2F 空中廊下に落ちた上履きを届ける
//   2 逃げた人体模型    理科の先生（C棟1F 理科室）… 理科準備室の人体模型を倒す
//   3 最後の放送        放送部員（A棟1F 放送室）  … D棟3F 放送準備室のテープを持ち帰る
//   4 卒業アルバム      司書（D棟1F 司書室）      … 3年の先輩からアルバムを返してもらう
//   5 迷子の新入生      新入生（B棟3F 廊下の西端）… 「3年E組」のどれかにあるカバンを探す
//   6 見つめる肖像画    美術部員（C棟2F 美術室）  … 美術準備室の肖像画を倒す
//   7 用務員の鍵束      用務員（A棟1F 用務員室）  … 2F 空中廊下で鍵束を拾う → 音楽準備室が開く
// =====================================================================

// --- 持ち物 ---
const hasItem = id => state.items.includes(id);
const takeItem = id => { state.items = state.items.filter(i => i !== id); };
const ITEM_NAME = {
  shoe: '名前入りの上履き', keys: '用務員の鍵束', tape: '最終下校の放送テープ', album: '1979年度 卒業アルバム',
  bag: '新入生のカバン', omamori: 'お守り', badge: '校章バッジ', bookmark: '古い栞', map: '校舎の見取り図',
};
// 落とし物の画像と、床に置いたときの幅（1 = 1マス。小さい物は見えるよう少し大きめ）
const ITEM_IMG = {
  shoe: { src: 'image/item_shoe.png', w: 0.26 }, keys: { src: 'image/item_keys.png', w: 0.15 },
  tape: { src: 'image/item_casete.png', w: 0.18 }, album: { src: 'image/item_album.png', w: 0.3 },
  bag: { src: 'image/item_bag.png', w: 0.36 },
};
// 吊るされた飾り：鐘楼の鐘（番人の脇）
const DECOR = [
  { fl: 4, x: 6, y: 19, img: 'image/chime.png', w: 0.45 },
];
// --- ごほうび ---
function rewardExp(n) { aliveParty().forEach(c => { c.exp += n; }); levelUps(); }
function rewardAll(fn) { state.party.forEach(fn); }

const ITEMS = [
  { id: 'shoe', quest: 'q1', fl: 2, x: 9, y: 7, text: ['床に、上履きが片方だけ落ちている。', 'かかとに「1-A」と書かれた名前の欄がある。'] },
  { id: 'keys', quest: 'q7', fl: 2, x: 16, y: 4, text: ['廊下の真ん中に、鍵束が落ちている。', 'タグに「用務員室」とある。'] },
  { id: 'tape', quest: 'q3', fl: 3, x: 34, y: 25, text: ['棚の奥に、ラベルの褪せたカセットテープがある。', '「最終下校　1979」と書かれている。'] },
  { id: 'bag', quest: 'q5', fl: 3, x: 14, y: 9, text: ['机の脇に、真新しい学生カバンが掛かっている。', '名札には「1年」とだけ読める。'] },
  { id: 'badge', fl: 1, x: 31, y: 12, text: ['楽譜の山の下に、古い校章バッジが埋もれていた。'], get() { const p = state.party[0]; p.atk = [p.atk[0] + 2, p.atk[1] + 2]; } },
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
    talk(s) {
      const sp = t.spells.map(i => SPELLS[i].name).join('・');
      return [`${t.name}先生${t.line}`];
    },
    after() { offerJoin(t.key); },
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
  q3: '「放送室の鍵が開いてたわ。放送部の子が来てるのかしら」',
};
// まだ伝えていないヒントを 1 つだけ返す（一度伝えたら繰り返さない）
//   保健室に来るたびに 1 つまで。保健室を出て、また戻ってくると次の 1 つ（nurseHinted は保健室の外に出ると消える）
function questHints(s) {
  if (s.flags.nurseHinted) return [];
  const q = openQuests().find(q => !s.flags[q] && !s.flags['hint_' + q]);
  let line = null;
  if (q) { s.flags['hint_' + q] = true; line = QUEST_HINT[q]; }
  else if (s.flags.q7done && !s.flags.got_badge && !s.flags.hint_badge) { s.flags.hint_badge = true; line = '「音楽準備室に、古い校章バッジがしまってあるそうよ。役に立つかもね」'; }
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
    talk() { return [
      '生徒「帰ろうと思ってたんだけど、夕焼けがきれいでさ」',
      '「チャイムが鳴り終わったら帰るよ」',
    ]; } },
  { id: 'bell', fl: 4, x: 4, y: 20, name: '鐘の番人', img: 'image/enemy/enemy_time_warden_boss.png', ht: 200, boss: true, hide: s => s.flags.bossDown,
    talk(s) { return [
      '鐘楼の天井から、古い校内放送の鐘が吊るされている。',
      'その傍らに、フードを目深にかぶった大きな人影が立っていた。',
      s.flags.q3done ? '番人「……下校の放送は、聞いたか」'
                     : '番人「……鐘を止めに来たか。この夕暮れは、終わらせぬ」',
      '番人が 大槌を振り上げた――！',
    ]; },
    after() { startBattle('bell', 1); } },

  // ===================== 1 片方の上履き =====================
  { id: 'ichinen', quest: 'q1', fl: 1, x: 4, y: 16, name: '1年生', img: 'image/chara_1nen.png', ht: 150, hide: s => s.flags.q1done,
    talk(s) {
      if (hasItem('shoe')) return [
        '1年生「あっ、わたしの上履き！ どこにあったの？」',
        '「……2階の廊下？ あの子、そんなところまで行ってたんだ」',
        '「ありがとう。これ、おばあちゃんにもらったお守り。持ってって」',
        '★ お守りを もらった',
      ];
      s.flags.q1 = true;
      return [
        '1年生「上履きが片方なくなっちゃって……」',
        '「さっき、ぴょんぴょん跳ねて階段を上っていっちゃったの」',
        '「2階の、くねくね曲がった廊下のほうへ……」',
      ];
    },
    after(s) { if (!hasItem('shoe')) return; takeItem('shoe'); state.items.push('omamori'); rewardAll(c => { c.ac--; }); s.flags.q1done = true; } },

  // ===================== 2 逃げた人体模型 =====================
  { id: 'rika', quest: 'q2', fl: 1, x: 32, y: 2, name: '理科の先生', img: 'image/chara_rika.png', ht: 172,
    talk(s) {
      if (s.flags.q2done) return ['理科の先生「準備室は片付いたよ。模型たちも、しばらくはおとなしくしているだろう」'];
      if (s.flags.q2fight) return [
        '理科の先生「本当に止めてくれたのか！ 助かった」',
        '「これは気付け薬だ。昔の薬品棚にあったものだが、よく効くよ」',
        '★ 気付け薬を もらった',
      ];
      s.flags.q2 = true;
      return [
        '理科の先生「君たち、準備室には入らないほうがいい」',
        '「人体模型が、また二体とも歩き回っていてね」',
        '「止めてくれるなら、礼はする。準備室は理科室の隣だ」',
      ];
    },
    after(s) { if (s.flags.q2fight && !s.flags.q2done) { s.flags.q2done = true; rewardAll(c => { c.maxhp += 3; c.hp += 3; }); rewardExp(20); } } },
  { id: 'q2foe', quest: 'q2', fl: 1, x: 31, y: 5, name: '人体模型', img: 'image/enemy/enemy_anatomical_model.png', ht: 165, foe: true, hide: s => s.flags.q2fight,
    talk() { return ['棚の陰から、人体模型が二体、ぎくしゃくと振り向いた――！']; },
    after() { startBattle('model', 2, () => { state.flags.q2fight = true; }); } },

  // ===================== 3 最後の放送 =====================
  { id: 'housou', quest: 'q3', fl: 1, x: 18, y: 1, name: '放送部員', img: 'image/chara_housou.png', ht: 160,
    talk(s) {
      if (s.flags.q3done) return ['放送部員「あの放送のあと、鐘の音が少し遠くなった気がする」'];
      if (hasItem('tape')) return [
        '放送部員「それ……！ 最終下校のテープ！ かけてみるね」',
        '――ザザ……「下校の時刻になりました。校内に残っている生徒は……」',
        '「……1979年、最後の下校放送。鐘が鳴り終わらなくなった日の録音です」',
        '放送部員「番人さんって、本当は下校を見届ける係だったのかもしれない」',
        '★ 鐘の音が 少し遠くなった',
      ];
      s.flags.q3 = true;
      return [
        '放送部員「最後の下校放送、そろそろ流さなきゃいけないの」',
        '「でも肝心のテープが無い。最後の下校放送のテープ」',
        '「D棟の3階の放送準備室にあるはず」',
      ];
    },
    after(s) { if (hasItem('tape') && !s.flags.q3done) { takeItem('tape'); s.flags.q3done = true; rewardExp(25); } } },

  // ===================== 4 卒業アルバム =====================
  { id: 'shisho', quest: 'q4', fl: 1, x: 30, y: 26, name: '司書', img: 'image/chara_sisyo.png', ht: 160,
    talk(s) {
      if (s.flags.q4done) return ['司書「アルバム、ちゃんと棚に戻しておいたわ」'];
      if (hasItem('album')) return [
        '司書「返ってきた！ 1979年度の卒業アルバム」',
        '「……あら、最後の集合写真。番人さんも一緒に写ってるのね」',
        '「お礼にこれを。栞よ。読みかけの気持ちを、なくさないように」',
        '★ 古い栞を もらった',
      ];
      s.flags.q4 = true;
      return [
        '司書「1979年度の卒業アルバムが、ずっと返ってこないの」',
        '「貸出カードの最後の名前は……3年の生徒ね。C棟の3階あたりにいるはず」',
      ];
    },
    after(s) { if (hasItem('album') && !s.flags.q4done) { takeItem('album'); state.items.push('bookmark'); rewardAll(c => { if (c.maxmp) { c.maxmp += 2; c.mp += 2; } }); s.flags.q4done = true; rewardExp(15); } } },
  { id: 'senpai', fl: 3, x: 30, y: 6, name: '3年の先輩', img: 'image/chara_senior_year3.png', ht: 150,
    talk(s) {
      if (s.flags.q4 && !s.flags.q4got) { s.flags.q4got = true; state.items.push('album'); return [
        '先輩「司書さんの使い？ ……ああ、このアルバムか」',
        '「番人も写ってるだろ。あの頃から、ずっと鐘のそばにいるんだ」',
        '★ 1979年度 卒業アルバムを 受け取った',
      ]; }
      return [
        '先輩「この上の鐘楼には近づかない方がいい」',
        '「俺は、鐘が鳴り終わったら帰るつもりだ」',
        '「……行くなら、しっかり鍛えてからにしな」',
      ];
    } },

  // ===================== 5 迷子の新入生 =====================
  { id: 'shinnyu', quest: 'q5', fl: 3, x: 2, y: 8, name: '新入生', img: 'image/chara_sinnnyuusei.png', ht: 155, hide: s => s.flags.q5done,
    talk(s) {
      if (hasItem('bag')) return [
        '新入生「ぼくのカバン！ どの教室にありました？」',
        '「……5つ目の3年E組でしたか。4つ目だと思ってました」',
        '「これで帰れます。ありがとうございます」',
        '★ 新入生は 階段のほうへ駆けていった',
      ];
      s.flags.q5 = true;
      return [
        '新入生「先輩、ここ3年の教室ですよね……？」',
        '「3年E組にカバンを置いてきたんですけど、どの3年E組だったか忘れちゃって」',
      ];
    },
    after(s) { if (hasItem('bag') && !s.flags.q5done) { takeItem('bag'); s.flags.q5done = true; rewardExp(30); } } },

  // ===================== 6 見つめる肖像画 =====================
  { id: 'art', quest: 'q6', fl: 2, x: 30, y: 3, name: '美術部員', img: 'image/chara_art_club.png', ht: 155,
    talk(s) {
      if (s.flags.q6done) return ['美術部員「もう、誰にも見られてない感じがする。……ありがとう」'];
      if (s.flags.q6fight) return [
        '美術部員「肖像画、静かになった……？ よかった」',
        '「これ、わたしが描いた校舎の見取り図。よかったら使って」',
        '★ 校舎の見取り図を もらった',
      ];
      s.flags.q6 = true;
      return [
        '美術部員「準備室の肖像画、今日はやけにこっちを見てくるの」',
        '「落ち着いて描けないから、なんとかしてくれる？」',
      ];
    },
    after(s) { if (s.flags.q6fight && !s.flags.q6done) { s.flags.q6done = true; state.items.push('map'); revealAllMaps(); rewardExp(20); } } },
  { id: 'q6foe', quest: 'q6', fl: 2, x: 32, y: 2, name: '肖像画', img: 'image/enemy/enemy_portrait.png', ht: 120, foe: true, hide: s => s.flags.q6fight,
    talk() { return ['イーゼルに立てかけられた肖像画が、まばたきをした――！']; },
    after() { startBattle('portrait', 1, () => { state.flags.q6fight = true; }); } },

  // ===================== 7 用務員の鍵束 =====================
  { id: 'youmu', quest: 'q7', fl: 1, x: 20, y: 6, name: '用務員', img: 'image/chara_caretaker.png', ht: 165,
    talk(s) {
      if (s.flags.q7done) return ['用務員「音楽準備室なら開けといたよ。古い物が埋もれてるかもしれん」'];
      if (hasItem('keys')) return [
        '用務員「おお、わしの鍵束！ 助かったよ」',
        '「礼に、音楽準備室の鍵を開けておこう。C棟の1階だ」',
        '★ 音楽準備室の 鍵が開いた',
      ];
      s.flags.q7 = true;
      return [
        '用務員「鍵束を落としちまってね。2階の、曲がりくねった廊下のどこかだ」',
        '「あそこは見晴らしがよくてな、つい景色に見とれて……。拾ってきてくれんか」',
        '「階段を上がって、くねくねした廊下をたどるといい」',
      ];
    },
    after(s) { if (hasItem('keys') && !s.flags.q7done) { takeItem('keys'); s.flags.q7done = true; s.flags.keys = true; rewardExp(15); } } },
];

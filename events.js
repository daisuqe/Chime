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
  { id: 'shoe', fl: 2, x: 14, y: 23, text: ['床に、上履きが片方だけ落ちている。', 'かかとに「1-A」と書かれた名前の欄がある。'] },
  { id: 'keys', fl: 2, x: 16, y: 6, text: ['廊下の真ん中に、鍵束が落ちている。', 'タグに「用務員室」とある。'] },
  { id: 'tape', fl: 3, x: 34, y: 22, text: ['棚の奥に、ラベルの褪せたカセットテープがある。', '「最終下校　1979」と書かれている。'] },
  { id: 'bag', fl: 3, x: 24, y: 11, text: ['机の脇に、真新しい学生カバンが掛かっている。', '名札には「1年」とだけ読める。'] },
  { id: 'badge', fl: 1, x: 31, y: 12, text: ['楽譜の山の下に、古い校章バッジが埋もれていた。', '（Player の攻撃力が上がった）'], get() { const p = state.party[0]; p.atk = [p.atk[0] + 2, p.atk[1] + 2]; } },
];

// ===================== 職員室の先生（1人だけ連れて行ける。職員室で交代できる） =====================
//   key：名前の元 / x,y：職員室で立っている場所 / cls：教科 / spells：使える呪文 / line：最初のひとこと
//   画像は image/chara_<key>.png。無ければ棒人間で表示。ht は身長（cm）
const TEACHERS = [
  { key: 'saeki', name: '佐伯', cls: '体育', x: 6, y: 1, ht: 178,
    st: { maxhp: 16, maxmp: 8, atk: [3, 7], ac: 8, agi: 7, grow: { hp: [3, 6], mp: 3 } }, spells: ['heal', 'scold'],
    line: '「なんだ、まだ残っていたのか。生徒を一人で歩かせるわけにはいかん」', note: '力が強い。手当てと一喝' },
  { key: 'furukawa', name: '古川', cls: '国語', x: 7, y: 1, ht: 162,
    st: { maxhp: 11, maxmp: 10, atk: [1, 4], ac: 9, agi: 8, grow: { hp: [2, 4], mp: 4 } }, spells: ['lecture', 'scold'],
    line: '「……こういう夜の話を、昔読んだことがあるわ。眠らせてしまえばいいのよ」', note: '敵を眠らせるのが得意' },
  { key: 'sanada', name: '真田', cls: '数学', x: 8, y: 1, ht: 178,
    st: { maxhp: 12, maxmp: 9, atk: [2, 5], ac: 8, agi: 10, grow: { hp: [2, 5], mp: 3 } }, spells: ['chalk', 'quiz'],
    line: '「確率的に考えて、二人の方が生き残る。行こう」', note: 'チョーク投げと抜き打ちテストで攻める' },
  { key: 'shiraishi', name: '白石', cls: '音楽', x: 9, y: 1, ht: 163,
    st: { maxhp: 10, maxmp: 11, atk: [1, 4], ac: 9, agi: 9, grow: { hp: [2, 4], mp: 4 } }, spells: ['chorus', 'scold'],
    line: '「あの鐘の音……音程が少しずつ狂ってるの。気になって」', note: '合唱で全員を回復' },
  { key: 'kuroda', name: '黒田', cls: '社会', x: 10, y: 1, ht: 176,
    st: { maxhp: 14, maxmp: 7, atk: [2, 6], ac: 7, agi: 8, grow: { hp: [3, 5], mp: 2 } }, spells: ['drill', 'chalk'],
    line: '「この学校の古い記録は、俺が一番知っている。避難訓練の要領で行くぞ」', note: '打たれ強い。避難訓練で全員を守る' },
  { key: 'aoyama', name: '青山', cls: '英語', x: 11, y: 1, ht: 165,
    st: { maxhp: 11, maxmp: 9, atk: [1, 5], ac: 9, agi: 11, grow: { hp: [2, 4], mp: 3 } }, spells: ['heal', 'chalk'],
    line: '「Don\'t worry. 先生がついてるから」', note: '素早い。手当てとチョーク投げ' },
  { key: 'midorikawa', name: '緑川', cls: '美術', x: 7, y: 3, ht: 172,
    st: { maxhp: 10, maxmp: 11, atk: [1, 4], ac: 9, agi: 10, grow: { hp: [2, 4], mp: 4 } }, spells: ['lecture', 'chorus'],
    line: '「校舎の形、描くたびに変わるんだ。一緒に確かめに行こう」', note: '眠らせる呪文と全員の回復' },
  { key: 'akai', name: '赤井', cls: '家庭科', x: 10, y: 3, ht: 155,
    st: { maxhp: 12, maxmp: 9, atk: [1, 5], ac: 8, agi: 9, grow: { hp: [3, 5], mp: 3 } }, spells: ['heal', 'drill'],
    line: '「お腹すいてない？ ……冗談よ。危ないから、ついていくわ」', note: '手当てと避難訓練で支える' },
];
const teacherOf = key => TEACHERS.find(t => t.key === key);
// 仲間としての先生（一度連れて行った先生は、交代しても経験やレベルを覚えている）
function teacherChar(key) {
  state.teachers = state.teachers || {};
  if (!state.teachers[key]) { const t = teacherOf(key); state.teachers[key] = mkChar({ id: 't_' + key, name: t.name, cls: t.cls, spells: t.spells.slice(), ...JSON.parse(JSON.stringify(t.st)) }); }
  return state.teachers[key];
}
function joinTeacher(key) {
  const s = state, old = s.flags.teacher;
  if (old) s.party = s.party.filter(c => c.id !== 't_' + old);
  s.party.splice(1, 0, teacherChar(key)); // Player のすぐ後ろ
  s.flags.teacher = key; s.flags.hadTeacher = true;
  log(old ? `${teacherOf(old).name}先生と交代して、${teacherOf(key).name}先生が仲間に加わった` : `${teacherOf(key).name}先生が 仲間に加わった！`, 'good');
}
function teacherNPC(t) {
  return {
    id: 't_' + t.key, fl: 1, x: t.x, y: t.y, name: t.name + '先生', img: `image/chara_${t.key}.png`, ht: t.ht,
    hide: s => s.flags.teacher === t.key,
    talk(s) {
      const sp = t.spells.map(i => SPELLS[i].name).join('・');
      return [`${t.name}先生（${t.cls}）${t.line}`, `（${t.note}。呪文：${sp}）`];
    },
    after(s) {
      const cur = s.flags.teacher;
      const q = cur ? `${teacherOf(cur).name}先生と交代して、${t.name}先生に来てもらう？` : `${t.name}先生に一緒に来てもらう？`;
      showChoice(q, [['はい', () => joinTeacher(t.key)], ['いいえ', () => {}]]);
    },
  };
}

const NPCS = [
  ...TEACHERS.map(teacherNPC),
  // ===================== 本筋 =====================
  { id: 'nurse', fl: 1, x: 2, y: 2, name: '保健の先生', img: 'image/chara_teacher_hospital.png', ht: 158,
    talk(s) {
      const first = !s.flags.metNurse; s.flags.metNurse = true;
      healAll();
      return first ? [
        '保健の先生「気がついた？ 廊下で倒れていたのよ」',
        '「……変ね。さっきから時計の針が五時から動かないの」',
        '「窓から見える校舎の形も、なんだかおかしい気がする」',
        '「隣の職員室に、まだ先生が何人か残っているはずよ。誰か一人についてきてもらいなさい」',
        '（体力と気力が全回復した）',
      ] : ['保健の先生「無理はしないでね。ほら、少し休んでいきなさい」', '（体力と気力が全回復した）'];
    } },
  { id: 'mizuno', fl: 1, x: 25, y: 25, name: '図書委員', img: 'image/chara_mizuno.png', ht: 152, hide: s => s.flags.mizuno,
    talk() { return [
      '図書委員の水野「……静かに。本が、勝手にページをめくってるの」',
      '「この学校の古い記録に、“鳴りやまないチャイム”の話があった」',
      '「鐘楼……この学校に、そんなもの無かったはずなのに」',
      '「調べたいことがあるの。私もついていく」',
      '★ 水野が 仲間に加わった！',
    ]; },
    after(s) { s.flags.mizuno = true; s.party.push(RECRUITS.mizuno()); } },
  { id: 's2a', fl: 2, x: 4, y: 10, name: '2年の生徒', img: 'image/chara_student_year2.png', ht: 170,
    talk() { return [
      '生徒「2階に上がったら、1階と全然つくりが違うんだ」',
      '「窓の外、ちゃんと見た？ ……見てみなよ」',
    ]; } },
  { id: 'bell', fl: 4, x: 4, y: 20, name: '鐘の番人', img: 'image/monster_time_warden_boss.png', ht: 200, boss: true, hide: s => s.flags.bossDown,
    talk(s) { return [
      '鐘楼の天井から、古い校内放送の鐘が吊るされている。',
      'その傍らに、フードを目深にかぶった大きな人影が立っていた。',
      s.flags.q3done ? '番人「……あの放送を聞いたか。ならば分かるだろう、この夕暮れが何なのか」'
                     : '番人「……鐘を止めに来たか。この夕暮れは、終わらせぬ」',
      '番人が 大槌を振り上げた――！',
    ]; },
    after() { startBattle('bell', 1); } },

  // ===================== 1 片方の上履き =====================
  { id: 'ichinen', fl: 1, x: 4, y: 16, name: '1年生', img: 'image/chara_1nen.png', ht: 150, hide: s => s.flags.q1done,
    talk(s) {
      if (hasItem('shoe')) return [
        '1年生「あっ、わたしの上履き！ どこにあったの？」',
        '「……2階の、くねくね曲がった廊下？ やっぱり、あれ夢じゃなかったんだ」',
        '「ありがとう。これ、おばあちゃんにもらったお守り。持ってって」',
        '★ お守りを もらった（全員の守りが上がった）',
      ];
      s.flags.q1 = true;
      return [
        '1年生「上履きが片方なくなっちゃって……」',
        '「さっき、上履きが勝手に跳ねて、階段を上っていくのを見たの」',
        '「2階の、くねくね曲がった廊下のほうへ……」',
      ];
    },
    after(s) { if (!hasItem('shoe')) return; takeItem('shoe'); state.items.push('omamori'); rewardAll(c => { c.ac--; }); s.flags.q1done = true; } },

  // ===================== 2 逃げた人体模型 =====================
  { id: 'rika', fl: 1, x: 32, y: 2, name: '理科の先生', img: 'image/chara_rika.png', ht: 172,
    talk(s) {
      if (s.flags.q2done) return ['理科の先生「準備室は片付いたよ。……模型は、もう動かないといいんだが」'];
      if (s.flags.q2fight) return [
        '理科の先生「本当に止めてくれたのか！ 助かった」',
        '「これは気付け薬だ。昔の薬品棚にあったものだが、よく効くよ」',
        '★ 気付け薬を使った（全員の最大HPが 3 上がった）',
      ];
      s.flags.q2 = true;
      return [
        '理科の先生「君たち、準備室には入らないほうがいい」',
        '「人体模型が……二体とも、勝手に歩き出したんだ」',
        '「止めてくれるなら、礼はする。準備室は理科室の南だ」',
      ];
    },
    after(s) { if (s.flags.q2fight && !s.flags.q2done) { s.flags.q2done = true; rewardAll(c => { c.maxhp += 3; c.hp += 3; }); rewardExp(20); } } },
  { id: 'q2foe', fl: 1, x: 31, y: 5, name: '人体模型', img: 'image/monster_anatomical_model.png', ht: 165, foe: true, hide: s => s.flags.q2fight,
    talk() { return ['棚の陰から、人体模型が二体、ぎくしゃくと振り向いた――！']; },
    after() { startBattle('model', 2, () => { state.flags.q2fight = true; }); } },

  // ===================== 3 最後の放送 =====================
  { id: 'housou', fl: 1, x: 16, y: 1, name: '放送部員', img: 'image/chara_housou.png', ht: 160,
    talk(s) {
      if (s.flags.q3done) return ['放送部員「あの放送が流れたあと、鐘の音が少し遠くなった気がする」'];
      if (hasItem('tape')) return [
        '放送部員「それ……！ 最終下校のテープ！ かけてみるね」',
        '――ザザ……「下校の時刻になりました。校内に残っている生徒は……」',
        '「……1979年、最後の下校放送の途中で、鐘が鳴りやまなくなった日の録音です」',
        '放送部員「番人って、本当は下校を見届ける係だったのかもしれない」',
        '★ 鐘の番人の 鐘の響きが弱まった',
      ];
      s.flags.q3 = true;
      return [
        '放送部員「放送室の機械が、勝手に昔の放送を流そうとするの」',
        '「でも肝心のテープが無い。最後の下校放送のテープ」',
        '「D棟の3階の放送準備室にあるはず。……3階に、D棟なんてあったかな」',
      ];
    },
    after(s) { if (hasItem('tape') && !s.flags.q3done) { takeItem('tape'); s.flags.q3done = true; rewardExp(25); } } },

  // ===================== 4 卒業アルバム =====================
  { id: 'shisho', fl: 1, x: 30, y: 26, name: '司書', img: 'image/chara_sisyo.png', ht: 160,
    talk(s) {
      if (s.flags.q4done) return ['司書「アルバム、ちゃんと棚に戻しておいたわ。……写真の人影のことは、忘れなさい」'];
      if (hasItem('album')) return [
        '司書「返ってきた！ 1979年度の卒業アルバム」',
        '「……あら、最後の集合写真。後ろに、フードの大きな人が写ってる」',
        '「お礼にこれを。栞よ。読みかけの気持ちを、なくさないように」',
        '★ 古い栞を もらった（呪文を使える仲間の最大MPが 2 上がった）',
      ];
      s.flags.q4 = true;
      return [
        '司書「1979年度の卒業アルバムが、ずっと返ってこないの」',
        '「貸出カードの最後の名前は……3年の生徒ね。C棟の3階あたりにいるはず」',
      ];
    },
    after(s) { if (hasItem('album') && !s.flags.q4done) { takeItem('album'); state.items.push('bookmark'); rewardAll(c => { if (c.maxmp) { c.maxmp += 2; c.mp += 2; } }); s.flags.q4done = true; rewardExp(15); } } },
  { id: 'senpai', fl: 3, x: 9, y: 17, name: '3年の先輩', img: 'image/chara_senior_year3.png', ht: 150,
    talk(s) {
      if (s.flags.q4 && !s.flags.q4got) { s.flags.q4got = true; state.items.push('album'); return [
        '先輩「司書さんの使い？ ……ああ、このアルバムか」',
        '「最後の集合写真、よく見てみな。俺たちの後ろに、誰かいるだろ」',
        '★ 1979年度 卒業アルバムを 受け取った',
      ]; }
      return [
        '先輩「この上の鐘楼には近づかない方がいい」',
        '「放課後のチャイムが鳴り終わらない限り、この夕方は終わらないって噂だ」',
        '「……行くなら、しっかり鍛えてからにしな」',
      ];
    } },

  // ===================== 5 迷子の新入生 =====================
  { id: 'shinnyu', fl: 3, x: 2, y: 8, name: '新入生', img: 'image/chara_sinnnyuusei.png', ht: 155, hide: s => s.flags.q5done,
    talk(s) {
      if (hasItem('bag')) return [
        '新入生「ぼくのカバン！ どの教室にありました？」',
        '「……5つ目の3年E組。数えてたのに、何回数えても場所が変わるんです」',
        '「これで帰れる……いや、帰れるのかな。とにかく、ありがとうございます」',
        '★ 新入生は 階段のほうへ駆けていった',
      ];
      s.flags.q5 = true;
      return [
        '新入生「先輩、ここ3年の教室ですよね……？」',
        '「3年E組にカバンを置いてきたんです。でも、3年E組がいくつもあって……」',
        '「どれが本物か、わからないんです」',
      ];
    },
    after(s) { if (hasItem('bag') && !s.flags.q5done) { takeItem('bag'); s.flags.q5done = true; rewardExp(30); } } },

  // ===================== 6 見つめる肖像画 =====================
  { id: 'art', fl: 2, x: 26, y: 13, name: '美術部員', img: 'image/chara_art_club.png', ht: 155,
    talk(s) {
      if (s.flags.q6done) return ['美術部員「もう、誰にも見られてない感じがする。……ありがとう」'];
      if (s.flags.q6fight) return [
        '美術部員「肖像画、静かになった……？ よかった」',
        '「これ、わたしが描いた校舎の見取り図。……描いてるうちに、形が変わっていったの」',
        '★ 校舎の見取り図を もらった（ミニマップに全階の形が描かれた）',
      ];
      s.flags.q6 = true;
      return [
        '美術部員「準備室の肖像画の目が、ずっとこっちを見てるの……」',
        '「目をそらすと、少しずつ近づいてくる気がする。お願い、なんとかして」',
      ];
    },
    after(s) { if (s.flags.q6fight && !s.flags.q6done) { s.flags.q6done = true; state.items.push('map'); revealAllMaps(); rewardExp(20); } } },
  { id: 'q6foe', fl: 2, x: 31, y: 13, name: '肖像画', img: 'image/monster_watching_portrait_.png', ht: 120, foe: true, hide: s => s.flags.q6fight,
    talk() { return ['イーゼルに立てかけられた肖像画が、まばたきをした――！']; },
    after() { startBattle('portrait', 1, () => { state.flags.q6fight = true; }); } },

  // ===================== 7 用務員の鍵束 =====================
  { id: 'youmu', fl: 1, x: 19, y: 2, name: '用務員', img: 'image/chara_caretaker.png', ht: 165,
    talk(s) {
      if (s.flags.q7done) return ['用務員「音楽準備室なら開けといたよ。古い物が埋もれてるかもしれん」'];
      if (hasItem('keys')) return [
        '用務員「おお、わしの鍵束！ 2階の曲がりくねった廊下で？ ……そうか」',
        '「この学校はな、何十年かに一度、こうして形を変えるんだ」',
        '「礼に、音楽準備室の鍵を開けておこう。C棟の1階だ」',
        '★ 音楽準備室の 鍵が開いた',
      ];
      s.flags.q7 = true;
      return [
        '用務員「鍵束を落としちまってね。2階の、曲がりくねった廊下のどこかだ」',
        '「あそこを歩くと足がすくんで、つい……。拾ってきてくれんか」',
        '「1階の東の階段から上がって、くねくねした廊下をたどるといい」',
      ];
    },
    after(s) { if (hasItem('keys') && !s.flags.q7done) { takeItem('keys'); s.flags.q7done = true; s.flags.keys = true; rewardExp(15); } } },
];

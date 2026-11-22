'use strict';
// =====================================================================
//  Chime — 言葉（日本語 / English / 한국어）
//  ・はじめは OS（ブラウザ）の言語で決める。日本語なら日本語、韓国語なら韓国語、それ以外は英語
//  ・ヘルプで切り替えると、その言葉を覚えておく（localStorage）。?lang=en / ?lang=ja / ?lang=ko でも試せる
//  ・ゲームの文はすべて日本語で書き、L('…') や L`…${x}…` で包む。英語は lang_en.js の EN、韓国語は lang_ko.js の KO から訳を引く
//    （訳が無いときは、英語は日本語のまま、韓国語は英語で出し、コンソールに知らせる）
//  ・部屋の名前など、判定にも使う言葉はデータでは日本語のまま持ち、表示するときに L(a.name) で訳す
// =====================================================================
const LANG_KEY = 'chime.lang';
const LANGS = ['ja', 'en', 'ko'];
const langOf = s => { s = String(s || '').toLowerCase(); return s.startsWith('ja') ? 'ja' : s.startsWith('ko') ? 'ko' : 'en'; };
const LANG = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  if (q) return langOf(q);
  try { const s = localStorage.getItem(LANG_KEY); if (LANGS.includes(s)) return s; } catch (e) {}
  return langOf((navigator.languages && navigator.languages[0]) || navigator.language);
})();
document.documentElement.lang = LANG;
// 言葉を切り替える：覚えてから読み込み直す（?lang= は外す）
function setLang(l) {
  try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
  const u = new URL(location.href); u.searchParams.delete('lang');
  location.replace(u.href);
}

// 英語で主人公（あなた＝You）が主語になったときは、動詞を You に合わせる（You takes → You take）
const YOU_MARK = '\u0001';
const YOU_VERB = { is: 'are', was: 'were', has: 'have', does: 'do', "isn't": "aren't", "wasn't": "weren't", "doesn't": "don't", "can't": "can't" };
function youVerb(w) {
  if (YOU_VERB[w]) return YOU_VERB[w];
  if (/[^aeiou]ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(ss|sh|ch|x|z|o)es$/.test(w)) return w.slice(0, -2);
  if (/[a-z]s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
  return w;
}
function fixYou(t) {
  if (!t.includes(YOU_MARK)) return t;
  return t
    .replace(new RegExp(YOU_MARK + "'s", 'g'), (m, i) => (startOfSentence(t, i) ? 'Your' : 'your'))
    .replace(new RegExp(YOU_MARK + ' ([a-z\']+)', 'g'), (m, w, i, all) => (startOfSentence(all, i) ? 'You ' + youVerb(w) : 'you ' + w))
    .replace(new RegExp(YOU_MARK, 'g'), (m, i, all) => (startOfSentence(all, i) ? 'You' : 'you'));
}
const startOfSentence = (t, i) => i === 0 || /(^|[.!?…"“:]\s+|\n\s*|^\s+)$/.test(t.slice(0, i));

const L_MISSING = new Set();
function missing(key) {
  if (L_MISSING.has(key)) return;
  L_MISSING.add(key); console.warn(`[lang] no ${LANG === 'ko' ? 'Korean' : 'English'} for:`, key);
}
// 韓国語の助詞：名前などを入れたあと、直前の文字にパッチム（終声）があるかで形を選ぶ
//   이(가)・은(는)・을(를)・와(과)・(으)로。数字は読み方で決める（1 일・3 삼 … はパッチムあり）
function koJosa(t) {
  const fin = ch => {
    if (/[0-9]/.test(ch)) return { has: '013678'.includes(ch), rieul: '178'.includes(ch) };
    const c = ch.charCodeAt(0) - 0xAC00; if (c < 0 || c > 11171) return null;
    const j = c % 28; return { has: j !== 0, rieul: j === 8 };
  };
  return t.replace(/([0-9가-힣])(이\(가\)|은\(는\)|을\(를\)|와\(과\)|\(으\)로)/g, (m, ch, p) => {
    const f = fin(ch); if (!f) return m;
    const pick = { '이(가)': f.has ? '이' : '가', '은(는)': f.has ? '은' : '는', '을(를)': f.has ? '을' : '를', '와(과)': f.has ? '과' : '와', '(으)로': f.has && !f.rieul ? '으로' : '로' }[p];
    return ch + pick;
  });
}
// 韓国語に訳が無いときは、英語で出す
const koOrEn = key => (typeof KO !== 'undefined' && KO[key] !== undefined ? KO[key] : (missing(key), EN[key]));
// L('文') または L`…${x}…`
function L(s, ...vals) {
  if (Array.isArray(s) && s.raw) {
    if (LANG === 'ja') return s.reduce((a, t, i) => a + t + (i < vals.length ? vals[i] : ''), '');
    const key = s.join('${}'), ko = LANG === 'ko' && typeof KO !== 'undefined' && KO[key] !== undefined, t = ko ? KO[key] : (LANG === 'ko' ? koOrEn(key) : EN[key]);
    const v = vals.map(x => (!ko && x === EN['あなた'] ? YOU_MARK : x));
    if (t === undefined) { missing(key); return s.reduce((a, t, i) => a + t + (i < vals.length ? vals[i] : ''), ''); }
    const out = typeof t === 'function' ? t(...v) : t.replace(/\{(\d)\}/g, (m, i) => v[+i]);
    return ko ? koJosa(out) : fixYou(out);
  }
  if (LANG === 'ja' || s == null) return s;
  const t = LANG === 'ko' ? koOrEn(s) : EN[s];
  if (t === undefined) { missing(s); return s; }
  return t;
}
// 先生の呼び方：日本語「佐伯先生」／英語「Mr. Saeki」／韓国語「사에키 선생님」
function sensei(name) {
  if (LANG === 'ja') return name + '先生';
  if (LANG === 'ko') return name + ' 선생님';
  return (EN_TITLE[name] || 'Teacher') + ' ' + name;
}
// 話している人と台詞：日本語「佐伯先生「…」」／英語「Mr. Saeki: "…"」／韓国語「사에키 선생님: "…"」
const say = (who, line) => (LANG === 'ja' ? who + line : who + ': ' + line);

// 画面に書いてある言葉（index.html）を、選んでいる言葉にする
function applyStaticText() {
  if (LANG === 'ja') return;
  document.documentElement.lang = LANG;
  document.title = 'Chime';
  document.querySelectorAll('#menu .tabs button').forEach(b => { b.textContent = L(b.textContent.trim()); });
  document.querySelectorAll('#pad button.txt').forEach(b => { b.innerHTML = L(b.innerHTML.trim()); });
  document.querySelectorAll('[aria-label]').forEach(el => { const a = el.getAttribute('aria-label'); if (/[\u3040-\u9fff]/.test(a)) el.setAttribute('aria-label', L(a)); });
  const close = document.querySelector('#menu .close'); if (close) close.textContent = L(close.textContent.trim());
  const help = document.getElementById('helpText'); if (help) help.innerHTML = LANG === 'ko' ? KO_HELP : EN_HELP;
  const fin = document.querySelector('#ending .fin'); if (fin) fin.textContent = L(fin.textContent.trim());
  const endBack = document.getElementById('endBack'); if (endBack) endBack.textContent = L(endBack.textContent.trim());
  const endStatsTitle = document.querySelector('#endStats h2'); if (endStatsTitle) endStatsTitle.textContent = L(endStatsTitle.textContent.trim());
  const fit = document.getElementById('bigmapFit'); if (fit) fit.textContent = L(fit.textContent.trim());
}

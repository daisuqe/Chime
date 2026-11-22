'use strict';
// =====================================================================
//  Chime — 言葉（日本語 / English）
//  ・はじめは OS（ブラウザ）の言語で決める。日本語なら日本語、それ以外は英語
//  ・ヘルプで切り替えると、その言葉を覚えておく（localStorage）。?lang=en / ?lang=ja でも試せる
//  ・ゲームの文はすべて日本語で書き、L('…') や L`…${x}…` で包む。英語のときは lang_en.js の EN から訳を引く
//    （訳が無いときは日本語のまま出し、コンソールに知らせる）
//  ・部屋の名前など、判定にも使う言葉はデータでは日本語のまま持ち、表示するときに L(a.name) で訳す
// =====================================================================
const LANG_KEY = 'chime.lang';
const LANG = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  if (q) return q.toLowerCase().startsWith('ja') ? 'ja' : 'en';
  try { const s = localStorage.getItem(LANG_KEY); if (s === 'ja' || s === 'en') return s; } catch (e) {}
  const n = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  return n.toLowerCase().startsWith('ja') ? 'ja' : 'en';
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
  L_MISSING.add(key); console.warn('[lang] no English for:', key);
}
// L('文') または L`…${x}…`
function L(s, ...vals) {
  if (Array.isArray(s) && s.raw) {
    if (LANG === 'ja') return s.reduce((a, t, i) => a + t + (i < vals.length ? vals[i] : ''), '');
    const key = s.join('${}'), t = EN[key];
    const v = vals.map(x => (LANG === 'en' && x === EN['あなた'] ? YOU_MARK : x));
    if (t === undefined) { missing(key); return s.reduce((a, t, i) => a + t + (i < vals.length ? vals[i] : ''), ''); }
    const out = typeof t === 'function' ? t(...v) : t.replace(/\{(\d)\}/g, (m, i) => v[+i]);
    return fixYou(out);
  }
  if (LANG === 'ja' || s == null) return s;
  const t = EN[s];
  if (t === undefined) { missing(s); return s; }
  return t;
}
// 先生の呼び方：日本語「佐伯先生」／英語「Mr. Saeki」
function sensei(name) {
  if (LANG === 'ja') return name + '先生';
  return (EN_TITLE[name] || 'Teacher') + ' ' + name;
}
// 話している人と台詞：日本語「佐伯先生「…」」／英語「Mr. Saeki: "…"」
const say = (who, line) => (LANG === 'ja' ? who + line : who + ': ' + line);

// 画面に書いてある言葉（index.html）を英語にする
function applyStaticText() {
  if (LANG === 'ja') return;
  document.title = 'Chime';
  document.querySelectorAll('#menu .tabs button').forEach(b => { b.textContent = L(b.textContent.trim()); });
  document.querySelectorAll('#pad button.txt').forEach(b => { b.innerHTML = L(b.innerHTML.trim()); });
  document.querySelectorAll('[aria-label]').forEach(el => { const a = el.getAttribute('aria-label'); if (/[\u3040-\u9fff]/.test(a)) el.setAttribute('aria-label', L(a)); });
  const close = document.querySelector('#menu .close'); if (close) close.textContent = L(close.textContent.trim());
  const help = document.getElementById('helpText'); if (help) help.innerHTML = EN_HELP;
  const fin = document.querySelector('#ending .fin'); if (fin) fin.textContent = L(fin.textContent.trim());
  const fit = document.getElementById('bigmapFit'); if (fit) fit.textContent = L(fit.textContent.trim());
}

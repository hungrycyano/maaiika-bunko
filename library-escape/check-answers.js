// 謎の答えが『指環』の本文(yubiwa.txt)から確実に導けるかを確かめます。
// 使い方:node library-escape/check-answers.js
'use strict';
const fs = require('fs');
const path = require('path');
const { parse } = require('./text.js');

const raw = fs.readFileSync(path.join(__dirname, '..', 'yubiwa.txt'), 'utf8');
const work = parse(raw);
const lines = work.lines.map((l) => (l.speaker ? l.speaker + '　' : '') + l.text);
const body = lines.join('\n');

let ok = true;
function check(label, cond, detail) {
  console.log((cond ? '  OK  ' : '  NG  ') + label + (detail ? '  … ' + detail : ''));
  if (!cond) ok = false;
}
const count = (s, sub) => s.split(sub).length - 1;

console.log('■ 本文の整形');
check('作品名・作者名', work.title === '指環' && work.author === '江戸川乱歩', work.title + ' / ' + work.author);
check('ルビ《》・｜・注記［＃］が残っていない', !/[《》｜［］＃]/.test(body));
check('クレジットに底本・入力・校正がある', ['底本', '入力：門田裕志', '校正：A.K'].every((k) => work.credits.join('\n').includes(k)));
check('最初と最後のセリフ', lines[0].startsWith('Ａ　失礼ですが') && lines[lines.length - 1].endsWith('開札口を出る時によ。'));

console.log('■ 場面一:衛星の投稿の暗号');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const posts = [...html.matchAll(/<time datetime="([^"]+)">[\s\S]*?<p class="post__body">(.)/g)]
  .map((m) => ({ t: m[1], c: m[2] }));
const oldest = posts.slice().sort((a, b) => a.t.localeCompare(b.t)).map((p) => p.c).join('');
const shown = posts.map((p) => p.c).join('');
check('投稿は4つ、時刻はすべてちがう', posts.length === 4 && new Set(posts.map((p) => p.t)).size === 4);
check('画面では新しい投稿が上', shown === 'らぞおあ', '上から読むと ' + shown);
check('古い順に最初の文字を読むと「あおぞら」', oldest === 'あおぞら', oldest);

console.log('■ 場面二:指環が隠されていた場所');
const hide = lines.filter((l) => l.includes('しのばせて置いたのさ'));
check('隠し場所は1か所だけ書かれている', hide.length === 1);
check('「煙草入れの底」', /腰に下げていた煙草入れの底へソッとしのばせて置いたのさ/.test(body));

console.log('■ 場面三:開札口の暗証番号');
const q1 = body.match(/隣の(.)等車の方から、興奮した人達/);
check('一つめ:「〇等車」は本文に1回だけ', count(body, '等車') === 1);
check('一つめ = 1(一等車)', q1 && q1[1] === '一', q1 && q1[0]);

const q2 = body.match(/俺が窓から投げたのも(.)つだったぜ/);
check('二つめ = 5(投げたのも五つ)', q2 && q2[1] === '五', q2 && q2[0]);
check('二つめ:Ａが拾ったのも五つで食いちがいがない', /腐れ蜜柑が五つ/.test(body) && /あの五つは皆無傷/.test(body));

const lastB = lines.filter((l) => l.startsWith('Ｂ')).pop();
check('三つめ:Ｂの最後のセリフは「嘘だと思われちゃ…」', lastB.startsWith('Ｂ　嘘だと思われちゃ癪だから'));
check('三つめ:最後のセリフの笑い声は1か所だけ', (lastB.match(/ハ+/g) || []).length === 1, (lastB.match(/ハ+/g) || []).join(','));
const ha = (lastB.match(/ハ+/) || [''])[0].length;
check('三つめ = 6(ハハハハハハ)', ha === 6, 'ハ×' + ha);

const q4 = body.match(/(.)の中から耳の穴まで/);
check('四つめ:□は「口」', q4 && q4[1] === '口', q4 && q4[0]);
check('四つめ:「開札口」の三文字目も「口」', '開札口'[2] === '口' && body.includes('開札口'));
// 「口」の画数は 3(丨・𠃌・一)

const code = [1, 5, 6, 3].join('');
const game = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');
check('game.js の暗証番号と一致(' + code + ')', game.includes("answer: '" + code + "'"));

console.log(ok ? '\nすべての答えが本文から導けます。' : '\n確認できない答えがあります。');
process.exit(ok ? 0 : 1);

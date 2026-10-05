// 青空文庫のテキスト(yubiwa.txt)を、ゲームで表示できる形に整えます。
// ブラウザでは window.YubiwaText として、Node.js では require() で使えます(確認用)。
(function (root) {
  'use strict';

  // ルビ・ルビの始まりの印・入力者注を取り除きます。
  function stripNotation(s) {
    return s
      .replace(/《[^《》]*》/g, '')   // 御見《おみ》 → 御見
      .replace(/［＃[^［］]*］/g, '')  // ［＃ここから…］ → (消す)
      .replace(/[｜|]/g, '');         // 席｜迄 → 席迄
  }

  // テキストを { title, author, lines, credits } に分けます。
  function parse(raw) {
    var text = String(raw).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    var all = text.split('\n');
    var title = (all[0] || '').trim();
    var author = (all[1] || '').trim();

    // 「記号について」の説明(-----で囲まれた部分)の後ろから、「底本：」の前までが本文です。
    var rules = [];
    all.forEach(function (line, i) { if (/^-{10,}\s*$/.test(line)) rules.push(i); });
    var start = rules.length >= 2 ? rules[1] + 1 : 2;
    var end = all.length;
    for (var i = start; i < all.length; i++) {
      if (/^底本[：:]/.test(all[i])) { end = i; break; }
    }

    var lines = all.slice(start, end)
      .map(stripNotation)
      .map(function (l) { return l.replace(/\s+$/, ''); })
      .filter(function (l) { return l.trim() !== ''; })
      .map(function (l) {
        var m = l.match(/^([Ａ-Ｚ])[　 ]+(.*)$/);
        return m ? { speaker: m[1], text: m[2] } : { speaker: '', text: l };
      });

    var credits = all.slice(end)
      .map(function (l) { return l.replace(/\s+$/, ''); })
      .filter(function (l) { return l.trim() !== ''; });

    return { title: title, author: author, lines: lines, credits: credits };
  }

  var api = { parse: parse, stripNotation: stripNotation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.YubiwaText = api;
})(this);

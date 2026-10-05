// 図書館からの最後の通信:ゲームの進行
(function () {
  'use strict';

  var TEXT_URL = '../yubiwa.txt'; // リポジトリのいちばん上にある青空文庫のテキスト

  // ---------- 答えのそろえ方 ----------
  // 全角・半角、カタカナ・ひらがな、空白や記号のちがいを気にせずに比べます。
  function normalize(s) {
    return String(s || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
      .replace(/[\s「」『』()()、。,.・!?!?〜~-]/g, '');
  }

  // ---------- 謎 ----------
  var PUZZLES = {
    // 場面1:投稿の最初の文字を、時刻の古い順に読む → あおぞら
    library: {
      check: function (raw) {
        var s = normalize(raw).replace(/図書館|としょかん$/, '');
        return s === 'あおぞら' || s === '青空' || s === 'aozora';
      },
      special: function (raw) {
        var s = normalize(raw).replace(/図書館|としょかん$/, '');
        if (s === 'らぞおあ') return '上から順に読みましたね。でも、タイムラインは「新しい投稿」がいちばん上です。衛星は「届いた順」と言っていました。';
        if (s.indexOf('わたし') === 0 || s.charAt(0) === '私') return '固定された投稿は、衛星からの「読み方の説明」です。声そのものではありません。';
        return null;
      },
      hints: [
        '固定された投稿に、読み方が書いてあります。',
        '投稿の本文の、最初のひと文字だけを集めてみましょう。「#受信ログ」の投稿は四つあります。',
        '「届いた順」とは、時刻の古い順のこと。いちばん下の投稿(02:14)から上へ読んでみて。'
      ]
    },

    // 場面2:指環が隠されていた場所 → 煙草入れ(の底)
    hiding: {
      check: function (raw) {
        var s = normalize(raw).replace(/煙草|莨/g, 'たばこ').replace(/入れ/g, 'いれ').replace(/入/g, 'いれ');
        return s.indexOf('たばこいれ') !== -1;
      },
      special: function (raw) {
        var s = normalize(raw);
        if (/蜜柑|みかん/.test(s)) return '蜜柑は、みんなの目をそちらへ向けるための囮でした。Ｂの最後の打ち明け話を、よく読んでみて。';
        if (/口|くち|耳|みみ/.test(s)) return '車掌は「口の中から耳の穴まで」検べましたが、見つかりませんでした。Ｂの身体の外に、隠し場所があるようです。';
        if (/窓|線路|すーつけーす|スーツケース/.test(s)) return 'そこからは、指環は出てきませんでした。Ｂがひそかにしのばせたのは、もっと身近なところです。';
        return null;
      },
      hints: [
        'Ｂがどれだけ検べられても、指環は出てきませんでした。Ｂ自身は、持っていなかったのです。',
        '物語のおわり近く、Ｂが「じゃ話すがね」と打ち明ける場面を読んでみて。',
        '「おめえが腰に下げていた〇〇〇〇の底へソッとしのばせて置いたのさ」'
      ]
    },

    // 場面3:開札口の暗証番号 → 1・5・6・3
    code: {
      answer: '1563',
      digitHints: [
        '一つめ:Ａのセリフに「そうこうしている内に、隣の〇等車の方から、興奮した人達がドヤドヤと」とあります。',
        '二つめ:Ｂが「俺が窓から投げたのも〇つだったぜ」と言っています。',
        '三つめ:Ｂの最後のセリフは「嘘だと思われちゃ癪だから」で始まります。そのおわり近くの笑い声を数えてみて。',
        '四つめ:□は顔の一部です。「開札口」の三文字目と同じ字。その字は、何画で書けるでしょう?'
      ]
    }
  };

  // ---------- 状態 ----------
  var state = { scene: 0, misses: { library: 0, hiding: 0, code: 0 }, bookLoaded: false };

  var $ = function (id) { return document.getElementById(id); };

  function showScene(n) {
    state.scene = n;
    var scenes = document.querySelectorAll('.scene');
    for (var i = 0; i < scenes.length; i++) scenes[i].hidden = +scenes[i].getAttribute('data-scene') !== n;

    var steps = document.querySelectorAll('#progress li');
    for (var j = 0; j < steps.length; j++) {
      var k = +steps[j].getAttribute('data-step');
      steps[j].className = k < n ? 'is-done' : (k === n ? 'is-current' : '');
      if (k === n) steps[j].setAttribute('aria-current', 'step'); else steps[j].removeAttribute('aria-current');
    }

    // 本は、書棚の場面からは見えるまま開札口にも持っていけるようにする
    var book = $('book');
    var current = document.querySelector('.scene[data-scene="' + n + '"]');
    if (n === 1 || n === 2) {
      var anchor = n === 1 ? current.querySelector('.shelf').nextElementSibling : current.querySelector('.notice').nextElementSibling;
      anchor.parentNode.insertBefore(book, anchor.nextSibling);
    }
    if (n !== 1) closeBook();

    window.scrollTo(0, 0);
    var h = current.querySelector('.scene__title');
    h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }

  function setInventory(icon, name, note) {
    $('inv-item').querySelector('.inventory__icon').textContent = icon;
    $('inv-name').textContent = name;
    $('inv-note').textContent = note;
    $('inv-item').classList.remove('is-new');
    void $('inv-item').offsetWidth;
    $('inv-item').classList.add('is-new');
  }

  // ---------- 本 ----------
  function loadBook() {
    if (state.bookLoaded) return;
    var body = $('book-body');
    fetch(TEXT_URL)
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      })
      .then(function (raw) {
        var work = window.YubiwaText.parse(raw);
        $('book-title').textContent = work.title;
        body.textContent = '';
        work.lines.forEach(function (line) {
          var p = document.createElement('p');
          if (line.speaker) {
            var sp = document.createElement('span');
            sp.className = 'speaker speaker--' + line.speaker;
            sp.textContent = line.speaker;
            p.appendChild(sp);
          }
          p.appendChild(document.createTextNode(line.text));
          body.appendChild(p);
        });
        state.bookLoaded = true;
      })
      .catch(function () {
        body.innerHTML = '<p class="error">本文(yubiwa.txt)を読みこめませんでした。ファイルを直接ひらいている場合は、かんたんなサーバーを使って表示してください(README の「自分のパソコンで表示を確かめる」を参照)。</p>';
      });
  }

  function openBook() {
    var book = $('book');
    book.hidden = false;
    $('open-book').setAttribute('aria-expanded', 'true');
    loadBook();
  }
  function closeBook() {
    $('book').hidden = true;
    $('open-book').setAttribute('aria-expanded', 'false');
  }

  // ---------- 答え合わせ ----------
  function giveHint(form, message) {
    var hint = form.querySelector('.hint');
    hint.textContent = message;
    hint.classList.remove('is-shake');
    void hint.offsetWidth;
    hint.classList.add('is-shake');
  }

  function nextHint(key) {
    var list = PUZZLES[key].hints;
    var n = state.misses[key]++;
    return 'ちがうようです。ヒント' + (Math.min(n, list.length - 1) + 1) + ':' + list[Math.min(n, list.length - 1)];
  }

  function onSubmit(e) {
    e.preventDefault();
    var form = e.target;
    var key = form.getAttribute('data-puzzle');
    var input = form.querySelector('input');
    var raw = input.value;

    if (!normalize(raw)) { giveHint(form, '答えを入力してください。'); input.focus(); return; }

    if (key === 'code') return checkCode(form, input, raw);

    var p = PUZZLES[key];
    if (p.check(raw)) {
      form.querySelector('.hint').textContent = '';
      if (key === 'library') showScene(1);
      if (key === 'hiding') {
        setInventory('👝', '煙草入れ', '腰に下げていた革の小袋は、古い煙草入れだった。中は空っぽの……はず。');
        showScene(2);
      }
      return;
    }
    giveHint(form, p.special(raw) || nextHint(key));
    input.select();
  }

  function checkCode(form, input, raw) {
    var digits = String(raw).normalize('NFKC').replace(/\D/g, '');
    var answer = PUZZLES.code.answer;
    if (digits.length !== answer.length) {
      giveHint(form, '錠は四けたです。貼り紙の四つの問いの答えを、上から順に並べてください。');
      input.select();
      return;
    }
    if (digits === answer) {
      form.querySelector('.hint').textContent = '';
      showScene(3);
      return;
    }
    var wrong = [];
    for (var i = 0; i < answer.length; i++) if (digits[i] !== answer[i]) wrong.push(i);
    state.misses.code++;
    var names = ['一', '二', '三', '四'];
    var msg = '錠は動かない。' + wrong.map(function (i) { return names[i] + 'つめ'; }).join('・') + 'の数が、ちがうようです。';
    if (state.misses.code >= 2) msg += 'ヒント:' + PUZZLES.code.digitHints[wrong[0]];
    giveHint(form, msg);
    input.select();
  }

  // ---------- はじめから ----------
  function restart() {
    state.misses = { library: 0, hiding: 0, code: 0 };
    var forms = document.querySelectorAll('form.answer');
    for (var i = 0; i < forms.length; i++) {
      forms[i].reset();
      forms[i].querySelector('.hint').textContent = '';
    }
    $('ending').hidden = true;
    $('open-pouch').hidden = false;
    $('reopen-book').textContent = '『指環』をもう一度ひらく';
    setInventory('👝', '革の小袋', '腰に下げている。いつから持っていたのか、思い出せない。');
    showScene(0);
  }

  // ---------- はじまり ----------
  var forms = document.querySelectorAll('form.answer');
  for (var i = 0; i < forms.length; i++) forms[i].addEventListener('submit', onSubmit);

  $('open-book').addEventListener('click', function () {
    if ($('book').hidden) openBook(); else closeBook();
  });
  $('reopen-book').addEventListener('click', function () {
    var book = $('book');
    if (book.hidden) {
      book.hidden = false;
      loadBook();
      this.textContent = '『指環』をとじる';
      book.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      book.hidden = true;
      this.textContent = '『指環』をもう一度ひらく';
    }
  });
  $('open-pouch').addEventListener('click', function () {
    this.hidden = true;
    setInventory('💍', 'ダイヤの指環', '煙草入れの底から出てきた。');
    $('ending').hidden = false;
    var steps = document.querySelectorAll('#progress li');
    steps[steps.length - 1].className = 'is-done';
    $('ending').querySelector('.ending__title').setAttribute('tabindex', '-1');
    $('ending').querySelector('.ending__title').focus();
  });
  $('restart').addEventListener('click', restart);

  showScene(0);
  window.scrollTo(0, 0);
})();

/* =========================================================
   まあいいか文庫 プログラム
   ふだんの作品追加では、このファイルを触る必要はありません。
   ========================================================= */
(function () {
  'use strict';

  /* ---------- サイトの設定 ---------- */
  var CONFIG = {
    siteName: 'まあいいか文庫',
    siteAuthor: '鬼巛',                 // 作品ファイルで「作者名」を省略したときに表示する名前
    worksDir: 'works/',                 // 作品を置くフォルダ
    worksIndex: 'works/index.json',     // 作品一覧(公開時に自動で作られます)
    tagsFile: 'settings/tags.txt',      // タグの設定ファイル
    recentCount: 3                      // 「最近の更新」に出す作品の数
  };

  // 作品ファイルの先頭に書ける項目
  var LABELS = {
    '作品名': 'title',
    'サブタイトル': 'subtitle',
    '作者名': 'author',
    'タグ': 'tags',
    '内容': 'summary',
    '公開日': 'date'
  };

  var FONT_SIZES = [14, 16, 18, 20, 22, 24, 27];
  var DEFAULT_FONT_SIZE = 18;
  var PC_QUERY = window.matchMedia('(min-width: 1024px)');
  var REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

  var state = {
    works: [],          // 新しい順
    byId: {},
    tags: [],           // [{ name, desc }]
    tagMap: {},
    currentId: null,
    filterTag: null,
    warnings: []
  };

  var $ = function (id) { return document.getElementById(id); };

  /* =========================================================
     小さな道具
     ========================================================= */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 全角の数字・英字・記号を半角に
  function toHalfWidth(s) {
    return s.replace(/[！-～]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
  }

  function normalizeText(text) {
    return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  function formatDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[0] + '.' + p[1] + '.' + p[2];
  }

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 保存できない環境では何もしない */ }
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  /* =========================================================
     作者向けの警告
     ========================================================= */
  function warn(where, message) {
    var text = '[' + where + '] ' + message;
    state.warnings.push({ where: where, message: message });
    if (window.console && console.warn) console.warn('まあいいか文庫:' + text);
  }

  function showWarnings() {
    if (!state.warnings.length) return;
    var list = $('author-warnings-list');
    list.innerHTML = state.warnings.map(function (w) {
      return '<li><code>' + escapeHtml(w.where) + '</code> ' + escapeHtml(w.message) + '</li>';
    }).join('');
    $('author-warnings').hidden = false;
  }

  /* =========================================================
     タグの設定ファイルを読む
     1行に「タグ名:説明文」。# で始まる行はメモ。
     ========================================================= */
  function parseTags(text) {
    var tags = [];
    var seen = {};
    normalizeText(text).split('\n').forEach(function (line, i) {
      var raw = line.trim();
      if (!raw || raw.charAt(0) === '#' || raw.charAt(0) === '#') return;
      var m = raw.match(/^([^::]+?)\s*[::]\s*(.*)$/);
      if (!m) {
        warn(CONFIG.tagsFile + ' の ' + (i + 1) + '行目', '「タグ名:説明文」の形になっていません(コロン「:」が見つかりません)。');
        return;
      }
      var name = m[1].trim();
      if (seen[name]) {
        warn(CONFIG.tagsFile + ' の ' + (i + 1) + '行目', 'タグ「' + name + '」が2回書かれています。');
        return;
      }
      seen[name] = true;
      tags.push({ name: name, desc: m[2].trim() });
    });
    return tags;
  }

  /* =========================================================
     作品ファイルを読む
     ========================================================= */
  var SEPARATOR = /^[ \t　]*[-ー―—－‐−]{3,}[ \t　]*$/;
  // 先頭に「## 」や「**」が付いてしまった行(メモ帳や編集画面で付くことがある)も項目として読む
  var LABEL_LINE = /^[ \t　]*(?:[#＃]+[ \t　]*)?(?:\*\*)?([^::*#＃]{1,12}?)(?:\*\*)?[ \t　]*[::][ \t　]*(.*?)(?:\*\*)?[ \t　]*$/;

  function parseWork(text, file) {
    var where = CONFIG.worksDir + file;
    var lines = normalizeText(text).split('\n');
    var meta = {};

    // 最初の水平線(---)より上が項目、下が本文
    var sep = -1;
    for (var i = 0; i < lines.length; i++) {
      if (SEPARATOR.test(lines[i])) { sep = i; break; }
    }
    var headerEnd = sep;
    if (sep === -1) {
      warn(where, '項目と本文を分ける水平線「---」の行が見つかりません。項目の下に「---」だけの行を1行入れてください。');
      // できるだけ表示はする:先頭の「項目名:」の行だけを項目として読む
      headerEnd = 0;
      while (headerEnd < lines.length) {
        if (lines[headerEnd].trim() && !LABEL_LINE.test(lines[headerEnd])) break;
        headerEnd++;
      }
    }

    for (var j = 0; j < headerEnd; j++) {
      var line = lines[j];
      if (!line.trim()) continue;
      var m = line.match(LABEL_LINE);
      if (!m) {
        warn(where, (j + 1) + '行目「' + line.trim().slice(0, 20) + '」は「項目名:内容」の形になっていません(水平線「---」より上には項目だけを書きます)。');
        continue;
      }
      var label = m[1].replace(/[ \t\u3000]/g, '');
      if (!LABELS[label]) {
        warn(where, (j + 1) + '行目の「' + label + '」は知らない項目名です。使える項目名は「' + Object.keys(LABELS).join('」「') + '」です。');
        continue;
      }
      var key = LABELS[label];
      if (meta[key] !== undefined) {
        warn(where, '「' + label + '」が2回書かれています。後のほう(' + (j + 1) + '行目)を使います。');
      }
      meta[key] = m[2].trim();
    }
    var bodyStart = sep === -1 ? headerEnd : sep + 1;

    var work = {
      id: file.replace(/\.(md|markdown|txt)$/i, ''),
      file: file,
      title: meta.title || '',
      subtitle: meta.subtitle || '',
      author: meta.author || CONFIG.siteAuthor,
      summary: meta.summary || '',
      tags: [],
      date: '',
      body: lines.slice(bodyStart).join('\n')
    };

    if (!work.title) {
      warn(where, '必須の項目「作品名」がありません。仮にファイル名を作品名として表示しています。');
      work.title = work.id;
    }

    if (meta.tags) {
      work.tags = meta.tags.split(/[、,,]+/).map(function (t) { return t.trim(); }).filter(Boolean);
      work.tags = work.tags.filter(function (t, idx) { return work.tags.indexOf(t) === idx; });
      if (work.tags.length > 2) {
        warn(where, '「タグ」は1〜2個までです(今は' + work.tags.length + '個:' + work.tags.join('、') + ')。');
      }
      work.tags.forEach(function (t) {
        if (!state.tagMap[t]) {
          warn(where, 'タグ「' + t + '」は ' + CONFIG.tagsFile + ' にありません。字がちがうか、設定ファイルへの追加が必要です。');
        }
      });
    } else {
      warn(where, '「タグ」がありません。1〜2個つけてください。');
    }

    if (meta.date) {
      var d = toHalfWidth(meta.date).replace(/[年月\/.]/g, '-').replace(/日/g, '').replace(/\s/g, '');
      var dm = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      var ok = false;
      if (dm) {
        var y = +dm[1], mo = +dm[2], da = +dm[3];
        var check = new Date(y, mo - 1, da);
        ok = check.getFullYear() === y && check.getMonth() === mo - 1 && check.getDate() === da;
        if (ok) work.date = y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + da).slice(-2);
      }
      if (!ok) warn(where, '「公開日」の「' + meta.date + '」が日付として読めません。「2026-10-01」のように書いてください。');
    } else {
      warn(where, '「公開日」がありません。並び順がいちばん後ろになります。');
    }

    if (!work.body.trim()) warn(where, '本文が空です。');
    return work;
  }

  /* ---------- 本文を HTML にする ---------- */
  function inlineFormat(escaped) {
    // ルビ:|漢字《かんじ》 または 漢字《かんじ》
    escaped = escaped.replace(/[||]([^||《》\n]+?)《([^《》\n]+?)》/g, '<ruby>$1<rp>(</rp><rt>$2</rt><rp>)</rp></ruby>');
    escaped = escaped.replace(/([㐀-鿿豈-﫿々〆ヶ]+)《([^《》\n]+?)》/g, '<ruby>$1<rp>(</rp><rt>$2</rt><rp>)</rp></ruby>');
    // 縦書きのとき、2桁の半角数字・「!?」などを横に並べる
    escaped = escaped.replace(/(^|[^0-9A-Za-z])([0-9]{2}|[!?]{2})(?![0-9A-Za-z])/g, '$1<span class="tcy">$2</span>');
    return escaped;
  }

  function renderBody(body) {
    // 編集画面などで紛れこむ空白の記号(&#x20; や &nbsp;)は、ふつうの空白として扱う
    body = body.replace(/&#x20;|&#32;|&nbsp;/gi, ' ');
    // 空行(スペースだけの行も含む)を段落の区切りにする
    var paragraphs = body.replace(/^\s*\n/, '').split(/\n(?:[ \t　]*\n)+/);
    return paragraphs.map(function (p) {
      p = p.replace(/^\n+|\n+$/g, '');
      if (!p.trim()) return '';
      var html = p.split('\n').map(function (l) { return inlineFormat(escapeHtml(l)); }).join('<br>');
      return '<p>' + html + '</p>';
    }).join('\n');
  }

  /* =========================================================
     作品一覧を集める
     ========================================================= */
  function isWorkFile(name) {
    return /\.(md|markdown|txt)$/i.test(name) && name.charAt(0) !== '_' && !/^readme\./i.test(name);
  }

  function fetchText(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return r.text();
    });
  }

  // 1. 公開時に自動で作られる works/index.json を読む
  // 2. ない場合は、GitHub の API でフォルダの中身を調べる
  function loadFileList() {
    return fetch(CONFIG.worksIndex, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('no index');
        return r.json();
      })
      .then(function (json) {
        var files = Array.isArray(json) ? json : json.files;
        return (files || []).filter(isWorkFile);
      })
      .catch(function () { return loadFileListFromGitHub(); });
  }

  function loadFileListFromGitHub() {
    var host = location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!host) return Promise.reject(new Error('作品一覧(' + CONFIG.worksIndex + ')が見つかりません。'));
    var owner = host[1];
    var first = location.pathname.split('/').filter(Boolean)[0];
    var repo = first && first.indexOf('.') === -1 ? first : owner + '.github.io';
    var api = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + CONFIG.worksDir.replace(/\/$/, '');
    return fetch(api).then(function (r) {
      if (!r.ok) throw new Error('作品一覧を取得できませんでした(GitHub API ' + r.status + ')。');
      return r.json();
    }).then(function (items) {
      return items.filter(function (it) { return it.type === 'file'; })
        .map(function (it) { return it.name; })
        .filter(isWorkFile);
    });
  }

  function loadWorks(files) {
    return Promise.all(files.map(function (file) {
      return fetchText(CONFIG.worksDir + encodeURIComponent(file))
        .then(function (text) { return parseWork(text, file); })
        .catch(function () {
          warn(CONFIG.worksDir + file, 'ファイルを読みこめませんでした。');
          return null;
        });
    })).then(function (list) {
      return list.filter(Boolean).sort(function (a, b) {
        if (a.date !== b.date) {
          if (!a.date) return 1;
          if (!b.date) return -1;
          return a.date < b.date ? 1 : -1;
        }
        return a.title.localeCompare(b.title, 'ja');
      });
    });
  }

  /* =========================================================
     URL(作品ごとの固有URL: ?work=ファイル名  タグ: ?tag=タグ名)
     ========================================================= */
  function readUrl() {
    var p = new URLSearchParams(location.search);
    return { work: p.get('work'), tag: p.get('tag') };
  }

  function buildUrl(workId, tag) {
    var p = new URLSearchParams();
    if (workId) p.set('work', workId);
    if (tag) p.set('tag', tag);
    var q = p.toString();
    return location.pathname + (q ? '?' + q : '') ;
  }

  function workHref(id) { return '?work=' + encodeURIComponent(id); }

  function updateHistory(push) {
    var url = buildUrl(state.currentId, state.filterTag);
    if (url === location.pathname + location.search) return;
    try {
      history[push ? 'pushState' : 'replaceState']({ work: state.currentId, tag: state.filterTag }, '', url);
    } catch (e) { /* file:// などで使えない場合は何もしない */ }
  }

  /* =========================================================
     画面を描く
     ========================================================= */
  function tagChips(tags) {
    if (!tags.length) return '';
    return '<span class="tag-chips">' + tags.map(function (t) {
      return '<button type="button" class="tag-chip" data-tag="' + escapeHtml(t) + '" aria-label="タグ「' + escapeHtml(t) + '」の作品を書庫に表示">' + escapeHtml(t) + '</button>';
    }).join('') + '</span>';
  }

  function renderStory(options) {
    options = options || {};
    var el = $('story');
    var work = state.byId[state.currentId];

    if (!work) {
      el.innerHTML = '<p class="story-message">まだ作品がありません。</p>';
      return;
    }

    var idx = state.works.indexOf(work);
    var older = state.works[idx + 1];   // 前の作品(ひとつ前に公開)
    var newer = state.works[idx - 1];   // 次の作品(ひとつ後に公開)

    var notice = options.notFound
      ? '<p class="story-message">お探しの作品「' + escapeHtml(options.notFound) + '」は見つかりませんでした。かわりに最新の作品を表示しています。</p>'
      : '';

    var meta = [];
    if (work.author) meta.push('<span>' + escapeHtml(work.author) + '</span>');
    if (work.date) meta.push('<time datetime="' + work.date + '">' + formatDate(work.date) + '</time>');
    if (work.tags.length) meta.push(tagChips(work.tags));

    el.innerHTML =
      notice +
      '<article>' +
        '<header class="story-head">' +
          '<h2 class="story-title" id="story-title" tabindex="-1">' + escapeHtml(work.title) + '</h2>' +
          (work.subtitle ? '<p class="story-subtitle">' + escapeHtml(work.subtitle) + '</p>' : '') +
          '<p class="story-meta">' + meta.join('') + '</p>' +
        '</header>' +
        '<div class="story-body">' + renderBody(work.body) + '</div>' +
        '<nav class="story-nav" aria-label="前後の作品">' +
          (older
            ? '<a class="prev" href="' + workHref(older.id) + '" data-work="' + escapeHtml(older.id) + '"><small>← 前の作品</small>' + escapeHtml(older.title) + '</a>'
            : '<span class="prev"><small>← 前の作品</small>これがいちばん古い作品です</span>') +
          (newer
            ? '<a class="next" href="' + workHref(newer.id) + '" data-work="' + escapeHtml(newer.id) + '"><small>次の作品 →</small>' + escapeHtml(newer.title) + '</a>'
            : '<span class="next"><small>次の作品 →</small>これが最新の作品です</span>') +
        '</nav>' +
      '</article>';

    document.title = work.title + '|' + CONFIG.siteName;
    resetStoryScroll();
  }

  function resetStoryScroll() {
    var sc = $('story-scroll');
    // 縦書き(右から左)のときも、scrollLeft = 0 が書き出し(右端)になります
    sc.scrollTop = 0;
    sc.scrollLeft = 0;
  }

  function renderLibrary() {
    var list = $('library-list');
    var tag = state.filterTag;
    var works = tag ? state.works.filter(function (w) { return w.tags.indexOf(tag) !== -1; }) : state.works;

    var filterBox = $('library-filter');
    if (tag) {
      $('library-filter-name').textContent = 'タグ「' + tag + '」の作品(' + works.length + '編)';
      var def = state.tagMap[tag];
      $('library-filter-desc').textContent = def ? def.desc : '';
      $('library-filter-desc').hidden = !(def && def.desc);
      filterBox.hidden = false;
    } else {
      filterBox.hidden = true;
    }

    if (!works.length) {
      list.innerHTML = '<li class="library-empty">' + (tag ? 'このタグの作品は、まだありません。' : 'まだ作品がありません。') + '</li>';
      return;
    }

    list.innerHTML = works.map(function (w) {
      var current = w.id === state.currentId ? ' aria-current="page"' : '';
      return '<li class="library-item">' +
        '<a class="library-item__link" href="' + workHref(w.id) + '" data-work="' + escapeHtml(w.id) + '"' + current + '>' +
          '<span class="library-item__title">' + escapeHtml(w.title) + '</span>' +
          (w.subtitle ? '<span class="library-item__subtitle">' + escapeHtml(w.subtitle) + '</span>' : '') +
          (w.summary ? '<span class="library-item__summary">' + escapeHtml(w.summary) + '</span>' : '') +
        '</a>' +
        '<div class="library-item__foot">' +
          (w.date ? '<time datetime="' + w.date + '">' + formatDate(w.date) + '</time>' : '') +
          tagChips(w.tags) +
        '</div>' +
      '</li>';
    }).join('');
  }

  function updateCurrentMarks() {
    var links = document.querySelectorAll('.library-item__link');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-work') === state.currentId) links[i].setAttribute('aria-current', 'page');
      else links[i].removeAttribute('aria-current');
    }
  }

  function updateClouds() {
    var clouds = document.querySelectorAll('.cloud');
    for (var i = 0; i < clouds.length; i++) {
      clouds[i].setAttribute('aria-pressed', clouds[i].getAttribute('data-tag') === state.filterTag ? 'true' : 'false');
    }
  }

  /* ---------- 雲のタグ(ページを開くたびに一度だけランダムに作る) ---------- */
  function radiusPart() { return Math.round(rand(38, 62)) + '%'; }

  function renderClouds() {
    var box = $('clouds');
    var tags = shuffle(state.tags);
    var colors = ['var(--cloud-1)', 'var(--cloud-2)', 'var(--cloud-3)', 'var(--cloud-4)'];
    box.innerHTML = '';

    tags.forEach(function (tag, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cloud';
      b.setAttribute('data-tag', tag.name);
      b.setAttribute('aria-pressed', 'false');
      b.title = tag.desc;
      b.setAttribute('aria-label', tag.name + ':' + tag.desc);

      var scale = rand(0.9, 1.12);             // 大きさ
      var padX = rand(18, 28) * scale;
      var padTop = rand(12, 18) * scale;
      var padBottom = rand(9, 13) * scale;
      var bumpA = rand(24, 36) * scale;
      var bumpB = rand(30, 46) * scale;
      var offset = rand(0, 14);                 // 上下の位置ずれ

      var s = b.style;
      s.setProperty('--cloud-bg', colors[Math.floor(Math.random() * colors.length)]);
      s.setProperty('--shape', [radiusPart(), radiusPart(), radiusPart(), radiusPart()].join(' ') + ' / ' +
        [radiusPart(), radiusPart(), radiusPart(), radiusPart()].join(' '));
      s.setProperty('--rot', rand(-3.5, 3.5).toFixed(1) + 'deg');   // 傾き(文字が読める程度に小さく)
      s.setProperty('--bump-a', bumpA.toFixed(0) + 'px');
      s.setProperty('--bump-a-x', rand(8, 26).toFixed(0) + '%');
      s.setProperty('--bump-b', bumpB.toFixed(0) + 'px');
      s.setProperty('--bump-b-x', rand(40, 58).toFixed(0) + '%');
      s.setProperty('--dur', rand(5, 9).toFixed(1) + 's');
      s.setProperty('--delay', (-rand(0, 8)).toFixed(1) + 's');
      s.setProperty('--lift', (-rand(4, 7)).toFixed(1) + 'px');
      s.fontSize = (scale * 1.02).toFixed(2) + 'rem';
      s.padding = padTop.toFixed(0) + 'px ' + padX.toFixed(0) + 'px ' + padBottom.toFixed(0) + 'px';
      // もこもこが上にはみ出す分と揺れる分を、余白で確保して重ならないようにする
      var headroom = Math.max(bumpA, bumpB) * 0.45 + 6;
      s.margin = (headroom + offset).toFixed(0) + 'px ' + rand(6, 18).toFixed(0) + 'px ' + (14 - offset + 8).toFixed(0) + 'px';

      var label = document.createElement('span');
      label.className = 'cloud__label';
      label.textContent = tag.name;
      b.appendChild(label);
      box.appendChild(b);
    });
  }

  /* ---------- 左列 ---------- */
  function renderRecommend() {
    var items = document.querySelectorAll('[data-recommend]');
    for (var i = 0; i < items.length; i++) {
      var id = items[i].getAttribute('data-recommend');
      var w = state.byId[id];
      if (!w) {
        warn('index.html のおすすめ作品', '「' + id + '」という作品ファイルが見つかりません(ファイル名から .md / .txt を除いた部分を書きます)。');
        items[i].hidden = true;
        continue;
      }
      items[i].innerHTML = '<a href="' + workHref(w.id) + '" data-work="' + escapeHtml(w.id) + '">' +
        '<span class="rec-title">' + escapeHtml(w.title) + '</span>' +
        (w.summary ? '<span class="rec-summary">' + escapeHtml(w.summary) + '</span>' : '') +
      '</a>';
    }
  }

  function renderRecent() {
    var list = $('recent-list');
    list.innerHTML = state.works.slice(0, CONFIG.recentCount).map(function (w) {
      return '<li>' + (w.date ? '<time datetime="' + w.date + '">' + formatDate(w.date) + '</time>' : '') +
        '<span><a href="' + workHref(w.id) + '" data-work="' + escapeHtml(w.id) + '">「' + escapeHtml(w.title) + '」</a>を公開しました。</span></li>';
    }).join('');
  }

  /* =========================================================
     操作
     ========================================================= */
  function showWork(id, opts) {
    opts = opts || {};
    if (!state.byId[id]) return;
    state.currentId = id;
    renderStory();
    updateCurrentMarks();
    if (opts.push !== false) updateHistory(true);
    if (opts.focus) {
      var title = $('story-title');
      // スマホでは本文の位置まで移動する
      if (!PC_QUERY.matches) {
        $('story-card').scrollIntoView({ behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth', block: 'start' });
      }
      if (title) title.focus({ preventScroll: true });
    }
  }

  function setFilter(tag, opts) {
    opts = opts || {};
    state.filterTag = tag || null;
    renderLibrary();
    updateClouds();
    if (opts.push !== false) updateHistory(true);
    if (opts.reveal) {
      var lib = $('library');
      if (!PC_QUERY.matches) {
        lib.scrollIntoView({ behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth', block: 'start' });
      }
      lib.classList.remove('is-flash');
      void lib.offsetWidth;
      lib.classList.add('is-flash');
    }
  }

  function bindEvents() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[data-work]');
      if (link) {
        // 修飾キー付きのクリック(新しいタブで開くなど)はブラウザにまかせる
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        showWork(link.getAttribute('data-work'), { focus: true });
        return;
      }
      var cloud = e.target.closest('.cloud');
      if (cloud) {
        var t = cloud.getAttribute('data-tag');
        setFilter(state.filterTag === t ? null : t, { reveal: state.filterTag !== t });
        return;
      }
      var chip = e.target.closest('.tag-chip');
      if (chip) {
        setFilter(chip.getAttribute('data-tag'), { reveal: true });
        return;
      }
      if (e.target.closest('[data-home]')) {
        e.preventDefault();
        state.filterTag = null;
        renderLibrary();
        updateClouds();
        if (state.works[0]) showWork(state.works[0].id, { push: false });
        try { history.pushState({}, '', location.pathname); } catch (err) {}
        window.scrollTo(0, 0);
      }
    });

    $('library-clear').addEventListener('click', function () { setFilter(null); });

    window.addEventListener('popstate', function () {
      var u = readUrl();
      state.filterTag = u.tag && state.tagMap[u.tag] ? u.tag : (u.tag || null);
      renderLibrary();
      updateClouds();
      var id = u.work && state.byId[u.work] ? u.work : (state.works[0] && state.works[0].id);
      if (id && id !== state.currentId) { state.currentId = id; renderStory(); }
      updateCurrentMarks();
    });

    $('author-warnings-close').addEventListener('click', function () { $('author-warnings').hidden = true; });
  }

  /* ---------- 読みやすさの設定 ---------- */
  function setupReader() {
    var root = document.documentElement;

    // ダークモード
    var themeBtn = $('theme-toggle');
    function syncTheme() {
      var dark = root.getAttribute('data-theme') === 'dark';
      themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      themeBtn.querySelector('.theme-toggle__label').textContent = dark ? 'ライトモード' : 'ダークモード';
      themeBtn.setAttribute('aria-label', dark ? '明るい配色にする' : '暗い配色(ダークモード)にする');
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#121a21' : '#eaf5f8');
    }
    themeBtn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store('mb-theme', next);
      syncTheme();
    });
    syncTheme();

    // 文字の大きさ
    var sizeNow = parseInt(load('mb-font-size'), 10);
    var sizeIndex = FONT_SIZES.indexOf(sizeNow);
    if (sizeIndex === -1) sizeIndex = FONT_SIZES.indexOf(DEFAULT_FONT_SIZE);
    function applySize() {
      var px = FONT_SIZES[sizeIndex];
      root.style.setProperty('--story-font-size', px + 'px');
      store('mb-font-size', String(px));
      $('font-smaller').disabled = sizeIndex === 0;
      $('font-larger').disabled = sizeIndex === FONT_SIZES.length - 1;
    }
    $('font-smaller').addEventListener('click', function () { if (sizeIndex > 0) { sizeIndex--; applySize(); } });
    $('font-larger').addEventListener('click', function () { if (sizeIndex < FONT_SIZES.length - 1) { sizeIndex++; applySize(); } });
    applySize();

    // 縦書き・横書き
    var vBtn = $('vertical-toggle');
    function syncVertical() {
      var v = root.classList.contains('is-vertical');
      vBtn.setAttribute('aria-pressed', v ? 'true' : 'false');
      vBtn.textContent = v ? '横書きにする' : '縦書きにする';
    }
    vBtn.addEventListener('click', function () {
      root.classList.toggle('is-vertical');
      store('mb-vertical', root.classList.contains('is-vertical') ? '1' : '0');
      syncVertical();
      resetStoryScroll();
    });
    syncVertical();

    // 縦書きのとき、マウスホイールの縦の動きで横にスクロールする
    $('story-scroll').addEventListener('wheel', function (e) {
      if (!root.classList.contains('is-vertical')) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey || e.ctrlKey) return;
      var sc = e.currentTarget;
      if (sc.scrollWidth <= sc.clientWidth) return;
      var unit = e.deltaMode === 1 ? 32 : (e.deltaMode === 2 ? sc.clientWidth : 1);
      sc.scrollLeft -= e.deltaY * unit;
      e.preventDefault();
    }, { passive: false });
  }

  /* =========================================================
     はじめに
     ========================================================= */
  function start() {
    setupReader();
    bindEvents();

    var tagsPromise = fetchText(CONFIG.tagsFile)
      .then(parseTags)
      .catch(function () {
        warn(CONFIG.tagsFile, 'タグの設定ファイルを読みこめませんでした。');
        return [];
      });

    tagsPromise.then(function (tags) {
      state.tags = tags;
      tags.forEach(function (t) { state.tagMap[t.name] = t; });
      renderClouds();
      return loadFileList();
    }).then(loadWorks).then(function (works) {
      state.works = works;
      works.forEach(function (w) { state.byId[w.id] = w; });

      var u = readUrl();
      var notFound = null;
      if (u.work && state.byId[u.work]) {
        state.currentId = u.work;
      } else {
        if (u.work) notFound = u.work;
        state.currentId = works[0] ? works[0].id : null;   // 初めて開いたときは最新の作品
      }
      state.filterTag = u.tag || null;

      renderStory({ notFound: notFound });
      renderLibrary();
      updateClouds();
      renderRecommend();
      renderRecent();
      showWarnings();
    }).catch(function (err) {
      $('story').innerHTML = '<p class="story-message">作品を読みこめませんでした。' + escapeHtml(err && err.message ? err.message : '') + '</p>';
      if (window.console) console.error(err);
      showWarnings();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

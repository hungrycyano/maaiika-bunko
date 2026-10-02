// works フォルダの中にある作品ファイルの一覧(works/index.json)を作ります。
// GitHub に公開するとき、自動で実行されます(.github/workflows/pages.yml)。
// 自分のパソコンで試すときは「node tools/build-index.js」を実行します。
'use strict';
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'works');
const files = fs.readdirSync(dir)
  .filter((f) => /\.(md|markdown|txt)$/i.test(f))
  .filter((f) => !f.startsWith('_') && !/^readme\./i.test(f)) // 「_」で始まるファイルは下書きとして公開しない
  .sort();

fs.writeFileSync(
  path.join(dir, 'index.json'),
  JSON.stringify({ files }, null, 2) + '\n'
);
console.log(`作品ファイル ${files.length} 件を works/index.json に書き出しました。`);
files.forEach((f) => console.log('  - ' + f));

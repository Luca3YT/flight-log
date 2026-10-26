# 搭乗記録 設計メモ

コードを触る前に読むメモです。決めた理由と、過去にハマったところを残しています。

## 1. 全体像

- iPhone のホーム画面に追加して使う PWA。国内線の搭乗を1便ずつ記録する
- **ビルドなし**。`index.html`（画面と CSS）、`data.js`（マスターデータ）、`app.js`（動作すべて）、`sw.js`（オフライン用）をそのまま配信する
- JS は ES5 の即時関数（`(function () { "use strict"; ... })()`）。グローバルは `window.SKYDATA`（data.js）と、テスト用の `window.__skylog` だけ
- 記録の本体は端末の localStorage。設定すると Google スプレッドシート（flight_log_gs）にも自動で書き込む（Apps Script 経由）
- 公開は GitHub Pages：`main` の直下 → https://luca3yt.github.io/flight-log/

## 2. app.js の地図

`/* ---------- 名前 ---------- */` の見出しで区切ってあります。

| 区画 | 中身 |
| --- | --- |
| indexes / small helpers | 空港・航空会社・座席表の索引、`esc` `norm`（ひらがな・カタカナ・全角半角をそろえる）、日付、距離（大圏距離） |
| motion | `bezier()`（CSS と同じ曲線を JS で）、`stagger` `countUp` `scramble`（空港の発着案内板のように文字を回す） |
| storage | `load` `save` `seedDb` `mergeSeed` |
| seat configs | 座席表の読み取り、窓側判定、窓の見え方の評価、座席表の HTML |
| boarding pass | 券面の HTML（`ticketHTML`） |
| views | タブの切り替え `go` と描画 `render` |
| stats / route map / achievements / recap card | 統計タブ。路線マップ（SVG）、実績24種、振り返りカード（canvas で 1080×1350 の画像） |
| window log | 窓位置タブ |
| settings / sync | 設定タブ、スプレッドシート同期 |
| design themes | デザインの一覧 `THEMES`、`applyTheme` `pickTheme`、canvas 用に CSS 変数を読む `themeColors` |
| import | 貼り付け・CSV の取り込み |
| flow | 記録の入力画面（下からせり上がる全画面） |
| detail sheet | 記録をタップしたときの詳細 |
| events | クリック・入力のまとめ受け（`data-act` 属性で振り分け） |
| launch animation | 起動アニメーション `playIntro` |

操作は HTML の `data-act="名前"` と、events 区画の `switch (act)` で結びついています。ボタンを足すときはこの2か所を見てください。

## 3. 端末に保存するデータ

localStorage のキー `skylog.v1`（プレビュー版は `skylog.preview.v1`）に、次の形の JSON を1つ保存します。

```js
{
  v: 1,
  flights: [{
    id, date: "2026-10-03", airline: "JL", from: "HND", to: "KMQ",
    type: "B737-800", config: "JL-738-V35" | null, seat: "12K", reg: "JA323J",
    flightNo: "185",            // 航空会社コードを除いた数字だけ
    note, window: "green" | "",  // 窓側の席のときだけ、保存時点の見え方
    createdAt, updatedAt
  }],
  windows: { "JL-738-V35": { "10K": "green", "10A": "black", ... } },  // 座席仕様ごとの窓の見え方
  settings: { gasUrl, token },
  outbox: [{ op: "upsert" | "delete", id, at }],   // まだシートに送っていない変更
  lastSync, lastError,
  ui: { intro: false /* 起動アニメーションを切った */, windowsCfg, theme: "night" | "dawn" | "dusk" | "classic" /* なければ night */ },
  badges: { f50: "2026-10-04", ... },   // 解除した実績と日付（"" は導入前から達成済み）
  seedVersion: 2
}
```

- 窓の見え方は `green`（真横）、`yellow`（ほぼ真横）、`red`（見にくい）、`black`（窓なし）、`unknown`（未判定）
- 形を変えるときは `blank()` に初期値を足すこと。`load()` が足りないキーを補います

## 4. 内蔵データ（SEED）と統合

- `data.js` の `SEED_FLIGHTS` は flight_log_gs の49便。`[日付, 出発, 到着, 機材, 機体記号, 航空会社, 備考]`
- 初めて開いた端末にはこれがそのまま入る
- `SEED_VERSION` を上げると、すでに使っている端末では `mergeSeed()` が**足りない便だけ**を追加する。照合は `日付|出発|到着|機体記号`。すでにある便は、備考が空なら内蔵データの備考で埋めることと、内蔵データでスカイマーク（BC）になっている便の航空会社を JL から直すこと以外は触らない
- 窓位置の初期値 `SEED_WINDOWS` は、前の窓位置ツールで判定した JAL 737-800 V35/V36 の結果

## 5. 座席表・機材の判定・地図

- `CONFIGS`：`{ id, fam, type, label, seats, src, cabins: [{cls, from, to, layout}], rows, exits, noRecline, noWindow, wing }`
  - `layout` は `"ABC|HJK"` のように通路を `|`、空きを `-` で書く。`rows` で列ごとの例外
  - `src: "official"` は各社の公式座席表を元にしたもの、`"approx"` は代表的な配置の目安（画面に「目安」と出る）
  - `fam` が航空会社の `fam` と一致したものが機材画面に出る（JAL グループの子会社は `JAL`）
- 汎用マップ：`GEN:3-3:30` のような ID（並びと列数）。一覧にない機材のとき
- 機体記号 → 機材（`detectAircraft`）：①同じ機体記号の過去の記録 ②`REG_RULES` の正規表現。JAL の機体は精度が高め、ANA や LCC は目安
- 入力の順番は「区間 → 機体記号 → 機材」。機体記号を先に入れて機材を自動で埋めるため。機材画面で手で選んだら `F.manualType` が立ち、その後に機体記号を変えても上書きしない
- `typeKey()`：型式の比較用。`B767-300ER` → `B767300`、`B737-81D`（顧客コード付き）→ `B737800`
- `JAPAN_PATH`：海岸線の SVG パス。x = (経度-138)×cos36°×10、y = -(緯度-36)×10。作り直しは `tools/gen-japan-path.py`

## 6. スプレッドシート同期（gas/Code.gs）

アプリ → Apps Script ウェブアプリ（`/exec`）

- 送信：`POST`、本文は JSON（`Content-Type` は付けない＝text/plain。付けると CORS の事前確認で失敗する）
  ```json
  { "token": "合言葉", "ops": [ { "op": "upsert", "row": { "id": "...", "date": "2026/10/03", "from": "HND", "to": "KMQ", "route": "HND → KMQ", "airline": "日本航空", "type": "B737-800", "reg": "JA323J", "seat": "12K", "window": "真横", "flightNo": "JL185", "note": "" } }, { "op": "delete", "id": "..." } ] }
  ```
- 受信：`GET ?action=ping&token=…`（行数）、`GET ?action=list&token=…`（全行）
- 返事はいつも `{ ok: true, ... }` か `{ ok: false, error: "..." }`
- シート側の決まりごと
  - 見出しの名前で列を探す（`日付` `出発` `到着` `路線` `機材` `機体記号` `備考`）。足りない `航空会社` `座席` `窓` `便名` `ID` は右端に自動で足す
  - 行の特定は ID。ID のない手入力の行は `日付・出発・到着・機体記号` で照合して ID を付ける（重複させない）
  - `#` と `路線` の列は、上の行の数式を新しい行へ引き継ぐ。ARRAYFORMULA の列には書かない
  - 日付は正午（12:00）で書く（タイムゾーンで前日にずれない）。機体記号が空なら「不明」
- アプリ側は `outbox` に溜めて順に送る。オフラインや失敗は残して次の機会に再送。開いたとき・オンラインに戻ったときにも送る
- リポジトリは公開なので、`Code.gs` の `TOKEN` は必ず仮の文字のまま（`npm run check` が見張っている）

## 7. 見た目と動き

- 色：夜の機内の紺 `--night #0C1626` と真鍮 `--brass #C9A86A`、券は真珠色 `--pearl`。書体は見出しが Shippori Mincho B1、本文が Zen Kaku Gothic New
- **デザイン（テーマ）は4種類**：`night`（夜の機内・既定）/ `dawn`（朝の空）/ `dusk`（夕焼け）/ `classic`（クラシック）。設定の「デザイン」で選び、`db.ui.theme` に保存
  - 色はすべて index.html 冒頭の `[data-theme="…"]` のブロックにある CSS 変数。**色を直書きしない**（新しい部品も変数を使う。足りなければ4テーマすべてに変数を足す。1つでも抜けると、設定の見本タイルが画面全体のテーマの値を引き継いで別の色になる。`npm run check` がそろっているか見張っている）
  - `<html data-theme>` に付ける。設定の見本タイルにも `data-theme` が付いていて、そのテーマの色で描かれる
  - 名前の注意：`--brass` は「アクセント色」、`--brass-hi` はボタンのグラデーション用の明るい側、文字に使うアクセントは `--accent-text`、金色ボタンの上の文字は `--on-accent`。明るいテーマでは `--brass` が青やえんじになる
  - 半透明のアクセントは `rgba(var(--accent-rgb), .2)` のように書く。グラデーションで消えていく先は `transparent` ではなく `--glow-0` / `--night-0`（古い Safari は transparent を黒経由で混ぜて灰色の縁が出る）
  - 起動アニメーションの SVG とメダルのグラデーションは `style="stop-color:var(--…)"`、振り返りカード（canvas）は `themeColors()` で CSS 変数を読む
  - 最初の描画より前にテーマを当てるため、index.html の head に小さなスクリプトがある（保存キーを直接読む。`build-preview.mjs` がプレビュー用のキーに置き換える）
  - 明るいテーマでは iPhone のステータスバーの白い文字が読めないので、`body::after` で上端（safe-area の高さ）に `--status` の色の帯を敷く
  - 「夜の機内」はテーマ導入前（v1.3.0）と画素単位で同じ。見た目を変えずに色を整理したいときは、v1.3.0 と画面を撮り比べると確かめやすい
- 主役は「券（ボーディングパス）」。入力に合わせて1項目ずつ埋まり、保存でスタンプ → 半券が切れる → 券が上へ消え、ホームに新しい券が降りてくる
- イージング
  - `--ease`（.16, 1, .3, 1）：ふつうの動き
  - `--ease-long`（.08, .82, .12, 1）：最後の減速を長く。**るかさんの要望で「最後をゆっくり滑らかに、約1.5秒長く」**。大きな動きはこれで 2〜3 秒
  - JS 側の `easeOut` も同じ曲線（`bezier(.08, .82, .12, 1)`）
- 保存の流れ（`commit`）：スタンプ 0ms → 半券 900ms → 券が上へ 2150ms → 閉じてホーム 2800ms → 実績チェックはその 2200ms 後
- `prefers-reduced-motion` のときは全部ほぼ一瞬。テストはこの状態で機能を確かめ、演出は `tests/motion.spec.mjs` で別に確かめる

## 8. ハマりどころ（過去の不具合）

- **券の大きさを変えない。** 以前、区間と座席の画面だけ券を小さくして項目を隠していたら「情報が欠落する」と指摘された。今はどの画面でも同じ大きさで、各行の高さを固定している（`.t-airline` `.t-names` `.t-v` `.t-seat` `.t-code`）。テストが全画面の券の高さを測っている
- **半券は紙ごと切れる。** `.ticket` は `.main` と `.stub` の2枚の紙。帯と切り欠き（mask）はそれぞれの紙が持つ。`.ticket` 自体に帯や切り欠きを付けると、切れるときに文字だけ動いて見える
- **横にはみ出さない。** 起動アニメーションの全画面要素に `transform: scale` をかけたら、ページの幅が 410px になり、iPhone でタップ位置がずれた。`html, body { overflow-x: clip }`、拡大は子要素にかける。テストが `scrollWidth === 390` を確かめている
- **閉じた全画面パネルはタップを通す。** `.flow` と `.sheet` は閉じたら `pointer-events: none`
- **実績の解除演出は全画面のモーダル。** 開いている間は下の画面を押せない。テストは `dismissAwards()` で閉じてから進む
- **起動アニメーションの「スキップ」ボタンは付けない**（るかさんの指定）。画面のタップで飛ばす。飛ばすと光が広がり、飛行機が飛び去り、夜空が幕のように上がる
- **編集は日付の画面から始める**（指定）。右上の「確認へ」で最後まで飛べる
- **取り込みの空港名。** 「羽田」「新千歳」のような漢字も読む（`resolveAp`）。CSV は UTF-8 で読めなければ Shift_JIS で読み直す
- **プレビューは保存先を分ける。** 同じ Wi-Fi の PC から開くと本番とは別のオリジンだが、念のため `build-preview.mjs` がキーを `skylog.preview.v1` に変えている
- **保存の演出中は入力画面をロックする。** `commit()` が `F.busy` と `F.saving` を立て、`next()`・`goStep()`・閉じるボタンはそれを見て何もしない。以前は演出中に「戻る」→「記録する」で同じ便が2件できた（新規の記録は保存のたびに新しい ID を作るため）
- **記録を読み込むときは必ず `cleanFlight()` を通す。** 日付か区間のない記録が1件でもあると `f.date.slice` で落ち、保存済みのデータなので開くたびに真っ白になる。`load()` とバックアップの復元で形をそろえ、使えない記録は捨てている
- **ファイル選択の input は、読み込んだらすぐ `value` を空にする。** 空にしないと、確認で「やめる」を選んだあと同じファイルを選んでも change が起きない
- **開発用サーバーは「.」で始まるパスと node_modules を出さない。** Windows は大文字・小文字を区別しないので、小文字にそろえて調べる（以前は `/.GIT/config` が見えた）
- **Apps Script のテストの日付。** `tests/gas.spec.mjs` では Code.gs を vm の中で動かすので、日付も vm の中で作らないと「日付」と認識されない（本物では問題ない）

## 9. iPhone の挙動で未確認のこと

- ホーム画面のアプリと Safari / Chrome のタブは保存場所が別（確認済みの前提で作っている）。プライベートブラウズでは保存できない
- 振り返りカードの「画像を保存・共有」は Web Share API（ファイル付き）。iOS の Safari / ホーム画面アプリで共有シートが開く想定だが、実機で未確認。だめなときは画像の長押しで保存できる
- Google Fonts は初回に読み込めればキャッシュする（`sw.js`）。初回からオフラインだと端末のフォントになる
- デザイン：明るいテーマの上端の帯（`--status`）が、ホーム画面アプリのステータスバーにちょうど重なるか。デザインを切り替えたときの全体のふわっとした入れ替わり（View Transitions）は iOS 18 以降の想定で、それより前の iOS では一瞬で切り替わる

## 10. スプレッドシート flight_log_gs

- Google スプレッドシート ID：`1q0_b83jvh4SnZkcq5q8jyWP3WWKJOkIs8lauytvuxkE`（ドライブには同じ名前の .xlsx が2つあるが、使うのはこの Google スプレッドシート版）
- タブ：`搭乗記録`（本体）、`統計`、`機体記号別`、`路線別`
- `搭乗記録` の列：`#`（`=IF(B2="","",ROW(B2)-1)`）/ 日付（本物の日付、表示 yyyy/mm/dd）/ 出発 / 到着 / 路線（`=IF(B2="","",C2&" → "&D2)`）/ 機材 / 機体記号（なしは「不明」）/ 備考
- `統計` は `'搭乗記録'!B2:B9100` のような範囲の数式で、総搭乗回数・初搭乗日・最終搭乗日などを出している
- 2026-10-04 に直したこと：41〜49行目の 2027年 → 2026年、2〜38行目の文字の日付 → 本物の日付、E1 の見出し（数式で上書きされていた）→「路線」

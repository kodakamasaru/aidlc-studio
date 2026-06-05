# S2.5 — UI 設計確定(視覚意図のイメージ作り / 全体)

## メタ
- 工程: S2.5 (UI Spec / Image)
- 役割: プロダクトデザイナー(視覚意図担当)
- バージョン: v0.0.1
- ステータス: レビュー待ち
- 入力参照: [s2/index.md](../s2/index.md) / [design/review-output.md](../design/review-output.md)
- 作成日: 2026-06-05
- 更新日: 2026-06-05

> **重要(契約)**: ここの `*.html` / `tokens.html` は **視覚意図のリファレンス**であって **コード移植元ではない**。S6/S7 は `screenshots/*.png` と `scr-NN-*.md` だけを参照し、`*.html` を Read してはならない。トークン値(色 hex / spacing px)は意図の言語化であり、S6/S7 が literal にコピーする義務はない(web 側で同じ視覚アウトカムを自然に表現する)。
>
> **プロダクト前提**: aidlc-studio は **web プロダクト**(`web/` = Vite + React)。S2.5 テンプレの「native 固有挙動(iOS/Android)」は本 PJ では非該当のため、各 `scr-NN-*.md` では **web 等価(レスポンシブ / keyboard / focus / hover / pointer)** に翻訳して記述する。

## 全体方針

### スタイル方向
- **Minimal product UI (Linear / Vercel 風)**(Q-01 で確定)。
- 落ち着いた中密度・クリーンな dev-tool ネイティブ。情報密度(Run 状態 / パイプライン / ログ / block-stream)を捌けることを最優先。装飾は最小、階層は余白と 1 アクセントで作る。
- 共通アプリシェル: 左 sidebar(Cycles / Inbox / Artifacts / Wiki)+ topbar(crumb + 状態バッジ + 主要アクション)+ content。Inbox には未処理件数バッジ。

### カラー方針
- **ベース**: Dark 優先(Q-02 確定)。bg `#09090b` → surface `#131316` → surface-2 `#1a1a20` → surface-3 `#212129` の 4 段。境界 `line #26262d` / `line-strong #34343d`。
- **テキスト**: hi `#ededf0` / mid `#9a9aa4` / low `#6a6a74` の 3 段。
- **primary(アクセント)**: indigo `#6366f1`(hover `#7c7ff5`)+ violet `#a78bfa`(Q-03 確定)。CTA・選択・focus リング・ブランドマークに使う唯一の決め色。
- **状態色(Run / process)**: running = teal `#2dd4bf` / stalled = amber `#f59e0b` / done = green `#22c55e` / failed = red `#ef4444` / idle = neutral `#6a6a74`(Q-03 確定)。
- **Inbox カード種別**: Q 待ち = indigo-400 `#818cf8`(`?` アイコン)/ レビュー待ち = purple-400 `#c084fc`(`◎` アイコン)。primary ファミリ内で hue を分け、**色 + アイコンの二重符号**で一目識別(D-03)。
- 各状態色は本体 + `-soft`(15% α 背景)+ 30% α 境界の 3 点セットでバッジ化。

### タイポグラフィ
- ファミリ: 本文・見出し = **Inter** / コード・ログ・US 番号 = **JetBrains Mono**。
- スケール: display 28/700(-0.02em) / h1 20/600(-0.01em) / h2 16/600 / body 14/400-500 / caption 12.5 / micro 11(バッジ・ナビ見出し、uppercase + tracking)。
- 行間 body 1.5 / log 1.65。

### 余白リズム
- ベース **4px**。スケール: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48(`--sp-1`〜`--sp-12`)。
- カード内 padding は 16–24、画面 content padding は 24。

### Radius / Shadow / Motion
- radius: sm 6 / md 8 / lg 12 / full。カード = lg、ボタン・入力 = sm、バッジ・dot = full。
- shadow: dark なので **境界主・shadow 従**。card `0 1px 2px rgba(0,0,0,.4)` / popover・modal `0 12px 32px rgba(0,0,0,.55)`。
- motion(意図 / 値は参考。詳細は各 `scr-NN-*.md` に文字で):
  - hover/focus = 150ms ease-out / パネル・モーダル = 200ms cubic-bezier(0.16,1,0.3,1) fade+slide / running dot pulse 1.6s / spinner 0.8s / skeleton shimmer 1.4s / パイプライン完了遷移 250ms。

## 画面一覧 (S2 の SCR と 1:1 対応)
- [SCR-01 Cycle 一覧・作成](./scr-01-cycle-list-create.html) | [仕様](./scr-01-cycle-list-create.md) | スクショ: [list](./screenshots/scr-01-cycle-list-create.list.png) / [empty](./screenshots/scr-01-cycle-list-create.empty.png) / [create](./screenshots/scr-01-cycle-list-create.create.png)
- [SCR-02 Cycle 詳細・実行](./scr-02-cycle-detail-run.html) | [仕様](./scr-02-cycle-detail-run.md) | スクショ: [idle](./screenshots/scr-02-cycle-detail-run.idle.png) / [running](./screenshots/scr-02-cycle-detail-run.running.png) / [stalled](./screenshots/scr-02-cycle-detail-run.stalled.png) / [done](./screenshots/scr-02-cycle-detail-run.done.png)
- [SCR-03 Human Inbox](./scr-03-human-inbox.html) | [仕様](./scr-03-human-inbox.md) | スクショ: [list](./screenshots/scr-03-human-inbox.list.png) / [empty](./screenshots/scr-03-human-inbox.empty.png)
- [SCR-04 レビュー詳細](./scr-04-review-detail.html) | [仕様](./scr-04-review-detail.md) | スクショ: [default](./screenshots/scr-04-review-detail.default.png) / [backtrack](./screenshots/scr-04-review-detail.backtrack.png)
- [SCR-05 Q 回答](./scr-05-answer-question.html) | [仕様](./scr-05-answer-question.md) | スクショ: [default](./screenshots/scr-05-answer-question.default.png)

## 視覚カタログ
- [tokens.html](./tokens.html) — ブラウザで開く
- [tokens.png](./screenshots/tokens.png) — スクショ

## 視覚イメージの生成
- 共有トークン: [styles.css](./styles.css)(全 HTML が link する単一 source)
- `bun run s2.5:capture`(`scripts/s2.5-capture.ts` / Playwright headless Chromium)で `section[data-state]` ごとに `screenshots/{scr}.{state}.png`、tokens は全面を `tokens.png`。**撮影前に screenshots/ を全削除**。

## 全体 質疑応答ログ

### Q-01 — スタイル方向は?
- **回答**(ユーザー記入):
  > Minimal product UI (Linear/Vercel 風)
- **確定**(AI 記入):
  > Linear/Vercel 風の minimal product UI で確定。情報密度を捌く dev-tool ネイティブ、装飾最小・1 アクセント・余白主導の階層。

### Q-02 — ベーステーマは?
- **回答**(ユーザー記入):
  > Dark 優先
- **確定**(AI 記入):
  > Dark 優先で確定。surface 4 段 + 境界主の階層。Light は v0.0.x で必要時に追加(tokens は CSS 変数なのでテーマ拡張は :root 差し替えで対応可)。

### Q-03 — 状態色のアクセント方針は?
- **回答**(ユーザー記入):
  > Indigo/Violet を主、状態は緑/琥珀/赤(running=teal / stalled=amber / done=green / error=red)
- **確定**(AI 記入):
  > primary = indigo+violet、Run 状態 = running:teal / stalled:amber / done:green / failed:red / idle:neutral で確定。Inbox 種別は primary ファミリ内で indigo-400(Q)/ purple-400(レビュー)に分離。

### Q-04 — この視覚意図(tokens + 5 画面 + 状態網羅)で確定してよいか?(**ユーザー確認待ち**)
- 確認方法: `s2.5/*.html` をブラウザで開く(細部は html、俯瞰は `screenshots/*.png`)。特に見てほしい点:
  1. SCR-02 のパイプライン(現在位置 / done / 手戻りマーカー ↩)と Run 状態(idle/running/stalled/done)の判別性
  2. SCR-03 Inbox の Q 待ち / レビュー待ちが一目で分かるか(色 + アイコン)
  3. SCR-04 block-stream の階層と、承認 / 差し戻し(↩)の重みのバランス
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  >

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — Tailwind CDN ではなくローカル CSS 変数(styles.css)でトークン化
- **理由**: capture 環境で Tailwind CDN(cdn.tailwindcss.com)が allowlist 外で 403。コミット対象の `screenshots/*.png` を **オフライン・決定的にレンダリング**するため、CDN 依存を排し CSS カスタムプロパティを単一 `styles.css` に集約。「インライン生値禁止 / トークン集約」要件も CSS 変数で満たす。S6/S7 は html/css を読まないため実装への影響なし。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

### D-02 — パイプラインは 8 ノード(S1 / S2 / **S2.5** / S3 / S4 / S5 / S6 / S7)
- **理由**: S2 SCR-02 は「S1▸…▸S7」表記だが、本 PJ の工程には S2.5 が実在する。パイプラインに S2.5 を明示ノードとして入れた(現在 Cycle も S2.5 を通過済として描画)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

### D-03 — Inbox 種別を「色 + アイコン」の二重符号で識別
- **理由**: Q 待ち(indigo-400)とレビュー待ち(purple-400)は primary ファミリ内で hue が近いため、色だけでは色覚多様性下で弱い。`?` / `◎` アイコンを併用し a11y を担保(色のみに依存しない / WCAG)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

### D-04 — 共通アプリシェル(左 sidebar + topbar)を全画面で固定
- **理由**: Inbox がハブ(S2 全体方針)。どの画面からも Cycles / Inbox に 1 クリックで戻れる導線と未処理件数の常時可視化が「IDE を触らず捌く」体験の核。sidebar に Artifacts / Wiki も枠だけ置く(中身は v0.0.x)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

### D-05 — 状態網羅に「操作中」状態(SCR-01 create / SCR-04 backtrack)を追加
- **理由**: S2 で「作成フォーム」「差し戻しダイアログ」が要素として挙がっている。default/empty/loading だけでなく、これらモーダル状態も `data-state` として撮り、S6/S7 がモーダルの視覚契約を持てるようにした。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

---

## 棄却した案

### R-01 — Tailwind CDN をそのまま使う(skill 骨子どおり)
- **棄却理由**: capture 環境で CDN 到達不可(403)。screenshots が無スタイルで撮れ、視覚契約として破綻する。CSS 変数に置換(D-01)。

### R-02 — Inbox の Q / レビューを色だけで区別
- **棄却理由**: 近接 hue + 色覚多様性で識別性不足。アイコン併用に変更(D-03)。

## 次工程への引き継ぎ
- **S6/S7 が参照すべき screenshots と md の対応表**: 各 `scr-NN-*.md` の「視覚 source / スクショ」メタ参照。S6/S7 は `screenshots/*.png` + `scr-NN-*.md` のみ(`*.html` Read 禁止)。
- **状態網羅(= 実装契約の質)**: SCR-01 {list/empty/create} / SCR-02 {idle/running/stalled/done} / SCR-03 {list/empty} / SCR-04 {default/backtrack} / SCR-05 {default}。
- **native 固有挙動でドメイン側に影響しそうな項目**: なし(web プロダクト)。ただし Run ログのストリーミング表示 / 未処理件数バッジのリアルタイム更新は **orchestration → web の push 経路**(SSE/WebSocket)を S3/S5 で要設計(各 md に注記)。
- **S5 へ**: 状態 enum(Run: idle/running/stalled/done/failed、HumanTask kind: question/review)を視覚バッジと 1:1 で定義済 → 集約の状態モデルと突き合わせること。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか:
- 暫定の解決方針:
- 棄却した案とその理由:

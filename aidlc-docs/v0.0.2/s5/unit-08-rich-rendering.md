# Unit-08: Evaluator 成果物リッチ描画

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-07](../s1/us-07-rich-rendering.md)(K)
- Phase: Phase 4
- レイヤ: `web/`(純表示コンポーネント / SCR-04 拡張)
- ステータス: 確定

## 責務 (1〜2 行)
品質ハーネス原則#3「コード不要で承認できる成果物」の要。Review detail(SCR-04)に **review block の純表示エリア**を追加し、completeness table / impact table / bugfix dossier / video embed / screenshot 証拠を描画して、人間がコードを見ずに approve/reject する(S3 反映 / S4 §3.7)。

## 外部依存
- **Unit-01**: bugfix dossier / Profile の block 型を描画。
- **Unit-03**: completeness table は BriefOut の `CompletenessBlock`(gen→eval 往復の産物)を API 経由で受けて描画。
- **Unit-06**: 共通フロント基盤(PageGuard 等)の上に作る。
- 既存: `web/src/features/review/ReviewBlocks.tsx`・`ReviewDetail.tsx`(拡張)。**`*.html`/`styles.css` は参照しない**(S3 契約 / API の block のみ)。

## I/F 定義 (この Unit が公開する契約)

| 描画 block | 入力(API の block) | 描画 |
|-----------|---------------------|------|
| completeness table | `CompletenessBlock`(requirements ↔ addressed) | テーブル。gap は赤ハイライト。要件は **平易な一文**(内部コードを出さない) |
| impact table | impact block | **振る舞い**(何が起きる/どの機能に効く)+ 重要度 高/中/低。ソース名/ファイル名は出さない |
| bugfix dossier | dossier block | cause(2層)/impact/fix/prevention/video の構造化カード |
| video embed | video block(URL) | 埋め込みプレーヤー。**v0.0.2 は placeholder**(録画なし表示) |
| screenshot 証拠 | screenshot block | verify-ui 自動生成 screenshot を動作証拠として描画 |
| approve/reject | 各 block | 各 block に紐づくボタン。レスポンシブ(320/768/1024/1440) |

- **descope card は SCR-04 から外す**(S3 反映 / 見送りは Unit-05 のサイクル側フローに一本化)。

## 主な AC(US 由来)
- SCR-04 に review block 描画エリア。completeness/impact/bugfix dossier/video/screenshot 描画。
- 原因・影響は **振る舞い**で描画(ソース非依存)、要件は平易な一文、重要度は高/中/低。
- video は placeholder、approve/reject が各 block で機能、レスポンシブ対応。E2E でリッチ描画→承認 pass。

## この Unit 固有の 質疑応答ログ

### Q-01 — impact/dossier 用に新しい `ReviewBlock` 型を足すか、既存型(summary/risk/diff 等)の組合せで表すか
- 提案: 既存 union を最大限再利用し、足りない構造(cause 2層など)だけ最小追加。追加時は Unit-01 の `coerceBlocks`/`KNOWN_BLOCK_TYPES` と同期する。
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  >

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — リッチ描画は SCR-04(Review detail)拡張に置く
- **理由**: US-07 D-01。承認/差し戻しは Review detail で行う v0.0.1 設計。そこに review block を足すのが自然。新規画面は作らない。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

### D-02 — video embed は placeholder(v0.0.2)
- **理由**: US-07 D-02。録画実体は v0.0.3。URL なしは「録画なし」placeholder。型と描画枠だけ作る。動作証拠は当面 verify-ui screenshot で代替。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — 独立 Review ダッシュボード画面を新設
- **棄却理由**: US-07 R-01。SCR-04 拡張で十分。新規画面は遷移を増やすだけ。

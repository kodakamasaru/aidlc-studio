# BACKLOG — v0.0.1 で作らない項目の台帳

S1〜S7 で「v0.0.1 では作らない / v0.0.x で / v1.0.0 で」と判断した項目をここに台帳化する(出典必須 / 完了で `[ ]`→`☑`、削除しない)。

## A. 機能拡張軸(v0.0.x シリーズ)
- [ ] 複数リポ / PJ 切替(repo-switch)。MVP は単一 PJ 固定。出典: US-25 / S2 SCR-01(作成フォームから対象リポ選択を削除)
- [ ] Backlog / Task 管理 UI(Task 追加・並べ替え・Cycle への割当)。MVP は Cycle 作成時に単一 Task 既定を背景生成のみ。出典: US-01/03/23/24 / S2 index / S2 SCR-01(作成フォームから初期 Task 入力を削除)
- [ ] Dashboard 4 象限。出典: US-10 / S1 Q-01 / S2 R-01
- [ ] 手戻り判断面 / within-step 部分差し戻し(AC・画面単位)。出典: S2 D-03
- [ ] Decision 履歴ビュー。出典: US-17
- [ ] Wiki(ユビキタス言語 / D 決定 / 引き継ぎ台帳)自動管理・閲覧。出典: US-20/32/33
- [ ] 会話履歴ビュー。出典: US-28
- [ ] Vision 管理 / Step 定義カスタム。出典: US-26/27
- [ ] 並行サイクル(worktree 複数)。出典: US-09 / CLAUDE.md v0 スコープ外
- [ ] リッチ可視化(レビュー重ブロック: 動画 dossier / screenshot / test-report リッチ描画)。出典: S2 SCR-04 / design/review-output.md
- [ ] Light テーマ(tokens を light/dark 2 系統化)。出典: S2.5 Q-02
- [ ] Inbox 種別タブ分割。出典: S2.5 SCR-03 R-01
- [ ] 実 AI 対話型ループ(headless `claude` の Q→回答→resume / `--resume`・session 注入)。MVP は run→emit→done の実 AI 検証まで(`claude -p` は実行完遂型)。出典: S7 ledger S7-C1 / s7-integration.md
- [ ] 通知(push)= US-31。MVP は NotifyPort no-op のみ。出典: S7 ledger S7-D2 / US-31
- [ ] frontend 共通化(PageGuard 画面ガード抽出 / 一覧 createdAt comparator 共通化)。機能影響なし。出典: S7 ledger S7-C3 / refactor-cleaner
- [ ] 会話/スレッド型の質問種別(要件詰めの往復 UX)。Inbox の1問1答カードでは要件ヒアリングの往復に不向き。**新 S1(要件ヒアリング)の前提機能**(方法論 v2 と密結合)。出典: ユーザー実機 feedback 2026-06-06 #4

## B. 公開・共有(v1.0.0 公開時)
- [ ] API 認証 / マルチユーザ(UserId owner スコープ)/ 本番 CSP nonce 化。MVP はローカル単一ユーザ常駐(127.0.0.1 + secureHeaders 既定 + projectId スコープ)。multi-tenant by UserId は S5/S6 ドメインに不在。出典: S7 ledger S7-D1 / s7-integration.md D-07

## C. 公開切替トリガー(技術スタック / インフラ)
- [ ] LLM 本選定 / Agent SDK 実行基盤の本番化。出典: CLAUDE.md 実行基盤
- [ ] orchestration → web の push 経路(SSE/WebSocket)本実装。出典: S2.5 SCR-02/03 設計連携メモ / S7 ledger S7-C2

## D. 時期未定
- (未定)

## F. 方法論 v2 — ステップ再定義(S2.5 廃止 / S1-S8)
ユーザー合意(2026-06-06)。現行 S1-S7+S2.5 を S1-S8 に再定義。S2.5 の半端さを解消し UI デザインを正式ステップ化、UoW と context-map を統合。**v0.0.1 締め後に独立実施**(影響: kit/skills 9本 + operating-model + `src/domain/shared/vocab.ts` DEFAULT_STEPS=S6 戻り + studio pipeline/UI)。既存 v0.0.1 aidlc-docs は歴史として温存し、新ステップは次版から前向き適用。出典: ユーザー提案 2026-06-06 #3
- [ ] S1 要件ヒアリング(brief + 現 S1 を統合・対話寄り)
- [ ] S2 画面要素(ワイヤーフレームレベル)= 現 S2 screen-mock
- [ ] S3 本格 UI デザイン = 現 S2.5 を正式ステップに昇格(**S2.5 廃止**)
- [ ] S4 技術仕様確定(必要なとき / 任意)= 新規
- [ ] S5 並行作業単位(UoW)と順序確定 = 現 S3 unit-of-work + 現 S4 context-map を統合
- [ ] S6 ドメインモデル視覚化で対応内容/方針を確認 = 現 S5 domain-model
- [ ] S7 ドメインコード実装 = 現 S6 pure-code
- [ ] S8 実 PJ コード組み込み = 現 S7 integration

## E. 棄却された案(思想として採用しない)
- Tailwind CDN を S2.5 で使う(オフライン決定的レンダリング不可)。出典: S2.5 D-01 / R-01
- Inbox 種別を色だけで区別。出典: S2.5 D-03 / R-02

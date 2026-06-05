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

## B. 公開・共有(v1.0.0 公開時)
- (未定)

## C. 公開切替トリガー(技術スタック / インフラ)
- [ ] LLM 本選定 / Agent SDK 実行基盤の本番化。出典: CLAUDE.md 実行基盤
- [ ] orchestration → web の push 経路(SSE/WebSocket)本実装。出典: S2.5 SCR-02/03 設計連携メモ

## D. 時期未定
- (未定)

## E. 棄却された案(思想として採用しない)
- Tailwind CDN を S2.5 で使う(オフライン決定的レンダリング不可)。出典: S2.5 D-01 / R-01
- Inbox 種別を色だけで区別。出典: S2.5 D-03 / R-02

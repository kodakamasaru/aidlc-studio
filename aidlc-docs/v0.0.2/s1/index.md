# S1 — ユーザーストーリー(一覧) — v0.0.2

## メタ
- 工程: S1 Discovery (Phase B)
- 役割: プロダクトディスカバリーリード
- ステータス: 確定
- 入力参照: [brief.md](../../brief.md) / [v0.0.2 scope.md](../scope.md) / [v0.0.1 ledger.yml](../../v0.0.1/ledger.yml)
- 作成日: 2026-06-10
- 更新日: 2026-06-10

## US 一覧

| # | US | scope ID | 実装P | 概要 |
|---|---|---|---|---|
| 01 | [StepDef 契約拡張 + Profile レジストリ](./us-01-stepdef-contracts.md) | A, G | P1 | 4契約 + execMode + 成果物Profile レジストリ |
| 02 | [Engine 実行パイプライン](./us-02-engine-pipeline.md) | B, C, D | P2 | BriefIn/Out + Run.role + deterministic gate |
| 03 | [Completeness Gate + Descope 制御](./us-03-completeness-gate.md) | E | P3 | requirements↔addressed 照合 + gap→descope |
| 04 | [Prompt 2層構成](./us-04-prompt-config.md) | F | P3 | Core常時 + Step Payload遅延の2層 |
| 05 | [Bugfix Dossier Profile](./us-05-bugfix-dossier.md) | H | P4 | cause/impact/fix/prevention/video 必須block |
| 06 | [Step 定義カスタム UI](./us-06-step-custom-ui.md) | I | P5 | 画面から StepDef 契約を編集 |
| 07 | [Evaluator 成果物リッチ描画](./us-07-rich-rendering.md) | K | P6 | completeness/impact/dossier/descope/video 描画 |
| 08 | [対話型 Q→回答→Resume](./us-08-qa-resume-loop.md) | S7-C1 | P2 | headless AI の Q停止→人間回答→再開 |
| 09 | [フロントエンド共通化リファクタ](./us-09-frontend-cleanup.md) | S7-C3 | P5 | PageGuard/Comparator 抽出(US-06/07 の前実施) |

## 全体方針(グルーピング・優先度)

### グルーピングの方針

scope.md の A-K を **「独立してテスト可能な縦スライス」** に整理:
- **A+G 統合**: StepDef の契約と Profile レジストリは参照関係にあり、分離すると片方が未完成になるため1 US に統合
- **B+C+D 統合**: Engine パイプライン(gen→deterministic→eval)は1つの実行フローとして不可分のため1 US に統合
- **E, F は独立**: Completeness gate と Prompt 構成は機能面で独立(検証ロジック vs プロンプト組み立て)
- **S7-C1 を追加**: v0.0.1 ledger の carried 項目。gen→eval→human 承認ループの前提

### 実装順序(フェーズ依存)

```
P1(US-01) → P2(US-02, US-08) → P3(US-03, US-04) → P4(US-05) → P5(US-09, US-06) → P6(US-07)
```

- P1 はデータモデル基盤。以降の全 US が依存
- P2 で実行パイプラインが回る(US-02: scripted adapter, US-08: live adapter)
- P3 で品質ゲートが載る
- P5 は US-09(共通化)を先に行い、その後に US-06(Step UI)で新規要素を追加
- P6 はリッチ描画(最終仕上げ)

### 前サイクル(v0.0.1) ledger reconcile

| carried ID | 内容 | v0.0.2 判定 | 行き先 |
|---|---|---|---|
| S7-C1 | Q→回答→Resume ループ | **IN** | US-08 |
| S7-C4 | Backtrack 後 Phase 再起動 | DEFER | BACKLOG(v0.0.3) |
| S7-C2 | Push 経路(SSE/WS) | DEFER | BACKLOG(v0.0.3) |
| S7-C3 | Frontend MEDIUM 整理 | **IN** | US-09 |

## 全体 質疑応答ログ (複数 US 横断の議論)

### Q-01 — v0.0.1で一番困ったこと・次に真っ先に直したいことは？
- **回答**(ユーザー記入):
  > AIが勝手に要件を落として進んだ。レビューでコードを見ないといけない。
- **確定**(AI 記入):
  > 優先度の軸が「要件漏れ防止(completeness gate)」と「コード不要レビュー(rich rendering)」。US-03(P3)とUS-07(P6)が主軸。パイプライン基盤(US-01/P1, US-02/P2)はこれらの前提として先に通す。

### Q-02 — AIが要件を見落として進んだ場合、どうしてほしいか？
- **回答**(ユーザー記入):
  > 必ず止めて聞く。
- **確定**(AI 記入):
  > gap = hard gate で確定。completeness gate(US-03)は要件漏れを機械的に検出し、必ず HumanTask として人間に確認する。

### Q-03 — レビュー画面で見たい情報の優先順位は？
- **回答**(ユーザー記入):
  > 要件カバレッジ / バグ修正の理由 / 確実に正しく実装されているという証拠（動画等）
- **確定**(AI 記入):
  > US-07(リッチ描画)の情報優先度: ①completeness table(要件カバレッジ) ②bugfix dossier(修正理由) ③動作証拠(動画/screenshot)。動画録画は scope.md で v0.0.3 defer だが、ユーザー要望が強いため v0.0.2 で screenshot 証拠(verify-ui)を強化し、video 型定義は残す。US-07 の AC を更新。

### Q-04 — AIからの質問にどう答えたいか？
- **回答**(ユーザー記入):
  > 選択肢提示 + 推奨選択肢を表示 + 手動回答も可能
- **確定**(AI 記入):
  > US-08(Q回答UI)はハイブリッド形式にする。AIが選択肢＋推奨を提示し、ユーザーは選ぶか自由入力で答える。HumanTask の Q カードに反映。

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — A(StepDef 拡張)と G(Profile レジストリ)を1 US に統合
- **理由**: StepDef の Output 契約が Profile を参照し、Profile が StepDef に依存。分離すると両方 incomplete でテスト不能になる。1 US で両方完成させる方が縦スライスとして自然。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

### D-02 — B+C+D(Engine パイプライン)を1 US に統合
- **理由**: gen→deterministic→eval は1つの実行フロー。各要素を独立 US にすると統合テストが書けない。Phase B(US-02)でパイプライン全体を E2E テスト可能にする。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

### D-03 — E(Completeness Gate)と F(Prompt 構成)を独立 US に分離
- **理由**: E は「検証ロジック(要件↔成果物の照合)」で F は「プロンプト組み立て(遅延ロード)」。機能面で独立。ただし実装フェーズは同じ P3。順不同で実装可。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

### D-04 — S7-C4/S7-C2/S7-C3 を v0.0.2 スコープ外に defer
- **理由**: scope.md の除外リストと成功基準に照らし、これら3項目は品質ハーネス基盤に直結しない。S7-C4(backtrack relaunch)は fan-out 実行と同時に v0.0.3 が自然。S7-C2(push)はポーリングで代替済。S7-C3(frontend cleanup)は機能影響なし。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

---

## 棄却した US 案

### R-01 — 各 scope ID(A〜K)を1 US ずつにする(10 US 構成)
- **棄却理由**: A+G と B+C+D は参照関係・実行フローとして不可分。無理に分けると「テスト不能な incomplete US」が発生する。統合した方が縦スライスの定義(独立してテスト可能)に合致。

### R-02 — P5(Step UI)と P6(リッチ描画)を1 US に統合
- **棄却理由**: 編集機能(I)と描画機能(K)はユーザー操作が完全に独立。異なるコンポーネント/ページで実装され、別々にテスト可能。統合する理由がない。

## 次工程 (S2) への引き継ぎ
- US の中で画面化が必須なもの: US-06(Step 定義UI), US-07(リッチ描画), US-08(Q→回答)
- フロー化で説明する方が早いもの: US-02(gen→eval パイプラインの状態遷移), US-03(descope フロー)
- Biz とのすり合わせで論点になりそうな US: US-03(descope の人間承認フロー), US-07(リッチ描画の情報量)

## 前サイクルからの引き継ぎ
- 何が漏れていたか: v0.0.2 の旧 S1-S5 ドキュメントが v2 メソッドリファクタで全削除された。旧データは旧ステップモデル(S1=brief, S2=画面, S3=unit, S4=context-map, S5=domain-model)に基づいており、v2(S1=requirements, S2=wireframe, S5=work-units, S6=domain-model)とマッピングが不一致。
- 暫定の解決方針: v2 メソッドで S1 から完全に再作成。旧ドキュメントの内容は scope.md に集約済みなので損失なし。
- 棄却した案とその理由: 旧ドキュメントを v2 マッピングに変換して再利用 → メソッド構造が根本的に変わった(PhaseGroup 新設、S2.5/S3/S4 廃止・統合)ため、変換コストが再作成より高い。

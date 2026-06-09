# S1 — ユーザーストーリー(一覧) — v0.0.2

## メタ
- 工程: S1 (User Story)
- 役割: プロダクトマネージャー
- ステータス: 確定
- 入力参照: [brief.md](../../brief.md) / [v0.0.1/s1/index.md](../../v0.0.1/s1/index.md)
- 作成日: 2026-06-10
- 更新日: 2026-06-10

> v0.0.1 の US インベントリ(33 US)を引き継ぎ、v0.0.2 スコープの版タグを更新する。
> 粒度方針(kit 準拠): **1 US = 1 つの独立してテスト可能な縦スライス。US 数は出力であって目標ではない**。

## v0.0.2 スコープの US(4 US)

| ID | タイトル | 版 | 概要 |
|----|---------|----|------|
| US-07 | ステップ専用 Agent が成果物を生成する | v0.0.1 + **v0.0.2** | gen→eval ループ / BriefIn-Out / deterministic gate / completeness gate |
| US-13 | ステップ最終出力を視覚レビューして承認/差し戻す | v0.0.1 + **v0.0.2** | evaluator pass 後のみ人間レビュー提示 |
| US-18 | コードを見ずにリッチレビューする | **v0.0.2** | completeness/impact/bugfix dossier/descope card/video embed |
| US-27 | ステップ定義(パイプライン)をカスタマイズする | **v0.0.2** | 契約(Output/Verification/HumanGate/Escalation)の UI 編集 + Profile 紐づき |

## US ファイル
- [US-07](./us-07-agent-generate-artifact.md)
- [US-13](./us-13-visual-review-step.md)
- [US-18](./us-18-rich-review.md)
- [US-27](./us-27-step-definition-custom.md)

> v0.0.1 の全 US 一覧は [v0.0.1/s1/index.md](../../v0.0.1/s1/index.md) を参照。

## Ledger reconcile

出典: [v0.0.1/ledger.yml](../../v0.0.1/ledger.yml)

| ledger ID | 内容 | v0.0.2 での扱い | 理由 |
|-----------|------|----------------|------|
| S7-C1 | 対話型 Q→回答→resume ループ | 先送り(v0.0.3+) | scope 除外「実 AI 対話型ループ」 |
| S7-C4 | backtrack 後 relaunchPhase 自動生成 | 先送り(v0.0.3+) | v0.0.2 スコープ外 |
| S7-C2 | orchestration→web push 経路 | 先送り(v0.0.3+) | scope 除外 |
| S7-C3 | frontend MEDIUM 整理 | 先送り(v0.0.3+) | 機能影響なし |

carried 4件は全件 v0.0.x(≥v0.0.3)へ先送り。v0.0.2 S1 は確定可能。

## 全体方針

- **v0.0.2 主軸**: 品質ハーネス + Step可変化 + リッチ描画。出典: [scope.md](../scope.md) / [design/quality-harness.md](../design/quality-harness.md)
- **新規 US なし**: 品質ハーネス(A-H)は US-07/13 の内部実装、リッチ描画(K)は US-18、Step カスタム(I)は US-27 に集約。ユーザー可視の振る舞いは既存 US で覆える。
- **v0.0.1 維持**: US-05/06/08/12 は v0.0.1 で完了。v0.0.2 で追加変更なし。

## 次工程 (S2) への引き継ぎ
- **画面化が必須**: US-27(Step 契約編集 UI) / US-18(リッチ描画パネル) / US-13(evaluator 状態表示)
- **既存画面の拡張**: Cycle detail(Phase pipeline に evaluator Run 表示) / Review detail(新 block 型描画)
- **新規画面**: Step 定義編集(契約フィールドのフォーム)

## 前サイクルからの引き継ぎ
- v0.0.1 で 88 テスト全緑。後方互換を維持して拡張する。

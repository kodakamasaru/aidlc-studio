# v0.0.2 スコープ — 品質ハーネス + Step可変化 + リッチ描画

作成日: 2026-06-09 / ステータス: **確定**

## 主軸

**「AIの実行品質を機械的に保証し、人間は成果物だけを見て判断できる」基盤を完成させる。**

v0.0.1 が「Human Inbox 縦ループ(1フェーズが回る)」を証明したのに対し、
v0.0.2 は「AIが勝手に漏らさず・黙って descope せず・理由が残る」を証明する。
設計正本 = [quality-harness.md](./design/quality-harness.md) §1-§11。

---

## スコープ項目

### ハーネス基盤(A-H)

| ID | 項目 | 設計 § | 実装フェーズ | 概要 |
|---|---|---|---|---|
| A | StepDef 拡張 | §2 | P1 | 4契約(Output/Verification/HumanGate/Escalation)+execMode を optional 追加 |
| B | BriefIn/BriefOut 型 + engine 組立 | §4 | P2 | BriefIn(context+requirements)/BriefOut(成果物+決定+申し送り)/CompletenessBlock |
| C | Run.role + evaluator 起動 | §8 | P2 | Run に role:'generator'\|'evaluator' 追加 / OrchestratorPort.launchEval 拡張 |
| D | Deterministic gate | §11.2 | P2 | evaluator 前の存在検査(成果物パス存在 / 必須block存在)。Node.js スクリプト |
| E | Completeness gate + descope | §7 | P3 | requirements ↔ addressed 照合 / gap → descope Question / approve→backlog Task化 |
| F | Prompt 構成(遅延ロード) | §11.1/11.3/11.4 | P3 | Core常時+Step Payload遅延の2層 / gen と eval で別 payload |
| G | 成果物 Profile レジストリ | §5 | P1 | task種別→必須block集合のデータ構造。coerceBlocks で前方互換 |
| H | Bugfix dossier プロファイル | §6 | P4 | cause(2層)/impact/fix/prevention/video の必須block定義 |

### UI 拡張

| ID | 項目 | 実装フェーズ | 概要 |
|---|---|---|---|
| I | Step 定義カスタム UI | P5 | 画面から StepDef の契約(出力/検証/人間ゲート/エスカレーション)を編集。1c(step可変)のUI面 |
| K | リッチ描画(review block) | P6 | Evaluator 成果物のリッチ描画: completeness table / impact table / bugfix dossier / descope card / video embed。原則③(コード不要で承認)の要 |

---

## 実装フェーズ

```
P1: 型拡張基盤(A, G) ← 既存テストが壊れないことを確認
P2: Engine 組立(B, C, D) ← gen→deterministic→eval ループが回る
P3: Gate/Policy(E, F) ← completeness gate + descope + prompt構成
P4: Profile 具体化(H) ← bugfix dossier
P5: Step カスタム UI(I) ← 画面から step を編集
P6: リッチ描画(K) ← evaluator 成果物を人間が見て判断できる
```

各フェーズは TDD(RED→GREEN→IMPROVE)で進める。80%+ coverage 維持。

---

## v0.0.2 でやらないこと(明示的な除外)

| 除外項目 | 理由 | 予定 |
|---|---|---|
| fan-out 実行(S6/S7 の UoW 並列) | 残スレッド。single-only で十分ハーネス価値が出る | v0.0.3 |
| headless ブラウザ録画(video block の実体) | インフラ層。video block の**型と描画枠(K)**は作るが、実際の録画は後 | v0.0.3 |
| 方法論 v2(S1-S8 再定義) | 独立実施(v0.0.1 締め後の合意済)。StepDef は generic なので並行可能だが混ぜない | 別バージョン |
| Wiki 自動管理 | 独立度高い。ハーネスと直結しない | v0.0.x |
| Dashboard 4象限 | 独立度高い | v0.0.x |
| 並行サイクル(worktree 複数) | v0 スコープ外(CLAUDE.md) | v1 |
| API 認証 / マルチユーザ | v1.0.0 公開時 | v1.0.0 |

---

## 成功基準

1. **gen→eval ループが回る**: generator が成果物を出し、別 Run の evaluator が検証する E2E が pass する
2. **completeness gate が機能する**: requirements に対する gap を検出し、descope Question が発火する
3. **descope が黙って通らない**: gap があれば evaluator が fail し、人間に descope Question が届く
4. **step を画面から編集できる**: StepDef の契約を UI で変更し、次回実行に反映される
5. **人間がコードを見ずに承認できる**: evaluator 成果物のリッチ描画を見て approve/reject できる
6. **既存テストが全て pass**: v0.0.1 の 155 tests が壊れない(後方互換)

---

## 関連ドキュメント

- [quality-harness.md](./design/quality-harness.md) — 設計正本(§1-§11)
- [review-output.md](./design/review-output.md) — per-step review payload 設計
- [BACKLOG.md](../../BACKLOG.md) — v0.0.1 で作らなかった項目の台帳
- [brief.md](./brief.md) — プロダクト brief(全版共通)

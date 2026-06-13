# Unit-01: wire 契約 & skill 焼き込み

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-03](../s1/us-03-output-question-routing.md)(emit スキーマ), [US-04](../s1/us-04-conversational-resume.md)(返信エンベロープ)/ 描画契約として US-05/US-06 にも供給
- 由来: S4 C3(`aidlc-question`)/ C4(`aidlc-answers`)/ S4 引き継ぎ「wire 契約を焼き込む skill」
- Phase: 1(leaf / 基盤)
- ステータス: 確定(2026-06-13 / 評価 AI レビュー)

## 責務 (1〜2 行)
AI→人間 質問(`aidlc-question`)と 人間→AI 返信(`aidlc-answers`)の **wire JSON スキーマを 1 箇所で定義**し、parse/serialize/バリデーションのユーティリティを提供する。併せて、人間に確認を投げうる skill 本文へ「構造化 emit / 回答突合」契約を焼き込み(道具では直らない層)、共通文面を [operating-model](../../../kit/rules/aidlc-operating-model.md) に DRY 定義する。

## 外部依存
- なし(leaf)。既存ドメイン型 [`QuestionOption`](../../../src/domain/question/question.ts)(`{id,label,hint?,recommended?}`)に wire JSON を写像するが、これは「既存型に合わせる」制約であり依存先 Unit ではない。

## I/F 定義 (この Unit が公開する契約)

### wire スキーマ(新規。S4 C3/C4 の意味論を実装形に固定)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| `parseQuestionBlock(text)` | live 結果テキスト | `AidlcQuestion[]` or `null`(block 無し) | 壊れ JSON / `recommended:true` が 0 or 2+ 個 / `options` 欠落 → 可視エラー(黙って通さない / 原則④) |
| `serializeAnswers(answers)` | `AidlcAnswer[]`(UI の選択+補足) | ` ```aidlc-answers ` fenced JSON 文字列 | — |
| `parseAnswersBlock(text)` | resume 入力エンベロープ | `AidlcAnswer[]` | parse 失敗は可視化 |

- `AidlcQuestion` = `{ id, prompt, background?, options: AidlcOption[], answerKind: "single"|"multi"|"free" }`
- `AidlcOption` = `{ id, label, hint?, recommended?: boolean }`(`recommended:true` は配列内で**厳密に 1 件** / S2 D-04・S4 C3)
- `AidlcAnswer` = `{ questionId, choiceIds: string[], note?: string }`(S4 C4)
- fenced タグは言語タグ付き ` ```aidlc-question ` / ` ```aidlc-answers `。

### skill 焼き込み契約(道具では直らない層 / CLAUDE.md)
- [operating-model](../../../kit/rules/aidlc-operating-model.md) に「人間確認の構造化 emit/突合」共通契約を 1 箇所定義(DRY の正本)。
- 各 skill 本文は **1 行で operating-model を参照**(文面複製しない)。**焼き込み対象 skill(確定リスト / 評価 AI S-2)**:
  1. [aidlc-s1-requirements](../../../kit/skills/aidlc-s1-requirements)(主軸 = web ヒアリング / 第一優先)
  2. [aidlc-s6-domain-model](../../../kit/skills/aidlc-s6-domain-model) — レビュー質問を出しうる
  3. [aidlc-s8-integration](../../../kit/skills/aidlc-s8-integration) — descope/統合確認を出しうる
  4. [aidlc-s9-scenario-validation](../../../kit/skills/aidlc-s9-scenario-validation) — 視覚レビュー質問を出しうる
- **クリティカルパス上の Day-0 タスク**: 本 Unit は Phase 1 leaf かつ Phase 2/3 全体の依存先。上記 4 skill への参照追記 + operating-model 共通契約定義を Phase 1 の初手で閉じる(「着手時に確定」と曖昧化しない)。上記以外に確認質問を出す skill が S7 実装中に判明したら同 1 行参照を追記。

## この Unit 固有の 質疑応答ログ

### Q-01 — (なし)
- wire スキーマ・焼き込み対象とも S4 C3/C4 と引き継ぎで意味論確定済。新規 Biz 判断なし。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — wire ユーティリティをドメインから独立した純関数モジュールに置く(infra でも domain でもない共有層)
- **理由**: parse/serialize は live adapter(Unit-03/04)と web(Unit-06)の双方が使う。ドメインに置くと infra/web がドメインに過依存し、infra に置くと web から参照できない。`QuestionOption`/`Answer` ドメイン型 ↔ wire JSON の写像境界として独立モジュール化し、両側から import 可能にする。最終配置(src 内 path)は S6/S7。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計 / 2026-06-13 評価 AI レビュー)。ユーザー上書き希望時は随時反映。
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — YAML を wire 形式に採用
- **棄却理由**: S4 D-03 で JSON 採用済(括弧明示で parse 堅牢・LLM 生成安定)。
</content>

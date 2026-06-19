# 集約: Question(v0.0.4 ビュー)

## メタ
- 親: [s6/index.md](./index.md)
- 対応 US: [US-03](../s1/us-03-output-question-routing.md), [US-04](../s1/us-04-conversational-resume.md), [US-05](../s1/us-05-qa-thread-ui.md), [US-06](../s1/us-06-bulk-hearing.md)
- 所属 Unit: [Unit-01](../s5/unit-01-wire-contract.md)(wire 境界), [Unit-03](../s5/unit-03-question-emit-session-parse.md)(emit), [Unit-04](../s5/unit-04-resume-turn.md)(回答→継続), [Unit-06](../s5/unit-06-conversation-ui.md)(描画)
- ステータス: 確定(2026-06-13 / 評価 AI レビュー)
- 正本コード: [src/domain/question/question.ts](../../../src/domain/question/question.ts)(**本サイクルで変更なし**)

## このビューの目的
v0.0.4 の質問・回答・継続は既存 `Question` 集約で表現済。本ファイルは新規モデル定義ではなく、**どの既存要素が本サイクルのどの US を満たすか**と**境界の置き方**を確認するビュー。

## モデル定義(既存 / DDD 採用)
- **集約ルート**: `Question`(`id, runId, cycleId, taskId|null, kind, state, payload, createdAt`)
- **値オブジェクト**:
  - `QuestionOption` = `{ id, label, hint?, recommended? }` ← wire の `aidlc-question.options` がこれに写像(項目過不足なし)
  - `Answer` = `{ verdict, body?, backtrackTo?, reason? }` ← wire の `aidlc-answers` の選択+補足が `body` に載る(**回答モデル不変**)
- **本サイクルで使う `kind`**: `"question"`(AI→人間 の確認質問。US-03)。他 kind(`visual_review` 等)は既存のまま。
- **ドメインサービス(純関数)**: `raiseQuestion`(open な Question 生成)/ `applyAnswer`(回答適用 → `{question, fact, command}`)/ `deriveCommand`(回答 → `Unit02Command`)/ `statementOf`。

## 不変条件(既存 / 本サイクルが依存)
- INV-1: 回答は `state==="open"` のときのみ適用可(二重回答防止)。
- INV-2: `verdict` は `kind` ごとの許可集合内のみ(`question` に visual_review 用 verdict を送れない)。
- **回答分岐(S4 C2 / 本サイクルの心臓 / 既存 `deriveCommand`)**:
  - `kind="question"` + 回答 → `Unit02Command.resumeRun{runId, body?}`(turn 継続経路)
  - `kind="visual_review"` + `approve` → `approveTaskReview{runId, taskId}`(finalize 経路)
  - → **本サイクルでこの分岐ロジックを変更しない**。live/scripted アダプタはこの命令を受けて経路を分ける(Unit-04)。

## batch(N問→N答→1resume)とドメインの関係(評価 AI S-1)
- 1 run が複数 `question` を出すと N 個の `Question`(各 open)が立つ。UI は全回答をまとめ 1 つの `aidlc-answers` JSON に積む(batch)。
- この JSON 文字列は **1 つの `Answer.body`(不透明)** に載り、`resumeRun{body}` で `--resume` に渡る。**ドメインは N 個の回答を parse しない**(突合は resumed agent が skill 契約で行う / S4 C4)。回答モデルは変更不要。
- **どの `Question` に `applyAnswer` を当てるか**(N 個を同 body で順に閉じる / アンカー 1 件を閉じる)は **app 層の選定**で、ドメイン形状の問題ではない(最終決定は S7/app)。S6 はこれがドメイン変更を要さないことだけを確定する。

## 境界(本サイクルで滲ませない線)
- **wire ↔ ドメイン**: `aidlc-question`/`aidlc-answers`(JSON)は **Unit-01 の境界変換**でドメイン型へ。wire 型をドメインに持ち込まない(index R-02)。
- **「★おすすめちょうど 1」**: ドメイン不変条件にしない。wire/UI バリデーション(Unit-01 / index D-03)。`QuestionOption.recommended?` は基数制約を持たない。

## この集約固有の 質疑応答ログ

### Q-01 — (なし)
- 既存集約の reuse 確認のみ。新規 Biz/モデル判断なし。

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — `aidlc-question` の `background`/`answerKind` をドメインに追加せず wire 専用項目とする
- **理由**: `background`(背景・折りたたみ)と `answerKind`(single/multi/free)は**表示・入力の形**(S2 D-03/D-04)で、ビジネスルールではない。ドメイン `Question` に持たせると表示都合がドメインに侵入する。wire スキーマ(Unit-01)に閉じ、ドメインは既存 `QuestionOption`/`Answer` のまま。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計 / 2026-06-13 評価 AI レビュー)。ユーザー上書き希望時は随時反映。

---

## この集約固有の 棄却した案

### R-01 — `kind="question"` 用に新 payload 型(選択肢の表示メタ込み)を追加
- **棄却理由**: 既存 `payload.{kind:"question", prompt, options?}` で足りる。表示メタは wire 側(D-01)。payload を太らせるとドメインが UI を知る。
</content>

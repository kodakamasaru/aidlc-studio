# S7 — 純粋ドメインコード 進行ログ / v0.0.4

## メタ
- 工程: S7 (Domain Code)
- PhaseGroup: Build
- 役割: ドメインエンジニア
- ステータス: **確定**(2026-06-13 / TDD green + 評価 AI 敵対レビュー反映済。内部コード設計ゆえ人間承認不要 — S4/S5/S6 と同じ確立パターン)
- 入力参照: [s6/index.md](./s6/index.md), [s5/unit-01-wire-contract.md](./s5/unit-01-wire-contract.md), [s4-tech-spec.md](./s4-tech-spec.md)(C3/C4)
- コード出力先: `src/wire/`(純粋な wire 境界モジュール)
- 言語/テストランナー: TypeScript / Bun(`bun test`、co-located `*.test.ts`)
- 作成日: 2026-06-13
- 更新日: 2026-06-13

## このサイクルの S7 のスコープ宣言

S6 の結論どおり **既存ドメイン集約はゼロ変更**。S7 の唯一の実装対象は、Unit-01 の**コード半分** = `aidlc-question`/`aidlc-answers` の **wire 変換純関数**(parse/serialize/validate)。フレームワーク非依存・I/O なし・モック不要の純粋関数のみ。

**S7 でやらないこと**:
- ドメイン集約(`Question`/`Cycle`/`Run`)の変更 — S6 で不要と確定。
- Unit-01 の**もう半分** = skill 本文への emit/突合契約の焼き込み(`kit/skills/*` + operating-model のテキスト)→ 統合/契約作業ゆえ S8。
- live adapter / engine / web の実装(infra/app/web)→ S8。

## 実装一覧

| # | 対象モデル/集約 | コードパス | テストパス | 対応 US | 状態 |
|---|----------------|----------|----------|--------|------|
| 1 | wire 型 + parse/serialize/validate(`AidlcQuestion`/`AidlcAnswer`/`WireError` + `parseQuestionBlock`/`validateAidlcQuestion`/`serializeAnswers`/`parseAnswersBlock`) | `src/wire/aidlc-wire.ts` | `src/wire/aidlc-wire.test.ts` | US-03 / US-04 | **確定**(42 tests green / typecheck clean) |

検証: `bun test src/` = **173 pass / 0 fail**(wire 42 を含む)。`bun run typecheck` の wire 関連エラー = **0**(既存の `scripts/s3-v003-capture.ts` エラーは本サイクル無関係・前から存在)。

## 純粋性チェックログ
| 日付 | チェック対象 | 検出された違反 | 対応 |
|------|------------|--------------|------|
| 2026-06-13 | `src/wire/aidlc-wire.ts` | import は `../domain/shared/result` のみ。framework/I/O/副作用なし、`any`・非 null 断定・unsafe cast なし、全型 `readonly` | 違反なし(完了条件②④充足) |

## 質疑応答ログ

### Q-01 — (Biz 判断なし)
- 純粋 wire コードの実装で Biz/プロダクト判断なし。命名・配置は内部設計(下記 D)。

---

## AI が独自に決めたこと と 理由

### D-01 — wire モジュールを `src/domain/` でなく `src/wire/`(domain/app/infra の兄弟)に置く
- **理由**: wire 変換は live adapter ↔ ドメイン ↔ web を跨ぐ**境界(anti-corruption layer)**で、コア・ドメインのビジネスロジックではない。`src/domain/` に置くとドメインが wire 表示都合(`background`/`answerKind`)を知ることになる(S6 question-aggregate D-01)。純粋(I/O なし)を保ちつつ独立配置し、S8 で infra と web の双方から import 可能にする(Unit-01 D-01 の最終配置確定)。S7 完了条件②(ドメイン層にフレームワーク import 無し)はこの配置でも充足(ドメイン層を一切汚さない)。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計 / 2026-06-13 評価 AI レビュー)。ユーザー上書き希望時は随時反映。

### D-02 — wire 型は branded `Text` でなく plain `string` を使う
- **理由**: wire は生 JSON の表現。ドメインの branded 型(`Text` 等)へのマッピングは infra 境界(Unit-03 / S8)で行う。wire を branded 型に縛るとドメインへ逆依存し純粋境界が崩れる。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計 / 2026-06-13 評価 AI レビュー)。ユーザー上書き希望時は随時反映。

### D-03 — parse 系は例外 throw でなく `Result<T, WireError>` を返す
- **理由**: リポ既存イディオム(`src/domain/shared/result` の `ok/err`)に揃える(consistency)。壊れ JSON / バリデーション違反を可視エラーとして返し黙って通さない(原則④)。block 無しは err でなく `ok(null)`(質問なし=visual_review 経路の正常系)。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計 / 2026-06-13 評価 AI レビュー)。ユーザー上書き希望時は随時反映。

---

## 棄却した案

### R-01 — wire 変換をドメイン `Question` のメソッド/ファクトリに生やす
- **棄却理由**: ドメインが wire(JSON シリアライズ)を知ることになり「回答モデル不変」「ドメインは技術から守る」(S7 PDF)に反する。境界モジュールに分離。

## 次工程 (S8) への引き継ぎ
- S5 I/F と突き合わせる公開関数: `parseQuestionBlock` / `serializeAnswers` / `parseAnswersBlock` / `validateAidlcQuestion`(Unit-03 emit・Unit-04 resume・Unit-06 UI が consume)。
- 技術層が実装すべきポート: live adapter の `extractSessionId`(Unit-03 / 純関数先出し)、`--resume` 再 spawn(Unit-04)、session-id の sqlite 永続。これらは S8。
- Unit-01 の残り半分(skill 焼き込み):S1/S6/S8/S9 skill 本文 + operating-model に emit/突合契約を 1 行参照で追記(S8)。
- ドメインが前提とする不変条件(統合時に壊さない):wire の「★おすすめちょうど 1」検証はこのモジュールが持つ(ドメイン不変条件ではない / S6 D-03)。web 側 UI も同検証を表示前提にする。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか:
- 暫定の解決方針:
- 棄却した案とその理由:

## 評価 AI レビュー記録(2026-06-13 / code-reviewer 評価エージェント)

純粋 wire コードゆえ Biz/プロダクト判断なし(責務契約①)。TDD で実装 → 評価 AI の敵対的レビュー(「壊す」前提)で確定検査。

- **初回判定**: SOUND-WITH-FIXES(WARNING:HIGH 1 + SHOULD-FIX 2 + NOTE 2)→ 全件トリアージし対応。
- **完了条件①〜④**: 全 PASS(対象実装済 / ドメイン層にフレームワーク import なし=そもそもドメインを触っていない / モック不要の単体テスト green / 不変条件=★おすすめ1・choiceIds 検証が型と関数で表現)。
- **反映した指摘**:
  - **B-1(Blocking)**: `validateAnswer` が `choiceIds` の要素型を未検証で `as string[]` の unsafe cast → `[1,null]` 等が通る(原則④違反)。`.every((c): c is string => ...)` で要素検証し cast を除去。テスト追加。
  - **S-2(Should-fix)**: 空 `choiceIds` の扱い。評価 AI の素案「非空必須」は **free 回答(note のみ)を壊す**ため不採用。正しい不変条件 =「**choice も note も無い真の空回答だけ弾く**」に補正実装(`free` は note で成立 / S2 D-04)。テスト追加。
  - **N-1(fix 昇格)**: 未クローズ fence が「ブロック無し」と誤分類され質問が黙って消える → `scanFence` を `absent|unclosed|content` の 3 値に再設計。`unclosed` は err。テスト追加。
- **S8 へ送る指摘(本 S7 のコード範囲外)**:
  - **S-1**: `background` 文字列内に裸の ``` 行があると fence 抽出が早期終了(LLM 統合の既知ハザード)。根治は **skill 契約(`aidlc-question` ブロックは 1 行 minified JSON で emit / 裸 ``` 行を含めない)** = Unit-01 の skill 焼き込み(S8)。現状コードは黙って通さず `bad-json`/`unclosed` の可視エラーに倒れる(原則④は満たす)。
- **by-design と確認(変更せず)**:
  - **N-2**: `free` でも `options` 非空 + ★おすすめちょうど 1 を要求するのは **S2 D-04 どおり正しい**(どんな質問でも AI が選択肢+★おすすめを出す。自由入力は常設の追加欄)。緩めない。
- **再検証**: 修正後 `bun test src/` = 173 pass / 0 fail、wire typecheck エラー 0。
</content>

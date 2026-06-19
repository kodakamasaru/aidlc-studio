# Unit-02: step 単一正本 & 作成時スナップショット

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-02](../s1/us-02-step-definition-canonical.md)
- Phase: 1(leaf / 基盤)
- ステータス: 確定

## 責務 (1〜2 行)
step 定義の正本を `vocab.ts`(domain)に一本化(v2 12・S2.5 退役・skillRef 実 dir)、web ラベルをそこから導出、skillRef の偽リンクを実 dir に解決。サイクル作成時に default を DB へ snapshot コピー。

> **★ スコープ注意(S5 評価 AI → 2026-06-12 ユーザー確定: 「ステップは可変」)**: **step 数は可変(実装済 / ROADMAP)**。よって `DEFAULT_STEPS` を **8(S2.5込)→ v2 12(S2.5 退役)** に更新するのは rigid な「移行」ではなく **default テンプレート値の変更**。app は可変 step を generic に扱うため回帰面は限定的。**step を直接参照する fixture/テストのみ追従**(完了条件 = 全 green)。本 Unit の主眼は S2.5 退役 + skillRef 実 dir 解決 + 単一正本化(+ §不変条件の snapshot domain 変更)。

## 外部依存
- なし(leaf)。Unit-03 が本 Unit の skillRef 解決を**呼ぶ側**(依存される側)。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| step 集合正本(`vocab`) | — | v2 12 step の集合 + 各 step の skillRef(実 dir 名) | — |
| skillRef→実 dir 解決 | `step` | 実 dir 名(例 `aidlc-s1-requirements`) | 未知 step は型で排除(branded `Step`) |
| 平易ラベル導出(web) | `step` | 表示ラベル(web `step-label` が vocab 集合から導出) | — |
| 作成時 snapshot(`cycle-service.createCycle`) | 新規 Cycle 入力 | default step 定義を DB に複製した Cycle | — |

## 不変条件
- ラベル文字列は **web 保持**(domain に表示文字列を入れない / S4 D-04)。vocab は集合 + skillRef のみ。
- snapshot 後はそのサイクルが DB を正とし、file default の後変更は波及しない。
- 既存 Step UI / 構成ビュー / `GET /api/steps/:step/skill` が回帰割れなし。
- **★ snapshot は domain 変更を伴う(S5 評価 AI)**: 現 `cycle-service.createCycle` は `{phaseId, step}` のみコピーし、`Phase` 型に StepDef snapshot フィールドが無い。本 Unit のスコープに **`Phase`(または `Cycle`)へ snapshot フィールド(label/skillRef/contracts)追加 + DB 列/シリアライズ追加**を含む(service だけの変更ではない)。

## この Unit 固有の 質疑応答ログ
### Q-01 — 平易ラベルの正本テキストの所在(vocab に machine-readable で持ち web は表示のみ / web に文字列保持)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定: 集合(どの step が在るか)の正本は vocab、表示文字列は web `step-label`。S4 D-04。)

---

## この Unit 固有の AI が独自に決めたこと と 理由
### D-01 — skillRef は domain(vocab)に置く / ラベルは web に置く
- **理由**: skillRef は domain identity(branded string)で domain 可。ラベルは UI 関心事で web。層を汚さず二重定義を消す(S4 評価 AI 指摘の反映)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## この Unit 固有の 棄却した案
### R-01 — snapshot を project-service に置く
- **棄却理由**: サイクル作成は `cycle-service.createCycle`。誤配置すると dead code(S4 HIGH 指摘)。

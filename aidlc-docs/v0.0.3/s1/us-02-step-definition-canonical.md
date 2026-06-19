# US-02: step 定義を file 単一正本に導出し、5 箇所の食い違いを解消する

## メタ
- 親: [s1/index.md](./index.md)
- 対応 S2 画面 (確定後に追記): —(既存 Step 設定/構成画面の表示元が正本に切り替わるのみ)
- ステータス: 確定
- scope: ①-b

## 3 視点

### なぜするか (Why)
step 定義が 5 箇所で食い違う(`vocab.ts` DEFAULT_STEPS=旧 8 / `kit/skills`=v2 12 / web `step-label`=混成 13 / DB `StepDef.label`=`step` 死蔵 / `skillRef=aidlc-${step}` が実 dir に解決しない偽リンク)。**これを解かないと ②-c の live prompt 合成が「どの step 集合・どのスキル本文を読むか」で破綻する。** skillRef が実 dir に解決することは ②(US-03)の硬い前提。

### UX へのインパクト
画面に出る step 名・順序・スキル本文が単一正本から導出され、表示と実行がズレない。サイクルごとに step をカスタムしたとき、その上書きだけが DB に乗り、default は方法論(file)のまま版管理される。

### 受け入れ条件 (AC)
- **file 単一正本**: `kit/skills` の v2 12 step 集合(S2.5 退役 / 平易ラベル / 実 dir skillRef)から導出した単一 constant が 1 つ存在し、`DEFAULT_STEPS` と web `step-label` がそこから導出(独自定義の重複が消える)。
- **S2.5 退役・S3 統一**: `DEFAULT_STEPS` が v2 12 step、S2.5 が消え、S3 の意味が v2(UI デザイン)に統一。
- **skillRef 実 dir 解決**: `skillRef`(例 `S1`)が実 dir(`aidlc-s1-requirements`)に解決するテストが pass(偽リンク解消)。
- **DB の役割は per-cycle snapshot(作成時コピー)**: **サイクル作成時に file default の全 step 定義を DB に snapshot コピー**(カスタムしなくてもコピーする)。以後そのサイクルは DB を正とし、カスタム(contracts・ラベル等)は DB を編集。file の後変更は既存サイクルに波及しない(再現性のピン留め)。`StepDef.label=step` 死蔵は、snapshot に平易ラベルが入ることで解消。
- 既存の Step 定義カスタム UI(US-06/v0.0.2)と Step 構成ビュー(`CycleStepsPage` / `StepSpecPage`)が新正本から表示しても回帰が割れない(235 + E2E 6 pass)。

## この US 固有の 質疑応答ログ

### Q-01 — 平易ラベル(人間向け step 名)の正本テキストはどこに置くか(constant にハードコード / kit/skills frontmatter の name から導出)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定方針: 単一 constant に step×平易ラベル×skillRef を持たせ、frontmatter とは二重化しない。frontmatter は本文表示用、constant が機械可読正本。)

---

## この US 固有の AI が独自に決めたこと と 理由

### D-01 — default=file テンプレート / per-cycle=DB snapshot(作成時コピー。全部 DB の正本化はしない)
- **理由**: file が「新規サイクルの default テンプレート(truth)」、DB が「そのサイクルの設定 snapshot(作成時に file からコピー → 以後分岐しうる状態)」。方法論 default の正本は file のまま(版管理)で、DB は不変 truth の複製ではなく分岐状態の実体化。①-a の境界ルールと整合。ユーザー補足(2026-06-12: カスタムしなくても作成時に default を DB へコピー)を反映。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — `StepDef.label` は snapshot に平易ラベルを実体で持つ(死蔵 `=step` を解消)
- **理由**: 作成時 snapshot に file default の平易ラベルがコピーされるので、`label` は常に意味ある値を持つ(`=step` の死蔵が消える)。per-cycle でラベルを変えたい場合はその snapshot 行を編集する(file への波及なし)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## この US 固有の 棄却した案

### R-01 — DB StepDef.label を正規ラベルの正本にする
- **棄却理由**: 方法論の default を DB に複製することになり、kit/skills 正本化と矛盾。版管理も失う(index Q-02 で却下)。

### R-02 — web step-label.ts を正本にする
- **棄却理由**: orchestrator/コード側が表示層(web)に依存する逆転が生じる。正本は方法論(file)側に置く。

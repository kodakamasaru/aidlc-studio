# S12 — ワークフロー改善 進行ログ

## メタ
- 工程: S12 (Workflow Improvement)
- 役割: メソドロジーエンジニア
- ステータス: 確定
- 入力参照: aidlc-docs/v0.0.5/s11-retrospective.md / aidlc-docs/v0.0.5/ledger.yml / BACKLOG.md §K
- 対象サイクル: v0.0.5
- 作成日: 2026-06-21
- 更新日: 2026-06-21

---

## 1. S11 全改善提案への具体策

### IMP-1 — precision-first 振り分けの step-contracts 制度化(優先度: 最高)

**S11 根拠**: Try-1 / P-S9-02(ゲートが発火しない欠陥)/ P-S9-03(詳細ファイル hardcode)  
**問題の本質**: 「存在確認」と「質の検証」と「意図の伝達」を同一ゲートに押し込んだことで、実運用経路を外したり、project-agnostic でなくなったりした。

**具体策(どこを変えるか)**:

1. **`kit/rules/aidlc-operating-model.md` に「ゲート設計 4 分割規則(Rule F-1)」を追記**:
   - 作ったか・形式・鮮度・連結 → **機械ゲート(floor)**。安価・決定論・ブレなし。
   - 中身の質・説得力 → **別 AI evaluator(producer≠checker)+ 落ちた理由**。ゲートでは偽物が通る。
   - 最終事業確信 → **人間**。
   - AI が「良い形」を理解する手がかり → **平易な intent 文**。濃い binding 規則を最小化し狙いの説明で代替する。
   - *注入経路*: aidlc-operating-model.md に焼く(composer が全スキルの prompt 先頭へ注入)。

2. **`src/domain/project/step-contracts.ts` に `gateDesign` 型フィールドを追加**:
   ```ts
   gateDesign?: {
     floor: string[];         // 機械ゲートが見る要件(存在/形式/連結)
     evaluatorFocus: string;  // evaluator が見る観点(質)
     intentText: string;      // AI への平易 intent 文
     firedByPaths: string[];  // done 提示経路の全列挙(空欄不可)
   }
   ```
   S8 の PR チェックリストに「新規ゲート = gateDesign 必須フィールドがあるか」を追加。欠ければ lint エラー。

3. **`kit/skills/aidlc-s8-integration/SKILL.md` の「完了条件」に追記**:
   「新規ゲートを実装する場合は gateDesign の 4 フィールドを step-contracts に宣言し、firedByPaths に done 提示経路を全列挙したことを確認すること(欠落は lint エラー)。」

**他 Step への影響**: S7(domain コードに step-contracts の型変更が波及)/ S9(evaluator に firedByPaths 追跡テストを追加)。  
**適用タイミング**: v0.0.6 S8 以降の新ゲート全件で即適用。既存ゲートは「触ったとき」順次 backfill(big-bang 禁止)。

---

### IMP-2 — `probe:rules` 拡張によるルール↔ゲート↔テスト drift 検出(優先度: 中)

**S11 根拠**: Try-2 / P-ARCH-01(単一正本なし / drift 検出なし)  
**問題の本質**: `aidlc-operating-model.md` が `live:check` をゲート名で参照しているが、そのゲートが実装・テストに存在するかを機械的に検証する仕組みが無い。

**具体策(どこを変えるか)**:

1. **`scripts/probe-rules.ts`(既存)を拡張**:
   - binding ルールのうち `gate_id:` タグ付きのものについて、(a) そのゲート実装が src/ に存在するか、(b) そのゲートを呼ぶテスト ID が test/ に存在するか、を機械チェック。
   - どちらかが欠けたら `exit 1`(= drift 検出)。
   - *注意*: ゲートが「連結しているか」だけを見る。中身の質は evaluator に委ねる(precision-first の適用)。

2. **`kit/rules/aidlc-operating-model.md` の binding ルール(Rule C-2 等)に `gate_id:` タグ記法を追記**。例:
   ```
   <!-- gate_id: live:check test_id: check-live-dossier.test -->
   ```

3. **`probe:rules` を S9/CLOSE ゲートに組み込む**: `live:check` と同列にして、drift があれば S9 を自動 block する。

**他 Step への影響**: S9(CLOSE ゲートに追加)/ S12(probe:rules が S12 確定前の必達チェックになる)。  
**適用タイミング**: v0.0.6 S9 で適用。まず binding ルールに `gate_id:` タグを付ける作業(S7/S8 で 1 US 化)してから S9 CLOSE に組み込む。

---

### IMP-3 — step-contracts 単一正本化の規律焼き込み(優先度: 中)

**S11 根拠**: Try-3 / P-ARCH-01(3 重符号化 / 単一正本なし)  
**問題の本質**: AI-DLC のあるべき挙動が kit 散文・機械ゲート・UI の 3 箇所に別々に符号化され、片方を直しても他方が追従しない。

**具体策(どこを変えるか)**:

1. **`kit/rules/aidlc-operating-model.md` に「単一正本規律(Rule F-2)」を新設**:
   > 新しい方法論不変条件は `src/domain/project/step-contracts.ts` に型付きで宣言し、composer 散文もゲートもそこから導出する。新規不変条件を散文+別ゲートの二重で足すことを禁止する。

2. **S8 PR チェックリストに「新規不変条件 = step-contracts 起点か」を追加**。二重符号化を PR レビューで即検出できるようにする。

3. **`requiresLiveEvidence` を実例として README に記載**: 既に step-contracts → composer 役割 + evidence-gate-check + engine-service の 3 者が全て step-contracts の値を読む構造になっている。これが雛形。

4. **既存の二重符号化は「触ったとき」順次 step-contracts 駆動へ寄せる**。v0.0.6 S7 で 1〜2 件を実例として移行し、型を確立してから残りへ波及する(BACKLOG §K (3b) 橋の型実証)。

**他 Step への影響**: S7(step-contracts 型定義の変更が domain コードに波及)/ S8(PR チェックリスト追加)。  
**適用タイミング**: Rule F-2 は v0.0.6 S12 で kit/rules 更新を即適用。橋の型実証は v0.0.6 S7 で 1 件。残りの移行は随時(big-bang 禁止)。

---

### IMP-4 — engine-service が S9 complete 受信時に `live:check` を自動発火(優先度: 最高 / P36・P37 hard 化)

**S11 根拠**: Try-4 / P-S9-01(live-deferral 再発)/ P36・P37  
**問題の本質**: `live:check`(dossier 不在なら exit 1)は本サイクルで導入済み。しかし AI が dossier を作らないまま「緑」と自己申告するケースを、**AI ではなくサーバ側から** `live:check` を呼び出す経路が無い。AI が呼び出しを skip できてしまう。

**具体策(どこを変えるか)**:

1. **`src/app/services/engine-service.ts` に `onStepComplete` フック追加**:
   ```ts
   if (step.contracts.requiresLiveEvidence) {
     const result = await runLiveCheck(run.id, step.id);
     if (result.status === 'FAIL') {
       await this.stalledWithReason(run, 'live:check failed — dossier missing or incomplete');
       return;  // done 遷移を阻止
     }
   }
   ```
   AI が「done にしてください」と言っても、engine-service が S9 complete イベントを受けた時点で `live:check` を自動実行し、FAIL なら `stalled` に差し戻す。AI は `live:check` を skip できない。

2. **テスト追加**: `engine-service.test.ts` に「requiresLiveEvidence=true な step を done にするとき dossier が無ければ stalled になること」を deterministic gate として追加。

3. **`kit/rules/aidlc-operating-model.md` の Rule C-2 を更新**: 「`live:check` は AI が能動的に呼ぶ義務ではなく、engine-service が step complete 時に自動実行する(AI による skip 不可)」と明記。

**他 Step への影響**: S8(engine-service の変更が integration テストに波及)/ S9(done 遷移の全経路が `live:check` を通る)。  
**適用タイミング**: v0.0.6 S1 で US 化して即着手(first-class US として commit)。P36/P37 が 2 サイクル連続 carried のため、これ以上延期すると SKILL.md「やってはいけないこと」に抵触する。

---

### Try-1〜4 補足: 既出再発チェックへの対応

v0.0.4 S11 で記録された P36/P37 は v0.0.5 でも再発した。S11 結論が示す通り、soft 規範追加は無効と判明している。v0.0.6 での IMP-4(engine-service 自動発火)を US として ledger に carried(into: v0.0.6)として記録し、first-class US として着手すること。

---

## StepDef 改善一覧

| # | 対象 Step | 変更種別 | 変更内容 | 影響を受ける他 Step | S11 提案番号 | 優先度 |
|---|----------|---------|---------|-------------------|------------|-------|
| 1 | S8 | 変更(完了条件追加) | 新規ゲートに gateDesign 型フィールド必須 / PR チェックリスト追加 | S7(型波及) / S9(テスト追加) | IMP-1 | 最高 |
| 2 | S9 | 変更(CLOSE ゲート追加) | probe:rules を CLOSE ゲートに組み込み / drift あれば自動 block | S8(タグ付け先行) | IMP-2 | 中 |
| 3 | S7 | 変更(実装追加) | engine-service onStepComplete + live:check 自動発火 | S8(integration テスト) / S9(done 経路全通過) | IMP-4 | 最高 |
| 4 | S1 | 変更(完了条件追加) | seed 系 US は「即確認できる条件」を Q&A で確定してから S5 に進む | S5〜S7(再定義リスク低減) | BT-04 根本原因 | 推奨 |

## 契約・テンプレート更新一覧

| # | 対象 | 変更内容 | 適用タイミング | S11 提案番号 |
|---|------|---------|-------------|------------|
| 1 | kit/rules/aidlc-operating-model.md | Rule F-1(ゲート設計 4 分割)・Rule F-2(単一正本規律)・Rule C-2 更新(engine-service 自動発火) | v0.0.6 S12 で kit/rules 更新 | IMP-1 / IMP-3 / IMP-4 |
| 2 | kit/skills/aidlc-s8-integration/SKILL.md | 完了条件に「gateDesign 必須フィールド確認」を追記 | v0.0.6 S8 から即適用 | IMP-1 |
| 3 | kit/skills/aidlc-s1-requirements/SKILL.md | やってはいけないことに「seed 系 US は S1 で即確認条件を Q&A 確定してから S5 に進む」を追記 | v0.0.6 S1 から即適用 | BT-04 |
| 4 | src/domain/project/step-contracts.ts | gateDesign 型フィールド追加 | v0.0.6 S7 で実装 | IMP-1 |
| 5 | src/app/services/engine-service.ts | onStepComplete フック + live:check 自動発火 + stalledWithReason 差し戻し | v0.0.6 S7 で US 化・実装 | IMP-4 |

## 新規 Policy / Extension 提案

| # | 提案名 | 目的 | 適用範囲 | S11 分析根拠 | 優先度 |
|---|-------|------|---------|------------|-------|
| 1 | precision-first ゲート設計規律 | 存在=機械ゲート / 質=evaluator / 狙い=平易 intent 文 の 4 分割を全ゲート設計に強制 | 全 Step のゲート実装(S7/S8 以降) | P-S9-02 / P-S9-03 / BACKLOG §K | 最高 |
| 2 | engine-service live-check Policy | S9 complete を AI 自己申告ではなくサーバ起点で live:check をトリガーする | S9 以降(requiresLiveEvidence=true な Step) | P-S9-01 / P36 / P37 | 最高 |
| 3 | 単一正本規律(step-contracts 起点) | 新規不変条件を step-contracts に型付きで宣言し二重符号化を禁止 | 全新規方法論不変条件 | P-ARCH-01 / BACKLOG §K (3a) | 中 |

---

## 2. 次サイクル(v0.0.6)改善優先リスト

### 必須(v0.0.6 で必ず適用)

1. **IMP-4: engine-service S9 complete → `live:check` 自動発火**
   - **機械ゲート化**: AI が skip できない構造にする。
   - v0.0.6 S1 reconcile で ledger に入っているか確認 → S5 以降で US 化して実装。
   - precision-first: 「dossier が存在するか」= 機械ゲート(floor)。「dossier の内容が説得力あるか」= evaluator。

2. **IMP-1: step-contracts に `gateDesign` 型フィールド追加 + S8 PR チェックリスト更新**
   - **機械ゲート化(lint)**: firedByPaths が空欄なら型エラー。
   - v0.0.6 S8 以降の新規ゲートに即適用。
   - precision-first: 「フィールドが揃っているか」= lint(機械)。「firedByPaths が実際の経路を網羅しているか」= evaluator(コードレビュー AI)。

3. **P-ARCH-01 Rule F 焼き込み: operating-model に単一正本規律を追記**
   - S12 規範として kit 更新。headless 実行では composer が注入するため即反映。
   - v0.0.6 S7 で `requiresLiveEvidence` に倣い既存不変条件 1 件を step-contracts 駆動へ移行して型を確立する(BACKLOG §K (3b))。
   - **平易 intent**: 「新しい AI の行動規則は型付きデータで 1 箇所に書く。散文と別ゲートで二重に書かない。」

### 推奨(v0.0.6 で試験適用)

4. **IMP-2: `probe:rules` 拡張(ルール↔ゲート↔テスト連結 drift 検出)**
   - S7/S8 で `gate_id:` タグ付けを 1 US 化してから S9 CLOSE ゲートに組み込む。
   - **機械ゲート化**: 連結の有無だけを見る。質は evaluator に委ねる(precision-first)。

5. **P-ARCH-02: reconcile/ledger CLI の repoPath パラメータ化**
   - 最初の外部 PJ 導入前に完了させる。影響範囲: reconcile-check.ts / migrate-root-ledger.ts のみ。
   - precision-first: 「repoPath が引数として渡されているか」= TypeScript 型チェック。「別 PJ で正しく動くか」= seed 跨サイクル fixture のシナリオテスト(evaluator)。

6. **BT-04 再発防止: S1 スキルへの seed 系 US 確定チェックリスト追記**
   - aidlc-s1-requirements/SKILL.md の「やってはいけないこと」に追記。
   - **平易 intent**: 「seed / fixture 系の US は S1 で『実 AI なしで即確認できる条件』と『データの中身の定義』を Q&A で確定してから S5 に進む。」

### 保留(v0.0.7 以降または条件付き)

7. **IMP-3(3c): 既存の散文+ゲート二重符号化を step-contracts 駆動へ全件移行**
   - 橋の型実証(IMP-3 推奨 v0.0.6 で 1〜2 件)が完了してから随時。big-bang 禁止(BACKLOG §K (3c))。

8. **BACKLOG §K (3b) 後の残り不変条件移行**
   - IMP-3 推奨の型確立が完了してから随時。v0.0.7 以降を目安とするが前倒し可能。

---

## 3. ledger クローズ表

`aidlc-docs/v0.0.5/ledger.yml` の全エントリを監査した結果。

| id | 旧 state | 新 state | 根拠 |
|----|---------|---------|------|
| SPLIT-v005-scope | done | done(変更なし) | S1 で確定済 |
| AUTO-ORCH-core | carried into:v0.0.6 | carried into:v0.0.6(変更なし) | v0.0.6 正当 carry forward。次 S1 reconcile で拾う |
| AUTO-ORCH-monitoring-parallel | carried into:v0.0.7 | carried into:v0.0.7(変更なし) | v0.0.7 正当 carry forward |
| O3-live-resume-continuation-unproven | carried into:v0.0.6 | carried into:v0.0.6(変更なし) | AUTO-ORCH-core に内包。v0.0.6 で実証 |
| F3-project-management-ui | carried into:v0.0.7 | carried into:v0.0.7(変更なし) | v0.0.7 正当 carry forward |
| S11-IMP5-retro-metrics-autocollect | carried into:v0.0.7 | carried into:v0.0.7(変更なし) | v0.0.7 正当 carry forward |
| PLATFORM-auto-evidence-production | done | done(変更なし) | s9/live-gate/auto-production/ で実証済 |
| **PLATFORM-evidence-separation-and-stance** | **carried into:v0.0.5** | **done** | ★今回更新。下記根拠参照 |
| BT-04-seed-for-immediate-verification | done | done(変更なし) | seed:suite 実機確認済 / 760 pass |
| S11-P04-evaluator-mechanical-gate | done | done(変更なし) | US-01/Unit-01 で実装・消し込み済 |
| IMP-s10-self-contained-review-packet | done | done(変更なし) | SKILL.md + operating-model Rule C-3 焼き込み済 |
| P-S9-03-gate-hardcoded-paths | done | done(変更なし) | resolveGatePaths で修正済 / 760 pass |
| P-ARCH-01-methodology-platform-link | carried into:v0.0.6 | carried into:v0.0.6(変更なし) | v0.0.6 正当 carry forward |
| P-ARCH-02-cross-cycle-project-param | carried into:v0.0.6 | carried into:v0.0.6(変更なし) | v0.0.6 正当 carry forward |

**PLATFORM-evidence-separation-and-stance を done にする根拠**:
- コード実装: `cycle-service.generatorRoleFor` が `verification OR requiresLiveEvidence` で generator 化 → S7/S8/S9 既定に `verification(LIVE_EVIDENCE_OBSERVATIONS)` 付与 → 技術 step は「作る run(generator)≠監査する run(evaluator)」が別 run として spawn される。
- evaluator に `EVALUATOR_AUDITOR_STANCE`(独立レビュア / 非コード人を説得 / Rule C-3)を注入。
- 決定論テスト(`gen-gate-eval.test` 「requiresLiveEvidence WITHOUT verification → SEPARATE evaluator run」)で generator.id ≠ evaluator.id を実証。751 pass。
- **live 端到達**: US-01 PASS 経路 live 実証(runId `2906b197…` / dossier `s9/live-pass/`)において、engine-service が `generatorRoleFor` → generator run を spawn し、evaluator run を別 run として起動して S9 が done まで通ったことを確認。S9-run.log(132KB)と S9-manifest.json にて generator run 完了 → evaluator run(別 runId)への連鎖が記録されている。
- タスク仕様: 「US-01 の PASS 経路 live 実証で gen→eval が実走したので、evaluator 分離の live 端到達は確認済として扱ってよい」。

### ledger クローズ状態サマリー

- 全エントリ数: 14
- done: 8(SPLIT-v005-scope / PLATFORM-auto-evidence-production / PLATFORM-evidence-separation-and-stance ← 今回 done / BT-04-seed-for-immediate-verification / S11-P04-evaluator-mechanical-gate / IMP-s10-self-contained-review-packet / P-S9-03-gate-hardcoded-paths — 計 7 件。SPLIT-v005-scope 含め 8 件)
- carried into:v0.0.6: 4(AUTO-ORCH-core / O3-live-resume-continuation-unproven / P-ARCH-01-methodology-platform-link / P-ARCH-02-cross-cycle-project-param)
- carried into:v0.0.7: 3(AUTO-ORCH-monitoring-parallel / F3-project-management-ui / S11-IMP5-retro-metrics-autocollect)
- dropped: 0
- **本サイクル(v0.0.5)を指す carried(into: v0.0.5): 0 件** ← 確認 OK

---

## 4. 次サイクル(v0.0.6)S1 引き継ぎサマリー

### 今サイクル(v0.0.5)の概要

| 項目 | 内容 |
|------|------|
| バージョン | v0.0.5 |
| 期間 | 2026-06-20〜2026-06-21(実質 2 日) |
| 総 US 数 | 9(US-01〜US-09) |
| S10 承認 / 却下 | 9 / 0 |
| 最終テスト pass 数 | 760(seed 刷新 + P-S9-03 修正後) |
| live BLOCK 実証 | PASS — runId `fa85f89b…` / dossier `s9/live-gate/` |
| live PASS 実証 | PASS — runId `2906b197…` / dossier `s9/live-pass/` |
| 本サイクルで修正した実バグ | 3 件(deterministic gate hardcode / seed カタカナ長音符 / completeness retry 収束) |
| バックトラック | BT-04(US-04 を S1 まで後退 / seed 定義を「即確認データ生成」に再構築) |
| サイクル目的 | 検証/台帳の土台 9 US(IMP1 / seeded+安価 live / binding probe / housekeeping) |

**主要な確定事項**:
- D-04(分割): v0.0.5 = 検証/台帳土台 9 US、v0.0.6 = 自走エンジン core、v0.0.7 = 監視 SDK・worktree 並行・F3・IMP5。
- BT-04 再確定: seed = 状態だけでなく実 skill 出力形のもっともらしい本文+証拠まで生成する義務。
- precision-first 原則: 存在=機械ゲート / 質=evaluator / 最終確信=人間 / 狙い=平易 intent 文。

### v0.0.6 で適用する改善

1. **[最優先] IMP-4**: engine-service が S9 complete 受信時に `live:check` を自動発火し FAIL なら `stalled` 差し戻し。AI が skip できない構造を実装。v0.0.6 S1 で US 化確認(reconcile ゲートで ledger に入っているか確認してから S5 に進む)。
2. **[最優先] IMP-1**: 新規ゲートには `gateDesign` 型フィールド(floor / evaluatorFocus / intentText / firedByPaths)を step-contracts に必須宣言。S8 PR チェックリストに追加。
3. **[重要] P-ARCH-01 Rule F**: operating-model に単一正本規律(Rule F-1/F-2)を追記。v0.0.6 S7 で既存不変条件 1 件を step-contracts 駆動へ移行して型を確立する。
4. **[推奨] IMP-2**: `probe:rules` に `gate_id:` タグ連結チェックを追加し S9 CLOSE ゲートに組み込む(S7/S8 でタグ付け先行)。
5. **[推奨] P-ARCH-02**: reconcile/ledger CLI の repoPath パラメータ化。外部 PJ 導入前に完了。
6. **[推奨] BT-04 再発防止**: aidlc-s1-requirements/SKILL.md の「やってはいけないこと」に seed 系 US の S1 確定チェックリストを追記。

### 次サイクルの注意点(再発防止)

1. **P36/P37 live-deferral の再演 — IMP-4 が最優先**:
   v0.0.5 S9 で AI 自身が「live-deferral を機械ゲートで潰す」実装工程において live-deferral を再演した(P-S9-01)。P36/P37 は 2 サイクル連続で soft 規範追加にもかかわらず再発した。engine-service 自動発火(IMP-4)を v0.0.6 で US 化しないと v0.0.6 S9 でも同じことが起きる可能性が高い。**テキストでなく構造が行動を変える**。

2. **新規ゲート設計時は firedByPaths を必ず全列挙する**:
   P-S9-02 の根因は done 提示経路が 3 つあるのに 1 経路のみにゲートを配線したこと。`gateDesign.firedByPaths` フィールドがあれば型チェック時に気づける。次サイクル以降は新規ゲートを書くたびにこのフィールドを必ず埋める。

3. **S1 で seed / fixture 系 US を着手する前に「即確認できる条件」を Q&A で確定する**:
   BT-04 の根本原因は S1 で「即確認」の意味(実 AI なし + データの中身まで作る)を確定しないまま S5 に進んだこと。次サイクルでも seed 系 US が発生した場合は S1 Q&A で必ず確定する。

4. **方法論の改善を kit にだけ焼いても headless には届かない**:
   kit/rules 更新は composer 注入経路を通じて headless にも届く。ただし live は sandbox の kit コピーを読むため、kit 編集後は `verify:test`(毎起動同期)を経由して再同期が要る。S12 確定前に `probe:rules` を 1 度実行して binding ルールが headless に到達するか確認すること。

5. **ledger の id 系譜を切らない**:
   P-S8-01 で 3 サイクル跨ぎの id 不一致が reconcile-check で検出された。改善提案を次サイクルへ送るときは旧 id を新エントリの `origin:` に必ず記載する。v0.0.6 S1 の reconcile で歴史的 carried(into: v0.0.x / 具体 target なし)に具体 into を付け直すか done 消し込みを行う。

6. **v0.0.6 S1 reconcile の必達チェック**:
   - AUTO-ORCH-core / O3-live-resume-continuation-unproven / P-ARCH-01 / P-ARCH-02 の 4 件(into:v0.0.6)を US 化して ledger から消し込む。
   - IMP-4 の engine-service 自動発火を新 US として追加する。
   - 歴史的 carried(into: v0.0.x 非具体 / S7-C1〜C4 等)への具体 into 付け直しまたは done 消し込みを実施する。

---

## 質疑応答ログ

本サイクル S12 は S11 consolidated 分析・ledger.yml・BACKLOG.md §K・SKILL.md に基づいて AI 自走で完成させた。S11 の IMP-1〜4 が具体策レベルまで記述されており、ledger 監査・優先順位付け・引き継ぎサマリーは全てデータに基づく技術判断の範囲(D-01 参照)。人間への Q カード発行は不要と判断した。

---

## AI が独自に決めたこと と 理由

### D-01 — S12 を Q カードなしで AI 自走完成させた
- **理由**: S11 consolidated が IMP-1〜4 / Try-1〜4 を具体策レベルまで記述しており、ledger 監査・優先順位付け・引き継ぎサマリーは全てデータに基づく技術判断の範囲。事業判断(IMP の採否・実施バージョン)は S10 承認済の改善方向に沿っており、新たな判断材料は不要。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — PLATFORM-evidence-separation-and-stance を done に更新
- **理由**: `into: v0.0.5` で carried のまま放置すると本サイクル内の未解決 carried になり SKILL.md「やってはいけないこと」に抵触する。コード実装(cycle-service / gen-gate-eval.test 751 pass)は完了。live 端到達は US-01 PASS 経路(runId `2906b197…`)で gen→eval の別 run 起動を実機確認済。タスク仕様が「確認済として扱ってよい」と明示している。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — IMP-4 を「最優先」に格上げし v0.0.6 S1 で US 化を必達とした
- **理由**: P36/P37 は v0.0.4 S11 → v0.0.5 S9 と 2 サイクル連続で再発した。SKILL.md「やってはいけないこと」が「同一趣旨が 2 サイクル連続 carried なら US 化必須」と規定しており、これ以上 soft 規範追加で済ませることは許されない。engine-service 自動発火は P36/P37 の唯一の hard 化手段。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-04 — IMP-3(3c): 既存二重符号化の全件移行を「保留」に分類
- **理由**: 橋の型実証(v0.0.6 で 1〜2 件移行)が完了していない状態で全件移行しても整合性が取れない。big-bang 禁止(BACKLOG §K (3c))に従い、型確立後に随時移行する。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-05 — P-ARCH-02 repoPath パラメータ化を「推奨」に留めた
- **理由**: 現在の studio dogfood では cwd 固定で正しく動いており、外部 PJ 導入前は実害がない。必須ブロッカーではないため推奨止まりとした。最初の外部 PJ 導入タイミングで先行して完了させる(BACKLOG §K の trigger 定義と一致)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-06 — IMP-1 の `gateDesign` フィールド名と 4 サブフィールドを具体化した
- **理由**: S11 Try-1 は「4 つの担当を必ず明示する」と述べるに止まり、型フィールドの具体名は未定義だった。`floor / evaluatorFocus / intentText / firedByPaths` はそれぞれ「機械ゲートが見る要件」「evaluator が見る観点」「AI への平易 intent 文」「done 提示経路の全列挙」に対応する最短かつ意味が明確な名前として選定した。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 棄却した案

### R-01 — probe:rules 拡張を「必須」に格上げする案
- **棄却理由**: gate_id: タグ付け作業(S7/S8 で 1 US 化)が先行して必要なため、S9 CLOSE 組み込みは S7/S8 の前提が整ってから。先に必須と宣言すると S1 reconcile で作業順が矛盾する。

### R-02 — PLATFORM-evidence-separation-and-stance を dropped にする案
- **棄却理由**: コード実装は完了しており、live 端到達も US-01 PASS 経路で確認済。dropped(不要・断念)ではなく done(実装完了)が正確な状態。done 記録として残す価値がある。

### R-03 — IMP-1〜4 を全て「必須」に分類する案
- **棄却理由**: IMP-2(probe:rules)と IMP-3(単一正本規律の全件移行)は前提作業(タグ付け / 型確立)が必要なため、先行作業完了前に「必須」と宣言すると作業順の矛盾が生じる。推奨に留めて前提が整ったタイミングで着手する方が現実的。

---

ステータス: **確定** (サイクル v0.0.5 CLOSED — 2026-06-21)

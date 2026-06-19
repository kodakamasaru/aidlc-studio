# S12 — ワークフロー改善 進行ログ / v0.0.4

## メタ
- 工程: S12 (Workflow Improvement)
- PhaseGroup: Improvement(最終工程 = サイクル最終 Step)
- 役割: メソドロジーエンジニア
- ステータス: **確定**(2026-06-20 / Q-01 承認: 必達ゲート + IMP1 US 化 → **v0.0.4 CLOSED**)
- 入力参照: [s11-retrospective.md](./s11-retrospective.md), [ledger.yml](./ledger.yml), [v0.0.3/s11](../v0.0.3/s11-retrospective.md), [v0.0.3/s12](../v0.0.3/s12-improvement.md)
- 対象サイクル: v0.0.4
- 作成日: 2026-06-20
- 更新日: 2026-06-20

> **この Step は何をするか**: S11 の改善提案を AI-DLC の SKILL.md / operating-model / ledger 規約という**実体に焼き込む**。本サイクルの S11 は「バグ多すぎ」の真因を ① live 動作確認の deferral(不遵守 / P36)② 解決策(機械ゲート)が2サイクル跨ぎで defer された構造(P37/P38)と特定した。S12 はこの**2つの構造を断つルール**を恒久化する。本 Step を `確定` にした瞬間 v0.0.4 は **CLOSED**。

---

## ★ S11 真因と S12 の応答(P38 を S12 自身が再演しないために)

v0.0.3 S12 は「S12 = テキスト根治の範囲」と自らをスコープし、機械ゲート(`S11-P04`)を「infra ゆえ範囲外」と defer した。それが v0.0.4 で 22 バグを招いた(P37/P38)。**S12 が同じ轍を踏まないため、本 S12 は「テキストで焼けるもの」だけでなく「テキストで焼けない構造改善を確実に次サイクル US 化する escalation 則」自体をテキストで焼く**(= S12 にできる最大の構造的貢献)。機械ゲート本体の実装は v0.0.5 IMP1(first-class US)。

---

## 適用済みの変更(本サイクルで実ファイルに焼き込み済)

### StepDef 改善一覧
| # | 対象 Step | 変更種別 | 変更内容 | 影響を受ける他 Step | S11 提案 | 優先度 |
|---|----------|---------|---------|-------------------|---------|-------|
| 1 | S9 (検証) | 完了条件 追加 | 完了条件 **(6) live 縦経路 e2e 1本完走**(使い捨てリポで `launch→質問→回答→resume→レビュー→承認` を実フロー走破 / 未完走なら確定不可 / 検出方法併記)| S10(本来人間が踏む live を S9 へ前倒し)| #1 (P36) | 最高 |
| 2 | S11 (振り返り) | 進め方 + 禁則 追加 | 進め方0に「過去全サイクルの S11/s12/ledger と本サイクル再発の突合」+「完成度クリティック AI 自走(4観点)」/ 禁則に「0 unresolved を検出方法なしに書く」「過去改善提案突合のスキップ」 | なし | #5(T42/T43)・P41 | 高 |

### 契約・テンプレート(横断ルール)更新一覧
| # | 対象 | 変更内容 | 適用タイミング | S11 提案 |
|---|------|---------|-------------|---------|
| A | operating-model.md 新規 § **Rule C** | live 動作確認は各技術 step の `done` 定義そのもの(人間にテスター役を肩代わりさせない / 機械強制は v0.0.5 IMP1)| 次サイクル即適用 | #1 / T39/T40 |
| B | operating-model.md 新規 § **Rule D** | binding ルールは「リンク参照」でなく「composer 本文注入」で配送(追加時に headless 到達を probe)| 次サイクル即適用 | #2 / T-B |
| C | operating-model.md 新規 § **Rule E** | 改善提案の deferral 防止(構造改善は backlog でなく次サイクル US / 2サイクル連続 carried は自動 escalate)| 次サイクル即適用 | P37/P38 / T41 |
| D | ledger.md 新規 § **改善提案の deferral 防止** | `escalation:` フィールド規約 + reconcile ゲート拡張(過去全サイクルの改善提案 vs 再発の突合)| 次サイクル S1 reconcile から | P37/P38 / T41/T42 |
| E | s12 SKILL.md 禁則 是正 | 完了条件の自己矛盾(carried=ゼロ vs into:次)を established 解釈へ明文化 + 「infra を S12 範囲外で defer」禁止 | 本サイクルから | P38 自己適用 |

### 新規 Policy / Extension 提案(= 上記 Rule C/D/E に集約済)
| # | 提案名 | 目的 | 適用範囲 | S11 分析根拠 | 優先度 |
|---|-------|------|---------|------------|-------|
| P-C | live done ゲート(Rule C)| live 確認の deferral(P36)を done 定義に組み込んで封じる | live 経路に触れる全技術 step | P36 / 22 バグの分布 | 最高 |
| P-E | deferral 防止 escalation(Rule E + ledger)| 構造改善が毎サイクル沈む逆選択(P38)を断つ | 全サイクルの改善提案ライフサイクル | P37/P38 / `S11-P04` の2回 defer | 最高 |

---

## 次サイクル改善優先リスト(※ Q-01 で人間承認待ち)

### 必須(次サイクルで必ず適用)
1. **`S11-IMP1-live-evidence-hard-gate`(機械ハードゲート + 安価 live + per-step live)を v0.0.5 の first-class US として commit**(backlog 放置でない / Rule E・escalation 則の初適用)。`S11-P04` の事実上の後継 = 3度目の defer を禁止。
2. **operating-model Rule C/D/E + ledger escalation 則の遵守**(本 S12 で焼き込み済 / 次サイクル即適用)。
3. **次サイクル S1 の reconcile 拡張**: 過去全サイクルの S11 改善提案 vs 再発を突合(同じ Problem が再出していないか)。

### 推奨(次サイクルで試験適用)
1. **メトリクス自動収集**(`S11-IMP5`): 検出ゲート別バグ・Step 別所要・Q&A 件数を run/HumanTask store から自動集計し S11 入力に供給。
2. **binding ルール配送 probe のチェックリスト運用**(`S11-IMP2` / Rule D の実運用)。

### 保留(将来のサイクルで検討)
1. (なし — 構造改善を「保留」に沈めること自体が P38 の病。保留に置くなら理由を明記する)

---

## ledger.yml クローズ状態
- 全項目数: **22**(実体16 = BT-01〜05 / O5 / S11-process-pointer / O3-resume / S9-housekeeping / F3-pmui / AUTO-ORCH / F12-badge / TEST-ENV / S11-IMP1/IMP2/IMP5 + 確定 D-NN 6 = S11-D01〜03 / S12-D01〜03)
- done: **13**(BT-01/02/03/04/05 + O5 + S11-process-problems-pointer + S11-D01〜03 + S12-D01〜03)
- dropped: **0**
- carried(残): **9** — すべて `into: v0.0.5` 明示(自サイクル `into: v0.0.4` の未消し込みは **0**)
  - O3-live-resume / S9-housekeeping-O4-O7 / F3-project-management-ui / AUTO-ORCH-durable-self-healing / F12-thread-badge-consistency / TEST-ENV-seeded-cycle-states / **S11-IMP1**(escalation 付・US 化必須)/ S11-IMP2 / S11-IMP5
- carried がゼロであることの確認: **NG(意図的・established)** — 下記参照

> **完了条件 (3) の解釈(established workflow / v0.0.3 S12 D-03 と同一)**: `into:` が**当該サイクル(v0.0.4)**を指す carried = **0**(自サイクル消し込み義務はすべて done)。`into: v0.0.5` の 9 件は次サイクル S1 の reconcile ゲートが拾う正当な前送り。本 S12 で SKILL.md の自己矛盾文言(「carried 全ゼロ」)を established 解釈に是正済(変更 E)。

---

## 次サイクル S1 引き継ぎサマリー

### 今サイクル(v0.0.4)の概要
- バージョン: v0.0.4 / US 数: **8**(US-01〜08 / US-08 は S9→S1 手戻りで追加)
- 品質評価: S10 最終承認 **8/8(100%)** + AI 判断 D-01/D-02 承認 / 決定論 **661** + E2E **35** + live **8** green / 未解決 CRITICAL・HIGH **0**(ただし検出は S10 の手動 opportunistic ── systematic な live 縦経路網羅は未 = false confidence の余地 / P41)。
- **最重要所見**: 「バグ多すぎ」の真因 = live 動作確認の deferral(不遵守 / P36)+ 解決策(機械ゲート)の2サイクル跨ぎ defer(P37/P38)。検出が自動ゲート(S9=3件)をすり抜け人間の最終ゲート(S10=22件)に集中。
- 主要な判断: S11-D01〜D03 / S12-D01〜D03(下記)。

### 次サイクル(v0.0.5)で適用する改善
1. **`S11-IMP1` を US 化して実装**(機械ハードゲート + 安価 live + per-step live)。Rule E により backlog 不可・必達。
2. **Rule C/D/E + ledger escalation を全工程で遵守**。
3. **reconcile 拡張**(過去全サイクル改善提案の再発突合)を S1 着手時に実施。

### 次サイクル(v0.0.5)の注意点
1. **reconcile ゲート**: 着手前に v0.0.4 ledger の carried 9 件を全件 reconcile。特に **`S11-IMP1` は「単なる carried」でなく US 化必須**(escalation / 未 US 化なら S1 確定不可)。
2. **live 確認を deferral しない**(Rule C): live 縦経路は各 step の done 定義。人間に QA を肩代わりさせない。IMP1 完成までは AI が毎 S9 で手動完走する。
3. **テキストで焼いたルールは headless に届くか probe**(Rule D)。今サイクルで Rule C/D/E を operating-model に足したので、composer 注入で実際に live プロンプトに載るかを確認する。

---

## 質疑応答ログ

### Q-01 — 次サイクル改善優先リストの承認 + live-gate のコスト合意
- 文脈: 必須=IMP1 の US 化 / Rule C-E 遵守 / reconcile 拡張、推奨=メトリクス自動収集・配送 probe。**live 縦経路 e2e を S9 完了条件(6)= 毎サイクル必達のハードゲート**にしたため、各サイクルに live 実行コスト(数十秒〜10分 + seeded states 整備)が常時かかる。この優先順位とコストで確定してよいか。
- **回答**(人間の回答を AI が記入 / 2026-06-20):
  > **必達ゲート + IMP1 を US 化(推奨どおり)** を承認。live 縦経路 e2e を S9 完了条件(6)= 毎サイクル必達のハードゲートとし、毎サイクルの live 実行コストを許容する。機械ゲート本体 IMP1 は v0.0.5 の first-class US として commit(backlog 不可・3度目の defer 禁止)。
- **確定**(AI 記入):
  > 優先リストを「必須=IMP1 の US 化 / Rule C-E 遵守 / reconcile 拡張、推奨=メトリクス自動収集・配送 probe」で確定。live-gate は必達。S12 を確定 → **v0.0.4 CLOSED**。

---

## AI が独自に決めたこと と 理由

### D-01 — S12 の最大貢献を「escalation 則自体をテキストで焼く」と定めた
- **理由**: P38 = 構造改善が毎サイクル defer される。S12 が「テキストしか焼けない」なら、せめて「構造改善を確実に次サイクル US 化させる escalation 則」をテキストで焼けば、S12 のテキスト性を逆手に取って deferral ループを断てる(operating-model Rule E + ledger 規約)。S12 が P38 を自己再演しないための設計判断。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**(レビューで人間が覆したときのみ): なし

### D-02 — live 縦経路 e2e を S9 の必達完了条件(6)としてハードゲート化(テキスト + 手動運用)した
- **理由**: P36 の真因(live deferral)を done 定義に組み込む。機械強制(IMP1)完成までの空白を、AI 自身の毎 S9 手動完走で埋める。テキスト規範だけでは deferral される実績(P37)があるため「IMP1 完成まで手動必達」を明記。**ただし毎サイクルのコストを伴う運用変更ゆえ事業判断要素を含み、Q-01 で人間承認を取る**。
- **種別**: 技術判断 + 事業判断(コスト)→ Q-01 で human-gate
- **上書き**: なし

### D-03 — carried 9 件を `into: v0.0.5` で残し、自サイクル carried ゼロをもって CLOSE 可能と判定した
- **理由**: established workflow(v0.0.3 S12 D-03 / ledger.md reconciliation)。`into: v0.0.4` の未消し込みは 0。次サイクル S1 の reconcile ゲート(特に IMP1 は US 化必須)が拾う。SKILL の「carried 全ゼロ」文言は本 S12 で established 解釈へ是正済。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 棄却した案

### R-01 — 機械ハードゲート(IMP1)本体を本 S12 で実装する
- **棄却理由**: hook/CI・seeded states・per-step live ランナーは infra 開発で S12(メソドロジー)の範囲外。ただし v0.0.3 R-02 と違い、**今回は「範囲外ゆえ後回し」で終わらせず Rule E + escalation で次サイクル US 化を強制**する(P38 の是正)。

### R-02 — live-gate を「推奨」に留め毎サイクル必達にしない
- **棄却理由**: 推奨止まりは「テキストは行動を変えない」(P36)の再演。ただしコストは実在するため、必達化の最終可否は Q-01 で人間に委ねる(事業判断)。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- (本サイクルは S12 内手戻りなし。該当なし)

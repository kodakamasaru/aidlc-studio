# S1 — ユーザーストーリー(一覧)

## メタ
- 工程: S1 Discovery (Phase B)
- 役割: プロダクトディスカバリーリード
- ステータス: 確定
- 入力参照: `aidlc-docs/brief.md`(全版共通ビジョン / 確定) + `aidlc-docs/v0.0.5/autonomous-self-healing-orchestration.md`(自走基盤の中核設計 / 大半は v0.0.6・v0.0.7 へ分割) + `aidlc-docs/v0.0.4/ledger.yml`(reconcile 対象)
- 作成日: 2026-06-20
- 更新日: 2026-06-20

## 本サイクルのテーマ

**「検証 / 台帳の土台」を固める。** タスクを自走させる前に、AI が未検証の成果を勝手に done 前進させない信頼層を先に作る:① live 証拠が無ければ step を done にできない機械ハードゲート(IMP1)② 未解決を版を跨いで保持するルート単一 ledger + reconcile のコード強制 ③ それらを安く実機検証する seeded + 安価 live 環境。あわせて binding-rule 到達 probe と housekeeping を片付ける。

### サイクル分割(2026-06-20)

当初 19 US(放置可能な自走基盤フル + IMP1 + 周辺 carried 全件)で起こしたが、**1 サイクルとして過大**とユーザーが判断し分割した(下記 D-04)。本 v0.0.5 は **検証/台帳の土台 9 US** に絞る。自走エンジン本体・監視 SDK 移行・worktree 並行・周辺 carried は v0.0.6 / v0.0.7 へ振り分けた(`aidlc-docs/v0.0.5/ledger.yml` に carried として carry forward 済 / silent drop ではない / closed な v0.0.4 ledger は改変しない)。

| 行先 | 内容 |
|---|---|
| **v0.0.5(本サイクル / 9 US)** | IMP1(live ハードゲート / ルート ledger / reconcile コード化)+ seeded+安価 live + binding probe + housekeeping ×4 |
| **v0.0.6** | 自走エンジン core(スケジューラ / 検証→自動 retry / backoff / inbox+後続継続 / reconcile-resume / stall+late-emit)+ O3 live resume |
| **v0.0.7** | 監視 Agent SDK 移行 + live-run 台帳 / worktree 真の並行(N>1) / F3 プロジェクト管理 UI / IMP5 retro メトリクス |

> **IMP1(US-01/02/03)を v0.0.5 に据え置く理由**: 2 サイクル連続 carried で「3 度目の defer 禁止 / backlog 不可 / first-class US 必須」と escalation 済(v0.0.3→v0.0.4)。ここで後続へ送ると escalation 則の自己再演になるため、分割しても IMP1 は v0.0.5 から動かさない。

## US 一覧

### IMP1 — live 証拠ハードゲート(first-class / escalation 済)
- [US-01 live 証拠ハードゲート(step done を機械検証)](./us-01-live-evidence-gate.md)
- [US-02 ルート単一 append-only ledger 再設計 + 全サイクル横断注入](./us-02-root-ledger.md)
- [US-03 reconcile のコード化(S1 fail script/hook)](./us-03-reconcile-codify.md)

### 土台 — seeded + 安価 live
- [US-04 seeded cycle-state 環境 + 安価 live](./us-04-seeded-cheap-live.md)

### binding-rule 到達(IMP2)
- [US-05 binding-rule 到達チェックリスト + probe test](./us-05-binding-rule-probe.md)

### housekeeping(個別 US / ユーザー判断 2026-06-20)
- [US-06 scripted レビュー summary の日本語化(O4)](./us-06-scripted-jp-placeholder.md)
- [US-07 server.ts allowed 配列に multi-turn 追加(O7)](./us-07-multiturn-allowed.md)
- [US-08 thread バッジ整合(F12)](./us-08-thread-badge.md)
- [US-09 dead code 削除: StepConfigPage.tsx(S8 継続)](./us-09-dead-code-stepconfig.md)

## 全体方針(グルーピング・優先度など)

- **優先度**: US-01〜04(IMP1 + 安価 live 土台)が本体。US-04(seeded + 安価 live)は US-01(live ハードゲート)の証拠生成を安くする前提なので US-01 と並走。US-02(ルート ledger)→ US-03(reconcile コード化)は順序依存。US-05(probe)は US-01〜03 で kit/rules・注入経路を触るのと相性がよい。US-06〜09 は独立 housekeeping。
- **粒度方針**: 1 US = 1 つの独立してテスト可能な縦スライス。US 数(9)は機能スコープ(分割後の土台 + housekeeping 個別分割というユーザー判断)の結果であって目標値ではない。
- **分割境界の健全性**: v0.0.5 の各 US は v0.0.6/v0.0.7 の未着手機能に hard 依存しない(US-01 のゲートは standalone で done をブロック、自動 retry エンジン統合は v0.0.6 / 関連は US-01 D-01)。

## reconcile ゲート(前サイクル ledger 消し込み)

`aidlc-docs/v0.0.4/ledger.yml` の `state: carried` 全 9 件を、本サイクル US 化(5 件)or `aidlc-docs/v0.0.5/ledger.yml` への carry forward(4 件 / 後続サイクルへ明示移送)で処理。**v0.0.5 を指す未 reconcile(carried 放置)ゼロ** → 本ゲートを満たす。後続移送は closed な v0.0.4 ledger を改変せず、v0.0.5 ledger に carried(into v0.0.6/v0.0.7)として載せる(= 次サイクルが読む operative な台帳)。

| carried id | 処理 |
|---|---|
| S11-IMP1-live-evidence-hard-gate | v0.0.5: US-01・US-02・US-03 |
| TEST-ENV-seeded-cycle-states | v0.0.5: US-04 |
| S11-IMP2-binding-rule-delivery-checklist | v0.0.5: US-05 |
| S9-housekeeping-O4-O7 | v0.0.5: US-06(O4)・US-07(O7) |
| F12-thread-badge-consistency | v0.0.5: US-08 |
| (dead code / S9-housekeeping 付随) | v0.0.5: US-09 |
| AUTO-ORCH-durable-self-healing | v0.0.5 ledger で 2 分割 carry forward → AUTO-ORCH-core(v0.0.6)+ AUTO-ORCH-monitoring-parallel(v0.0.7) |
| O3-live-resume-continuation-unproven | v0.0.5 ledger → v0.0.6 carry forward(AUTO-ORCH-core の resume 経路に内包) |
| F3-project-management-ui | v0.0.5 ledger → v0.0.7 carry forward |
| S11-IMP5-retro-metrics-autocollect | v0.0.5 ledger → v0.0.7 carry forward |

## 全体 質疑応答ログ (複数 US 横断の議論)

### Q-01 — v0.0.5 の到達点(自走コア範囲)
- **回答**(人間の回答を AI が記入):
  > (当初)フル盛り(worktree 真の並行 N>1 + Agent SDK 全面移行込み)→ (見直し)19 は数が多すぎるのでサイクル分割したい。
- **確定**(AI 記入):
  > 19 US は 1 サイクルとして過大。v0.0.5 は検証/台帳の土台 9 US に絞り、自走コア・監視 SDK・worktree 並行・周辺 carried は v0.0.6/v0.0.7 へ分割(D-04 / 上表)。IMP1 は escalation のため v0.0.5 据置。

### Q-02 — 周辺 carried(F3 / IMP5 / IMP2)の扱い
- **回答**(人間の回答を AI が記入):
  > (当初)全件 v0.0.5 に含める → (分割で見直し)
- **確定**(AI 記入):
  > IMP2(US-05)は v0.0.5 に残す(IMP1 の注入経路を触るため相性がよい)。F3 / IMP5 は v0.0.7 へ移送(`into:` 再タグ)。

### Q-03 — housekeeping(O4/O7/F12/dead code)の粒度
- **回答**(人間の回答を AI が記入):
  > 個別 US に分割。
- **確定**(AI 記入):
  > O4→US-06 / O7→US-07 / F12→US-08 / dead code→US-09 に分割。ユーザーの明示判断による粒度選択。

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — Phase A(brief)はスキップし Phase B から開始
- **理由**: `brief.md` は全版共通ビジョンで `ステータス: 確定`。目的・対象ユーザー・スコープ線引きは v0.0.4 から不変。S1 スキルの「Phase A は目的/対象がブレたときのみ戻る」に該当しない。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — US-04 に TEST-ENV(seeded states)と IMP1(b)安価 live を統合
- **理由**: IMP1 scope の「(b) live を安くする = seeded states + backend --watch + verify:shot/visual を毎 step 自動」と TEST-ENV の seeded cycle-state fixtures は同一機構。分割すると seed 環境が二重定義になる。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — live 機械ゲート(US-01)は v0.0.5 では standalone(自動 retry エンジン統合は v0.0.6)
- **理由**: 自走の検証→自動作り直しエンジンは v0.0.6 へ分割したため、v0.0.5 の US-01 はゲートが done を止めるところまで(retry は現行どおり人手)。証拠不在=検証 NG の意味付けは保ち、v0.0.6 の自動 retry がトリガを拾える接点を残す(US-01 D-01)。これで v0.0.5 の各 US が後続未着手機能に hard 依存しない。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-04 — 19 US を 3 サイクルに分割(v0.0.5 / v0.0.6 / v0.0.7)
- **理由**: 当初 Q-01/Q-02 でフル盛り + 全件採択したが、19 US を見たユーザーが「1 サイクルとして過大」と判断(2026-06-20)。信頼層(検証/台帳の土台)を自走エンジン本体より先に固める順序が正しい(未検証成果の自動前進を防ぐ)。IMP1 は escalation のため v0.0.5 から動かさない。後続移送は `aidlc-docs/v0.0.5/ledger.yml` に carried(into v0.0.6/v0.0.7)として記録し silent drop を避ける(closed な v0.0.4 ledger は改変しない)。
- **種別**: 事業判断(ユーザー確定)
- **上書き**: なし

---

## 棄却した US 案

### R-01 — 19 US を 1 サイクル(v0.0.5)で全部やる
- **棄却理由**: D-04 のとおり過大。3 サイクルに分割。

### R-02 — housekeeping を 1 本の US に集約する
- **棄却理由**: Q-03 でユーザーが個別分割を選択(US-06〜09)。

## 次工程 (S2) への引き継ぎ
- **画面化が必須**: US-08(thread バッジ)/ US-04(seeded 状態の選択 UI があれば)。
- **フロー化(状態遷移図)で説明する方が早い**: US-01(step done の機械ゲート判定フロー)/ US-03(reconcile fail 判定)。本サイクルは画面より状態機械・スクリプト寄り。
- **画面なし(プロセス/基盤 US)**: US-02(ルート ledger)/ US-03 / US-05(probe)/ US-06 / US-07 / US-09。S2 では「画面化対象」と「機構のみ」を仕分ける。
- **Biz とのすり合わせで論点になりそう**: なし(US-01 の運用コストは前サイクル承認済 / マージ戦略等の重い論点は v0.0.7 へ移送済)。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか: (手戻り時に追記)
- 暫定の解決方針:
- 棄却した案とその理由:

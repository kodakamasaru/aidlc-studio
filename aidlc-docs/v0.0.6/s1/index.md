# S1 — ユーザーストーリー(一覧)

## メタ
- 工程: S1 Discovery (Phase B)
- 役割: プロダクトディスカバリーリード
- ステータス: 確定
- 入力参照: プロダクトの狙い(brief / 全版共通ビジョン)+ 自走基盤の中核設計(durable / self-healing オーケストレーション §1〜§12)+ 前サイクル(v0.0.5)の引き継ぎ台帳
- 作成日: 2026-06-21
- 更新日: 2026-06-21

## 本サイクルのテーマ

**「放置可能な自走エンジン core」を載せる。** v0.0.5 で固めた信頼層(live 証拠ハードゲート + 跨サイクル ledger + reconcile)の上に、**タスクを積んでおけば人間が放置していても AI が判断点の手前まで勝手に進む**自走基盤の core を構築する。具体的には ① DB 駆動の自走スケジューラ(並列上限・依存 DAG・human-gate parking)② 独立検証→自動 retry ループ ③ 上限/レートの backoff 自動再開 ④ retry 上限到達の inbox 化 + 後続継続 ⑤ 起動毎 reconcile の resume 優先 + 孤児自動 retry(O3 live 実証込み)⑥ stall 検知 + late-emit 冪等化。これらを支える観測基盤として ⑦ 走行中を逐次観測できる実行基盤(Agent SDK `query()` 移行 + 逐次 stream 監視)⑧ live-run 稼働台帳(pid ↔ session_id ↔ last-activity)も本サイクルに含める(idle stall 検知に load-bearing)。あわせて方法論↔プラットフォームの drift 検出と reconcile/ledger の project パラメータ化(P-ARCH)、legacy の silent 自動再生成を片付ける。

> **設計正本**: 自走基盤の中核設計(durable / self-healing オーケストレーション §1〜§12)が本サイクル US-01〜08 の入力。監視層(Agent SDK `query()` 全面移行 + 逐次 stream 監視 + live-run 稼働台帳 / §10・§11)は **idle stall 検知に load-bearing なため本サイクルに含める**(US-07/08)。v0.0.7 へ残すのは **worktree 複数による真の並行サイクル(N>1)+ 書込競合分離・マージ戦略のみ**(全体 Q-02 / D-05)。OTEL(組織コスト可視化)は任意・保留(§10)。

## サイクル分割の継承(2026-06-20 / v0.0.5 S1 D-04)

v0.0.5 S1 で当初 19 US を 3 サイクルに分割した。本 v0.0.6 はその **core パート**:

| 行先 | 内容 |
|---|---|
| v0.0.5(完了) | IMP1(live ハードゲート / ルート ledger / reconcile コード化)+ seeded+安価 live + binding probe + housekeeping |
| **v0.0.6(本サイクル / 13 US)** | 自走エンジン core(スケジューラ / 検証→自動 retry / backoff / inbox+後続継続 / reconcile-resume / stall+late-emit)+ **監視層(Agent SDK query() 移行 + 逐次監視 + 稼働台帳)** + O3 live resume + P-ARCH(drift 検出 / project 化)+ legacy silent 再生成 + **escalation 前倒し(F3 プロジェクト管理 UI / IMP5 振り返りメトリクス)** |
| v0.0.7 | **worktree 真の並行(N>1)+ 書込競合分離・マージ戦略**(+ 監視 OTEL 等は任意) |

## US 一覧

### 自走エンジン core(durable / self-healing)
- [US-01 自走スケジューラ(並列上限 + 依存 DAG + human-gate parking)](./us-01-self-driving-scheduler.md)
- [US-02 generate→独立検証→自動 retry ループ(全技術 step)](./us-02-verify-auto-retry-loop.md)
- [US-03 上限/レート分類 + 指数 backoff 自動再開](./us-03-backoff-on-limits.md)
- [US-04 retry 上限到達 → inbox + 後続継続(非ブロッキング)](./us-04-retry-exhausted-inbox.md)
- [US-05 起動毎 reconcile を resume 優先 + 孤児自動 retry(O3 live 実証込み)](./us-05-reconcile-resume.md)
- [US-06 stall 検知(timeout / claude 非依存)+ late-emit 冪等化](./us-06-stall-late-emit.md)

### 監視層(durable 自走の観測基盤 / US-05・US-06 の substrate)
- [US-07 CLI spawn → Agent SDK query() 全面移行 + 逐次 stream 監視](./us-07-agent-sdk-monitoring.md)
- [US-08 live-run 稼働台帳(runId ↔ pid ↔ session_id ↔ last-activity 永続)](./us-08-liverun-registry.md)

### P-ARCH — 方法論↔プラットフォーム連動 / project 化
- [US-09 ルール↔ゲート↔テスト drift 検出 + 単一正本の橋を 1 本実証](./us-09-rule-gate-drift.md)
- [US-10 reconcile/ledger を project(repoPath)パラメータ化 + 跨サイクル seed fixture](./us-10-project-param-reconcile.md)

### legacy housekeeping
- [US-11 理由なし gap の silent 自動再生成(S8-Q02)](./us-11-silent-regeneration.md)

### escalation 前倒し(2 連続 carried = 3 度目 defer 禁止 / Q-03)
- [US-12 プロジェクト作成/リセット/切替 UI + legacy 正規化マイグレーション(F3)](./us-12-project-management-ui.md)
- [US-13 振り返りメトリクス自動集計(IMP5)](./us-13-retro-metrics-autocollect.md)

## 全体方針(グルーピング・優先度など)

- **優先度・依存**: US-01(スケジューラ)が core の背骨。US-07(逐次監視の実行基盤)・US-08(稼働台帳)は **US-05(reconcile 孤児判定)・US-06(idle stall)の substrate** で、番号は後ろだが論理的には土台(走行中の逐次観測が無いと idle/last-activity が作れない)。US-02(検証→自動 retry)・US-03(backoff)・US-04(上限→inbox)は US-01 の起動・前進ループに retry/復帰の枝を足す関係で、各々独立してテスト可能な縦スライス。US-09/10(P-ARCH)は core と独立に進められる(US-10 は US-04 の inbox 画面化・跨サイクル検証の前提を整える)。US-11 は独立 legacy。US-12(プロジェクト管理 UI)は US-10(project パラメータ化)と対で進めると相性がよい。US-13(振り返りメトリクス)は独立(本サイクルの run/HumanTask 遷移増で価値が上がる)。
- **粒度方針**: 1 US = 1 つの独立してテスト可能な縦スライス。US 数(13)は機能スコープ + escalation 前倒し(F3/IMP5)の結果であって目標値ではない。core 8 US は §4〜§12 の各受け入れ条件(再起動復帰 / backoff 完走 / 検証 NG 自動作り直し / 上限→inbox+後続継続 / N 以下 / 介在点 4 つ固定 / 走行中逐次観測 / 稼働台帳)に対応する自然分割。
- **scope 健全性**: 監視層(逐次監視 + 稼働台帳 + Agent SDK 移行)は本サイクルに含む。v0.0.7 へ残すのは **worktree 真の並行(N>1)+ 競合分離・マージ戦略** のみ。本サイクルの US は worktree 並行に hard 依存しない(単一 worktree 内のプロセス並列で完結)。
- **scope 確定**: ユーザー判断(2026-06-21)で 9 US を確定(Q-01)→ 監視SDK の ①逐次監視+稼働台帳 ②Agent SDK 全面移行 を v0.0.6 へ前倒し(Q-02 / +2)→ reconcile ゲートの escalation 則で F3・IMP5 を v0.0.6 で US 化(Q-03 / +2)。**計 13 US**。v0.0.7 に残すのは worktree 真の並行(N>1)のみ。

## reconcile ゲート(前サイクル ledger 消し込み)

前サイクル(v0.0.5)から `into: v0.0.6` で carried された全件を、本サイクル US 化で処理する。ルート台帳(全サイクル横断ビュー)の `into: v0.0.6` carried を **未 reconcile ゼロ**にする。

| carried id | 処理 |
|---|---|
| AUTO-ORCH-core | US-01・US-02・US-03・US-04・US-05・US-06(§1〜§12 を 6 US 化) |
| O3-live-resume-continuation-unproven | US-05 に内包(resume 経路の実機シナリオで live 実証) |
| P-ARCH-01-methodology-platform-link | US-09(drift 検出 + 単一正本の橋実証 / (3a)(3b)(2)) |
| P-ARCH-02-cross-cycle-project-param | US-10(repoPath パラメータ化 + 跨サイクル seed fixture) |
| S8-Q02 | US-11(理由なし gap の silent 自動再生成) |

> 確定と同じターンでルート台帳(全サイクル横断 append-only)の上記 5 件(into: v0.0.6)の carried を `done`(closed_in)へ更新する。S1 確定 = 上記 5 件が全て US に反映済 = v0.0.6 を指す未 reconcile carried ゼロ。

### v0.0.7 carried の前倒し(scope 変更 / Q-02・Q-03)

本サイクル S1 で、v0.0.7 予定だった carried を 2 系統で前倒しする(reconcile ゲートで明示 addressed にする / silent な scope いじりにしない):

| 元 carried id | 本サイクルへ前倒し | v0.0.7 に残す | 契機 |
|---|---|---|---|
| AUTO-ORCH-monitoring-parallel | US-07(Agent SDK query() 移行 + 逐次 stream 監視)・US-08(live-run 稼働台帳)を v0.0.6 へ | worktree 複数による真の並行(N>1)+ 競合分離・マージ戦略 のみ | Q-02(idle stall に load-bearing) |
| F3-project-management-ui | US-12(プロジェクト作成/リセット/切替 UI + legacy 正規化)を v0.0.6 へ | なし(全量前倒し) | **Q-03 / escalation 則**(2 連続 carried = 3 度目 defer 禁止) |
| S11-IMP5-retro-metrics-autocollect | US-13(振り返りメトリクス自動集計)を v0.0.6 へ | なし(全量前倒し) | **Q-03 / escalation 則** |

> - `AUTO-ORCH-monitoring-parallel`: decision から監視部分を除き **worktree 並行 + 競合分離・マージのみ(into: v0.0.7)** に narrowing。監視部分は v0.0.6 で US 化済。
> - `F3` / `IMP5`: v0.0.4 → v0.0.5 と 2 サイクル連続 carried で escalation 則が発火(3 度目の v0.0.7 送り不可)。本サイクルで US 化(US-12 / US-13)し、台帳上 `done`(closed_in: v0.0.6)へ。
> - これらの id を S1 US 群で明示参照したことで reconcile ゲートの addressed を満たす。本サイクル closed 時に v0.0.6 ledger へ確定記録する。

## 全体 質疑応答ログ (複数 US 横断の議論)

### Q-01 — v0.0.6 のスコープ(9 US で確定してよいか)
- **回答**(人間の回答を AI が記入):
  > 9 US で確定(自走エンジン core 6 + P-ARCH 2 + legacy 1)。
- **確定**(AI 記入):
  > (初回)ledger が事前確定した境界どおり 9 US。直後に Q-02 で監視SDK の扱いを見直し 11 US に拡張(下記 Q-02 が最終)。

### Q-02 — 監視SDK(逐次監視 / 稼働台帳 / Agent SDK 全面移行)も v0.0.7 へ後回しでよいか
- **回答**(人間の回答を AI が記入):
  > worktree 並行を後続にするのは分かるが、監視SDK も後回しにするのか? → 監視SDK は ①逐次監視+稼働台帳 ②Agent SDK 全面移行 とも v0.0.6 に入れる。
- **確定**(AI 記入):
  > 監視SDK を 3 層に分解し、①逐次 stream 監視 + 稼働台帳(last-activity)②Agent SDK `query()` 全面移行 を v0.0.6 へ前倒し(US-07/08)。理由: idle stall 検知(US-06)は走行中の逐次観測が無いと原理的に作れず、塊読みのままでは壁時計 timeout しか持てない=設計§5/§8 の「ハング(無出力)→ idle timeout」を満たせない。監視は自走 core に load-bearing。v0.0.7 に残すのは ③worktree 真の並行(N>1)+ 競合分離・マージ戦略 のみ。これにより v0.0.6 は 9→11 US(旧 D-05 を訂正)。

### Q-03 — F3(プロジェクト管理 UI)/ IMP5(振り返りメトリクス)を escalation 則でどう処理するか
- **回答**(人間の回答を AI が記入):
  > 両方 v0.0.6 で US 化する。
- **確定**(AI 記入):
  > reconcile ゲートで F3・IMP5 が「2 サイクル連続 carried(v0.0.4→v0.0.5)= 3 度目の v0.0.7 送り禁止」として escalation 発火。v0.0.7 へ再 carry せず本サイクルで first-class US 化(US-12 F3 / US-13 IMP5)。これで v0.0.6 は 11→13 US。F3 は US-10(project パラメータ化)と対、IMP5 は S11 改善提案そのもの(escalation 則の本来の対象)。

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — Phase A(brief)はスキップし Phase B から開始
- **理由**: brief は全版共通ビジョンで確定済。目的・対象ユーザー・スコープ線引きは不変。S1 スキルの「Phase A は目的/対象がブレたときのみ戻る」に該当しない。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — AUTO-ORCH-core(§1〜§12)を 6 US に分割
- **理由**: 設計正本 §4〜§12 の各機構が、設計 §12 の受け入れ条件 1〜6 に 1:1 対応する。①スケジューラ(§9)②検証→自動 retry(§4)③backoff(§5 上限)④上限→inbox+後続(§6)⑤reconcile-resume(§5/§8/§11)⑥stall+late-emit(§5/§7/§11)の 6 つは各々独立してテスト可能な縦スライス。これ以上粗くまとめると「再起動復帰」と「backoff 完走」など別シナリオの検証が 1 US に同居し独立テスト性が崩れる。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — O3(live resume 継続未実証)を独立 US にせず US-05 に内包
- **理由**: ledger の O3 carry 方針どおり「独立 US にせず resume 経路の実機シナリオで兼ねる」。US-05 の reconcile-resume が揮発しない実 session の --resume 継続を実機で通せば O3 の実証要件を満たす。独立 US 化すると検証シナリオが US-05 と完全重複する。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-04 — P-ARCH-01 を「drift 検出 + 橋 1 本実証」に絞り、単一正本インタプリタ全面化(深 (3)/(3c))は本サイクル外
- **理由**: 設計の (3a) 単一正本規律・(3b) 橋の型 1 本実証・(2) drift 検出は低コスト高レバレッジで本サイクル。(3) step-contracts を方法論不変条件の汎用インタプリタへ全面拡張 / (3c) 既存二重符号化の全件移行は big-bang 禁止(型確立後に随時)。US-07 は型を 1 本立てて drift を機械検査するところまで。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-05 — 監視層(逐次監視 + 稼働台帳 + Agent SDK 移行)を v0.0.6 に含め、v0.0.7 は worktree 真の並行のみ【訂正済】
- **理由**: 当初「監視 SDK 全面移行・worktree 並行とも v0.0.7」としたが、Q-02 でユーザーが訂正。idle stall 検知(US-06)は走行中の逐次観測が無いと原理的に作れず(塊読みでは壁時計 timeout しか持てない)、監視は自走 core に load-bearing。よって監視層(US-07 Agent SDK query() 移行 + 逐次監視 / US-08 稼働台帳)を本サイクルへ前倒し。v0.0.7 に残すのは worktree 複数による真の並行サイクル(N>1)+ 競合分離・マージ戦略のみ(重インフラ / core が乗ってから)。
- **種別**: 事業判断(ユーザー確定 / Q-02)
- **上書き**: 旧 D-05「監視 SDK 全面移行・worktree 真の並行とも v0.0.7」を Q-02 で上書き。

### D-06 — F3 / IMP5 を v0.0.7 へ再 carry せず v0.0.6 で US 化(escalation 則の遵守)
- **理由**: reconcile-check v0.0.6 が `F3-project-management-ui` と `S11-IMP5-retro-metrics-autocollect` を「2 サイクル連続 carried = escalation」として BLOCK。台帳ルールの「3 度目の defer 禁止 / first-class US 必須」に従い US-12 / US-13 化(Q-03)。当初 S1 起こしで into:v0.0.6 の 5 件だけ見て v0.0.7 行きの escalation を見落としたのは段取りミス(reconcile v0.0.6 を起こし時に回すべきだった)。S11 行き材料: ① S1 起こし時に reconcile-check を必ず回す規律 ② escalation ルール散文は「US 化必須」だがゲートコード(reconcileCycle)は「addressed」までしか見ない drift(US-09 が狙う乖離の実例)。
- **種別**: 事業判断(ユーザー確定 / Q-03)
- **上書き**: なし

---

## 棄却した US 案

### R-01 — O3 を独立 US 化する
- **棄却理由**: D-03。resume 経路の実機シナリオ(US-05)と検証が完全重複するため内包。

### R-02 — P-ARCH-01 で step-contracts 単一正本インタプリタを全面実装する
- **棄却理由**: D-04。big-bang 禁止。橋の型 1 本実証 + drift 検出に絞る。

## 次工程 (S2) への引き継ぎ
- **画面化が必須**: US-01(自走ボード上で「実行中 / 待ち / parking」が一目で分かる状態表示)/ US-04(retry 上限到達の inbox カード)/ US-12(プロジェクト作成/リセット/切替 UI)。
- **画面化が望ましい**: US-13(振り返りメトリクスのレポート表示)。
- **フロー化(状態遷移図)で説明する方が早い**: US-02(generate→検証→done|retry の判定フロー)/ US-03(上限分類→backoff→再開)/ US-05(起動時 reconcile の resume|re-run 分岐)/ US-06(stall timeout 判定)。本サイクルは画面より状態機械・スケジューラ寄り。
- **画面なし(プロセス/基盤 US)**: US-07(逐次監視の実行基盤)/ US-08(稼働台帳)/ US-09(drift 検出 probe)/ US-10(project パラメータ化)/ US-11(silent 再生成)。ただし US-08 の稼働台帳は「今何が起動中か」を将来ボードに描く素地(S2 で軽く触れる)。
- **Biz とのすり合わせで論点になりそう**: retry 上限の既定値・backoff の最大待ち時間(US-03/04 の運用ノブ。S2 以降で詰める)。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか: (手戻り時に追記)
- 暫定の解決方針:
- 棄却した案とその理由:

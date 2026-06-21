# S4 — 技術仕様

## メタ
- 工程: S4 (Tech Spec)
- PhaseGroup: Design
- 役割: ソフトウェアアーキテクト
- バージョン: v0.0.6
- ステータス: 確定
- 入力参照:
  - プロダクトの狙い(brief)
  - このサイクルの要件一覧(US 群 13 件)
  - 画面要素(ワイヤーフレーム)+ UIデザイン(SCR-01〜05)
  - 自走基盤の中核設計(durable / self-healing オーケストレーション §1〜§13)
- 作成日: 2026-06-21
- 更新日: 2026-06-21

## 本サイクルの S4 の位置づけ

技術スタックは v0.0.1〜v0.0.5 で確定済(Bun + TypeScript + SQLite + React/Vite + Playwright)。本 S4 は**新規スタック選定ではなく、自走エンジン core のアーキテクチャ方針 + AI 入出力契約**を固めるのが目的。特に US-07(Agent SDK 移行)で唯一の新規外部依存が入るので、その方針をここで確定する。**実装詳細(関数シグネチャ / DB スキーマの列定義 / SDK の正確な API 表面)は S5 以降**。S4 は方針まで。

## 技術スタック

### 言語 / フレームワーク
| 用途 | 選定 | 状態 | 理由 |
|------|------|------|------|
| ランタイム / TS 実行 | Bun + TypeScript | 既存 | 高速起動・組込テストランナ・単一バイナリ。studio は常駐サーバ + 多数の短命 CLI を回すので起動コストが効く |
| 永続化 | SQLite(Bun 組込) | 既存 | 設計§2「DB が唯一の真実」。単一ファイル・原子トランザクション・組込で運用が軽い。シングルユーザー前提に最適 |
| Web(ビューア/操作盤) | React + Vite | 既存 | 既存ボード/Inbox 資産を踏襲 |
| AI 実行(headless) | **現状: CLI `claude -p` spawn → 移行先: Claude Agent SDK `query()`** | **US-07 で移行** | 走行中の逐次観測(idle 検知 / last-activity)が CLI 塊読みでは原理的に不可。SDK の逐次メッセージで取得する(下 D-02 / 外部 I/F) |
| 視覚検証 | Playwright(同梱 Chromium) | 既存 | verify-ui screenshot(S8/S9 の視覚証拠 + S3 capture)。auto-evidence で利用 |
| 並行 | git worktree(単一) | 既存(単一) | 本サイクルは単一 worktree 内のプロセス並列。worktree 複数(N>1)は v0.0.7 |

### 開発ツールチェーン
| 用途 | 選定 | 理由 |
|------|------|------|
| テスト | `bun test`(決定論スイート)+ live(実 claude) | 決定論を floor、live を追加層(real-AI tests additive) |
| 型 | `tsc --noEmit` | 既存 |
| ゲート CLI | reconcile / ledger:check / probe:rules / evidence:check / live:check | 既存 + US-09(probe 拡張)/ US-10(project 化) |

## アーキテクチャ方針

### 全体構成
- **ローカル常駐サーバ(Bun)+ SPA(React)+ 短命ワーカー(claude)** の構成。サーバは「真実(SQLite)を持ち、ワーカーを起動・監視・突合する」司令塔。ワーカーは使い捨て。
- レイヤー: `domain`(純粋ロジック / ステートマシン)→ `app/services`(engine-service / scheduler / reconcile / context-resolver 等)→ `app/ports`(抽象 I/F)→ `infra`(orchestrator live/scripted / evidence / sqlite)。依存は内向き(domain は infra を知らない)。

### 自走の中核 — durable / self-healing ステートマシン(設計§2)
4 性質を全 step で守る:
1. **DB(SQLite)が唯一の真実**。実行中状態を in-memory に置かない(US-08 稼働台帳も DB)。
2. **プロセス(claude 子)は使い捨て**。生死は OS 観測の事実であって状態源でない。
3. **起動毎に reconcile**(US-05)。DB の running と実 pid を突合し孤児を回収。
4. **全遷移は原子コミット + 冪等**(US-06 late-emit / 二重 emit で不整合化しない)。

### 自走スケジューラ(US-01 / 設計§9)
- DB 駆動。pending から「依存 DAG・並列上限 N・human-gate でない」を満たすものを起動。
- 起動毎に **desired(DB のあるべき)vs actual(実プロセス)を再導出**して(再)起動。**二重起動しない**(冪等キー = cycle+step)。
- human-gate step は run を「待ち」状態で永続 parking。完了後は次の eligible を自動起動。

### 検証 → 自動 retry ループ(US-02 / 設計§4)
- 技術 step は **生成 run(generator)≠ 検証 run(evaluator)** を別 run として spawn(v0.0.5 で確立した generatorRoleFor を踏襲)。
- 独立検証(決定論ゲート: 完了条件 gap / evaluator run / visual-eval mock 突合)を「人間に出す前」でなく**自動 retry のトリガ**に配線。NG は人間に出さず作り直し。
- done は**観測事実で裏取り**(status=done でも成果物不在 / 検証 NG なら done にしない / §7-2)。

### 失敗分類 + backoff(US-03 / 設計§5・§7-4)
- 失敗を **exit / エラー信号から分類**(文章解釈に依存しない)。
- 「上限/レート系」= backoff-retriable → **指数 backoff で自動再開・別カウンタ**(retry 回数を浪費しない)。
- 「不完全成果物」= US-02 の作り直しカウンタ。上限到達 → US-04。

### reconcile-resume(US-05 / 設計§5・§8)
- 起動時 reconcile: 孤児 run を **resume 優先**(session_id があれば同一文脈継続 / O3 をこの経路で live 実証)、無ければ **idempotent re-run**。

### stall + late-emit(US-06 / 設計§5・§7-3・§8)
- **idle / 壁時計 timeout(claude 非依存)** が stall の最終 backstop。idle は US-07 逐次監視 + US-08 last-activity から算出。
- 死んだ run の late-emit は**冪等に無視**(RunNotFound で不整合化しない)。

### 監視(US-07/US-08 / 設計§10)
- live-run 稼働台帳(runId↔pid↔session_id↔last-activity)を **DB 永続**。
- 進捗/生死は **Agent SDK query() の逐次メッセージ**で取得(emit を待たない)。last-activity を逐次更新。

### エラーハンドリング(全体方針)
- リトライ: 不完全成果物 = 作り直し(上限あり)/ 上限・レート = backoff 自動再開 / stall = timeout→retry / 孤児 = resume|re-run。
- フォールバック: retry 上限到達 → inbox「要対応」+ 後続継続(非ブロッキング / US-04)。
- 表示: 技術失敗は人間に出さない。例外(上限到達)のみ事業語で inbox 化(SCR-02/05)。

### セキュリティ
- 認証/認可: シングルユーザー・ローカル常駐のため無し(brief「マルチユーザー認証は対象外」)。公開時は「1 ユーザー 1 セルフホスト」。
- 秘匿: 内部情報(path / runId / pid / session_id / 内部語)を人間向け出力に出さない(責務契約① / 全 SCR で遵守確認済)。
- 鍵: Claude の認証情報は環境変数 / 既存 claude 認証に委譲。ハードコード禁止。

## 外部 I/F 仕様

### 外部 API / 実行系
| 名称 | 用途 | 通信方式 | 状態 | 備考 |
|------|------|---------|------|------|
| **Claude Agent SDK `query()`**(`@anthropic-ai/claude-agent-sdk` 相当) | headless step 実行 + 逐次監視 + session resume | プロセス内 async ストリーム(SDK message 逐次) | **新規 / US-07** | 正確な API 表面・型名は S5/S7 実装時に公式 docs で確定。本 step は「CLI 塊読み → SDK 逐次ストリーム」の移行方針まで。resume(session 継続)・走行中メッセージ(進捗/状態)を使う |
| Claude CLI `claude -p`(現状) | 同上(移行前) | 子プロセス spawn + stream-json stdout 塊読み | 既存 / US-07 で置換 | 移行後も「逃げ道」として残すか は S7 判断(D-03) |

### データ永続化(SQLite — DB=truth)
| 名称 | 用途 | 形式 | 状態 |
|------|------|------|------|
| run store | run の state(running/stalled/done/failed)+ retry/backoff カウンタ | SQLite テーブル | 既存 + 拡張 |
| HumanTask store | Q / レビュー / 手戻り / 実機確認 / **要対応(US-04)** | SQLite テーブル | 既存 + 種別追加 |
| session store | runId↔session_id(resume 用) | SQLite テーブル | 既存 |
| **live-run 稼働台帳** | runId↔pid↔session_id↔startedAt↔last-activity | SQLite テーブル | **新規 / US-08** |

### その他 I/F
| 名称 | 用途 | 状態 |
|------|------|------|
| git worktree | サイクルの作業ディレクトリ分離(単一) | 既存(単一 / N>1 は v0.0.7) |
| Playwright + Chromium | verify-ui screenshot(視覚証拠 / auto-evidence) | 既存 |
| aidlc-docs(対象 PJ) | 真実の source(成果物)。reconcile/ledger は repoPath で参照(US-10) | 既存 + project 化 |

## AI 入出力契約(完了条件 7 / operating-model Rule A)

> transport だけでなく「何を・どの source から・どう構造化して渡し / 受け取るか」を設計する。

### AI 入力コンテキスト設計(各 step run に何を渡すか)
composer(`prompt-composer.ts` の contractLayer 等)が prompt 先頭から順に注入する:
| # | 渡すもの | source | 構造化 |
|---|---------|--------|--------|
| 1 | 責務契約(最上位 binding) | `kit/rules/responsibility-contract.md`(Fs) | 全文・skill 本文より前(衝突時に勝つ位置) |
| 2 | 運用モデル(全工程 binding) | `kit/rules/aidlc-operating-model.md`(Fs) | 全文 |
| 3 | 該当 kit skill 本文 | `kit/skills/aidlc-sN/SKILL.md` | 全文 |
| 4 | 前段成果物 | aidlc-docs(repoPath / US-10) | **index.md を存在ゲート**(project-agnostic)+ 詳細は soft 文脈(欠落マーカー) |
| 5 | 却下理由(全件 / 現 step 優先) | context-resolver Section 9 | 教訓の消失防止(ledger 昇格と連動) |
| 6 | 跨サイクル未解決 | root 台帳(US-02)+ 現サイクル ledger | carried を現 step 視点で |
- 質の評価が要る項目(成果物の説得力等)は evaluator run に同じ context を渡し、独立採点させる(precision-first: 存在=ゲート / 質=evaluator)。

### AI 出力フォーマット設計(成果物・質問・完了をどう受け取るか)
| emit 種別 | 構造 | 受け取り後の処理 |
|---|---|---|
| **aidlc-result** | `status: running|needs_human|done|failed` / `artifacts[]`(画面ファイル等)/ `summary`(事業語) | スキーマ厳格検証 → 壊れていたら**人間でなく retry**(§7-1)。done は成果物存在 + 検証 OK で裏取り(§7-2) |
| **aidlc-question** | `prompt` / `background` / `options[]`(推奨 + 選択肢 + 自由入力) | HumanTask(parking)化。画像前提の質問禁止(契約①) |
| **aidlc-answers** | 人間回答の突合キー | 該当 run を resume |
| 逐次 stream message | SDK の走行中メッセージ(進捗/状態) | last-activity 更新(US-08)/ idle 算出(US-06)。emit を待たない(§10) |
- 視覚承認は散文に画像パスを書かず、必ず aidlc-result の `artifacts[]` に画面ファイルを載せる(プラットフォームがギャラリー描画 / 契約①)。

## 非機能要件

### パフォーマンス / 制御値(既定 / 運用ノブ)
| 指標 | 目標値(既定) | 測定/根拠 |
|------|--------|---------|
| 並列起動数 | **常に N 以下**(既定 N=4) | スケジューラが起動前に在庫確認(設計§12-5) |
| idle timeout(無音) | 既定 90s(step 種別で調整可) | claude 非依存の壁時計。stall 検知(§5) |
| 壁時計 timeout(総) | step 種別ごとに上限(例 hearing 長め) | 最終 backstop(§7-3) |
| backoff | 指数(base 30s / 最大 30 分まで) | 上限/レートの自動再開(§5) |
| 作り直し上限 | 既定 3 回 → inbox(US-04) | 無限 retry 防止(§6) |
| 起動時 reconcile | 数秒以内に全 run 突合 | 起動直後に desired vs actual 再導出 |

> 既定値は運用ノブ(設定外部化 = brief「設定の外部化」)。最終値は S5/実装で確定。

### スケーラビリティ / 可用性
- 想定: シングルユーザー / 単一マシン / 単一 worktree(本サイクル)。同時 run は N 上限。
- 可用性: アプリ/backend が落ちても **起動し直せば DB から正しい続きに戻る**(設計§12-1 / US-05)。稼働率目標は設定しない(常駐 = 人間が起動している前提)。

### 監視・ログ
- live-run 稼働台帳(US-08)で「今何が起動中か」を DB 事実として保持。
- ログ: run の stdout(run.log)+ 逐次 stream を auto-evidence に残す(既存)。
- アラート: retry 上限到達 = inbox「要対応」(SCR-02)。OTEL(組織コスト)は任意・保留(設計§10)。

## binding 逆引き確認(完了条件 6)

| 触る US | AC との整合 |
|---|---|
| US-01 スケジューラ | N以下 / DAG / parking / 自動次起動 を全体構成に反映。矛盾なし |
| US-02 検証→retry | generator≠evaluator / 検証を自動 retry トリガ。矛盾なし |
| US-03 backoff | exit信号分類 / 別カウンタ / 指数 backoff。矛盾なし |
| US-04 inbox+後続 | 上限→要対応カード + 非ブロッキング(SCR-02/05 と一致)。矛盾なし |
| US-05 reconcile-resume | resume優先→re-run / O3 実証経路。矛盾なし |
| US-06 stall/late-emit | idle/壁時計 timeout(claude非依存)/ 冪等無視。矛盾なし |
| US-07 Agent SDK 移行 | CLI塊読み→SDK逐次ストリーム(本 step で方針確定)。矛盾なし |
| US-08 稼働台帳 | runId↔pid↔session_id↔last-activity を DB 永続(I/F 確定)。矛盾なし |
| US-10 project 化 | reconcile/ledger を repoPath パラメータ化(外部 I/F に反映)。矛盾なし |
| US-12/13 | UI/レポートで I/F 影響は小(既存 store 読み)。矛盾なし |
- US-09(drift 検出)/ US-11(silent 再生成)は本 spec の構成に内包(probe CLI / 既存生成経路)。矛盾なし。

## 質疑応答ログ

### Q-01 — (技術判断は AI 自走で確定。人間 Q は現時点なし)
- **回答**(人間の回答を AI が記入):
  > 
- **確定**(AI 記入):
  > 

---

## AI が独自に決めたこと と 理由

### D-01 — 新規スタック選定はせず、既存(Bun/TS/SQLite/React/Playwright)を踏襲
- **理由**: brief「AI-DLC 方法論そのものの再設計はしない / invocation だけ web 化」。本サイクルは自走エンジンの追加であってプラットフォーム基盤の入替ではない。唯一の新規依存は US-07 の Agent SDK。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — AI 実行を CLI spawn から Claude Agent SDK query() の逐次ストリームへ移行(US-07)。S4 は方針まで
- **理由**: idle stall 検知(US-06)・last-activity(US-08)は走行中の逐次観測が必須で、`new Response(out).text()` の塊読みでは作れない。SDK の逐次メッセージで走行中状態を取得し、resume で session 継続する。**正確な SDK API 表面・型名は変わりうる(claude-api リファレンスも「公式 docs で確認」と明記)ため S5/S7 実装時に確定**。S4 では「塊読み→逐次ストリーム + resume + 稼働台帳供給」の方針までに留める(S4 で実装詳細に踏み込まない原則)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — 移行後の CLI 経路存置(逃げ道)は S7 判断に委ねる
- **理由**: 設計の「stall 時の手動介入の逃げ道」を残すか、SDK 単一経路にするかは実装容易性とのトレードオフ。S4 では両論を残し、S7 で実測して決める(過剰な前倒し確定をしない)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-04 — 制御値(N / timeout / backoff / 作り直し上限)は既定値 + 運用ノブとし、最終値は実装で確定
- **理由**: brief「設定の外部化」。S4 で硬直値を確定すると実機チューニングが効かない。既定 + env 化の方針までを S4 で固める。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 棄却した案

### R-01 — keep-alive 常駐ループに実行状態を持たせる
- **棄却理由**: 設計§2。再起動で状態が消え自己復帰が成立しない。DB=真実 / プロセス使い捨てが必須。

### R-02 — S4 で DB スキーマの列定義・SDK の関数シグネチャまで確定する
- **棄却理由**: S4 は方針まで(スキル「実装詳細まで掘り下げない」)。スキーマ/シグネチャは S5/S6/S7。ここで固めると下流の設計自由度を奪う。

### R-03 — worktree 複数による真の並行(N>1)を本 spec に含める
- **棄却理由**: v0.0.7(AUTO-ORCH-monitoring-parallel)へ分割済。書込競合分離・マージ戦略の重インフラは core が乗ってから。

## 次工程 (S5) への引き継ぎ
- **Work Units 分割で考慮すべき技術的制約**: US-07(Agent SDK 移行)は全 live 実行経路に触る横断作業 = 他 US の前提になりうるので依存 DAG 上流に置く。US-08(稼働台帳)は US-05/06 の substrate(先行)。
- **優先して実装すべき技術的基盤**: ① live-run 稼働台帳(US-08)② Agent SDK 逐次ストリーム(US-07)→ これらの上に scheduler(US-01)/ reconcile-resume(US-05)/ stall(US-06)が乗る。
- **技術的リスクと軽減策**: Agent SDK の API 表面が想定と違うリスク → S7 実装時に公式 docs で確定 + CLI 経路を逃げ道に残せる設計(D-03)。冪等性の取りこぼし(二重起動/late-emit)→ 全遷移を原子トランザクション + 冪等キーで設計(domain テストで実証)。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか: (手戻り時に追記)
- 暫定の解決方針:
- 棄却した案とその理由:

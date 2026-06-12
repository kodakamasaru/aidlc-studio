# v0.0.3 スコープ — ① 正本一元化(前提)+ ② live を“本物”にする

作成日: 2026-06-12 / 更新日: 2026-06-12 / ステータス: **確定**

## 主軸

**「読むソース」と「表示ソース」のズレを根絶し(① 正本一元化)、その締まった境界の上で live(実 AI)が本物の成果物を出す(②)。**

v0.0.2 が「AI が勝手に漏らさず・黙って descope せず・理由が残る」品質ハーネスを scripted で完成させたのに対し、
v0.0.3 は ① でハーネスの足場(source-of-truth 境界)を確定し、② でそのハーネスを **live(ローカル `claude` headless)** で貫通させる。
設計正本思想 = [external-memory.ts](../../src/domain/external-memory/external-memory.ts)「aidlc-docs を唯一の真実 source / studio は索引・状態のみ・内容を複製しない」。
出典 = [ROADMAP.md](../../ROADMAP.md) v0.0.3 節 / 本調査 2026-06-11。

> **① が本サイクルの硬い前提**。境界が揺れたまま ② の live prompt を合成すると、mock 乖離(v0.0.2 S10 却下)と同種の drift を再生産する。

---

## 正本の境界ルール(本サイクルで確定する 1 枚)

データ種別ごとに `truth`(真実の置き場)と `DB の役割` を 1 枚に固定する。**模範 = `artifact`(path 索引のみ)**。

| 種別 | truth | DB の役割 | 現状 | v0.0.3 是正 |
|---|---|---|---|---|
| artifact | file(`aidlc-docs/…`) | index(path のみ) | 模範 | 変更なし(基準) |
| ledger | file(`aidlc-docs/{v}/ledger.yml`) | **none** | DB が全文 JSON 複製・app 参照 0(死蔵) | **DB テーブル削除** |
| conversation | file/規約 | **none** | テーブルあり・参照 0(死蔵) | **DB テーブル削除** |
| step 定義(default テンプレート) | file(`kit/skills` 由来の単一 constant) | (新規サイクルの起点) | コード/web/DB で 5 箇所食い違い | **file 単一正本に導出** |
| step 定義(per-cycle) | DB(サイクル作成時の snapshot) | **state(作成時に default を snapshot コピー → 以後そのサイクルの正)** | StepDef.label=`step` 死蔵 | **cycle 作成時に file default を DB にコピー(ピン留め)。以後カスタムは DB を編集。file の後変更は既存サイクルに波及しない** |
| wiki | file(未構築) | (将来 index) | `JSON.stringify(doc)` で内容複製(原則違反) | **方針のみ確定**(index-only 是正は Wiki サイクルへ) |

**統一原則**: file = truth(方法論・成果物本体)/ DB = index か state(per-cycle の状態・進行・スナップショット)。**DB は不変 truth を複製しない**。
- 補足: step 定義の per-cycle 設定は **作成時に file default を snapshot コピー**する(ピン留め)。これは「不変 truth の複製」ではなく「分岐しうる状態の実体化」であり、原則に反しない(ledger/conversation の死蔵複製とは別物)。file は新規サイクルの default テンプレートとして truth であり続ける。
①-a(外部記憶)と ①-b(step 定義)は、この 1 つの境界ルールの 2 つの適用面である。

---

## スコープ項目

### ① 正本一元化(Source-of-Truth 境界の確定)

| ID | 項目 | ROADMAP | US | 概要 |
|---|---|---|---|---|
| a | 外部記憶の境界是正 | ①-a | US-01 | 正本マップを operating-model にルール化 / 死蔵テーブル(ledger・conversation)を **削除** / wiki は方針のみ確定 |
| b | step 定義の単一正本化 | ①-b | US-02 | file 単一 constant(v2 12・S2.5 退役・実 dir skillRef)へ導出。DEFAULT_STEPS / web step-label を従属化。DB は per-cycle 上書きのみ |
| c | live prompt の source 契約明文化 | ①-c | US-03 | `kit/skills` 手順本文 + `StepDef.contracts`(DB)+ brief/前段成果物(`aidlc-docs`)の合成順序・所有を契約化 |

### ② live を“本物”にする(実 AI が本物の成果物を出す)

| ID | 項目 | ROADMAP | US | 概要 |
|---|---|---|---|---|
| d | live prompt ← 実スキル接続 | ② | US-03 | `defaultBuildPrompt` の 1 文スタブを ①-c 契約に従う実合成へ([live.ts](../../src/infra/orchestrator/live.ts)) |
| e | live evaluator completeness emit | ②(carry `S8-live-completeness`) | US-04 | live が stream-json から completeness(addressed)を emit → 実 AI で completeness gate が効く |
| f | live verify-ui screenshot を review block へ | ② | US-05 | live run の実 screenshot を review block へ(S9 観察 O-01 解消 / 実画像の動作証拠) |

---

## 前サイクル(v0.0.2) ledger reconcile

[v0.0.2/ledger.yml](../v0.0.2/ledger.yml) の `carried` を全件突き合わせ:

| carried ID | 内容 | into | v0.0.3 判定 | 行き先 |
|---|---|---|---|---|
| `S8-live-completeness` | live evaluator が completeness を emit | **v0.0.3** | **IN** | US-04 |
| `S9-US08-liveE2E` | 実 AI E2E(Q→回答→resume)の常時実行化 | v0.0.4 | 据え置き | — |
| `S8-Q02` | auto-rework 完全 silent 化(磨き込み) | v0.0.6 | 据え置き | — |

→ v0.0.3 を指す carried は `S8-live-completeness` の 1 件のみ。US-04 で消化(reconcile ゲート充足)。

---

## 成功基準(v0.0.3)

1. **正本マップが 1 枚で確定**し operating-model にルール化されている(file=truth / DB=index|state)。
2. **死蔵テーブル(ledger・conversation)が削除**され、step 定義の 5 箇所食い違いが解消(file 単一正本に導出 / skillRef が実 dir に解決)。
3. **S1 を実 AI(live)でプラットフォームから 1 本通し**、completeness gate + リッチ描画 + screenshot 証拠が **実 AI で**揃う。
4. **既存テストが全て pass**(後方互換 / 235 回帰 + E2E 6 を割らない)。

---

## v0.0.3 でやらないこと(明示的な除外)

| 除外項目 | 理由 | 予定 |
|---|---|---|
| live mid-run Q→回答→resume の実モデル化 | Human Inbox の魂は独立サイクル | v0.0.4 |
| S1-S12 通し自走 / フェーズ間半自動接続 | self-host バーは段階達成 | v0.0.5 |
| Wiki の index-only 実装 | 本サイクルは方針確定まで | Wiki サイクル |
| §F 4 層化 / fan-out 並列 / 並行サイクル | クリティカルパス外 | v0.0.6+ / v1 |

---

## 関連ドキュメント

- [ROADMAP.md](../../ROADMAP.md) — v0.0.3 節(出典)
- [external-memory.ts](../../src/domain/external-memory/external-memory.ts) — 正本思想の設計核
- [kit/rules/aidlc-operating-model.md](../../kit/rules/aidlc-operating-model.md) — 正本マップのルール化先(US-01 成果物)
- [brief.md](../brief.md) — プロダクト brief(全版共通)

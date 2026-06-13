# S4 — 技術仕様 / v0.0.4

## メタ
- 工程: S4 (Tech Spec)
- PhaseGroup: Design
- 役割: ソフトウェアアーキテクト
- バージョン: v0.0.4
- ステータス: **確定**(2026-06-13 / 評価 AI レビュー反映済 — 後述 §評価 AI レビュー記録)
- 入力参照:
  - [brief.md](../brief.md)
  - [scope.md](./scope.md)
  - [s1/index.md](./s1/index.md)(US-01〜07 / D-04 双方向フォーマット化)
  - [s2/index.md](./s2/index.md)(会話テンプレ D-04 / バッチ質問)
  - [s3/index.md](./s3/index.md)(SCR-02 会話スレッド / SCR-05 可変ステップ進捗)
- 作成日: 2026-06-13
- 更新日: 2026-06-13

---

## S4 のスコープ宣言(なぜ「任意」を実施するか)

このサイクルはブラウンフィールド(既存コードベース)で、**技術スタックは確定済・自明**。よって S4 は **グリーンフィールド的なスタック選定(代替比較)を行わない**。

代わりに、**確定済 S1 / S2 が明示的に「具体設計は S4」と預けた技術契約**を pin する。これらは S5(作業単位分割)が各 US で resume / 質問経路 / 文脈注入をバラバラに再発明しないために必要な「どう作るか」の契約:

| S4 が埋める宿題 | 預けた出典 |
|---|---|
| session-id の永続の置き場と境界 | US-04 Q-01「DB state と境界は S4/S5/S6」 |
| AI→人間 質問の構造化 wire マーカ | US-03 Q-01「詳細テンプレは S2/S4」/ index D-04 |
| 人間→AI 返信のシリアライズ(resume 入力) | US-04 AC「返信を構造化して resume に渡す。具体テンプレは S2/S4」 |
| 前段文脈の解決ロジック + トークン絞り規則 | US-01 Q-01「絞り規則は S4/S5」 |
| scripted アダプタの turn 継続パリティ | US-04 AC「scripted でも turn 継続を再現」 |

**S4 がやらないこと**:
- 技術スタック選定(確定済 → 下表は確認のみ)。
- US-07(可変ステップ進捗)の技術契約 — [PhasePipeline.tsx](../../web/src/features/cycle-detail/PhasePipeline.tsx) が既に N フェーズ対応済で実装で満たされている(新規契約不要)。
- 実装詳細(関数シグネチャ / DB スキーマ / イベント名の最終形)→ S5 以降。

---

## 技術スタック(確定済 / 確認のみ)

ブラウンフィールドのため代替比較は省略。出典 = ルート [package.json](../../package.json) / [web/package.json](../../web/package.json) / [CLAUDE.md](../../CLAUDE.md)。

### 言語 / フレームワーク
| 用途 | 選定 | 備考 |
|------|------|------|
| 言語 | TypeScript | src/(ドメイン+app+infra)/ web/src/(React) |
| backend HTTP | Hono | ローカル常駐サーバ |
| frontend | React + React Router + Vite | ビューア & 操作盤 |
| 実 AI 実行 | ローカル `claude` CLI(`claude -p`, subscription-authed) | Anthropic API ではない(S7 Phase 5b)。headless 完遂型 |

> **スタック代替案の記録(SKILL 完了条件①)**: 本サイクルはスタックを**前サイクルから継承**し、新規選定・変更はない。各スタックの代替比較・棄却理由は確定済の [v0.0.2/s4-tech-spec.md](../v0.0.2/s4-tech-spec.md) / [v0.0.3/s4-tech-spec.md](../v0.0.3/s4-tech-spec.md)(「既存スタック・再選定しない」)に記録済で、前サイクル踏襲の確立パターン。v0.0.4 でこれを覆す技術的事由は生じていない(=「変更なし + 理由」を本サイクルの代替案記録とする)。

### インフラ / ツールチェーン
| 用途 | 選定 | 備考 |
|------|------|------|
| runtime / pkg / test | Bun | `Bun.spawn` で claude 子プロセス起動 |
| E2E / 視覚証拠 | Playwright | verify-ui screenshot |
| 状態 store | sqlite(studio 別 store) | 真実 source = aidlc-docs / run・HumanTask 状態は別 store(CLAUDE.md データモデル) |

---

## アーキテクチャ方針 — v0.0.4 の技術契約(本体)

> 既存の境界を前提にする: ドメインは [OrchestratorPort](../../src/app/ports/orchestrator.ts) のみに依存し、具象アダプタ(scripted | [live](../../src/infra/orchestrator/live.ts))を合成根で束縛(S7 D-01)。アダプタは DB を書かず、`DomainEventSink` に context-tagged な `DomainEvent` を push → app 層が 1 トランザクションで正規化・永続(S7 D-04)。下記契約はこの境界の上に乗る。

### C1 — セッション継続 / turn モデル(US-04)

現状: `claude -p` は完遂型で mid-run 停止しない。live の `resume()` は「レビュー承認の finalize(`done` emit)」専用で、`claude --resume` を叩かず session-id も保持していない。

契約:
- **session-id の parse 点を明示**: live run の stream-json には `{"type":"system","subtype":"init","session_id":...}` 行が含まれる。現 [awaitAndEmit](../../src/infra/orchestrator/live.ts)/`extractResultText` は `result`/`assistant` 行のみを見て **init 行を捨てている**。S5 は `awaitAndEmit` の drain ループ(または専用 `extractSessionId(stdout)`)で **init 行の `session_id` を取得**し、`ResultEmitted` 等の emit に添えて app へ渡す(新フィールド or 新イベント。最終形は S5/S7)。「どこで読むか」をここで固定する = この parse フックの追加漏れを防ぐ。
- session-id は **studio の run 状態 store(sqlite)に Run と紐づけて永続**する(in-memory `contexts` map はサーバ再起動で消えるため不可)。**aidlc-docs(真実 source)には載せない** — 実行基盤の状態であり、CLAUDE.md データモデルの「run 状態は別 store」境界に従う(US-04 Q-01 の境界確定)。
- 1 turn = `claude -p`(または `--resume`)の 1 完遂。turn ベースで足りる(index Q-02 / US-04 D-01)。mid-run 割り込みは対象外(R-01)。
- resume 時にアダプタが session-id を受け取る経路は `ResumeRun` に `sessionId?` を加える(port 拡張。現 [ResumeRun](../../src/app/ports/orchestrator.ts) は `runId`+`body?` のみ)。最終のイベント形/列名は S5/S7。

### C2 — resume の二義を分岐(混線防止)

現状: live の `resume()` は **`done` emit の 1 機能のみ**(`claude --resume` を叩く turn 継続経路は**未実装**。[live.ts](../../src/infra/orchestrator/live.ts) 252-284 のコメントどおり v0.0.x enhancement)。つまり本契約は「二重責務のリファクタ」ではなく **新経路の追加**であり、実装デルタは小さくない(S5 で見積もること)。

契約: live アダプタ上で 2 経路を**明確に分ける**。判別は既存の `Unit02Command`(ドメインが回答 kind から導出済):
- `question` 回答 → `resumeRun{sessionId, body}` → **`claude --resume <session-id> -p <返信エンベロープ>` を再 spawn**(新経路)し次 turn を実行。次 turn の出力は再び質問(`question`)か完了(`visual_review`)として Inbox に出る(US-04 AC)。
- `visual_review` 承認 → 既存どおり **finalize(`done` emit、再 spawn なし)**。これは別命令 `approveTaskReview`(ドメイン既存)にマップ。
- これで「答えると進む(turn 継続 / 新経路)」と「承認すると終わる(finalize / 既存)」が別経路として分離され混線しない。

### C3 — AI→人間 質問の構造化 emit(wire マーカ)(US-03 / index D-04)

契約:
- skill 本文に契約を持たせる:「人間に確認したいことは、結果テキスト中に言語タグ付き fenced block ` ```aidlc-question ` で **構造化 emit** する」。自由文検出は棄却(誤検出 / completeness-checks-anchor-on-spec)。
- block の中身は **JSON**(LLM 生成が安定し機械 parse が確実)。S2 D-04 の 4 部テンプレ意味論を構造で表す:

  ```aidlc-question
  {
    "questions": [
      {
        "id": "q1",
        "prompt": "単文の問い(【質問N】)",
        "background": "背景・なぜ聞くか(【背景】/ 既定折り畳み)",
        "options": [
          { "id": "a", "label": "選択肢ラベル", "hint": "補足", "recommended": true },
          { "id": "b", "label": "…" }
        ],
        "answerKind": "single" | "multi" | "free"
      }
    ]
  }
  ```

- live アダプタは結果テキストを走査し、block があれば **`QuestionRaised`(kind=`question`, options→[QuestionOption[]](../../src/domain/question/question.ts))** を emit(`ResultEmitted`→`visual_review` ではなく)。block 無し = 従来どおり `ResultEmitted`→`visual_review`(誤分類しない / US-03 AC)。1 run に複数 question = 複数カード or 順次提示(US-03 AC)。
- バリデーション: `options` には **★おすすめをちょうど 1 つ**(S2 D-04 準拠 / `recommended:true` が**厳密に 1 件** — 0 件も 2 件以上も可視エラーで弾く)。**自由入力欄は web が常に付与**(その他/補足 / S2 D-04「自由入力常設」)。欠落・違反時は黙って通さない(原則④)。
- web は JSON を **S2 の 4 部テンプレ(【質問】【背景】【選択肢】★おすすめ【回答形式】)に描画**。人間は raw JSON を見ない。

### C4 — 人間→AI 返信のシリアライズ(--resume 入力エンベロープ)(US-04)

契約:
- 回答(複数 Q 一括 = S2 バッチ確定)は言語タグ付き fenced block ` ```aidlc-answers ` の JSON で resume 入力に渡す:

  ```aidlc-answers
  {
    "answers": [
      { "questionId": "q1", "choiceIds": ["a"], "note": "自由入力・補足(任意)" }
    ]
  }
  ```

- ドメイン `Answer.body`(単一 `Text`)にこのエンベロープ文字列を載せる(**回答モデル不変** / [question.ts](../../src/domain/question/question.ts) の `resumeRun{body}` / `statementOf` は body をそのまま使う)。
- resumed agent は skill 契約で「直前に出した質問 id と `answers` を突合して続行する」。これで **N 問 → N 答 → 1 resume**(S2 SCR-02 バッチ)が機械的に閉じる。

### C5 — 前段文脈の解決ロジック + 絞り規則(US-01 Q-01 の S4 宿題)

現状: [prompt-composer.ts](../../src/app/services/prompt-composer.ts) は `contextPaths` を受け取り合成するが、既定 brief のみで、前段成果物 path に解決する呼び出し側が未配線。

契約:
- 解決は **app/engine 側**(US-01 D-01: composer は受け取るだけ)。step 起動時に当該サイクル `aidlc-docs/{version}/` の **done 済み前段 step の index.md + 主要成果物**を `contextPaths` に解決。
- **絞り規則**(トークン肥大対策 / US-01 Q-01 の S4 宿題): 既定 = 各前段 step の `index.md` 全件 + 当該 step が直接依存する成果物本体。閾値超過時は段階縮退「直前 step は index+主要成果物 / それ以前は index のみ」。縮退しても欠落は可視マーカ維持(原則④)。
- step 個別ハードコード禁止 → **step→必要前段 の宣言的マップ**で解決(US-01 AC「解決ロジックが app/engine 側・個別ハードコードでない」)。

### C6 — scripted アダプタの turn パリティ(US-04 AC / real-AI tests additive)

契約:
- `ScriptedOrchestrator` は **resume 回数 keyed の turn シーケンス**を持ち、`resume(body)` ごとに次 turn(`QuestionRaised` か `ResultEmitted`)を emit。
- 決定論テストが live なしで検証: ①「質問→回答→resume→次出力」②「resume 失敗/timeout→`stalled`→retry」(US-04 AC)。
- scripted は live の前段テスト層 — **緩めない・live と 2 アダプタ整合**(real-AI tests additive)。

### エラーハンドリング(既存踏襲)
- turn 内 timeout(既定 120s)→ `stalled`(retriable)/ 非ゼロ exit・`is_error`・parse miss → `failed`。既存 [awaitAndEmit](../../src/infra/orchestrator/live.ts) のロジックをそのまま resume turn にも適用。
- resume 失敗(session 失効 / `--resume` エラー)も `stalled` として可視化し retry(黙って失わない / US-04 AC)。

### セキュリティ
- ローカル `claude` CLI / subscription auth。**API キー等の secret なし**(プロンプトにも埋め込まない)。
- session-id は機密ではないが studio store 内に閉じる(aidlc-docs に出さない)。
- studio はローカル常駐のため CSP / 外部公開ヘッダは v0 スコープ外(将来 web 公開時に別途)。

---

## 外部 I/F 仕様

### 外部 I/F: ローカル claude CLI(唯一の外部実行系)
| 局面 | コマンド形 | データ形式 | 備考 |
|------|-----------|-----------|------|
| 起動 | `claude -p <prompt> --output-format stream-json --verbose [--model]` | stdin: なし / stdout: stream-json (JSONL) | 既存 |
| session 取得 | (起動の stdout) | `{"type":"system","subtype":"init","session_id":...}` | C1 |
| 継続(turn) | `claude --resume <session-id> -p <返信エンベロープ> --output-format stream-json` | エンベロープ = ` ```aidlc-answers ` JSON | C2/C4 新規 |
| 質問 emit | (出力の result text 内) | ` ```aidlc-question ` JSON block | C3 新規 |
| 失敗 | 非ゼロ exit / `is_error:true` / timeout | — | `stalled`\|`failed` に変換(既存) |

### データ永続化
| 名称 | 用途 | 形式 | 備考 |
|------|------|------|------|
| studio run 状態 store | run / HumanTask / **session-id** | sqlite | aidlc-docs と分離(CLAUDE.md) |
| aidlc-docs | 成果物の真実 source | md / html | session-id は載せない |

---

## 非機能要件
| 指標 | 目標 / 方針 | 測定・実現 |
|------|-----------|-----------|
| turn 内 latency 上限 | 既定 timeout 120s/turn 維持。超過は `stalled` | 既存 `DEFAULT_TIMEOUT_MS` |
| 暴走防止 | 1 ヒアリングの turn 数に上限(暫定 **10 turn**)。超過は stall 扱いで人間に判断を返す(無限往復を防ぐ) | 最終値の調整・定数化は S5 |
| 後方互換 | 既存 brief 注入・3-source 合成・scripted 経路テストを壊さない | US-01/03/04 AC |
| session 寿命 | claude 側保持。失効時は resume→stalled→retry(新規 run) | C1/エラー方針 |

---

## 質疑応答ログ

(S4 固有のユーザー向け論点なし — 本サイクルの対話論点は S1 index Q-01〜03 / D-04 で確定済。本 S4 はその確定を技術契約に落とすのみ。新規の Biz 判断は発生しない。)

---

## AI が独自に決めたこと と 理由

> いずれも**内部コードの設計**(責務契約①: 事業部は内部コードを前提にしない / US-03・04・01 が「AI 裁量に委任」で確定済の延長)。最終要件(US の覆う範囲)は不変。

### D-01 — session-id は studio 別 store に永続し aidlc-docs に出さない
- **理由**: 実行基盤の状態であり成果物ではない。CLAUDE.md データモデルの「run 状態は別 store」境界に従う。in-memory map はサーバ再起動で消えるため永続必須(US-04 Q-01 の境界確定)。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計。評価 AI レビュー N-1 が「人間承認不要」を確認 / 2026-06-13)。ユーザー上書き希望時は随時反映。

### D-02 — resume を「turn 継続」専用に純化し、承認 finalize は別経路にする
- **理由**: 現 `resume()` の二義(承認 done / 将来の継続)が混線の温床。回答 kind(`question`→継続 / `visual_review`→finalize)で分ける方が状態遷移が明確で誤遷移を防ぐ。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計。評価 AI レビュー N-1 が「人間承認不要」を確認 / 2026-06-13)。ユーザー上書き希望時は随時反映。

### D-03 — 質問/返信の wire は言語タグ付き fenced JSON block(`aidlc-question` / `aidlc-answers`)
- **理由**: LLM の生成が安定し機械 parse が確実。自由文検出は誤検出/取りこぼし(US-03 R-01 で棄却済)。JSON は S2 の 4 部テンプレ意味論を構造で過不足なく表せ、web 描画は raw を隠せる。YAML より括弧明示で parse 堅牢。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計。評価 AI レビュー N-1 が「人間承認不要」を確認 / 2026-06-13)。ユーザー上書き希望時は随時反映。

### D-04 — 前段文脈は「当該サイクル done 前段の index 全件 + 直接依存成果物」を既定とし、超過時に段階縮退
- **理由**: US-01 Q-01 が S4 に預けた絞り規則。サイクル内に閉じれば文脈汚染とトークン肥大を両抑制(過去版横断は Wiki/ledger の役割 / US-01 R-01)。縮退しても可視マーカで欠落を黙らせない(原則④)。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計。評価 AI レビュー N-1 が「人間承認不要」を確認 / 2026-06-13)。ユーザー上書き希望時は随時反映。

---

## 棄却した案

### R-01 — mid-run 割り込み(実行途中を割って質問)を本サイクルで実装
- **棄却理由**: `claude -p` は完遂型で途中停止しない。turn ベース(C1)で S1 ヒアリングは回る。本格中断は別レイヤ(S8-Q02 / 後続)。S1 R-01 と整合。

### R-02 — resume を使わず毎 turn 全文脈を prompt 再注入
- **棄却理由**: トークン肥大・文脈ドリフト。`--resume` で session 文脈を引き継ぐ方が正確で安価(US-04 R-01 と整合)。

### R-03 — 自由文ヒューリスティック(「?」検出)で質問化
- **棄却理由**: 誤検出・取りこぼし。完成検査は仕様(構造化契約)起点が原則(US-03 R-01 / completeness-checks-anchor-on-spec)。

---

## 触る US の binding 逆引き確認(完了条件⑥)

| US | binding/AC | S4 契約 | 整合 |
|----|-----------|---------|------|
| US-01 | brief+前段成果物注入 / 解決は app/engine / 後方互換 / 絞り規則は S4 | C5 / D-04 | ✓ AC が S4 に預けた絞り規則を充足。解決を app/engine に置く点も一致 |
| US-03 | 質問は構造化マーカで `question` 化 / 誤分類しない / scripted 整合 / テンプレは S2/S4 | C3 / D-03 | ✓ wire マーカ詳細を確定。block 無し=visual_review で誤分類回避 |
| US-04 | 回答で `--resume` 次 turn / session 同一性 / 返信フォーマット化 / scripted 再現 / 失敗は stall | C1・C2・C4・C6 / D-01・D-02 | ✓ session 永続境界・返信エンベロープ・scripted パリティを確定 |
| US-05 | 同一画面 QA スレッド(画面/UI) | (web 実装。S4 契約は wire のみ提供) | ✓ 矛盾なし(C3/C4 のデータを SCR-02 が描画) |
| index D-04 | 双方向フォーマット化 | C3(AI→人間)/ C4(人間→AI) | ✓ 双方向とも構造化で充足 |

→ 矛盾なし。S4 契約はいずれも確定済 US の AC が「S4 で確定」と預けた部分を埋めるもの。

---

## 次工程 (S5) への引き継ぎ
- **Work Units 分割で考慮すべき技術的制約**:
  - C1/C2 は port 拡張(`ResumeRun.sessionId?`)+ live・scripted 両アダプタ+ app 永続 を跨ぐ → 単一スライスにせず「質問経路(US-03)」「継続(US-04)」を分けた S1 D-03 の刻みに沿う。
  - C3/C4 の wire 契約は skill 本文修正(emit/返信突合の契約)を伴う = 道具では直らない層(CLAUDE.md)。**焼き込む skill**: 第一に人間ヒアリングを行う [aidlc-s1-requirements](../../kit/skills/aidlc-s1-requirements)(`aidlc-question` emit + `aidlc-answers` 突合の契約)。加えて人間に確認を投げうる全 step skill に同契約を共通追記(具体的には descope/レビュー質問を出す S6/S8/S9 系)。共通契約は [kit/rules/aidlc-operating-model.md](../../kit/rules/aidlc-operating-model.md) に 1 箇所定義し各 skill から参照(DRY)。最終の対象 skill 一覧と文面は S5/S7。
- **優先して実装すべき技術的基盤**: session-id 永続(C1)— これが無いと US-04 の全 AC が成立しない。次いで C3 の parse(US-03 の心臓)。
- **技術的リスクと軽減策**:
  - `--resume` の session 失効/挙動が CLI バージョン依存 → 失敗は `stalled`→retry に倒す(C1 エラー方針)で握り潰さない。
  - AI が `aidlc-question` block を出さない/壊れた JSON → parse 失敗は可視化(原則④)、block 無しは従来 visual_review にフォールバック(誤分類より安全側)。

## 評価 AI レビュー記録(2026-06-13 / code-architect 評価エージェント)

S4 は全項目が内部コード設計(責務契約①: 事業部は内部コードを前提にしない)で、人間 human-gate に該当する Biz/プロダクト判断を含まない。よって人間承認でなく**評価 AI の敵対的レビュー**で確定検査を実施(v0.0.3 s4 §9 の確立パターン踏襲 / dogfood 作業規範)。

- **総合判定**: SOUND-WITH-FIXES → 指摘を全反映して解消。
- **N-1(人間判断の見落とし検査)**: D-01〜D-04 を「人間承認不要」とした分類は**正しい**と確認(隠れた Biz/プロダクトゲートなし)。
- **反映した指摘**:
  - B-1: C2「resume が二重責務」は事実誤り(現 `resume()` は done emit のみ・--resume 経路は未実装)→「新経路の追加」に訂正、実装デルタ注記を追加。
  - B-2: スタック代替案未記録(完了条件①)→ 前サイクル s4 への代替案記録参照 +「変更なし+理由」を明記。
  - B-3: C1 に session-id の parse 点が欠落 → `awaitAndEmit`/`extractSessionId` の init 行取得を固定。
  - S-1: ★おすすめ「≥1」→ S2 D-04 準拠「ちょうど 1(0/2+ は弾く)」に修正。
  - S-2: turn 上限を暫定 10 turn と本 S4 に明記(完了条件④の定量化)。
  - N-4: wire 契約を焼き込む skill(S1 ほか)を S5 引き継ぎに列挙。
- **検証された事実主張(NOTE)**: PhasePipeline の N フェーズ対応 / contextPaths 未配線 — いずれもコードと一致(誤りなし)。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか:
- 暫定の解決方針:
- 棄却した案とその理由:

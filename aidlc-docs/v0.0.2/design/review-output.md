# 設計スレッド — レビュー出力設計 (Review Output Design)

## 位置づけ
- **S1 ↔ S2 の橋**。視覚レビュー(US-13)/ リッチレビュー(US-18)の中身を先に詰める。
- ここの結論が **S2(画面)/ S5(Artifact 集約)/ orchestration(Agent の emit 契約)** の前提になる。
- なぜ独立スレッド: ステップごとに「何を出力するか」が別物。特に **S6/S7 は人間がコードを見ない**ため、AI が "承認可能な代替表現" を**合成**する必要がある。視覚レビューは 1 画面ではなく**型ごとレンダラ + 合成**のサブシステム。
- ステータス: 確定(設計方針)
- 作成日: 2026-06-05 / 更新日: 2026-06-05

## 1. per-step review payload マトリクス

| Step | Agent が生む Artifact | 人間が視覚レビューする対象(review payload) | 表現の型 | 承認の意味 |
|---|---|---|---|---|
| S1 US | US一覧(3観点/版) | グルーピング済 US + 前回差分 | 構造/リスト | この US 群で進む |
| S2 Mock/Flow | 画面モック + フロー | モック画像 + Mermaid フロー | 図/モック | この画面・遷移で進む |
| S2.5 UI | トークン + 画面HTML→PNG | 状態別スクショ + トークンカタログ | スクショギャラリー | この視覚意図で進む |
| S3 UoW | Unit分割 + I/F契約 | Unit一覧 + I/Fシグネチャ | 構造/表 | この分割・契約で進む |
| S4 Context Map | 依存DAG | Mermaid DAG | 図 | この依存関係で進む |
| S5 Domain | 集約/不変条件/状態遷移 | 集約図 + 状態機械図 + 不変条件 + ユビキタス言語 | 図+構造 | このモデルで進む |
| **S6 Code** | コード + テスト | **(コード非表示)変更説明 / AC充足マップ / テスト+カバレッジ / 7-reviewer verdict / リスク分析 / 差分サマリ** | **合成レビューカード** | この実装を受け入れる |
| **S7 Integration** | 統合アプリ | verify-ui スクショ(状態別)/ E2E結果 / US貫通確認 / 実機確認依頼 / リスク / 差分サマリ | スクショ+レポート+実機カード | この統合を受け入れる |

## 1.5 第2軸 — Task kind による変化(出力は step × task-kind の 2 次元)

review payload は step だけでなく **Task の種類**でも変わる。同じ S6/S7 でも UI機能とリファクタリングでは見せるものが別物。

| Task kind | レビューで効く固有ブロック |
|---|---|
| UI機能(画面あり) | 状態別スクショ / フロー / before-after 視覚差分 |
| ドメイン・ロジック(画面なし) | 不変条件 / 境界値テスト表 / 状態遷移 |
| API・契約 | I/F シグネチャ / request-response 例 / 契約テスト |
| データモデル・マイグレーション | スキーマ差分 / マイグレ手順 / データ整合リスク / 後方互換 |
| セキュリティ・認可 | security-reviewer verdict を最上段 / 脅威シナリオ / multi-tenant 防御テスト |
| I/O・エクスポート(CSV 等) | サンプル出力(実物)/ フォーマット仕様 |
| 外部連携(通知 / Webhook) | イベントフロー / 契約(stub 範囲明示) |
| リファクタリング(振る舞い不変) | 不変の証明(同テスト緑 / AC 不変)/ 差分範囲 |
| バグ修正 | repro(落ちてたテスト)→ 緑 / 回帰範囲 |
| 性能改善 | ベンチ before-after / 計算量 |
| 設定・インフラ | config 差分 / env 影響 |

→ step(縦)× task-kind(横)で **組合せ爆発**する。固定画面では捌けない。

## 1.6 設計解 — review payload = 型付きブロックの列(block-stream)

組合せを N×M 画面で作らない。**review payload を「型付きレビューブロックの順序リスト」として Agent が emit** し、**汎用レンダラがブロック列を描画**する。

- ブロック型(論点A の拡張): `summary` / `ac-map` / `mermaid` / `screenshot(状態別)` / `test-report` / `coverage` / `reviewer-verdict` / `risk` / `diff-summary` / `sample-output` / `schema-diff` / `benchmark` / `device-check` …
- **どのブロックを emit するかが step × task-kind で決まる**(バリエーションはデータに宿る)。レンダラ・レビュー画面は 1 つ(ブロックを順に描くだけ)。
- Task / Artifact 集約が `kind` を持ち、Agent の emit 契約が `ReviewBlock[]` を返す。
- これで「**画面は 1 枚、出力は無限のバリエーション**」を両立。→ S5(集約に kind / ReviewBlock)・orchestration(Agent の emit 契約)・S2(汎用レビュー面)の前提。

### Q-06 — この block-stream モデル(出力はデータ=ブロック列 / レンダラは汎用 1 つ)で行くか?
- **回答**:
  >
- **確定**:
  >

## 1.7 設計基準 — 「事業部 Go サイン」dossier(レビュー出力の品質バー)

レビュー出力の基準を引き上げる: **障害が許されない PJ で、コードを読めない事業部に見せて Go が出る証拠パッケージ**。「最小で承認できる payload」ではなく「**高リスク文脈で確信を持って Go できる dossier**」を基準にする(= 論点B の "最小6点" を上書き)。

> 訂正(ユーザー指摘): バグ修正は「UT が落ちている → 緑」とは限らない。実際にレビュアーが安心するのは **修正前後の実シナリオ動画 / 原因 / 影響調査 / 再発防止**。静的な「テスト緑」だけでは Go は出ない。

### dossier spine(常に問われる事業部の問い = 固定)
1. **何が変わったか**(業務言語。コード用語でない) — `summary`
2. **効くと言える根拠(実演)**: 修正前後のシナリオ**動画** + 通過シナリオ一覧 + 実行ログ — `scenario-demo` `scenario-coverage`
3. **壊れていないと言える根拠**(3 facet):
   - (3a) **機能回帰**: 影響範囲 + 触れていない範囲(negative scope)+ 回帰テスト — `impact` `regression`
   - (3b) **既存ユーザー・既存データが壊れない**: 既存の本番相当データでシナリオを通す検証(新規インストールだけで判定しない)— `existing-data-safety`
   - (3c) **マイグレーション安全性**: 要否 / 可逆性 / データ整合 / 後方互換(旧データ形状で動く)/ 失敗時の挙動 / dry-run 結果 — `data-migration` `backward-compat`
4. **残存リスクと緩和** — `risk` `mitigation`
5. **失敗したら戻せる**(rollback / kill-switch) — `rollback`
6. **(変更・修正系)原因と再発防止** — `root-cause` `recurrence-guard`
7. **誰が検証したか**(客観的な第三者証跡 / 自己申告と分離): 7-reviewer / security / QA verdict — `attestation`

→ **spine(問い)は固定、それを満たす evidence ブロックが step × task-kind で変わる**。1.6 の block-stream と接続(spine = 章立て、block = 中身)。論点C(self-report 分離)は spine-7 の `attestation` として制度化する。

### task-kind ごとの強調(例)
- **バグ修正**: 2(前後動画)+ 6(原因 / 再発防止)+ 3(回帰)が主役
- **UI機能**: 2(動画 + 状態別スクショ)+ 3(視覚回帰)
- **セキュリティ**: 7(security verdict)最上段 + 4(脅威 / 緩和)+ 3(防御テスト)
- **データ移行**: 3(後方互換 / 整合)+ 5(rollback / マイグレ逆操作)が主役
- **性能改善**: 2(ベンチ before-after)+ 3(機能回帰)

### 新規ブロック(動的エビデンス含む)
- `scenario-demo`(修正前後の**動画**): 実アプリでシナリオを走らせ録画。verify-ui のスクショから一段重い capability。**Go 確信の中核**。
- `root-cause` / `impact`(影響調査・blast radius)/ `recurrence-guard`(再発防止)/ `rollback` / `attestation`(第三者検証)/ `mitigation`
- `existing-data-safety`(既存ユーザーの既存データでシナリオ通過)/ `data-migration`(手順 + 可逆性 + dry-run)/ `backward-compat`(旧データ形状で動く)
- **連動**: 不可逆なマイグレーション(rollback 不能)は spine-5 の Go ブロッカー。**永続データに触れる変更はすべて 3b/3c が自動発火**(新規動作だけ見て Go を出させない)。

### MVP との関係
- この dossier は **目標品質**。block-stream なので MVP(v0.0.1 = S1 を回すだけ)は `summary` / `ac-map` / `mermaid` 等の軽いブロックで開始し、`scenario-demo` 等の重いブロックは v0.0.x で追加する。**画面は 1 枚のまま育つ**。

### Q-07 — 「事業部 Go サイン dossier(spine 7 項目固定 + evidence 可変)」を品質バーの基準に据えるか? spine に過不足は?
- **回答**:
  >
- **確定**:
  >

## 2. 横断設計論点(提案 + Q)

### 論点A — Artifact 型 → レンダラ対応
- 型: `text/構造` / `mermaid` / `screenshot(状態別)` / `test-report` / `diff-summary` / `risk` / `ac-map`
- **提案**: Artifact 集約に `kind` と「review representation」を持たせ、型ごとにレンダラを用意。Agent は Artifact と一緒に review payload を emit する契約。
- → S5(Artifact 集約)/ orchestration の前提。

### 論点B — S6/S7 コードレビュー payload の最小セット(最重要)
- **提案(最小6点 / S7 は +スクショ)**:
  1. 変更説明(自然言語: 何の振る舞いを実装したか)
  2. AC 充足マップ(どの US/AC が満たされたか)
  3. テスト結果 + カバレッジ(line/branch)
  4. 7-reviewer verdict サマリ(CRITICAL/HIGH = 0 の証跡)
  5. リスク分析(壊れうる箇所 / edge / セキュリティ)
  6. 差分サマリ(ファイル/モジュール単位の概念差分。**生 diff ではない**)
  - S7 追加: verify-ui スクショ(状態別)+ US 貫通(画面→API→ドメイン→永続化)
- Q-02 で確認。

### 論点C — self-report バイアスの分離(信頼設計)
- **問題**: AI が自分のコードの「リスク」「テスト結果」を自己申告 → そのままでは信用できない。
- **提案**: **客観シグナル(テスト pass/fail・カバレッジ数値・7-reviewer の verdict)を一級市民**として最上段に置き、**AI の自己説明(変更説明・リスク所感)は補助**として視覚的に分離。人間は「客観 → 説明」の順で見る。
- Q-03 で確認。

### 論点D — 差し戻しの粒度
- **提案**: 承認/却下の二択に加え **部分差し戻し**(対象 = AC / 画面 / 集約 単位)+ **手戻り先ステップ指定**(例 S6→S2)+ **理由必須**(→ Decision 履歴 + ledger に残る)。
- Q-04 で確認(MVP に入れるか v0.0.x か)。

### 論点E — 状態カバレッジ
- 画面は default / empty / error / loading 等の複数状態。S2.5 の data-state を正本とする(既存 memory「Coverage gap-prevention」)。
- **提案**: レビューは **全 data-state のスクショ**を出す(fixture だけ緑で live 未結線=false-green を closure 前に潰す)。
- Q-05 で確認(全状態必須か主要のみか)。

## 3. US への波及(S1 手戻り候補)
- US-13 / US-18 はこの subsystem の入口。**型ごとレンダラ / コード合成 payload / 部分差し戻し / 客観シグナル分離 / 状態カバレッジ**は新 US 候補。論点確定後に S1 へ手戻りして US 追記 or v0.0.x へ割り当て。

## 確定サマリ(2026-06-05 / 「次いこう」で方針確定)
- **block-stream モデル(Q-06)** 採用: review payload = `ReviewBlock[]`、レンダラは汎用 1 枚。バリエーションはデータに宿す。
- **Go サイン dossier(Q-07)** を品質バーに採用: spine 7 項目固定 + evidence 可変。コードを読めない事業部が Go を出せる証拠を基準にする。#3 は 機能回帰 / 既存データ / マイグレーション の 3 facet。
- **論点A(Q-01)**: ブロック型分類で開始、新 kind はブロック型を足して拡張。
- **論点B(Q-02)**: 「最小6点」は撤回し dossier 基準に上書き。
- **論点C(Q-03)**: self-report 分離 = spine-7 `attestation` として制度化。
- **論点D(Q-04 / S2 手戻りで更新)**: 差し戻し = **手戻り先ステップ選択 + 理由**(→ Decision / ledger)を **MVP に内在**(AI-DLC は任意の過去ステップへ戻れるため)。**within-step の部分差し戻し(AC / 画面 単位)は v0.0.x**。
- **論点E(Q-05)**: レビューは全 data-state を出す(false-green 防止 / memory「Coverage gap-prevention」連動)。

### 後工程への波及(carry / 取りこぼし防止 — v0.0.x で ledger 化)
US-13 / US-18 を入口とする review subsystem。新 US 候補(MVP は軽いブロックのみ / 下記は v0.0.x):
- 汎用レビューレンダラ(block-stream)
- `scenario-demo`(前後動画録画)capability
- Go dossier 合成(S6/S7 の evidence パッケージ自動生成)
- 既存データ安全性 / マイグレーション安全性の検証ブロック
- 部分差し戻し + 手戻り先指定
- `attestation`(第三者検証の分離表示)
→ **S2(汎用レビュー面)/ S5(Artifact・Task に `kind` / `ReviewBlock`)/ orchestration(Agent の emit 契約)** の前提として引き渡す。

## 質疑応答ログ

### Q-01 — Artifact 型分類(論点A)はこれで十分か?
- **回答**:
  >
- **確定**:
  >

### Q-02 — S6/S7 コードレビュー payload の最小6点(論点B)でよいか? 削る/足す?
- **回答**:
  >
- **確定**:
  >

### Q-03 — 客観シグナル優先 + AI 自己説明は補助、という信頼設計(論点C)でよいか?
- **回答**:
  >
- **確定**:
  >

### Q-04 — 部分差し戻し + 手戻り先指定(論点D)は MVP に入れるか v0.0.x か?
- **回答**:
  >
- **確定**:
  >

### Q-05 — レビューで全 data-state を出す(論点E)か、主要状態のみか?
- **回答**:
  >
- **確定**:
  >

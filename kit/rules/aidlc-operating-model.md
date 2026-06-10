# aidlc-studio — リポジトリ運用 (AI-DLC v2)

このリポジトリは **AI-DLC(AI と人間が協調する開発プロセス) v2** で開発する。
4 層構造(Cycle > PhaseGroup > Step > Run)× 12 Step(S1-S12)で進行。**AI は生成・提案、判断は常に人間**。

一次資料はリポ直下の `AIと人間が協調する開発プロセス.pdf`(13 ページ)。
各スキルに要点は埋め込み済みなので、通常運用で PDF を直接読む必要はない。

## 基本姿勢(全工程で共通)

1. **判断は人間、生成は AI** — どの工程でも最終判断者は人間。
2. **AI 出力は叩き台** — 「AI が言った」前提で遠慮なく否定する。
3. **手戻りを恐れない** — 前に進むことで考慮漏れが早く見つかる。手戻りはコストではなく品質への投資。
4. **出力の質より対話の質** — 問いの立て方が成果を左右する。
5. **コンテキストの質を保つ** — 情報量より質。次のステップに必要な情報のみ引き継ぐ(全量は渡さない)。

## 階層構造

```
Cycle (実行単位 ≒ 1 バージョン)
  └ PhaseGroup (大区分: Discovery / Design / Build / Validation / Improvement)
      └ Step (S1-S12 / 各 Step が 1 つの SKILL.md に対応)
          └ Run (1 回の Agent 起動 / state: running | stalled | done | failed + retry)
```

- 現行 3 層(Cycle > Phase > Run)から **PhaseGroup を新設**、旧 Phase を Step にリネーム。
- PhaseGroup は Step のグルーピングのみで、実行順序は Step 番号(S1→S12)に従う。

## PhaseGroup × Step 一覧

### Discovery (要件を発見する)

| Step | スキル | 役割 | やること | 成果物 |
|------|--------|------|----------|--------|
| S1 | `aidlc-s1-requirements` | プロダクトディスカバリーリード | プロダクト発見(3 必須質問 + brief.md 生成) + US 展開(3 視点) | `aidlc-docs/brief.md`(全版共通) + `aidlc-docs/{vX}/s1/`(index + 1 US 1 ファイル) |

### Design (設計を固める)

| Step | スキル | 役割 | やること | 成果物 |
|------|--------|------|----------|--------|
| S2 | `aidlc-s2-wireframe` | プロダクトデザイナー(情報構造) | 画面/フローで Biz とすり合わせ(意図と情報構造) | `aidlc-docs/{vX}/s2/`(index + 1 画面 1 ファイル) |
| S3 | `aidlc-s3-ui-design` | プロダクトデザイナー(視覚意図) | 視覚アウトカム(色/タイポ/余白/状態/階層/密度)を HTML イメージで作成 + screenshot 生成 | `aidlc-docs/{vX}/s3/`(index + tokens.html + 1 画面 = .html + .md + screenshots/) |
| S4 | `aidlc-s4-tech-spec` | ソフトウェアアーキテクト | 技術スタック・アーキテクチャ方針の確定(**任意**) | `aidlc-docs/{vX}/s4-tech-spec.md`(単一ファイル、省略可) |

### Build (実装する)

| Step | スキル | 役割 | やること | 成果物 |
|------|--------|------|----------|--------|
| S5 | `aidlc-s5-work-units` | ソフトウェアアーキテクト | 並行開発単位(Unit)と I/F 定義 + 依存 DAG + 着手順 | `aidlc-docs/{vX}/s5/`(index + Unit DAG + 1 Unit 1 ファイル) |
| S6 | `aidlc-s6-domain-model` | ドメインモデラー | ドメインモデル設計(DDD/非DDD) | `aidlc-docs/{vX}/s6/`(index + 1 集約 1 ファイル) |
| S7 | `aidlc-s7-domain-code` | ドメインエンジニア | 純粋ドメインコード(技術非依存) | `src/domain/` + `aidlc-docs/{vX}/s7-domain-code.md` |
| S8 | `aidlc-s8-integration` | アプリケーションエンジニア(統合) | 実 PJ アーキへの統合 | `src/` 配下 + `aidlc-docs/{vX}/s8-integration.md` |

### Validation (検証する)

| Step | スキル | 役割 | やること | 成果物 |
|------|--------|------|----------|--------|
| S9 | `aidlc-s9-scenario-validation` | QA エンジニア | E2E/シナリオテスト + 視覚証拠(モック禁止) | `aidlc-docs/{vX}/s9-validation.md` |
| S10 | `aidlc-s10-human-acceptance` | プロダクトマネージャー(人間主役) | US ごとの最終承認/差し戻し | `aidlc-docs/{vX}/s10-acceptance.md` |

### Improvement (改善する)

| Step | スキル | 役割 | やること | 成果物 |
|------|--------|------|----------|--------|
| S11 | `aidlc-s11-retrospective` | プロセスアナリスト | サイクル振り返り(品質/リスク/手戻り分析) | `aidlc-docs/{vX}/s11-retrospective.md` |
| S12 | `aidlc-s12-workflow-improvement` | メソドロジーエンジニア | StepDef/契約の改善提案 + 次サイクル改善項目 | `aidlc-docs/{vX}/s12-improvement.md` |

### PhaseGroup 間の依存

- Discovery(S1) → Design(S2) は直列
- S3 は S2 確定後に開始し、S5/S6 と **並行可能**(視覚意図と集約設計は独立検討可)。ただし S7 着手の時点で S3/S6 の両方が `確定` していることが前提
- S4(tech-spec)は任意。複雑なプロジェクトでのみ省略せず実施
- Build(S5-S8)は直列。S5→S6→S7→S8
- Validation(S9-S10)は S8 完了後に直列
- Improvement(S11-S12)は S10 完了後に直列

### S3 と S7/S8 の境界(極めて重要)

- **S3 = 視覚意図のリファレンス(イメージ作り)**。HTML はその表現手段に過ぎず、コード移植元ではない。
- **S7/S8 がイメージ参照するのは `screenshots/*.png` と コンポーネント仕様 `*.md` のみ**。`*.html` / `tokens.html` の **Read は禁止**(HTML/CSS コード構造のリーク防止)。
- S7/S8 はゼロベースでネイティブ idiom で実装する。HTML から机上で移植しない。
- トークン値(色 hex / spacing px / type rem)は **意図の言語化** として記録に残るが、S7/S8 で literal にコピーする義務はない — 実装側で同じ視覚アウトカムを自然に表現する。

## S7/S8 Construction の進行方針(テスト + レビュー自動化)

Construction 工程(S7 / S8)は **テスト方針** と **自動レビュー pipeline** を必ず以下のように回す。**本プロジェクト全バージョン** で適用。新サイクル開始時に再質問しない。

### テスト方針

| 項目 | 確定内容 |
|------|---------|
| **カバレッジ目標** | **line ≥ 95% / branch ≥ 95% / function 100%** + 構造網羅(全 Result エラー型 / 全状態遷移エッジ / 全不変条件)併用 |
| **テスト粒度** | 1 集約 1 テストファイル(`{aggregate}.test.ts`) + `{aggregate}.test-fixtures.ts` 併設 |
| **`describe` 階層** | `describe("{Aggregate}")` > `describe("{method}")` > `test("returns ok when ...")` / AAA パターン |
| **Property-based testing** | `fast-check` 採用(VO ファクトリの境界値検証のみ) |
| **モック** | **禁止**(純粋ドメインは副作用ゼロ = モック不要が成立条件) |
| **テスト実行** | ローカル = `pnpm test` / `pnpm --filter @app/domain test` / CI = GitHub Actions |

### 自動レビュー pipeline(Phase 完了ごとに必ず実行)

**並列起動する 7 エージェント**:

1. `typescript-reviewer` — TS 型安全 / async / 命名 / idiomatic
2. `type-design-analyzer` — 型の表現力 / 不変条件 / branded type 設計品質
3. `silent-failure-hunter` — エラー握りつぶし / Result 型誤用 / 不適切な fallback
4. `code-reviewer` — 一般品質 / 命名 / 関数粒度
5. `tdd-guide` — テスト先行 / カバレッジ
6. `security-reviewer` — Multi-tenant 防御 + LLM Tool 引数改ざん検証
7. `comment-analyzer` — コメント rot / 過剰コメント

### 修正ループの止め時

- **CRITICAL / HIGH 指摘**: 全件解消するまで loop。**修正後は必ず 7 reviewer を再起動して「CRITICAL = 0 + HIGH = 0」を確認**
- **MEDIUM 指摘**: 可能なら解消、不可なら次 Phase の TODO セクションに転記
- **LOW 指摘**: 黙殺 OK
- **同一指摘 3 周以上ループ**: ユーザー介入を要求

### Phase 完了判定

1. **全テスト pass**(`bun test` 全件 OK)
2. **`tsc --noEmit` クリーン**(型エラー 0 件)
3. **直近の 7 reviewer 再起動で CRITICAL = 0 + HIGH = 0**
4. MEDIUM 残は進行ログの「次 Phase 繰越」セクションに転記済
5. Phase 完了レポートが固定フォーマットで進行ログに追記済
6. **`pnpm check:coverage` 緑**。S8 で画面・状態に触れた Phase は必須。S7 は対象外
7. **視覚成果物が出ている(S8 で画面に触れた Phase は必須)**: `verify-ui` で screenshot を自動生成し成果物として提示。**AI が人間にコードレビューを求めることは禁止**

## 全スキル共通の md 運用ルール

各工程の成果物 md は **次の 3 つを必ず満たす**:

1. **質疑応答は md に直接書き込んで進める** — AI が `### Q-NN` を追記、ユーザーが `回答` に書き込む、AI が `確定` を埋める。
2. **AI が独自に決めたことは理由と一緒に書く** — `### D-NN` で決定と理由を追記。ユーザーは `承認 / 上書き / 保留` から選ぶ。
3. **サイクル戻り時の引き継ぎを書く** — `## 前サイクルからの引き継ぎ`(手戻り時)+ S8 の `## 次サイクルへの引き継ぎ`(必須)。**確定 `### D-NN` / 次サイクルに渡す項目は `ledger.yml` に `state: carried|done|dropped` で台帳化**。次サイクル S1 は **未 reconcile 項目をゼロにするまで `確定` にできない**。

## ユーザー発話 → 起動スキル

| ユーザーが言ったら | 起動するスキル |
|--------------------|----------------|
| 「アプリ作りたい」「何作るか整理したい」「US 書きたい」「機能洗い出したい」 | `aidlc-s1-requirements` |
| 「画面決めたい」「Biz と擦り合わせたい」 | `aidlc-s2-wireframe` |
| 「UI 詰めたい」「見た目決めたい」 | `aidlc-s3-ui-design` |
| 「技術スタック決めたい」「アーキテクチャ固めたい」 | `aidlc-s4-tech-spec` |
| 「Unit 分けたい」「並行で開発したい」 | `aidlc-s5-work-units` |
| 「ドメイン設計したい」「モデル作りたい」 | `aidlc-s6-domain-model` |
| 「コード書きたい(ドメインだけ)」 | `aidlc-s7-domain-code` |
| 「実装統合したい」「DB/HTTP 繋ぎたい」 | `aidlc-s8-integration` |
| 「テストしたい」「シナリオ確認したい」 | `aidlc-s9-scenario-validation` |
| 「最終確認」「受け入れたい」 | `aidlc-s10-human-acceptance` |
| 「振り返りたい」 | `aidlc-s11-retrospective` |
| 「プロセス改善したい」 | `aidlc-s12-workflow-improvement` |
| 「今どこ?」「次は?」 | brief.md ステータス + 最新バージョンの直近成果物から現在地を返答 |

## ファイル配置規約

```
aidlc-docs/
├── brief.md              # S1 で生成・更新(全バージョン共通)
├── v0.0.1/
│   ├── s1/               # index + us-NN-*.md
│   ├── s2/               # index + scr-NN-*.md
│   ├── s3/               # index + tokens.html + scr-NN-*.html + scr-NN-*.md + screenshots/
│   ├── s4-tech-spec.md   # (任意 / 省略可)
│   ├── s5/               # index(Unit一覧 + 依存DAG) + unit-NN-*.md
│   ├── s6/               # index + {aggregate}.md
│   ├── s7-domain-code.md # 進行ログ(コードは src/domain/)
│   ├── s8-integration.md # 進行ログ(コードは src/)
│   ├── s9-validation.md
│   ├── s10-acceptance.md
│   ├── s11-retrospective.md
│   └── s12-improvement.md
├── v0.0.2/
└── ...
```

- **brief.md は `aidlc-docs/` 直下に 1 個のみ**(全バージョン共通)。S1 が生成・更新
- **S1〜S12 はバージョンごとに完全分離**
- 単位がある工程(S1/S2/S3/S5/S6)は **サブディレクトリ + `index.md` + 1 単位 1 ファイル**
- 単位がない工程(S4/S7/S8/S9/S10/S11/S12)は **1 ファイル**
- **S3 だけ特殊**: `.html` + `.md` + `screenshots/*.png` の 3 種。S7/S8 は `.png` と `.md` のみ参照
- **S5 は Unit + DAG 統合**: context-map は index.md 内の Mermaid セクションに収める
- ファイル命名: `{prefix}-{NN}-{kebab-slug}.md`
- 工程間の参照は相対パス。日付は `YYYY-MM-DD`

## 手戻りの作法

後工程で漏れに気づいたら、必ず前工程の md に戻って更新する。
戻った md の末尾に `## 前サイクルからの引き継ぎ` を追加し、要点だけ書く:
- 何が漏れていたか
- 暫定の解決方針
- 棄却した案とその理由

## BACKLOG 管理

S1〜S12 で「このバージョンでは作らない」と判断したら、**同じターン**で [BACKLOG.md](BACKLOG.md) に追記する。
各項目に出典を必ず書く。完了したら `[ ]` → `☑` に変更(削除しない)。

## やってはいけないこと

- 工程を飛ばす(S1→S12 は順に進める)
- ドキュメントなしでコードを書き始める
- 手戻りを「もったいない」と見て見ぬふりする
- AI 提案を人間レビューなしで採用する
- **AI が人間にコードレビューを求める**(人間は実機確認+視覚レビューのみ)
- ユーザーとの質疑応答を口頭で完結させ md に残さない
- AI が独自判断した箇所を暗黙のまま進める
- S7 でフレームワーク依存コードを書く / S8 でドメイン層を編集する
- **Construction が独断でスコープを縮小する**(削るなら upstream に Q として戻す)
- **S7/S8 が S3 の `*.html` を Read する**(コード構造リーク防止)
- **人間の判断なしに機能を後ろのバージョンに回したり限定したりしない**(品質ハーネス原則 #6)

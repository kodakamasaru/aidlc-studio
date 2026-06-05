# self-management-app — リポジトリ運用 (AI-DLC)

このリポジトリは **AI-DLC(AI と人間が協調する開発プロセス)** で開発する。
コードを書く前に S1〜S7 の工程を順に踏む。**AI は生成・提案、判断は常に人間**。

一次資料はリポ直下の `AIと人間が協調する開発プロセス.pdf`(13 ページ)。
各スキルに要点は埋め込み済みなので、通常運用で PDF を直接読む必要はない。

## 基本姿勢(全工程で共通)

1. **判断は人間、生成は AI** — どの工程でも最終判断者は人間。
2. **AI 出力は叩き台** — 「AI が言った」前提で遠慮なく否定する。
3. **手戻りを恐れない** — 前に進むことで考慮漏れが早く見つかる。手戻りはコストではなく品質への投資。
4. **出力の質より対話の質** — 問いの立て方が成果を左右する。
5. **コンテキストの質を保つ** — 情報量より質。次のステップに必要な情報のみ引き継ぐ(全量は渡さない)。

## 工程・役割・成果物

| Step | スキル | 役割(誰として振る舞うか) | やること | 成果物 |
|------|--------|--------------------------|----------|--------|
| 前段 | `aidlc-brief` | プロダクトディスカバリーリード | 目的・対象ユーザー・スコープの言語化 | `aidlc-docs/brief.md`(全バージョン共通 / 1 個) |
| S1 | `aidlc-s1-user-story` | プロダクトマネージャー | US 15 前後 + 3 観点 | `aidlc-docs/{vX}/s1/` (index + 1 US 1 ファイル) |
| S2 | `aidlc-s2-screen-mock` | プロダクトデザイナー(情報構造) | 画面/フローで Biz とすり合わせ(意図と情報構造) | `aidlc-docs/{vX}/s2/` (index + 1 画面 1 ファイル) |
| S2.5 | `aidlc-s2.5-ui-spec` | プロダクトデザイナー(視覚意図) | 視覚アウトカム(色 / タイポ / 余白 / 状態 / 階層 / 密度)を HTML イメージで作成 + screenshot 生成 | `aidlc-docs/{vX}/s2.5/` (index + tokens.html + 1 画面 = .html + .md + screenshots/) |
| S3 | `aidlc-s3-unit-of-work` | ソフトウェアアーキテクト | 並行開発単位と I/F 定義案 | `aidlc-docs/{vX}/s3/` (index + 1 Unit 1 ファイル) |
| S4 | `aidlc-s4-context-map` | ソフトウェアアーキテクト | Unit 間関係を Mermaid 1 枚 | `aidlc-docs/{vX}/s4-context-map.md` |
| S5 | `aidlc-s5-domain-model` | ドメインモデラー | ドメインモデル設計 (DDD/非DDD) | `aidlc-docs/{vX}/s5/` (index + 1 集約 1 ファイル) |
| S6 | `aidlc-s6-pure-code` | ドメインエンジニア | 純粋ドメインコード(技術非依存) | `src/domain/` + `aidlc-docs/{vX}/s6-pure-code.md` |
| S7 | `aidlc-s7-integration` | アプリケーションエンジニア(統合) | 実 PJ アーキへの統合 | `src/` 配下 + `aidlc-docs/{vX}/s7-integration.md` |

S1〜S2.5 + S3〜S4 は **Inception**(要件定義)、S5〜S7 は **Construction**(実装)。
S2.5 は S2 確定後に開始し、S3/S4/S5 と **並行可能**(視覚意図と集約設計は独立検討可)。ただし S6 着手の時点で S2.5 / S5 の両方が `確定` していることが前提。

### S2.5 と S6/S7 の境界(極めて重要)

- **S2.5 = 視覚意図のリファレンス(イメージ作り)**。HTML はその表現手段に過ぎず、コード移植元ではない。
- **S6/S7 がイメージ参照するのは `screenshots/*.png` と コンポーネント仕様 `*.md` のみ**。`*.html` / `tokens.html` の **Read は禁止**(HTML/CSS コード構造のリーク防止)。
- S6/S7 はゼロベースで React Native / Expo ネイティブ idiom で実装する。HTML から机上で移植しない。
- トークン値(色 hex / spacing px / type rem)は **意図の言語化** として記録に残るが、S6/S7 で literal にコピーする義務はない — RN 側で `StyleSheet` / native idiom で同じ視覚アウトカムを自然に表現する。

## S6/S7 Construction の進行方針(テスト + レビュー自動化)

Construction 工程(S6 / S7)は **テスト方針** と **自動レビュー pipeline** を必ず以下のように回す。**本プロジェクト全バージョン(v0.0.1 / v0.0.x / v1.0.0)** で適用。新サイクル開始時に再質問しない。詳細議論ログは各サイクルの `aidlc-docs/{vX.Y.Z}/s6-pure-code.md` Q-05 / Q-06 を参照(初出は v0.0.1 / 2026-06-01)。

### テスト方針

| 項目 | 確定内容 |
|------|---------|
| **カバレッジ目標** | **line ≥ 95% / branch ≥ 95% / function 100%** + 構造網羅(全 Result エラー型 / 全状態遷移エッジ / 全不変条件)併用。reviewer エージェントが構造網羅を補助確認 |
| **テスト粒度** | 1 集約 1 テストファイル(`{aggregate}.test.ts`) + `{aggregate}.test-fixtures.ts` 併設(Builder + Default Valid Instance) |
| **`describe` 階層** | `describe("{Aggregate}")` > `describe("{method}")` > `test("returns ok when ...")` / AAA パターン |
| **Property-based testing** | `fast-check` 採用(VO ファクトリの境界値検証のみ / 集約ルートの不変条件は固定例) |
| **Multi-tenant 防御テスト** | 全 Repository Port が `ownerScope: UserId` を受けることを **型レベル(`ts-expect-error`)+ 振る舞いレベル(他 user スコープで NotFound)両方** でテスト |
| **結線オフ契約テスト** | `notification-hook` 系は **型レベルのみ**(`PersistedHookExecution` 型に `sendPush` メソッドが存在しないことを `ts-expect-error` で検証 / ランタイム検証は過剰) |
| **スナップショットテスト** | **不採用**(純粋ドメイン層に視覚出力なし) |
| **モック** | **禁止**(純粋ドメインは副作用ゼロ = モック不要が成立条件 / モックが必要になった瞬間に純粋性が壊れている) |
| **テスト実行** | ローカル = `pnpm test`(全 workspace)/ `pnpm --filter @app/domain test`(domain のみ) / CI = GitHub Actions(v0.0.1 は最小設定 / v0.0.x で本格化) |

### 自動レビュー pipeline(Phase 完了ごとに必ず実行)

**起動タイミング**: Phase 完了時(各集約完了時ではなく Phase 単位)。粒度中 = レビュアー視点で塊が見える + 修正コスト局所 + トークン効率中庸。

**並列起動する 7 エージェント**(Agent tool を 1 メッセージ内に並列発行):

1. `typescript-reviewer` — TS 型安全 / async / 命名 / idiomatic
2. `type-design-analyzer` — 型の表現力 / 不変条件 / branded type 設計品質
3. `silent-failure-hunter` — エラー握りつぶし / Result 型誤用 / 不適切な fallback
4. `code-reviewer` — 一般品質 / 命名 / 関数粒度
5. `tdd-guide` — テスト先行 / カバレッジ
6. `security-reviewer` — Multi-tenant 防御 + LLM Tool 引数改ざん検証(純粋ドメインでもセキュリティ責務あり)
7. `comment-analyzer` — コメント rot / 過剰コメント

**S6 Phase 6 完了時 / S7 全工程完了時に追加**: `refactor-cleaner`(全ドメイン横断重複検出 / 1 回のみ)

**共通プロンプトテンプレート**: 「対象 Phase 番号 + 対象集約名 + コード/テストパス + 直前のテスト結果サマリ + S5 集約 md への参照 + CRITICAL/HIGH 解消優先 + Result 型誤用と Multi-tenant 防御 Repository Port シグネチャを必ず確認」

### 修正ループの止め時

- **CRITICAL / HIGH 指摘**: 全件解消するまで loop(共通ルール `~/.claude/rules/common/code-review.md` 準拠)。**修正実施後は必ず 7 reviewer を再起動して「CRITICAL = 0 + HIGH = 0」をエージェント出力で確認する**(=コードを見直しただけで「修正完了 = 0 件」と Phase 完了レポートに書くことは禁止 / 再レビュー結果を引用すること)
- **MEDIUM 指摘**: 可能なら解消、不可なら次 Phase の TODO セクションに転記
- **LOW 指摘**: 黙殺 OK
- **同一指摘 3 周以上ループ**: ユーザー介入を要求(=AI 間の堂々巡り = 構造的問題のサイン)

### Phase 完了判定(以下を **すべて** 満たした時点で Phase 完了)

1. **全テスト pass**(`bun test` 全件 OK)
2. **`tsc --noEmit` クリーン**(型エラー 0 件)
3. **直近の 7 reviewer 再起動で CRITICAL = 0 + HIGH = 0**(初回レビュー + 修正だけで「Phase 完了」と宣言することは禁止 / 再レビューエージェントの出力を Phase 完了レポートに引用すること)
4. MEDIUM 残は `s6-pure-code.md` / `s7-integration.md` の「次 Phase 繰越」セクションに転記済
5. Phase 完了レポートが固定フォーマットで進行ログに追記済
6. **`pnpm check:coverage` 緑**(画面×状態カバレッジ = false-green / SPEC_UNCOVERED / SCREEN_UNCOVERED が 0)。S7 で画面・状態に触れた Phase は必須(= fixture だけ緑で live 未結線の状態を closure 前に潰す / 仕組みは `scripts/coverage/` + memory「Coverage gap-prevention」)。S6(純粋ドメイン)Phase は対象外

### ユーザー介入条件(=以下のみ AI 単独判断を停止)

1. 同一指摘 3 周以上ループ(AI 間の見解相違)
2. エージェント間で矛盾指摘(例: `typescript-reviewer` と `type-design-analyzer` の対立)
3. 集約境界の変更が必要と判明 → S5 に戻る(`s5/index.md`「前サイクルからの引き継ぎ」追記)
4. Repository Port シグネチャ変更が必要と判明 → S3/S5 に戻る(S3 I/F 整合チェック)
5. その他は Phase 完了サマリと共に報告のみ(=対話コスト最小化)

### Phase 完了レポート固定フォーマット

```markdown
## Phase {N} 完了レポート

### 実装サマリ
- 対象集約: {aggregate-list}
- コードパス: {file-paths}
- テストパス: {test-paths}
- テスト結果: {N/M passed} / coverage {line: X% / branch: Y%}

### Reviewer 並列起動結果
| Reviewer | CRITICAL | HIGH | MEDIUM | LOW | 主要指摘 |
|----------|----------|------|--------|-----|---------|

### 修正ループ
- {ループ回数} 周で全 CRITICAL/HIGH 解消
- MEDIUM 残: {次 Phase へ繰越項目}
- LOW: 黙殺

### S6 進捗
- 完了 Phase: {1〜6}
- 残 Phase: {未完了 Phase}

### ユーザー判断要求(あれば)
- {条件と質問}
```

報告先: 進行ログ md(`s6-pure-code.md` / `s7-integration.md`)の「実装一覧」テーブル直下に Phase ごと追記 + ターン応答にもサマリを返す。

## 全スキル共通の md 運用ルール

各工程の成果物 md は **次の 3 つを必ず満たす**(やり直し時の判断材料を残すため):

1. **質疑応答は md に直接書き込んで進める** — AI が `### Q-NN` を md に追記する。**ユーザーは IDE で md を開いて `回答` セクションに直接書き込む**(口頭やりとりに頼らない)。複数行・コードブロック OK。AI は次のやり取りで `確定` を埋める。
2. **AI が独自に決めたことは理由と一緒に書く** — AI が `### D-NN` で決定と理由を追記。ユーザーは `判断` を `承認 / 上書き / 保留` から選び、上書きするなら `上書き内容` に書く。
3. **サイクル戻り時の引き継ぎを書く** — `## 前サイクルからの引き継ぎ`(手戻り時に追加)+ S7 の `## 次サイクルへの引き継ぎ`(必須)。

引き継ぎに書くのは PDF P.10 準拠で以下の 3 つだけ(全量コピーしない):
- 何が漏れていたか
- 暫定の解決方針
- 棄却した案とその理由

## ユーザー発話 → 起動スキル

| ユーザーが言ったら | 起動するスキル |
|--------------------|----------------|
| 「アプリ作りたい」「何作るか整理したい」「ざっくり相談したい」 | `aidlc-brief` |
| 「US 書きたい」「機能洗い出したい」 | `aidlc-s1-user-story` |
| 「画面決めたい」「Biz と擦り合わせたい」 | `aidlc-s2-screen-mock` |
| 「UI 詰めたい」「見た目決めたい」「デザイン固めたい」 | `aidlc-s2.5-ui-spec` |
| 「Unit 分けたい」「並行で開発したい」 | `aidlc-s3-unit-of-work` |
| 「Unit の関係図描きたい」「全体像可視化したい」 | `aidlc-s4-context-map` |
| 「ドメイン設計したい」「モデル作りたい」 | `aidlc-s5-domain-model` |
| 「コード書きたい(ドメインだけ)」「純粋ドメイン実装したい」 | `aidlc-s6-pure-code` |
| 「実装統合したい」「DB/HTTP 繋ぎたい」 | `aidlc-s7-integration` |
| 「今どこ?」「次は?」 | `aidlc-docs/brief.md` のステータス + `aidlc-docs/` 直下の最新バージョン (`vX.Y.Z/`) の直近成果物のステータスから現在地を返答 |
| 「次に何作る?」「次のバージョンで何やる?」 | 現バージョンの「次サイクルへの引き継ぎ」セクションを読み、優先順位は新バージョン入口で再評価する旨を案内 |

## ファイル配置規約

```
.
├── aidlc-docs/
│   ├── brief.md              # **全バージョン共通の brief** (1 個のみ / アプリ全体のビジョン)
│   ├── v0.0.1/               # バージョンごとに S1〜S7 を完全分離
│   │   ├── s1/
│   │   │   ├── index.md      # US 一覧目次 + 全体 Q&A + 全体 AI 判断 + 引き継ぎ
│   │   │   ├── us-01-{slug}.md
│   │   │   └── ...
│   │   ├── s2/
│   │   │   ├── index.md      # 画面遷移フロー(Mermaid) + 全体 Q&A + 引き継ぎ
│   │   │   ├── scr-01-{slug}.md
│   │   │   └── ...
│   │   ├── s2.5/
│   │   │   ├── index.md      # 視覚方針 / デザイン原則 / 全体 Q&A + 引き継ぎ
│   │   │   ├── tokens.html   # 視覚カタログ source(色 / タイポ / 余白 / radius / shadow / motion)
│   │   │   ├── scr-01-{slug}.html   # 1 画面 = 1 HTML(状態は section で並列定義)
│   │   │   ├── scr-01-{slug}.md     # native 固有挙動 / a11y / gesture / motion(文字で書く)
│   │   │   └── screenshots/  # 自動生成(`bun run s2.5:capture`) / S6/S7 はここしか見ない
│   │   │       ├── tokens.png
│   │   │       ├── scr-01-{slug}.default.png
│   │   │       └── ...
│   │   ├── s3/
│   │   │   ├── index.md      # アーキ前提・I/F 決定方針・全体 Q&A
│   │   │   ├── unit-01-{slug}.md
│   │   │   └── ...
│   │   ├── s4-context-map.md
│   │   ├── s5/
│   │   │   ├── index.md      # スタック確認・DDD 判断・ユビキタス言語・全体 Q&A
│   │   │   ├── {aggregate-name}.md
│   │   │   └── ...
│   │   ├── s6-pure-code.md   # 進行ログ(コード本体は src/domain/)
│   │   └── s7-integration.md # 進行ログ(統合コードは src/)
│   ├── v0.0.2/               # 次バージョン(機能拡張)で新規に立てる
│   ├── ...
│   └── v1.0.0/               # マーケット公開バージョン
└── src/
```

- **brief.md は `aidlc-docs/` 直下に 1 個のみ**(全バージョン共通のアプリビジョン)。バージョンごとに書き直さない
- **S1〜S7 はバージョンごとに `aidlc-docs/{vX.Y.Z}/` で物理完全分離**(新機能群は新バージョン S1 から始める)
- 各 US には `[v0.0.1]` / `[v0.0.x]` / `[v1.0.0]` のタグを冒頭 AC に付ける(brief D-13 で確定済)
- 単位がある工程(S1/S2/S2.5/S3/S5)は **サブディレクトリ + `index.md` + 1 単位 1 ファイル**
- 単位がない工程(S4/S6/S7)は **1 ファイル**
- **S2.5 だけ特殊**: 1 画面 = `.html`(source / 人間編集) + `.md`(native 固有挙動) + `screenshots/*.png`(自動生成)の 3 種で構成。S6/S7 は `.png` と `.md` のみ参照、`.html` は参照禁止
- ファイル命名: `{prefix}-{NN}-{kebab-slug}.md`(連番 2 桁 + 短い英語 slug)
- 全体 Q&A(複数単位にまたがる議論)は `index.md` に、特定単位の Q&A はその単位ファイルに書く
- 古い版を残したいときは `*.archive-YYYYMMDD.md` にリネーム
- 工程間の参照は **同バージョン内の** 相対パス(例: `[US-03](../s1/us-03-foo.md)`)
- 別バージョンへ参照したい時は `[v0.0.1 US-03](../../v0.0.1/s1/us-03-foo.md)` のような明示パス
- brief.md への参照は `[brief](../../brief.md)` 形式(全バージョンから 1 つ上の階層)
- 日付は全て `YYYY-MM-DD` 形式

## 手戻りの作法

後工程で漏れに気づいたら、必ず前工程の md に戻って更新する。
戻った md の末尾に `## 前サイクルからの引き継ぎ` セクションを追加し、**要点だけ** 書く:

- 何が漏れていたか(1〜3 行)
- 暫定の解決方針
- 棄却した案とその理由

情報量より質。**前サイクルのコンテキストは全量引き継がない**(PDF P.10)。

## v0.0.x / v1.0.0 落としの BACKLOG 管理

S1〜S7 のいずれかで「v0.0.1 では作らない / v0.0.x で / v1.0.0 で」と判断したら、その確定と **同じターン**で必ず [BACKLOG.md](BACKLOG.md) に追記する。落としを aidlc-docs 内に書きっぱなしにしない(=台帳化されないと将来サイクル開始時に拾い直しのコストがかかる)。

- **場所**: リポ直下 `BACKLOG.md`(memory「Backlog outside aidlc-docs」/ AI-DLC 議論履歴とは物理分離)
- **2 軸独立**(memory「Version != publishing axis」):
  - **A. 機能拡張軸**(v0.0.x シリーズ)= 機能 / UI / データモデルの追加・強化
  - **B. 公開・共有**(v1.0.0 公開時)= ストア公開 / 共有 UI / マルチユーザー本格対応
  - **C. 公開切替トリガー**(技術スタック / インフラ)= LLM 本選定 / APNs 本番証明書 / デプロイ
  - **D. 時期未定**
  - **E. 棄却された案**(参考 / 思想として採用しない)
- **各項目に出典を必ず書く**(どの US / SCR / D で決まったか)
- 完了したら `[ ]` → `☑` に変更(削除しない / 履歴として残す)

## やってはいけないこと

- 工程を飛ばす(S1〜S2.5〜S7 は順に進める / S2.5 は S2 確定後、S6 着手前に必ず確定させる)
- ドキュメントなしでコードを書き始める
- 手戻りを「もったいない」と感じて見て見ぬふりする
- AI 提案を人間レビューなしで採用する
- ユーザーとの質疑応答を口頭で完結させ md に残さない
- AI が独自判断した箇所を「確定」と表現せず暗黙のまま進める
- S6 でフレームワーク依存コードを書く / S7 でドメイン層を編集する
- スタック情報を実 PJ と乖離させたまま S5 に進める(AI が的外れな質問を返す)
- **Construction 工程(S6/S7)が独断でスコープを縮小する**(機能 / 画面 / 視覚要素を「実装しやすさ」「v0.0.1 だから」を理由に削らない)。削るなら upstream(S1/S2/S2.5/S5)に Q として戻す
- **ユーザーの session-level 指示**(例:『実機確認以外でできることを進めて』『一旦これだけ』)を **design-level スコープ確定として扱う**(その場の作業範囲指示は永続スコープではない)
- **S6/S7 が S2.5 の `*.html` / `tokens.html` を Read する**(コード構造リーク防止 / `screenshots/*.png` と `*.md` のみ参照)
- S6/S7 が S2.5 の HTML / CSS パターン(タグ階層 / クラス名 / Tailwind ユーティリティ / レイアウトテクニック)を実装に持ち込む(ゼロベースで React Native idiom で書く)

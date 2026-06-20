# Unit-04: 即確認のための seed データ生成(seeded-evidence)

## メタ
- 親: 作業単位の一覧
- 所属 US: [US-04](../s1/us-04-seeded-cheap-live.md)
- ステータス: 確定(S1 backtrack で再 cut / BT-04)

## 責務 (1〜2 行)
使い捨て隔離リポに「**任意 step を走らせずに即検証できる、もっともらしいデータのサイクル群(スイート)**」を seed する(Q-01): 各サイクルは別アプリ・別 step 停止で、前段成果物 + 当該 step 産物 + 証拠(`_evidence/<step>/manifest.json` + 実 screenshot/log) + run/phase 状態を持つ。これにより done ゲート(US-01)/ 記録者≠レビュアーの独立監査 / 視覚証拠レビューを seed データ上で**即実行**できる。データは fixtures/seed-cycles にコミットされた**実 run 相当のもっともらしい内容**(プレースホルダ禁止)。

## 外部依存
- 証拠 manifest writer(`evidence-manifest.ts`)/ FsEvidenceGate(`fs-evidence-gate.ts`)を再利用。
- studio サーバ(`buildServer`)+ Playwright 同梱 Chromium — 実 screenshot キャプチャ(seed-suite-capture)。
- 隔離 DB + sandbox ディレクトリ(`/tmp/...`)。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| `seedCycleCore({ store, ids, project, fixture, now, studioRoot, fixtureDir? })` | fixture(cycle.json 相当)+ 任意の `fixtureDir`(commit 済み素材)| 隔離リポに **状態 + データ**を置いたサイクル。`fixtureDir` 有=artifacts/ を丸ごと複製 + evidence/ から log/shot を複製。無=最小スタブ生成(後方互換)| fixture 不正 / complete なのに shot 不在 → `SeedError` |
| `seedSuiteCore({ store, ids, sandboxRoot, fixturesRoot, now, studioRoot, only? })` | fixtures/seed-cycles ルート | スイート全サイクルを **project ごと**(`<sandboxRoot>/<slug>`)に seed した `SuiteSeedItem[]` | fixtures 不在 / 0 件 → `SeedError` |
| `scripts/seed-suite-capture.ts` | — | 各 evidence:complete step の `shot.png` を**実 studio ボードの実キャプチャ**で生成しコミット | 撮影失敗 → 例外(manifest に偽証拠を残さない)|

## この Unit 固有の 質疑応答ログ
(未解決 Q なし)

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — 証拠形式の既定は screenshot+log、動画は遷移 step のみ
- **理由**: S4 技術的リスク(動画コスト/容量)。既定を軽く、操作・遷移 step だけ動画(US-01 step 性質別形式)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — seed は「状態」でなく「即確認データ」を作る(BT-04)
- **理由**: 旧 cut は状態だけ seed し検証を実 claude live に頼ったため即確認にならなかった。seed は前段成果物・産物・証拠まで作り、走らせずに当該 step の done ゲート / 記録者≠レビュアー監査 / 視覚レビューを即回せること。`seedCycleCore` は状態 + データを置く。
- **種別**: 事業判断(ユーザー指摘で是正 / BT-04)
- **上書き**: 旧 I/F「seedCycle = 状態だけ」→「状態 + データ」。

### D-03 — データは disk 上の commit 済み fixture から複製(生成テキストでなく)
- **理由**: 「もっともらしい」内容(現実的な US/画面/モデル/純粋コード/シナリオ報告)はコードで生成するより、各 step の実 skill 出力形に沿って著した固定 fixture を複製する方が忠実かつ保守容易。`fixtures/seed-cycles/<slug>/` を正本にし materializer は複製に徹する(KISS)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-04 — 証拠 screenshot は実 studio ボードの実キャプチャ(限界も明記)
- **理由**: Q-01「実際に回した時同様」を満たすため、1×1 プレースホルダを廃し、seed したサイクルのボードを実 studio で開いて撮った実 PNG を証拠にする(`seed-suite-capture`)。これは live 経路の `captureVerifyUi`(studio UI を撮る)と同性質。
- **正直な限界**(silent descope 禁止 / [[harness-quality-vision]]): seed は **対象アプリ(ToDo/チャット等)の画面そのもの**は撮らない — それには実 live run でアプリを建てる必要がある。seed が証明するのは「即確認の**機構**が、もっともらしいデータ + 実 studio キャプチャ上で動く」こと。対象アプリのシナリオ screenshot は実 live run(captureVerifyUi)が産む領域。
- **種別**: 事業判断(ユーザー指摘 Q-01 を反映 / 2026-06-21)
- **上書き**: 旧 D-01「証拠の既定は screenshot+log」は維持。screenshot の**中身**を「実 studio キャプチャ」と確定。

---

## この Unit 固有の 棄却した案

### R-01 — seed は状態だけ、証拠は実 live で都度生成
- **棄却理由**: 即確認にならない(generator hearing-first で遅い)。seed がデータを作れば走らせずに即検証できる(US-04 R-01)。

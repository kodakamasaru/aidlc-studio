# S6 データモデル: seed fixture スイート(US-04 / BT-04 / Q-01)

> seed fixture は **test-infra のデータ形状**(ドメイン集約ではない / S6 の domain 集約は evidence.md・
> ledger-entry.md)。ここでは「即確認のための seed データ」が持つべき形を定義する。
> S1 再ヒアリング Q-01 を反映し、単一サイクルでなく **多様な要件の example サイクル群(スイート)** を扱う。

## 不変条件 / 原則
- seed は **状態 + データ**を作る(状態だけでは即確認にならない / BT-04)。
- 当該 step を**走らせずに**検証できる: 前段成果物・産物・証拠が実ファイルとして存在する。
- データは **「実際に回した時同様」= もっともらしい**(プレースホルダ禁止 / Q-01)。各 step の成果物は
  その step が実際に産むものとして現実的な内容、証拠 screenshot は**実アプリの実 screenshot**。
- 実 aidlc-docs を汚染しない(使い捨てリポ配下のみ / [[test-projects-use-throwaway-repo]])。
- **スイート**: 1 サイクルでなく複数。各サイクルは別アプリ(別 brief)・**別 step で停止**し、合わせて
  任意 step をいずれかのサイクル上で即確認できるようカバーする。

## スイート構成(committed fixtures)
ソース = `fixtures/seed-cycles/<slug>/`(リポにコミット / 正本)。現行 5 サイクル:

| slug | アプリ | version | 停止 step | PhaseGroup | 証拠 |
|------|--------|---------|-----------|------------|------|
| todo-app | 個人 ToDo 管理 | v0.0.1 | S2(review)| Discovery | — |
| inventory | 小規模在庫管理 | v0.0.1 | S4(review)| Design | — |
| booking | 会議室予約 | v0.0.1 | S6(review)| Build(ドメインモデル)| — |
| expense | 家計簿 | v0.0.1 | S8(review)| Build(統合)| S7,S8 complete |
| chat | 社内チャット | v0.0.1 | S9(review)| Validation | S7,S8,S9 complete |

- 停止 step は全て相異なる(S2/S4/S6/S8/S9)= 各 PhaseGroup を横断。
- `requiresLiveEvidence`(S7/S8/S9)に到達したサイクルだけ証拠 complete(= 即確認の本丸)。

## fixture ディレクトリ形状
```
fixtures/seed-cycles/<slug>/
  cycle.json                     # 下記スキーマ
  artifacts/
    S1/index.md                  # その step が実際に産む成果物(もっともらしい本文)
    S1/us-01-*.md …              # US/画面/Unit ごとの分割ファイルも可(実 run と同様)
    S7/code/*.ts                 # S7 は純粋ドメインコードを実 .ts として同梱
    …
  evidence/
    S7/run.log                   # 実 run 相当の実行ログ(具体的・タイムスタンプ付き)
    S9/run.log
    S9/shot.png                  # ★実アプリの実 screenshot(後述 capture で生成)
```

### cycle.json スキーマ
```jsonc
{
  "version": "v0.0.1",
  "slug": "chat",
  "title": "社内チャット",
  "brief": "<日本語1段落>",
  "stopAt": "S9",
  "steps": [
    { "step": "S1", "state": "done" },
    { "step": "S7", "state": "done",   "evidence": "complete" },
    { "step": "S9", "state": "review", "evidence": "complete" }
  ]
}
```
- `state`: pending | running | review | done
- `evidence`: none(既定)| log-only | complete(log + screenshot manifest)

## seed が生成する実体(version 配下 / 隔離リポ)
materializer(`seedCycleCore` fixtureDir モード)が fixture を隔離リポへ複製する:

| 種別 | パス | 用途(即確認) |
|------|------|------|
| 前段成果物 + 当該 step 産物 | `aidlc-docs/<version>/<step>/**`(artifacts/ を丸ごと複製)| deterministic gate / 視覚・レビュー対象 |
| 当該 step 証拠 | `aidlc-docs/<version>/_evidence/<step>/manifest.json` + `run.log` + `shot.png` | US-01 done ゲート / 記録者≠レビュアー監査の入力 |
| run/phase 状態 | DB(Cycle 集約・サイクルごとに 1 project)| ボード表示 / ゲート前提 |

`capturedAt`(= 固定 `now`)≥ 各 run の `startedAt`(= `now − 1s`)を必ず満たす(決定論 / wall-clock 非依存)。

## screenshot の出所(実 screenshot の作り方)
`evidence/<step>/shot.png` は **実アプリの実 screenshot**。`scripts/seed-suite-capture.ts` が:
1. スイートを使い捨て DB に seed(証拠を一旦 strip)→ 2. studio サーバを in-process 起動 →
3. 各サイクルのボード `/cycles/<id>` を Playwright(同梱 chromium)で開き全画面撮影 →
4. `fixtures/.../evidence/<step>/shot.png` に保存(コミット)。
これは live 経路の `captureVerifyUi`(studio UI を撮る)と同じ性質の実キャプチャ。1×1 プレースホルダではない。

## 即確認の使われ方
seed 後、走らせずに: ① `FsEvidenceGate.check` で done ゲート可否を即判定(complete step は `eligible`)
② 記録者≠レビュアーの独立監査を seed 証拠上で即実行 ③ web で当該サイクルの産物/レビューを即目視。
</content>

# S5 手戻り追補 — US-08 工程の再構成 の作業分割 / v0.0.4

## メタ
- 工程: S5(Work Units)手戻り追補
- 出典: 2026-06-14 S9→S1 手戻り(US-08 新設)。US-08 を実装可能な作業単位 + 依存 DAG に分解。
- 入力: [s1/us-08-step-reconstruction.md](../s1/us-08-step-reconstruction.md), [s2/scr-02-conversation-thread.md](../s2/scr-02-conversation-thread.md)(D-05 サイクル / D-06 グローバル), [s3 reconstruction / reconstruction-global mock](../s3/scr-02-conversation-thread.md)
- ステータス: 確定(2026-06-14)

## 作業単位(Work Units)

| WU | 層 | 内容 | 対応 AC |
|----|----|------|--------|
| U08-1 | domain | `StepDef`/`StepDefSnapshot` に inline `instruction?`(各工程ルール md)追加 + `reconstructPipeline(cycle, newPendingSteps)`(着手済み固定・未着手を再構成 / 独自工程 id 可 / 追加削除並替) | AC-3/5/6 |
| U08-2 | app | 再構成の適用: サイクル= `reconstructPipeline` で pending phase 置換 / グローバル= 既存 `customizePipeline` で project.pipelineDef 更新(+instruction) | AC-3/6/7 |
| U08-3 | infra(orchestrator) | 再構成案の生成: scripted= 決定論的な再構成案(削除1+新設1 等)を emit / live= 実 AI が US+既定+ヒアリングから工程列+各ルール md を提案。グローバルは人間起点(現既定提示→人間指示→AI 変更案) | AC-2/3/4/7 |
| U08-4 | app/HTTP | 起動・適用エンドポイント: サイクル再構成は S1 確定直後に1回自動起動(AC-2) / グローバルは SCR-04 global「会話で直す」から人間起動(AC-7)。回答ルーティングは既存ヒアリング機構に相乗り | AC-2/4/7 |
| U08-5 | web | SCR-02 再構成スレッド UI(2 モード: サイクル=AI 起点差分表示 / グローバル=人間起点差分なし / 各ルール展開で読むだけ / まとめて承認)。SCR-04 が再構成後の実工程・ルールを反映 | AC-1/3/4/6 |
| U08-6 | S9/E2E | 実 backend で variable サイクルを作って scr-05.variable を実機撮影(mock 注入を置換 / O5 消し込み)+ 再構成 2 モードの E2E | 全 AC 実証 |

## 依存 DAG
```
U08-1(domain 土台)
   └→ U08-2(app 適用)
         ├→ U08-3(orchestrator 提案生成: scripted→live)
         └→ U08-4(app/HTTP 起動・適用)
               └→ U08-5(web 2モード UI)
                     └→ U08-6(S9 実 backend variable 再実証)
```
- U08-1 が全ての土台(先行必須)。U08-3/U08-4 は U08-2 後に並行可。U08-5 は U08-3/4 後。U08-6 が最終ゲート。

## leaf 基盤の reuse(S5 方針)
- wire 純関数(Unit-01)/ ヒアリング回答ルーティング(BU-3)/ scripted+live 2 アダプタ分離 / SCR-02 スレッド器 / customizePipeline(グローバル既定)/ PhasePipeline 可変描画(US-07 / 実装済)を reuse。新規集約はゼロ(reconstructPipeline は既存 Cycle 集約の操作)。

## 次工程(S6/S7/S8)への引き継ぎ
- S6: 集約は Cycle/Project の reuse。reconstructPipeline は Cycle 集約の純操作 / instruction は StepDef の加法フィールド。新規集約ゼロ。
- S7: 上記をドメインコードに(TDD)。
- S8: app 適用 + orchestrator 提案 + HTTP + web 2 モード UI を結線。
- S9: U08-6 で実 backend variable を再実証し O5 を done に。

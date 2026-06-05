# SCR-02: Cycle 詳細・実行

## メタ
- 親: [s2/index.md](./index.md)
- 対応 US: US-06, US-07, US-08
- 版: v0.0.1
- ステータス: 確定

## 目的
1 つの Cycle の進行を俯瞰し、Phase を起動・retry する実行ハブ。手戻りで選ばれたステップからの再開もここに反映される。

## 主要 UI 要素
- ステップパイプライン(S1▸S2▸…▸S7 + 現在位置ハイライト + 手戻り履歴マーカー)
- Run state 表示(running / stalled / done)
- 現在 Run の状態 / ログ(headless 生成の進捗・出力)
- Phase 起動ボタン(次ステップを起動)
- retry ボタン(stall 時のみ活性 / US-08)

## 状態 (data-state)
- idle: Run 未起動。Phase 起動ボタンが主役。
- running: AI が headless 生成中。パイプラインに進捗、ログがストリーム。Phase 起動は不活性。
- stalled: Run が停止。retry ボタンが活性、停止理由を表示。
- done: 当該ステップ完了。Inbox にレビュー待ちカード生成済を示し、次 Phase 導線を表示。

## 遷移
- IN: SCR-01(作成 / 行クリック)/ SCR-05(Q 回答 resume 後)/ SCR-04(承認後の次 Phase / 差し戻し後の再開)
- OUT: Phase 起動 → AI Run(running)
- OUT: 質問発生 → SCR-03(Inbox: Q 待ちカード生成)
- OUT: ステップ完了 → SCR-03(Inbox: レビュー待ちカード生成)
- OUT: stall → retry(同画面で再 Run)

## 備考(挙動 / native / a11y)
- パイプラインは現在位置 + 過去の手戻り(どのステップへ戻ったか)を時系列で読めること。
- retry は stalled のときだけ活性。idle/running/done では非表示 or 不活性。
- ログは長文化しうるため折りたたみ / 自動スクロール追従を想定。

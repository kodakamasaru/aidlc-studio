# SCR-02: Cycle 詳細・実行 — コンポーネント仕様

## メタ
- 親: [s2.5/index.md](./index.md)
- 視覚 source: [scr-02-cycle-detail-run.html](./scr-02-cycle-detail-run.html)(人間レビュー用 / S6/S7 は Read 禁止)
- スクショ:
  - [idle](./screenshots/scr-02-cycle-detail-run.idle.png)
  - [running](./screenshots/scr-02-cycle-detail-run.running.png)
  - [stalled](./screenshots/scr-02-cycle-detail-run.stalled.png)
  - [done](./screenshots/scr-02-cycle-detail-run.done.png)
- 対応 S2 SCR: [SCR-02](../s2/scr-02-cycle-detail-run.md)
- 対応 US: [US-06](../s1/us-06-cycle-start-phase.md) / [US-07](../s1/us-07-agent-generate-artifact.md) / [US-08](../s1/us-08-retry-run.md)
- ステータス: レビュー待ち

## 状態網羅(Run state = 画面の主役)
- **idle**: Run 未起動。topbar に idle バッジ、主アクション = 「Sn Phase 起動」。パイプラインは現在ステップを current(indigo)で表示。
- **running**: AI が headless 生成中。current node は spinner、起動ボタンは spinner + 不活性。Run ログが mono でストリーム(末尾にキャレット)。バッジ = running(teal, pulse)+ worktree 識別。
- **stalled**: Run 停止。current node は amber `!`、停止理由カード(amber 境界)+ 直前出力 + **retry**(主アクション・活性)。retry は **stalled のときだけ活性**(他状態では非表示/不活性)。
- **done**: 当該ステップ完了。done node、レビュー待ちが Inbox に生成済の導線、次 Phase ボタン。手戻り履歴は node 右上の ↩ マーカー + 凡例で時系列に読める。

## 挙動(web / レスポンシブ)
- **パイプライン**: S1 / S2 / S2.5 / S3 / S4 / S5 / S6 / S7 の 8 ノード(index D-02)。done(green ✓)/ current(indigo, focus ring)/ upcoming(neutral 数字)。connector は done 区間が green。横幅が足りない場合は横スクロール(ノードは縮めない)。
- **手戻り履歴**: 戻ったことがあるステップ node の右上に ↩(amber)マーカー + content 下に凡例。「どのステップへ戻ったか」を時系列で読めること(S2 備考)。
- **Run ログ**: 長文化しうるため max-height + 内部スクロール、running 中は自動スクロール追従(末尾固定)。
- **retry の活性条件**: `state === stalled` のみ。idle/running/done では非表示か不活性。

## a11y
- Run 状態は色 + dot + ラベル(running/stalled/done/idle)の三重符号。
- パイプライン各 node に `aria-label="S3 現在のステップ"` 等。current に `aria-current="step"`。
- ログ領域は `role="log" aria-live="polite"`(更新を読み上げ、ただし過剰連呼を避け polite)。
- stalled の停止理由は単なる色でなく見出し「停止理由」+ 経過時間テキストで明示。

## interaction(web pointer / keyboard)
- Phase 起動 / retry / 次 Phase / レビュー = ボタン。Enter/Space で起動。
- ログ折りたたみ・全文表示はトグル。
- running 中は破壊的操作(起動)を不活性化して二重起動を防ぐ。

## motion(文字で)
- ステップ完了: node が neutral → done(green)へ 250ms ease-out、connector も追従。
- running: current node spinner 0.8s linear / バッジ dot pulse 1.6s。
- stalled 遷移: current node が indigo → amber へ 200ms、停止理由カードが 200ms fade+slide-up。
- ログ: 新規行は 120ms fade-in、コンテナは末尾へ smooth scroll。

## 設計連携メモ(S3/S5 へ)
- Run ログのストリーミングと Run 状態のリアルタイム反映には **orchestration → web の push 経路(SSE/WebSocket)** が要る。Run を stateless にする方針なら、進捗は外部記憶(handoff/ledger)+ stream で表現する設計を S5 で確定すること。

## この画面固有の 質疑応答ログ
### Q-01 — 手戻り履歴の見せ方(node マーカー方式)で十分か
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  > (暫定)node 右上 ↩ マーカー + 凡例。多数回の手戻りが起きるなら別途タイムライン行を v0.0.x で検討。

---

## この画面固有の AI が独自に決めたこと と 理由
### D-01 — パイプラインに S2.5 を明示ノードとして含める
- **理由**: 本 PJ の工程に S2.5 が実在(S2 表記の S1▸…▸S7 は簡略)。視覚契約として 8 ノードに統一(index D-02)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

### D-02 — 主アクションを状態で 1 つに切り替える(起動 / retry / 次 Phase)
- **理由**: 「いま押すべき 1 ボタン」を topbar 右に固定し、状態ごとに意味を切替(idle=起動 / stalled=retry / done=レビュー or 次)。迷いを消す。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

---

## この画面固有の 棄却した案
### R-01 — Run ログを常時全画面で出す
- **棄却理由**: minimal 方針。ログは折りたたみ + max-height。俯瞰(パイプライン + 状態)を上に置く。

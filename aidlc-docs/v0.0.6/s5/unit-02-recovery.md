# Unit-02: 起動時 reconcile + stall 復帰

## メタ
- 親: 作業単位の一覧
- 所属 US: [US-05](../s1/us-05-reconcile-resume.md), [US-06](../s1/us-06-stall-late-emit.md)
- ステータス: 確定

## 責務 (1〜2 行)
稼働台帳(Unit-01)を読んで異常 run を復帰させる self-healing。**起動時**は孤児 run を検知し resume 優先(無ければ idempotent re-run)、**走行中**は idle/壁時計 timeout で stall を検知して retry に回す。死んだ run の late-emit を冪等に無視する。

## 外部依存
- Unit-01 の **稼働台帳 query**(pid/last-activity)と **resume(runId)**。
- Unit-03 の retry 経路(stall/孤児 → 作り直し or resume)。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| reconcileOnBoot() | (なし / 起動時に呼ばれる) | 孤児 run の復帰計画(resume or re-run のリスト) | — |
| classifyOrphan(runId) | runId(台帳の pid 不在) | resume可(session_idあり)/ re-run | — |
| detectStall(runId) | last-activity / 経過時間 | stall(idle/壁時計 超過)判定 | — |
| onLateEmit(runId) | 死んだ run の遅延報告 | 冪等に無視(RunNotFound で不整合化しない) | — |

## この Unit 固有の 質疑応答ログ

### Q-01 — (未)
- **回答**(人間の回答を AI が記入):
  > 
- **確定**(AI 記入):
  > 

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — stall 判定は claude 自己申告でなく Unit-01 の last-activity + timeout を権威にする
- **理由**: 設計§7-3。claude 非依存の timeout が最終 backstop。Unit-02 は Unit-01 が出す last-activity だけを見て idle を算出する(claude の stalled 自己申告はヒント止まり)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — O3(live resume 継続)はこの Unit の resume 経路の実機シナリオで実証する
- **理由**: index D-03 / ledger。reconcileOnBoot→classifyOrphan→resume の経路を実 claude の揮発しない session で通せば O3 の実証要件を満たす(独立 US 化しない)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この Unit 固有の 棄却した案

### R-01 — 孤児を常に re-run(resume を使わない)
- **棄却理由**: 設計§5「resume を優先」。session_id があれば同一文脈継続の方が忠実。re-run は文脈を失う新試行(resume 不能時のみ)。

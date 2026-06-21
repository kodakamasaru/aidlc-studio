# Unit-03: 検証→自動 retry / 失敗分類 backoff / 上限→inbox / silent 再生成

## メタ
- 親: 作業単位の一覧
- 所属 US: [US-02](../s1/us-02-verify-auto-retry-loop.md), [US-03](../s1/us-03-backoff-on-limits.md), [US-04](../s1/us-04-retry-exhausted-inbox.md), [US-11](../s1/us-11-silent-regeneration.md)
- ステータス: 確定

## 責務 (1〜2 行)
「step が完璧に通らなかった時に何をするか」の失敗時ポリシー一式。① 独立検証 NG → 人間に出さず作り直し(US-02)② 失敗を exit/エラー信号で分類し、上限/レート系は別カウンタで指数 backoff 自動再開(US-03)③ 作り直し上限到達 → inbox「要対応」化 + スケジューラは後続継続(US-04)④ 理由なし gap → silent 自動再生成(US-11)。

## 外部依存
- Unit-01 の **失敗 signal**(分類の入力)と **launch/再起動**(作り直し)。
- HumanTask store(上限到達カードの登録 / 既存 + 「要対応」種別追加)。
- 既存の独立検証(完了条件 gap / evaluator run / visual-eval)を retry トリガとして配線。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| classifyFailure(signal) | Unit-01 の失敗 signal | `backoff-retriable`(上限/レート)/ `incomplete`(成果物 NG)| — |
| onVerifyResult(runId, result) | 独立検証の結果 | pass→done前進 / fail→作り直し(上限内)| — |
| scheduleBackoff(runId) | backoff-retriable | 指数 backoff の再開予定(別カウンタ) | — |
| onRetryExhausted(runId) | 作り直し上限到達 | HumanTask「要対応」登録 + 後続継続シグナル | — |
| silentRegenerate(gap) | 理由なし gap | 黙って再生成(loud stall を出さない)| 理由ある gap → loud(レビュー経路) |

## この Unit 固有の 質疑応答ログ

### Q-01 — (未)
- **回答**(人間の回答を AI が記入):
  > 
- **確定**(AI 記入):
  > 

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — backoff-retriable と incomplete を別カウンタにする
- **理由**: 設計§5。上限/レート(時間で回復)を作り直しカウンタで消費すると、回復可能なのに inbox 落ちが早まる。分類して別カウンタで扱う。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — 検証 NG は人間に出さず作り直し、上限到達のみ inbox(要対応)
- **理由**: 責務契約②/設計§4・§6。技術的不完全さは human タスク化しない。例外通知(上限到達)だけ inbox 化し、スケジューラは止めない(US-04 / SCR-02・05)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — silent 再生成は「理由なし gap」に限定し、理由ある gap は loud に上げる
- **理由**: US-11 / 責務契約④。理由ある gap(契約逸脱)は人間の判断材料。silent に握り潰すと納品物がこっそり契約から逸れる。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この Unit 固有の 棄却した案

### R-01 — 生成 run 自身に再採点させて retry を判断する
- **棄却理由**: 設計§4「自己採点は偽合格を構造的に生む」。独立検証(別 run / 決定論)が握る(Unit-03 は generator と別 run の評価を読む)。

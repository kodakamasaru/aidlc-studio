# US-09: dead code 削除 — StepConfigPage.tsx(S8 継続)

## メタ
- 親: 要件一覧
- 対応 S2 画面 (確定後に追記): なし(dead code 削除)
- ステータス: 確定
- 由来: S9-housekeeping-O4-O7 の付随項目(dead code / S8 継続)

## 3 視点

### なぜするか (Why)
`StepConfigPage.tsx` は使われていない dead code(S8 で StepConfigReadback に置換済の残り)。残すと混乱の元 + 保守コスト。

### UX へのインパクト
(内部品質)dead code が削除され、設定画面まわりの参照が StepConfigReadback に一本化される。

### 受け入れ条件 (AC)
- web/src 配下の `StepConfigPage.tsx` が削除される
- 削除後も web build / tsc / playwright が green(参照が残っていない)

## この US 固有の 質疑応答ログ
(未解決 Q なし)

---

## この US 固有の AI が独自に決めたこと と 理由

### D-01 — 一時 cleanup script(cleanup-legacy-project.ts)+ backup の整理は F3 と共に v0.0.7 へ
- **理由**: 一時 script は legacy プロジェクト正規化(F3 / プロジェクト管理 UI)に紐づく。F3 は v0.0.7 へ分割したため、script・backup の整理もそこへ同送する。本 US は純粋な dead-code(StepConfigPage.tsx)削除に限定。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この US 固有の 棄却した案
(なし)

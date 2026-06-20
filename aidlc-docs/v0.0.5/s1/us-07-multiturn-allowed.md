# US-07: server.ts allowed 配列に multi-turn 追加(O7)

## メタ
- 親: 要件一覧
- 対応 S2 画面 (確定後に追記): なし(backend の修正)
- ステータス: 確定
- 由来: S9-housekeeping-O4-O7(O7)

## 3 視点

### なぜするか (Why)
`src/server.ts` の allowed 配列に "multi-turn" が不在で、multi-turn シナリオが happy にフォールバックする(検証経路の穴)。実害は別経路で担保されているが、シナリオが happy にすり替わるのは観測を歪める。

### UX へのインパクト
multi-turn シナリオが happy にすり替わらず正しく扱われる。

### 受け入れ条件 (AC)
- `server.ts` の allowed 配列に "multi-turn" が追加される
- multi-turn シナリオが happy フォールバックせず正しくルーティングされる
- 既存テスト green(退行なし)

## この US 固有の 質疑応答ログ
(未解決 Q なし)

---

## この US 固有の AI が独自に決めたこと と 理由
(特になし)

---

## この US 固有の 棄却した案
(なし)

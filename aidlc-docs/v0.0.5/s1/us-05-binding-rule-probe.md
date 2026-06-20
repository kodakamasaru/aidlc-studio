# US-05: binding-rule 到達チェックリスト + probe test

## メタ
- 親: 要件一覧
- 対応 S2 画面 (確定後に追記): なし(プロセス/テスト基盤の US)
- ステータス: 確定
- 由来: S11-IMP2-binding-rule-delivery-checklist

## 3 視点

### なぜするか (Why)
binding ルールがリンク参照止まりで headless AI に本文が届かない事故が反復した(F-6/7/10/11/14/16 / P11/P12/P14/P16)。新しい kit/rules/*.md を追加するたびに「どの注入点で headless に本文が届くか」を probe test 付きで必須化すれば、リンク参照止まりの事故が構造的に防げる。本サイクルは US-01〜04 で新しい kit/rules・注入経路を触る(live ゲート / ルート ledger / reconcile script)ため、その到達を probe で固めるのと相性がよい。

### UX へのインパクト
新しい binding ルールを追加すると、注入点到達が probe test で機械確認され、headless 実行に本文が確実に届く(リンクだけ足して届かない事故が起きない)。

### 受け入れ条件 (AC)
- 新 kit/rules/*.md 追加時のチェックリストが `aidlc-operating-model.md` に明文化される
- 各 binding ルールについて「どの注入点で headless に本文が届くか」を確認する probe test テンプレがある
- probe test が無い/通らない binding ルールが検出される

## この US 固有の 質疑応答ログ
(未解決 Q なし)

---

## この US 固有の AI が独自に決めたこと と 理由

### D-01 — probe test は context-resolver の注入経路を対象にする
- **理由**: headless に本文を届けるのは context-resolver(composer)。ここを通ることを probe で確認するのが「届く」の機械的定義。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この US 固有の 棄却した案
(なし)

# Unit-05: binding-rule 到達 probe(binding-probe)

## メタ
- 親: 作業単位の一覧
- 所属 US: [US-05](../s1/us-05-binding-rule-probe.md)
- ステータス: 確定

## 責務 (1〜2 行)
新 kit/rules/*.md が context-resolver(composer)の注入経路を通って headless prompt 本文に到達するかを assert する probe テストと、その必須化チェックリスト(operating-model)を提供する。

## 外部依存
- context-resolver(composer)の prompt 組み立て出力を検査対象にする(読み取り)。
- 順序注記(非ブロッキング): probe 機構自体は leaf だが、Unit-02 が新規 rule / §6 注入を変えた**後**に、その新 rule への probe テストを 1 本追加する(S7 作業指示に含める)。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| `probeRuleReach(rulePath)` | kit/rules/*.md パス | `{ reached: bool, injectionPoint?: string }` | 注入経路に現れない → reached:false |
| operating-model チェックリスト | 新 rule 追加手順 | probe 必須化の明文 | — |

## この Unit 固有の 質疑応答ログ
(未解決 Q なし)

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — probe は composer の組み立て結果(prompt 本文)を直接検査する
- **理由**: 「届く」の機械的定義 = composer 出力に本文が現れること。リンク参照だけで本文が無い場合を fail にできる(US-05 D-01)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この Unit 固有の 棄却した案
(なし)

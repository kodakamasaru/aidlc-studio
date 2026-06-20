# Unit-03: reconcile 検査スクリプト(reconcile-check)

## メタ
- 親: 作業単位の一覧
- 所属 US: [US-03](../s1/us-03-reconcile-codify.md)
- ステータス: 確定

## 責務 (1〜2 行)
S1 完了ゲートで、前(全)サイクルの未解決 carried + escalation 項目が当サイクルで US 化されているかを検査し、未 US 化が残れば非ゼロ終了して S1 確定をブロックする。

## 外部依存
- Unit-02 のルート ledger(`aidlc-docs/ledger.yml`)を入力にする。
- 当サイクルの `s1/` US 群(file)を読む。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| `reconcileCheck(version)` script | 現サイクル version | exit 0 = pass / exit≠0 + 未消し込み id 列挙 | 未 US 化あり / 2連続 carried escalation 未対応 → 非0 |

## この Unit 固有の 質疑応答ログ
(未解決 Q なし)

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — まず S1 完了ゲートの script として配線(CI 連携は後)
- **理由**: US-03 の本質は「S1 を進めさせない」。最小構成で非0 終了によりブロック。CI hook 化は YAGNI で後の強化(S4 D-03)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この Unit 固有の 棄却した案
(なし)

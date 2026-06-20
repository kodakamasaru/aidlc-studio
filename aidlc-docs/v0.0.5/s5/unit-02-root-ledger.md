# Unit-02: ルート ledger + §6 注入(root-ledger)

## メタ
- 親: 作業単位の一覧
- 所属 US: [US-02](../s1/us-02-root-ledger.md)
- ステータス: 確定

## 責務 (1〜2 行)
全版共通のルート単一 append-only ledger(`aidlc-docs/ledger.yml`)を導入し、版別 ledger の未解決を集約。context-resolver Section 6 注入を「現サイクル + ルート台帳」に拡張する。

## 外部依存
- context-resolver(composer)の既存 Section 6 注入経路に乗る(拡張)。
- 版別 ledger(file)を読み取り source にする(改変しない)。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| `loadRootLedger()` | なし | ルート ledger エントリ配列(schema 維持) | yaml 破損 → 検証エラー |
| `resolveSection6(currentVersion)` | 現サイクル version | 現サイクル ledger + ルート台帳の carried/escalation を結合した注入テキスト | — |
| 移行 `migrateToRootLedger()` | 版別 ledger 群 | ルート ledger に未解決を集約(冪等) | — |

## この Unit 固有の 質疑応答ログ
(未解決 Q なし)

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — 既存 schema を維持(id/origin/decision/state/into/reason/closed_in)
- **理由**: reconcile(Unit-03)や既存 ledger 規約と互換にする。形式は変えず「置き場と注入範囲」だけ変える。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この Unit 固有の 棄却した案
(なし)

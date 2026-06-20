# S7 — ドメインコード

| 項目 | 値 |
|---|---|
| ステップ | S7 |
| 対象 | expense v0.0.1 |
| ステータス | 確定 |
| 完了日 | 2026-06-18 |

---

## 実装一覧

| ファイル | 内容 | テスト状態 | テスト件数 |
|---|---|---|---|
| `src/domain/money.ts` | Money 値オブジェクト(createMoney/addMoney/subtractMoney) | PASS | 5件 |
| `src/domain/expense.ts` | Expense 集約ルート + Category enum(createExpense/updateExpenseMemo) | PASS | 4件 |
| `src/domain/budget.ts` | Budget 集約ルート(createBudget/getBudgetStatus/isWarning) | PASS | 3件 |

合計: 3ファイル / 12テスト / 全 PASS

---

## 純粋性チェックログ

S7 完了前に各ファイルの import を静的解析し、フレームワーク・I/O 依存がないことを確認した。

| ファイル | import 一覧 | 判定 |
|---|---|---|
| `money.ts` | なし | 純粋 ✓ |
| `expense.ts` | `./money` のみ | 純粋 ✓ |
| `budget.ts` | `./money` のみ | 純粋 ✓ |

外部依存(React / idb / Zustand / Node.js API)はゼロ。`crypto.randomUUID()` はブラウザ標準 API であり、フレームワーク依存には該当しないと判断した(D-01)。

---

## Q&A ログ

### Q-01: `crypto.randomUUID()` は Node.js テスト環境(Vitest)で使えるか?

**回答(D-01):** → Node.js 19+ および jsdom 環境では `crypto.randomUUID()` が利用可能。Vitest の `environment: 'jsdom'` 設定で解決する。テスト時に UUID の形式が正しいかを検証する必要はなく、一意性さえ担保されれば十分。

---

## AI 独自決定

| ID | 決定内容 | 根拠 |
|---|---|---|
| D-01 | `crypto.randomUUID()` をブラウザ標準 API として許容し純粋性チェックの対象外とする | Web 標準。特定フレームワークへの依存ではない。Node 19+ / jsdom で動作する。 |
| D-02 | `InvalidMoneyError` / `InvalidExpenseError` / `InvalidBudgetError` を各ファイル内に定義する | エラー型をドメイン層に閉じ込め、呼び出し元が catch で判別できるようにする。 |

---

## 次工程 S8 への引き継ぎ

- `src/domain/` の3ファイルが完成・テスト PASS 済み。
- S8 では Unit-04(Storage Adapter)と Unit-02(Application Services)、Unit-01(UI Layer)を実装し、全 US の動線を閉じる。
- `ExpenseRepository` の I/F は Unit-03 の型定義(`Expense`, `Budget`)に準拠すること。
- S8 終了時に SCR-01〜04 の全状態をブラウザで目視確認し、スクリーンショットを成果物として提出すること。

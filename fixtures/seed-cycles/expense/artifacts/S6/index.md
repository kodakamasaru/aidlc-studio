# S6 — ドメインモデル

| 項目 | 値 |
|---|---|
| ステップ | S6 |
| 対象 | expense v0.0.1 |
| ステータス | 確定 |
| 完了日 | 2026-06-18 |

---

## スタック確認

| 確認項目 | 結果 |
|---|---|
| 言語 | TypeScript 5.x |
| DDD 採用 | 採用(軽量 DDD。戦略パターンのみ。リポジトリパターンは infra 層) |
| 外部フレームワーク依存 | なし(domain 層は pure TypeScript) |
| テストツール | Vitest |

---

## ユビキタス言語

| 用語 | 定義 |
|---|---|
| 支出(Expense) | ユーザーが記録する1件の金銭的な出費。金額・日付・カテゴリ・メモを持つ。 |
| 金額(Money) | 正整数・円単位の金額。0円以下は無効。 |
| カテゴリ(Category) | 支出の分類。食費/交通/日用品/娯楽/医療/その他 の固定6種。 |
| 予算(Budget) | 月単位で設定する支出上限額。月に1件のみ存在する。 |
| 月キー(monthKey) | 予算・集計の月を識別する文字列。形式: `YYYY-MM`(例: `2026-06`)。 |
| 予算超過警告 | 当月の支出合計が予算の80%以上になった状態。ホーム画面にバナーを表示する。 |
| 支出 ID(ExpenseId) | 支出を一意に識別する UUID 文字列。 |

---

## 集約一覧

| 集約ルート | 値オブジェクト | 外部参照 |
|---|---|---|
| Expense | Money, Category, ExpenseId | なし |
| Budget | Money | なし |

---

## モデル定義

### Money (値オブジェクト)

```
Money
  value: number   // 正整数・円単位

不変条件:
  - value は整数かつ 1 以上でなければならない(0 以下は InvalidMoneyError)
  - 加算結果は常に新しい Money を返す(不変)
  - 減算結果が 0 未満になる場合は InvalidMoneyError

操作:
  createMoney(amount: number): Money     // throws if amount <= 0
  addMoney(a: Money, b: Money): Money
  subtractMoney(a: Money, b: Money): Money  // throws if result < 0
  valueOf(m: Money): number
```

### Category (値オブジェクト / enum)

```
Category =
  | "食費"
  | "交通"
  | "日用品"
  | "娯楽"
  | "医療"
  | "その他"

不変条件:
  - 上記6種の文字列のみ有効。それ以外は型エラー。
```

### ExpenseId (値オブジェクト)

```
ExpenseId
  value: string   // UUID v4 形式

不変条件:
  - UUID v4 形式の文字列であること。
  - 一度生成したら変更しない。
```

### Expense (集約ルート)

```
Expense
  id:       ExpenseId
  amount:   Money
  date:     Date           // ブラウザ Date オブジェクト
  category: Category
  memo:     string         // 空文字可・最大200文字

不変条件:
  - amount の value は 1 以上
  - memo は200文字以内
  - id は不変(作成後に変更しない)
  - 不変オブジェクト: 更新操作は新しい Expense を返す

操作:
  createExpense(params: {
    amount: number,
    date: Date,
    category: Category,
    memo?: string
  }): Expense
    // throws InvalidExpenseError if amount <= 0 or memo > 200 chars

  updateExpenseMemo(expense: Expense, newMemo: string): Expense
    // throws InvalidExpenseError if newMemo > 200 chars
    // returns new Expense (immutable)
```

### Budget (集約ルート)

```
Budget
  monthKey: string   // YYYY-MM
  amount:   Money

不変条件:
  - monthKey は YYYY-MM 形式
  - amount の value は 1 以上
  - 同一 monthKey の Budget は IndexedDB に1件のみ存在する(上書き方式)

操作:
  createBudget(monthKey: string, amount: number): Budget
    // throws InvalidBudgetError if amount <= 0

  getBudgetStatus(budget: Budget, totalSpent: Money): BudgetStatus
    // BudgetStatus = "ok" | "warning" | "over"
    // warning: totalSpent.value >= budget.amount.value * 0.8
    // over:    totalSpent.value >= budget.amount.value

  isWarning(budget: Budget, totalSpent: Money): boolean
    // true if getBudgetStatus returns "warning" or "over"
```

---

## ドメインイベント(参考)

v0.0.1 ではドメインイベントは実装しないが、以下を将来の拡張に向けてリストアップする:

- `ExpenseAdded { expenseId, amount, category, date }`
- `ExpenseDeleted { expenseId }`
- `BudgetSet { monthKey, amount }`
- `BudgetWarningTriggered { monthKey, percentage }`

---

## Q&A ログ

### Q-01: Expense の date フィールドはブラウザ Date か ISO 文字列か?

**回答(D-01):** → ドメイン層は `Date` オブジェクト。Storage 層が IndexedDB への保存時に ISO 文字列にシリアライズする責務を持つ。ドメインを特定のシリアライズ形式に縛らない。

---

## AI 独自決定

| ID | 決定内容 | 根拠 |
|---|---|---|
| D-01 | ドメイン層の date は `Date` オブジェクト | シリアライズ責務を infra 層に分離する。ドメインを純粋に保つ。 |
| D-02 | ExpenseId の生成は `createExpense` 内で `crypto.randomUUID()` を呼ぶ | ドメイン層内部で完結。外から ID を注入する必要がない。 |
| D-03 | BudgetStatus を "ok"/"warning"/"over" の3状態で定義 | UI バナーの表示状態と1:1対応。条件分岐を最小化する。 |

---

## 次工程 S7 への引き継ぎ

- Money / Category / ExpenseId / Expense / Budget の定義が確定済み。
- 実装ファイルは `src/domain/money.ts`, `src/domain/expense.ts`, `src/domain/budget.ts` の3ファイル構成。
- `createExpense` は `crypto.randomUUID()` で ID を生成する。
- テストは Vitest で各ファイルに対応する `__tests__/*.test.ts` に書く。
- フレームワーク・I/O の import がゼロであることをテスト前に自動チェックすること。

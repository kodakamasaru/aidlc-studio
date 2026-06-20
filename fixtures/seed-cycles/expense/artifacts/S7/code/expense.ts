// Expense — 集約ルート
// 支出1件を表すドメインオブジェクト。不変条件: amount > 0, memo <= 200文字。
// フレームワーク・I/O 依存ゼロの純粋 TypeScript。

import { type Money, createMoney } from "./money";

export type Category =
  | "食費"
  | "交通"
  | "日用品"
  | "娯楽"
  | "医療"
  | "その他";

export const ALL_CATEGORIES: readonly Category[] = [
  "食費",
  "交通",
  "日用品",
  "娯楽",
  "医療",
  "その他",
];

export type ExpenseId = { readonly _expenseIdBrand: true; readonly value: string };

export type Expense = {
  readonly id: ExpenseId;
  readonly amount: Money;
  readonly date: Date;
  readonly category: Category;
  readonly memo: string;
};

export class InvalidExpenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidExpenseError";
  }
}

const MEMO_MAX_LENGTH = 200;

function makeExpenseId(value: string): ExpenseId {
  return { _expenseIdBrand: true, value } as ExpenseId;
}

/**
 * Expense を生成する。
 * - amount が 0 以下の場合は InvalidExpenseError を投げる(Money 経由)
 * - memo が 200 文字を超える場合は InvalidExpenseError を投げる
 */
export function createExpense(params: {
  amount: number;
  date: Date;
  category: Category;
  memo?: string;
}): Expense {
  const memo = params.memo ?? "";
  if (memo.length > MEMO_MAX_LENGTH) {
    throw new InvalidExpenseError(
      `メモは${MEMO_MAX_LENGTH}文字以内でなければなりません。現在: ${memo.length}文字`
    );
  }
  const amount = createMoney(params.amount); // throws InvalidMoneyError if <= 0
  const id = makeExpenseId(crypto.randomUUID());
  return Object.freeze({ id, amount, date: params.date, category: params.category, memo });
}

/**
 * メモを更新した新しい Expense を返す(不変)。
 * memo が 200 文字を超える場合は InvalidExpenseError を投げる。
 */
export function updateExpenseMemo(expense: Expense, newMemo: string): Expense {
  if (newMemo.length > MEMO_MAX_LENGTH) {
    throw new InvalidExpenseError(
      `メモは${MEMO_MAX_LENGTH}文字以内でなければなりません。現在: ${newMemo.length}文字`
    );
  }
  return Object.freeze({ ...expense, memo: newMemo });
}

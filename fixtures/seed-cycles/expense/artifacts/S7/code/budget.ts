// Budget — 集約ルート
// 月単位の予算を表すドメインオブジェクト。不変条件: amount > 0, monthKey は YYYY-MM 形式。
// フレームワーク・I/O 依存ゼロの純粋 TypeScript。

import { type Money, createMoney } from "./money";

export type BudgetStatus = "ok" | "warning" | "over";

export type Budget = {
  readonly monthKey: string; // YYYY-MM
  readonly amount: Money;
};

export class InvalidBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBudgetError";
  }
}

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const WARNING_THRESHOLD = 0.8;

/**
 * Budget を生成する。
 * - amount が 0 以下の場合は InvalidBudgetError を投げる
 * - monthKey が YYYY-MM 形式でない場合は InvalidBudgetError を投げる
 */
export function createBudget(monthKey: string, amount: number): Budget {
  if (!MONTH_KEY_PATTERN.test(monthKey)) {
    throw new InvalidBudgetError(
      `monthKey は YYYY-MM 形式でなければなりません。受け取った値: ${monthKey}`
    );
  }
  const budgetAmount = createMoney(amount); // throws InvalidMoneyError if <= 0
  return Object.freeze({ monthKey, amount: budgetAmount });
}

/**
 * 予算に対する支出の状態を返す。
 * - "over":    totalSpent >= budget.amount (100%以上)
 * - "warning": totalSpent >= budget.amount * 0.8 (80%以上)
 * - "ok":      上記以外
 */
export function getBudgetStatus(budget: Budget, totalSpent: Money): BudgetStatus {
  const spent = totalSpent.value;
  const limit = budget.amount.value;
  if (spent >= limit) {
    return "over";
  }
  if (spent >= limit * WARNING_THRESHOLD) {
    return "warning";
  }
  return "ok";
}

/**
 * 予算超過警告状態かどうかを返す。
 * warning または over のとき true。
 */
export function isWarning(budget: Budget, totalSpent: Money): boolean {
  const status = getBudgetStatus(budget, totalSpent);
  return status === "warning" || status === "over";
}

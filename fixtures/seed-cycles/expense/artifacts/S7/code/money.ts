// Money — 値オブジェクト
// 金額(正整数・円単位)。0以下を禁止する不変条件。
// フレームワーク・I/O 依存ゼロの純粋 TypeScript。

declare const _moneyBrand: unique symbol;

export type Money = {
  readonly [_moneyBrand]: true;
  readonly value: number;
};

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMoneyError";
  }
}

/**
 * Money を生成する。amount が 0 以下の場合は InvalidMoneyError を投げる。
 */
export function createMoney(amount: number): Money {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new InvalidMoneyError(
      `金額は1以上の整数でなければなりません。受け取った値: ${amount}`
    );
  }
  return { [_moneyBrand]: true, value: amount } as Money;
}

/**
 * 2つの Money を加算して新しい Money を返す。
 */
export function addMoney(a: Money, b: Money): Money {
  return createMoney(a.value + b.value);
}

/**
 * a から b を減算して新しい Money を返す。
 * 結果が 0 未満になる場合は InvalidMoneyError を投げる。
 */
export function subtractMoney(a: Money, b: Money): Money {
  const result = a.value - b.value;
  if (result <= 0) {
    throw new InvalidMoneyError(
      `減算結果が0以下になります。${a.value} - ${b.value} = ${result}`
    );
  }
  return createMoney(result);
}

/**
 * Money の数値を取り出す。
 */
export function valueOf(m: Money): number {
  return m.value;
}

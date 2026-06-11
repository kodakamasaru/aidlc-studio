/**
 * 見送りの意思決定 — 純粋部(S6 descope-policy)。Review 域の全域関数。
 *
 * gap(brief.ts が算出)の後始末を決める決定的な判定。状況 → 帰結:
 *   - gap ゼロ ............................. Step done を許可(allow-done)
 *   - gap あり / 見送り申請の無い gap が残る .. generator を自動差し戻し(auto-rework / 人間に出さない)
 *   - 全 gap が理由付き見送り申請で覆われる ... descope 申請を Question 化(await-descope / 人間へ)
 *
 * 不変条件(原則#6 / #2): 理由のない見送りは発生しない(申請なし gap は auto-rework に倒す)。
 * 全 gap が解消 or 承認済み見送りまで done にしない(hard gate)。
 * gap の「処理」はここ、「算出」は brief.ts、Question/Task への配線は question.ts。
 */

import type { Text } from "../shared/primitives";
import type { Step } from "../shared/vocab";
import type { Requirement } from "./brief";

/** AI が理由付きで起こす見送り申請(1 申請 = 1 requirement)。 */
export type DescopeRequest = {
  readonly requirement: Requirement; // key で gap と照合
  readonly aiReason: Text; // 必須(理由なき見送りは禁止)
  readonly recommendedStep?: Step; // 「前のステップからやり直す」候補
};

/** gap の後始末の帰結。 */
export type Disposition =
  | { readonly kind: "allow-done" }
  | { readonly kind: "auto-rework"; readonly unresolved: readonly Requirement[] }
  | { readonly kind: "await-descope"; readonly requests: readonly DescopeRequest[] };

/**
 * decideDisposition(S6 決定表): gap と見送り申請から後始末を決める(副作用なし・全域)。
 * 申請の無い gap が 1 つでも残れば auto-rework(人間に出さず AI が作り直す)。
 * 全 gap が理由付き申請で覆われていれば await-descope(申請を Question 化して人間へ)。
 */
export const decideDisposition = (
  gaps: readonly Requirement[],
  descopeRequests: readonly DescopeRequest[] = [],
): Disposition => {
  if (gaps.length === 0) return { kind: "allow-done" };

  const requestedKeys = new Set(descopeRequests.map((r) => r.requirement.key));
  const unresolved = gaps.filter((g) => !requestedKeys.has(g.key));
  if (unresolved.length > 0) return { kind: "auto-rework", unresolved };

  // 全 gap が申請で覆われている → 各 gap に対応する申請だけを人間へ回す
  const gapKeys = new Set(gaps.map((g) => g.key));
  const requests = descopeRequests.filter((r) => gapKeys.has(r.requirement.key));
  return { kind: "await-descope", requests };
};

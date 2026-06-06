/**
 * 共有の基本値オブジェクト: Instant(時刻) / NonEmptyText / Text。
 * 時刻はドメインで取得せず、外から ISO-8601 文字列で注入する(S6 D-04)。
 */

import { type Result, ok, err } from "./result";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** ISO-8601 のタイムスタンプ(順序比較できる文字列)。生成は外部、ここは型付けと検証のみ。 */
export type Instant = Brand<string, "Instant">;
/** 空でないテキスト(title など)。 */
export type NonEmptyText = Brand<string, "NonEmptyText">;
/** 任意テキスト(本文・理由など)。 */
export type Text = string;

const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export type InstantError = "InvalidInstant";

/** ISO-8601 文字列を Instant にする。形式不正は Err。 */
export const instant = (s: string): Result<Instant, InstantError> =>
  ISO_8601.test(s) ? ok(s as Instant) : err("InvalidInstant");

export type TextError = "EmptyText";

/** 空・空白のみを拒否して NonEmptyText にする。 */
export const nonEmptyText = (s: string): Result<NonEmptyText, TextError> =>
  s.trim().length > 0 ? ok(s as NonEmptyText) : err("EmptyText");

/** Instant の時系列比較(古い→新しい)。 */
export const compareInstant = (a: Instant, b: Instant): number =>
  a < b ? -1 : a > b ? 1 : 0;

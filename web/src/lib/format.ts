// Presentation helpers: relative time + error-code → Japanese message.
import { ApiError } from "./api";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** ISO instant → coarse Japanese relative time ("2 分前" / "1 時間前" / "昨日"). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const diff = Math.max(0, now - then);
  if (diff < MIN) return "たった今";
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 時間前`;
  if (diff < 2 * DAY) return "昨日";
  return `${Math.floor(diff / DAY)} 日前`;
}

/** Turn an unknown thrown value into a human-facing message. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "NetworkError") return "サーバに接続できませんでした";
    return `エラー: ${err.code}`;
  }
  if (err instanceof Error) return err.message;
  return "予期しないエラーが発生しました";
}

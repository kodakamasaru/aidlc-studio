/**
 * 集約: LedgerEntry(台帳項目)(S6 ledger-entry.md / S7 実装)
 *
 * 純粋(D-03): フレームワーク・DB・HTTP・I/O を持たない。
 * 判定に必要な入力は全て引数で受け取る(ファイルを読まない)。
 */

// ── 型定義 ────────────────────────────────────────────

/** 台帳エントリの状態(S6 ledger-entry.md)。 */
export type LedgerState = "carried" | "done" | "dropped";

/**
 * 台帳項目(S6 ledger-entry.md 集約ルート)。
 *
 * 不変条件(validateLedgerEntry で検査):
 *   carried ⇒ into 必須
 *   done    ⇒ closedIn 必須
 *   dropped ⇒ reason 必須
 */
export type LedgerEntry = {
  readonly id: string;
  /** どの md で確定したか(出典)。 */
  readonly origin: string;
  /** 決定内容。 */
  readonly decision: string;
  readonly state: LedgerState;
  /** 渡し先バージョン(state=carried のとき必須)。 */
  readonly into?: string;
  /** 棄却理由(state=dropped のとき必須)。 */
  readonly reason?: string;
  /** 消し込んだ md/commit(state=done のとき必須)。 */
  readonly closedIn?: string;
  /** 昇格メモ(2 サイクル連続 carried 等、detectEscalation が付与)。 */
  readonly escalation?: string;
};

/** reconcileStatus の結果型。 */
export type ReconcileStatus = "reconciled" | "unreconciled";

// ── 純粋関数 ─────────────────────────────────────────

/**
 * validateLedgerEntry: state ごとの必須フィールドを検査する。
 * 違反を文字列の配列で返す。違反ゼロなら空配列。
 *
 * 検査内容(S6 ledger-entry.md 不変条件):
 *   carried ⇒ into 必須
 *   done    ⇒ closedIn 必須
 *   dropped ⇒ reason 必須
 */
export const validateLedgerEntry = (entry: LedgerEntry): readonly string[] => {
  const violations: string[] = [];

  if (entry.state === "carried" && entry.into === undefined) {
    violations.push("carried requires into");
  }
  if (entry.state === "done" && entry.closedIn === undefined) {
    violations.push("done requires closedIn");
  }
  if (entry.state === "dropped" && entry.reason === undefined) {
    violations.push("dropped requires reason");
  }

  return violations;
};

/**
 * reconcileStatus: carried エントリが次サイクルで US 化済かを判定する。
 *
 * reconciled の条件:
 *   ① entry.state === "carried"
 *   ② entry.into === targetVersion(このサイクル向けの持ち越し)
 *   ③ addressedIds に entry.id が厳密一致で含まれている(US 化の証跡)
 *
 * ①②③ のいずれか欠ければ "unreconciled"。
 *
 * addressedIds は「当該サイクルの US 群が明示的に消し込む台帳 id の集合」。
 * US 由来(`由来:` / origin)から台帳 id を抽出する処理は技術層(S8)の責務であり、
 * ドメインは厳密メンバーシップのみ判定する(部分一致は "D-1"→"D-10" の誤検出を生むため不可)。
 *
 * @param entry         判定対象の台帳項目
 * @param targetVersion 現サイクルのバージョン識別子(例: "v0.0.5")
 * @param addressedIds  現サイクルの US 群が消し込む台帳 id の集合(US 化されたことを示す)
 */
export const reconcileStatus = (
  entry: LedgerEntry,
  targetVersion: string,
  addressedIds: readonly string[],
): ReconcileStatus => {
  if (entry.state !== "carried") return "unreconciled";
  if (entry.into !== targetVersion) return "unreconciled";

  // 台帳 id が厳密一致で消し込み対象に含まれているかで US 化を判定
  const reflected = addressedIds.includes(entry.id);
  return reflected ? "reconciled" : "unreconciled";
};

/**
 * detectEscalation: 同一 id が 2 回以上 "carried" で出現するエントリを escalation 対象として返す。
 *
 * - 入力は複数サイクルにまたがる全エントリ(carried/done/dropped 混在可)
 * - 同一 id の carried が 2 件以上あれば escalation 対象
 * - done/dropped で解消済みなら対象外
 * - 結果は重複なし(id ごとに最後の carried エントリを代表として返す)
 *
 * @param entriesAcrossCycles 複数サイクルの LedgerEntry 一覧
 */
export const detectEscalation = (
  entriesAcrossCycles: readonly LedgerEntry[],
): readonly LedgerEntry[] => {
  type Summary = {
    carriedCount: number;
    resolved: boolean;
    lastCarried: LedgerEntry | null;
  };
  const byId = new Map<string, Summary>();

  for (const entry of entriesAcrossCycles) {
    const existing = byId.get(entry.id) ?? {
      carriedCount: 0,
      resolved: false,
      lastCarried: null,
    };

    if (entry.state === "carried") {
      byId.set(entry.id, {
        carriedCount: existing.carriedCount + 1,
        resolved: existing.resolved,
        lastCarried: entry,
      });
    } else if (entry.state === "done" || entry.state === "dropped") {
      byId.set(entry.id, {
        ...existing,
        resolved: true,
      });
    }
  }

  const result: LedgerEntry[] = [];
  for (const [, summary] of byId) {
    if (summary.carriedCount >= 2 && !summary.resolved && summary.lastCarried !== null) {
      result.push(summary.lastCarried);
    }
  }

  return result;
};

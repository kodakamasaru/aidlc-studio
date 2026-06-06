/**
 * 集約: 外部記憶(Artifact / Wiki / Ledger / Conversation)(S5 external-memory.md)。
 *
 * 設計核: aidlc-docs を唯一の真実 source とし、studio は参照・索引・状態のみ持つ(内容を複製しない)。
 * 純粋(D-03)。FS の read/write(readArtifact 等)は S7。ここは「参照 + 薄い不変条件」と、
 * 安全に純粋実装できる部分(DocPath 検証 / Ledger 不変条件 / Wiki の人間ブロック保護)を担う。
 */

import { type Result, ok, err } from "../shared/result";
import type { Instant, Text } from "../shared/primitives";
import type { Step } from "../shared/vocab";
import type { CycleId, RunId, LedgerEntryId } from "../shared/ids";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ── DocPath(aidlc-docs ルート配下に限定 / path traversal 拒否。INV-2) ──
export type DocPath = Brand<string, "DocPath">;
export type DocPathError = "PathOutsideDocs";

/**
 * docPath: aidlc-docs ルート配下に正規化する。絶対パス・ルート外への `..` 脱出・NUL を拒否。純粋。
 */
export const docPath = (raw: string): Result<DocPath, DocPathError> => {
  if (raw.length === 0 || raw.startsWith("/") || raw.includes("\0")) {
    return err("PathOutsideDocs");
  }
  const segments = raw.split("/").filter((s) => s !== "" && s !== ".");
  const resolved: string[] = [];
  for (const seg of segments) {
    if (seg === "..") {
      if (resolved.length === 0) return err("PathOutsideDocs");
      resolved.pop();
    } else {
      resolved.push(seg);
    }
  }
  if (resolved.length === 0) return err("PathOutsideDocs");
  return ok(resolved.join("/") as DocPath);
};

// ── ArtifactRef(索引エントリ / 内容は aidlc-docs に在る。INV-1) ──
export type ArtifactKind = "us" | "mock" | "flow" | "uow" | "code" | "screenshot";

export type ArtifactRef = {
  readonly cycleId: CycleId;
  readonly step: Step;
  readonly path: DocPath;
  readonly kind: ArtifactKind;
  readonly updatedAt: Instant;
};

/** ArtifactEmitted 受信で索引エントリを作る(内容は複製しない)。 */
export const indexArtifact = (ref: ArtifactRef): ArtifactRef => ref;

// ── WikiDoc(section 単位の参照 + 人間ブロック保護。INV-5) ──────
export type WikiSection = "ubiquitous" | "facts" | "ledger";

export type WikiDoc = {
  readonly section: WikiSection;
  readonly path: DocPath;
  readonly updatedAt: Instant;
};

const HUMAN_BLOCK = /<!-- human -->[\s\S]*?<!-- \/human -->/g;

/** 本文中の人間編集ブロック(`<!-- human -->…<!-- /human -->`)を抽出。 */
export const extractHumanBlocks = (body: string): readonly string[] =>
  body.match(HUMAN_BLOCK) ?? [];

/**
 * regenerateWikiBody: AI 再生成本文に、旧本文の人間ブロックを保持して合成する(INV-5)。
 * AI 本文に既に含まれていない人間ブロックは末尾に温存し、人間編集を失わない。純粋。
 */
export const regenerateWikiBody = (oldBody: string, aiBody: string): string => {
  const preserved = extractHumanBlocks(oldBody).filter((b) => !aiBody.includes(b));
  return preserved.length === 0 ? aiBody : `${aiBody}\n${preserved.join("\n")}`;
};

// ── LedgerEntry(持ち越し台帳 / 厚い不変条件。INV-3/4) ───────────
export type LedgerKind = "D" | "確定項目";
export type LedgerState = "carried" | "done" | "dropped";

export type LedgerEntry = {
  readonly id: LedgerEntryId;
  readonly kind: LedgerKind;
  readonly label: Text;
  readonly state: LedgerState;
  readonly into?: Text; // carried のとき必須(次サイクルのどこへ)
  readonly reason?: Text; // dropped のとき必須
  readonly cycleFrom: CycleId;
};

export type LedgerError = "MissingInto" | "MissingReason" | "NotCarried";

export type MakeLedgerEntryCmd = {
  readonly id: LedgerEntryId;
  readonly kind: LedgerKind;
  readonly label: Text;
  readonly state: LedgerState;
  readonly into?: Text;
  readonly reason?: Text;
  readonly cycleFrom: CycleId;
};

const present = (t: Text | undefined): t is Text => t !== undefined && t.trim().length > 0;

/** makeLedgerEntry: carried⇒into 必須 / dropped⇒reason 必須(INV-3)。 */
export const makeLedgerEntry = (
  cmd: MakeLedgerEntryCmd,
): Result<LedgerEntry, LedgerError> => {
  if (cmd.state === "carried" && !present(cmd.into)) return err("MissingInto");
  if (cmd.state === "dropped" && !present(cmd.reason)) return err("MissingReason");
  return ok({
    id: cmd.id,
    kind: cmd.kind,
    label: cmd.label,
    state: cmd.state,
    ...(present(cmd.into) ? { into: cmd.into } : {}),
    ...(present(cmd.reason) ? { reason: cmd.reason } : {}),
    cycleFrom: cmd.cycleFrom,
  });
};

/** reconcileEntry: 次サイクルで carried を done / dropped に決着させる(dropped は reason 必須)。 */
export const reconcileEntry = (
  entry: LedgerEntry,
  disposition: { readonly to: "done" | "dropped"; readonly reason?: Text },
): Result<LedgerEntry, LedgerError> => {
  if (entry.state !== "carried") return err("NotCarried");
  if (disposition.to === "dropped" && !present(disposition.reason)) {
    return err("MissingReason");
  }
  return ok({
    ...entry,
    state: disposition.to,
    ...(present(disposition.reason) ? { reason: disposition.reason } : {}),
  });
};

/** 未 reconcile 件数 = まだ carried の entry 数(INV-4 の判定材料)。 */
export const unreconciledCount = (entries: readonly LedgerEntry[]): number =>
  entries.filter((e) => e.state === "carried").length;

/** 次サイクル S1 着手条件: 未 reconcile = 0(kit #5 / INV-4)。 */
export const canStartNextCycleS1 = (entries: readonly LedgerEntry[]): boolean =>
  unreconciledCount(entries) === 0;

// ── Conversation(runId 単位の対話ログ参照) ─────────────────────
export type ConversationTurn = {
  readonly role: string;
  readonly text: Text;
  readonly at: Instant;
};

export type Conversation = {
  readonly runId: RunId;
  readonly turns: readonly ConversationTurn[];
};

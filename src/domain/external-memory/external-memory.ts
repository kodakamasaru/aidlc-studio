/**
 * 集約: 外部記憶(Artifact / Wiki)(S5 external-memory.md)。
 *
 * 設計核: aidlc-docs を唯一の真実 source とし、studio は参照・索引・状態のみ持つ(内容を複製しない)。
 * 純粋(D-03)。FS の read/write(readArtifact 等)は S7。ここは「参照 + 薄い不変条件」と、
 * 安全に純粋実装できる部分(DocPath 検証 / Wiki の人間ブロック保護)を担う。
 */

import { type Result, ok, err } from "../shared/result";
import type { Instant } from "../shared/primitives";
import type { Step } from "../shared/vocab";
import type { CycleId } from "../shared/ids";

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

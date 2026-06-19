/**
 * Web-side aidlc-answers serializer.
 *
 * Emits the same JSON shape as the backend src/wire/aidlc-wire.ts AidlcAnswer[].
 * Cannot import the backend module directly (no Vite alias to src/).
 *
 * D-NN: web-side duplicate of AidlcAnswer type. Schema is kept identical
 * ({questionId, choiceIds:string[], note?}) to prevent fork; backend wire.ts
 * is the canonical spec.
 */

export interface AidlcAnswer {
  readonly questionId: string;
  readonly choiceIds: readonly string[];
  readonly note?: string;
}

/**
 * Serialize a list of answers into the aidlc-answers fenced block
 * body as a JSON string, then wrap it in the fence so it can be POST-ed in
 * the answer body field.
 *
 * Output shape (the body field value):
 *   ```aidlc-answers
 *   [{"questionId":"…","choiceIds":["…"],"note":"…"}, …]
 *   ```
 */
export function serializeAnswersBlock(answers: readonly AidlcAnswer[]): string {
  const json = JSON.stringify(answers, null, 0);
  return `\`\`\`aidlc-answers\n${json}\n\`\`\``;
}

/**
 * Build an AidlcAnswer for a single question from local UI state.
 * choiceIds includes selected option ids; note carries the free-text supplement.
 */
export function buildAnswer(
  questionId: string,
  choiceIds: readonly string[],
  note: string,
): AidlcAnswer {
  return {
    questionId,
    choiceIds,
    ...(note.trim() ? { note: note.trim() } : {}),
  };
}

/**
 * Return true if the answer has at least one choice id OR a non-empty note.
 */
export function isAnswerComplete(answer: AidlcAnswer): boolean {
  return answer.choiceIds.length > 0 || (answer.note?.trim().length ?? 0) > 0;
}

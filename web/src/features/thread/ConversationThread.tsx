// SCR-02 — 会話スレッド(統合対話ビュー)
// 同一ステップの QA を時系列で積み、画面遷移なしで連続回答(バッチ方式)。
// 各質問を 4 部テンプレ(質問/背景=折りたたみ/選択肢=★おすすめ+理由/自由入力)で描画。
// N 問の回答を aidlc-answers にシリアライズして batch submit で resume へ送る。
// 設定ヒアリング(US-06)も同じ器に収容。
//
// 状態: default(質問あり) / empty(着手直後) / running(resume中) / appended(次バッチ追記) /
//        completed(完了) / stall(retry)
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Question, type QuestionOption } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { useProjectContext } from "../../lib/project-context";
import { useSetTopbar } from "../../components/shell/topbar-context";
import { StateBadge } from "../../components/ui/StateBadge";
import { Spinner } from "../../components/ui/Spinner";
import { ErrorMessage } from "../../components/ui/StateMessage";
import { stepLabel } from "../../lib/step-label";
import {
  serializeAnswersBlock,
  buildAnswer,
  isAnswerComplete,
  type AidlcAnswer,
} from "./aidlc-answers";
import "./conversation-thread.css";

/** How often to poll for new questions while the run is active (empty thread). */
const POLL_MS = 3000;

// ── Local state types ─────────────────────────────────────────

interface PerQuestionState {
  readonly choiceId: string;
  readonly note: string;
  readonly backgroundOpen: boolean;
}

function emptyQState(): PerQuestionState {
  return { choiceId: "", note: "", backgroundOpen: false };
}

// ── Thread bubble record types ─────────────────────────────────

/**
 * Human bubble carries the resolved label text for each answer so the bubble
 * never shows raw option ids to the user.
 * choiceLabels[i] is the human-readable label for answers[i].choiceIds[0]
 * (or the free-text note if no option was chosen).
 */
type ThreadBubble =
  | {
      readonly kind: "ai-batch";
      readonly questions: readonly Question[];
      readonly turnKey: string;
    }
  | {
      readonly kind: "human";
      readonly answers: readonly AidlcAnswer[];
      /** Resolved label text per answer (index-aligned with answers[]).
       *  Each entry is the option label text, the note text, or a combination. */
      readonly choiceLabels: readonly string[];
      readonly questionCount: number;
    };

// ── Pure helpers ───────────────────────────────────────────────

function promptText(q: Question): string {
  if (q.payload.kind === "question") return q.payload.prompt;
  if (q.payload.kind === "device_check") return q.payload.instructions;
  if (q.payload.kind === "decision") return q.payload.statement;
  return "回答してください。";
}

function getOptions(q: Question): readonly QuestionOption[] {
  if (q.payload.kind === "question" && q.payload.options) return q.payload.options;
  return [];
}

/** Group open questions by runId into AI-batch bubbles (preserving order). */
function buildBubbles(questions: readonly Question[]): readonly ThreadBubble[] {
  if (questions.length === 0) return [];
  const groups = new Map<string, Question[]>();
  const order: string[] = [];
  for (const q of questions) {
    if (!groups.has(q.runId)) {
      groups.set(q.runId, []);
      order.push(q.runId);
    }
    (groups.get(q.runId) as Question[]).push(q);
  }
  return order.map((runId) => ({
    kind: "ai-batch" as const,
    questions: ((groups.get(runId) ?? []) as Question[]).sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    ),
    turnKey: runId,
  }));
}

// ── ConversationThread ────────────────────────────────────────

interface ConversationThreadProps {
  readonly cycleId: string;
  readonly stepName?: string;
  /** true = settings hearing mode (US-06). Header label + intro text change. */
  readonly isHearing?: boolean;
  readonly backTo?: string;
  readonly backLabel?: string;
}

export function ConversationThread({
  cycleId,
  stepName,
  isHearing = false,
  backTo,
  backLabel,
}: ConversationThreadProps) {
  const { refreshInbox } = useProjectContext();

  const inboxQ = useAsync(() => api.getCycleInbox(cycleId), [cycleId]);
  const cycleQ = useAsync(() => api.getCycle(cycleId), [cycleId]);

  const allOpenQuestions = (inboxQ.data ?? [])
    .filter((q) => q.kind === "question")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const cycle = cycleQ.data;
  const activePhase = cycle?.phases.find(
    (p) => p.state === "running" || p.state === "review",
  );
  // Fallback: when no phase is currently running (done/stall), take the most
  // recently-ordered phase so the breadcrumb still shows the step name.
  const resolvedPhase =
    activePhase ??
    cycle?.phases
      .slice()
      .sort((a, b) => b.order - a.order)
      .find((p) => p.state === "done" || p.state === "review") ??
    cycle?.phases.at(-1);
  const activeRun = activePhase?.runs
    .slice()
    .sort((a, b) => b.attempt - a.attempt)[0];
  const runState = activeRun?.state;

  const isRunning = runState === "running";
  const isStalled = runState === "stalled" || runState === "failed";
  const isDone =
    cycle?.state === "done" ||
    (activePhase?.state === "done" && allOpenQuestions.length === 0);

  // A visual_review for this cycle means the AI finished answering and emitted a
  // review — the QA thread must STOP showing "考えています" and point the human to the
  // review (原則#1/Human Inbox), NOT poll forever. The live run stays `running` under
  // the review-gate, so isRunning alone never clears. BUG (S10 device_check 2026-06):
  // the thread only watched kind==="question" and ignored the emitted visual_review,
  // leaving the screen stuck on "AI が続きを考えています".
  const openReview = (inboxQ.data ?? []).find((q) => q.kind === "visual_review");

  // ── Polling: while AI is running and neither questions nor a review yet ────────
  const reloadInbox = inboxQ.reload;
  const reloadCycle = cycleQ.reload;
  const shouldPoll =
    isRunning && allOpenQuestions.length === 0 && openReview === undefined;

  useEffect(() => {
    if (!shouldPoll) return;
    const tick = () => {
      if (document.hidden) return;
      reloadInbox({ background: true });
      reloadCycle({ background: true });
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [shouldPoll, reloadInbox, reloadCycle]);

  // ── Per-question answer state ────────────────────────────────
  const [answerMap, setAnswerMap] = useState<Record<string, PerQuestionState>>({});

  // Initialize new questions with empty state immutably
  const openQKey = allOpenQuestions.map((q) => q.id).join(",");
  useEffect(() => {
    setAnswerMap((prev) => {
      let next = prev;
      for (const q of allOpenQuestions) {
        if (!(q.id in next)) {
          next = { ...next, [q.id]: emptyQState() };
        }
      }
      return next;
    });
    // deps: openQKey captures all ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openQKey]);

  const setChoice = useCallback((qId: string, choiceId: string) => {
    setAnswerMap((prev) => ({
      ...prev,
      [qId]: { ...(prev[qId] ?? emptyQState()), choiceId },
    }));
  }, []);

  const setNote = useCallback((qId: string, note: string) => {
    setAnswerMap((prev) => ({
      ...prev,
      [qId]: { ...(prev[qId] ?? emptyQState()), note },
    }));
  }, []);

  const toggleBg = useCallback((qId: string) => {
    setAnswerMap((prev) => ({
      ...prev,
      [qId]: {
        ...(prev[qId] ?? emptyQState()),
        backgroundOpen: !(prev[qId]?.backgroundOpen ?? false),
      },
    }));
  }, []);

  // ── Submission ───────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [history, setHistory] = useState<readonly ThreadBubble[]>([]);

  // Derived early so it can be referenced in topbar badge and render section.
  const hasHistory = history.length > 0;

  const unansweredCount = allOpenQuestions.filter((q) => {
    const s = answerMap[q.id];
    if (!s) return true;
    return !isAnswerComplete(buildAnswer(q.id, s.choiceId ? [s.choiceId] : [], s.note));
  }).length;

  const canSubmit =
    !submitting && allOpenQuestions.length > 0 && unansweredCount === 0;

  const threadEndRef = useRef<HTMLDivElement>(null);
  function scrollToEnd() {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }
  useEffect(() => {
    scrollToEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOpenQuestions.length, history.length]);

  async function submitBatch() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    const batchAnswers: AidlcAnswer[] = allOpenQuestions.map((q) => {
      const s = answerMap[q.id] ?? emptyQState();
      return buildAnswer(q.id, s.choiceId ? [s.choiceId] : [], s.note);
    });

    // Resolve human-readable label text for each answer at submit time so the
    // history bubble never shows raw option ids.
    const choiceLabels: string[] = allOpenQuestions.map((q, idx) => {
      const s = answerMap[q.id] ?? emptyQState();
      const options = getOptions(q);
      if (s.choiceId) {
        const opt = options.find((o) => o.id === s.choiceId);
        const label = opt?.label ?? s.choiceId;
        return s.note.trim() ? `${label}(補足: ${s.note.trim()})` : label;
      }
      return s.note.trim() || batchAnswers[idx]?.choiceIds.join("、") || "";
    });

    // Serialize all answers into aidlc-answers block and submit each question.
    // The block carries all N answers so the AI receives full context on resume.
    const body = serializeAnswersBlock(batchAnswers);

    try {
      for (const q of allOpenQuestions) {
        await api.answerQuestion(q.id, { verdict: "answer", body });
      }
      // Record submitted bubbles in conversation history
      setHistory((prev) => [
        ...prev,
        ...buildBubbles(allOpenQuestions),
        {
          kind: "human",
          answers: batchAnswers,
          choiceLabels,
          questionCount: batchAnswers.length,
        },
      ]);
      setAnswerMap({});
      refreshInbox();
      reloadInbox({ background: true });
      reloadCycle({ background: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submitBatch();
    }
  }

  // ── Retry stalled run ────────────────────────────────────────
  const [retrying, setRetrying] = useState(false);

  async function retryRun() {
    if (!activeRun || retrying) return;
    setRetrying(true);
    try {
      await api.retryRun(cycleId, activeRun.id);
      reloadCycle();
      reloadInbox();
    } finally {
      setRetrying(false);
    }
  }

  // ── Topbar ───────────────────────────────────────────────────
  // Prefer the explicitly-passed step name; fall back to the resolved phase's
  // step so the crumb always shows the human step name, never "会話スレッド".
  const resolvedStepName = stepName ?? resolvedPhase?.step;
  const titleLabel = isHearing
    ? "ステップ設定ヒアリング"
    : resolvedStepName
    ? stepLabel(resolvedStepName)
    : "会話スレッド";

  const cycleName = cycle?.version ?? "…";

  const runBadge = isDone ? (
    <StateBadge variant="done">完了</StateBadge>
  ) : isStalled ? (
    <StateBadge variant="stalled">行き詰まり</StateBadge>
  ) : allOpenQuestions.length > 0 ? (
    // Questions are waiting for human answers — "回答待ち"
    <StateBadge variant="stalled">回答待ち</StateBadge>
  ) : isRunning && hasHistory ? (
    // Answers submitted, AI is continuing — "実行中"
    <StateBadge variant="running" pulse>実行中</StateBadge>
  ) : isRunning ? (
    // AI just launched, awaiting first question — "起動中"
    <StateBadge variant="running" pulse>起動中</StateBadge>
  ) : (
    <StateBadge variant="running" pulse>起動中</StateBadge>
  );

  useSetTopbar(
    {
      left: (
        <span className="crumb-wrap">
          {backTo ? (
            <>
              <Link to={backTo} className="crumb">
                {backLabel ?? "戻る"}
              </Link>
              <span className="crumb__sep">/</span>
            </>
          ) : null}
          <span className="crumb__current">{titleLabel}</span>
          {cycleName !== "…" && cycleName !== (backLabel ?? "") ? (
            // Show the cycle version as trailing context ONLY when the back link
            // isn't already showing it — otherwise the crumb duplicates (e.g.
            // "v0.0.1 / 要件 v0.0.1"). In hearing mode backLabel is "設定", so the
            // version still shows there.
            <span className="crumb crumb--meta">{cycleName}</span>
          ) : null}
        </span>
      ),
      right: runBadge,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [titleLabel, isDone, isStalled, isRunning, hasHistory, allOpenQuestions.length, backTo, backLabel, cycleName],
  );

  // ── Render ────────────────────────────────────────────────────

  if (inboxQ.status === "error") {
    return (
      <div className="content-inner">
        <ErrorMessage error={inboxQ.error} onRetry={inboxQ.reload} />
      </div>
    );
  }

  const currentBubbles = buildBubbles(allOpenQuestions);

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className="thread-page" onKeyDown={onKeyDown}>
      <div
        className="thread-container"
        role="log"
        aria-label="会話スレッド"
        aria-live="polite"
      >
        {/* ── Conversation history (past answered bubbles) ── */}
        {history.map((bubble, i) => {
          if (bubble.kind === "ai-batch") {
            return (
              <AiBatchBubble
                key={`hist-ai-${bubble.turnKey}`}
                questions={bubble.questions}
                answerMap={{}}
                isHistory
                isHearing={isHearing}
                onChangeChoice={() => undefined}
                onChangeNote={() => undefined}
                onToggleBackground={() => undefined}
              />
            );
          }
          return (
            <HumanBubble
              key={`hist-human-${i}`}
              answers={bubble.answers}
              choiceLabels={bubble.choiceLabels}
              questionCount={bubble.questionCount}
            />
          );
        })}

        {/* ── Empty state: AI launched, awaiting first question batch ─── */}
        {/* Condition: run is active, no open questions, AND no submitted history yet.
            Distinct from "running" which shows after the human has already submitted. */}
        {allOpenQuestions.length === 0 &&
          !isStalled &&
          !isDone &&
          !hasHistory && (
            <div className="thread-empty" aria-label="スレッド空状態">
              <div className="thread-empty__glyph" aria-hidden="true">
                💬
              </div>
              <p className="thread-empty__title">AI を起動しました</p>
              <p className="thread-empty__body">
                最初の質問(まとめて数件)が届くとここに表示されます。各質問は選択肢 +
                おすすめ + 自由入力で、全部に答えて 1 回で送信すると会話が続きます。
              </p>
            </div>
          )}

        {/* ── Current open-question batch ─────────────────── */}
        {currentBubbles.map((bubble) => {
          if (bubble.kind !== "ai-batch") return null;
          return (
            <AiBatchBubble
              key={`cur-ai-${bubble.turnKey}`}
              questions={bubble.questions}
              answerMap={answerMap}
              isHistory={false}
              isNewest={hasHistory}
              isHearing={isHearing}
              onChangeChoice={setChoice}
              onChangeNote={setNote}
              onToggleBackground={toggleBg}
            />
          );
        })}

        {/* ── Running: answers submitted, AI is continuing ─── */}
        {/* Only shown when the human has submitted at least one batch (hasHistory).
            Before any submission, the empty/launched state above is shown instead. */}
        {isRunning && allOpenQuestions.length === 0 && hasHistory && !openReview && (
          <div className="thread-running" aria-live="polite">
            <span className="thread-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              {(() => {
                // Use questionCount from the most recent human bubble so the
                // count matches "【回答 N 件】" in the bubble above.
                const lastHuman = [...history]
                  .reverse()
                  .find((b) => b.kind === "human");
                const n = lastHuman?.questionCount ?? history.filter((b) => b.kind === "human").length;
                return `${n} 件の回答を受け取りました。AI が続きを考えています…`;
              })()}
            </span>
            <span className="sr-only">AI が続きを考えています</span>
          </div>
        )}

        {/* ── Review ready: the AI emitted a 「できあがりの確認」 after the QA. Stop the
            spinner and send the human to the review (S10 device_check fix). ─── */}
        {openReview && allOpenQuestions.length === 0 && (
          <div className="thread-review-ready" aria-live="polite">
            <span>AI が「できあがりの確認」を出しました。内容を確認して承認 / 差し戻しできます。</span>
            <Link to={`/questions/${openReview.id}`} className="btn btn--primary">
              できあがりを確認する
            </Link>
          </div>
        )}

        {/* ── Stall state ──────────────────────────────────── */}
        {isStalled && (
          <div className="thread-stall" role="alert">
            <div className="thread-stall__msg">
              <p className="thread-stall__title">再開に失敗しました(時間切れ)</p>
              <p className="thread-stall__body">
                {(() => {
                  // Use questionCount from the most recent human bubble so the
                  // stall count matches the human bubble's "【回答 N 件】".
                  const lastHuman = [...history]
                    .reverse()
                    .find((b) => b.kind === "human");
                  const n = lastHuman?.questionCount ?? 0;
                  return n > 0
                    ? `${n} 件の回答は保存済みです。失われていません。もう一度再開できます。`
                    : "AI の再開に失敗しました。回答は保存されています。";
                })()}
              </p>
            </div>
            <button
              type="button"
              className="btn btn--surface"
              onClick={() => void retryRun()}
              disabled={retrying || !activeRun}
            >
              {retrying ? <Spinner size={14} /> : null}
              再試行
            </button>
          </div>
        )}

        {/* ── Completed ────────────────────────────────────── */}
        {isDone && allOpenQuestions.length === 0 && (
          <div className="thread-done">
            <div className="thread-done__msg">
              <p className="thread-done__title">
                {isHearing
                  ? "設定ヒアリングが完了しました"
                  : "要件ヒアリングが完了しました"}
              </p>
              <p className="thread-done__body">
                {isHearing
                  ? "ステップ設定が確定しました。設定の確認・修正はステップ設定画面から行えます。"
                  : "成果物(要件一覧)ができあがり、Inbox に「◎ できあがりの確認」が立ちました。レビューで承認すると次フェーズへ進みます。"}
              </p>
            </div>
            {isHearing ? (
              <Link to={backTo ?? "/inbox"} className="btn btn--primary">
                設定を確認 →
              </Link>
            ) : (
              <Link to="/inbox" className="btn btn--primary">
                レビューを開く →
              </Link>
            )}
          </div>
        )}

        <div ref={threadEndRef} aria-hidden="true" />
      </div>

      {/* ── Batch submit footer ─────────────────────────────── */}
      {allOpenQuestions.length > 0 && (
        <div className="thread-submit-bar">
          {submitError ? (
            <p className="form-error thread-submit-bar__error" role="alert">
              {submitError} —{" "}
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => void submitBatch()}
              >
                再試行
              </button>
            </p>
          ) : null}
          <div className="thread-submit-bar__inner">
            <span className="thread-submit-bar__hint">
              {unansweredCount === 0
                ? `未回答 0 / ${allOpenQuestions.length} — 全問に答えました`
                : `未回答 ${unansweredCount} / ${allOpenQuestions.length}`}
            </span>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!canSubmit || submitting}
              onClick={() => void submitBatch()}
              aria-label={`まとめて送信して再開 (${allOpenQuestions.length} 件)`}
            >
              {submitting ? <Spinner size={14} /> : null}
              まとめて送信して再開
              <kbd className="thread-kbd">⌘⏎</kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AiBatchBubble ─────────────────────────────────────────────

interface AiBatchBubbleProps {
  readonly questions: readonly Question[];
  readonly answerMap: Record<string, PerQuestionState>;
  readonly isHistory: boolean;
  readonly isNewest?: boolean;
  readonly isHearing?: boolean;
  readonly onChangeChoice: (qId: string, choiceId: string) => void;
  readonly onChangeNote: (qId: string, note: string) => void;
  readonly onToggleBackground: (qId: string) => void;
}

function AiBatchBubble({
  questions,
  answerMap,
  isHistory,
  isNewest = false,
  isHearing = false,
  onChangeChoice,
  onChangeNote,
  onToggleBackground,
}: AiBatchBubbleProps) {
  const count = questions.length;
  return (
    <div
      className={`thread-bubble thread-bubble--ai${isNewest ? " thread-bubble--new" : ""}`}
    >
      <span className="sr-only">AI:</span>
      <div className="thread-bubble__who" aria-hidden="true">
        AI{isNewest ? <span style={{ color: "var(--color-running)" }}> · 新着</span> : null}
      </div>
      <div className="thread-bubble__box">
        <div className="thread-q-header">
          <span className="thread-q-tag" aria-hidden="true">
            {isHearing ? "【設定ヒアリング】" : "【質問】"}
          </span>
          <span className="thread-q-intro">
            {isHearing
              ? `このサイクルの全ステップの設定をまとめて伺います。${count} 件お答えください。`
              : `この回で確認したいことが ${count} 件あります。まとめてお答えください。`}
          </span>
          <span
            className="thread-q-count"
            aria-label={`${count} 件`}
            aria-hidden="true"
          >
            {count} 件
          </span>
        </div>

        {questions.map((q, idx) => (
          <QuestionItem
            key={q.id}
            question={q}
            index={idx + 1}
            state={answerMap[q.id] ?? emptyQState()}
            isReadOnly={isHistory}
            onChangeChoice={(choiceId) => onChangeChoice(q.id, choiceId)}
            onChangeNote={(note) => onChangeNote(q.id, note)}
            onToggleBackground={() => onToggleBackground(q.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── QuestionItem ──────────────────────────────────────────────

interface QuestionItemProps {
  readonly question: Question;
  readonly index: number;
  readonly state: PerQuestionState;
  readonly isReadOnly: boolean;
  readonly onChangeChoice: (choiceId: string) => void;
  readonly onChangeNote: (note: string) => void;
  readonly onToggleBackground: () => void;
}

function QuestionItem({
  question,
  index,
  state,
  isReadOnly,
  onChangeChoice,
  onChangeNote,
  onToggleBackground,
}: QuestionItemProps) {
  const textareaId = useId();
  const bgPanelId = useId();
  const options = getOptions(question);
  const prompt = promptText(question);

  return (
    <div className="thread-q-item">
      <div className="thread-q-item__head">
        <span className="thread-q-tag" aria-hidden="true">
          {index}.
        </span>
        <span className="thread-q-text">
          <span className="sr-only">質問{index}</span>
          {prompt}
        </span>
      </div>

      {/* Background collapsible (slot for future background field) */}
      <div className="thread-q-bg">
        <button
          type="button"
          className="thread-q-bg__toggle"
          aria-expanded={state.backgroundOpen}
          aria-controls={bgPanelId}
          onClick={onToggleBackground}
          disabled={isReadOnly}
        >
          <span aria-hidden="true">{state.backgroundOpen ? "▾" : "▸"}</span>
          <span>【背景】 展開して全文を読む</span>
        </button>
        {state.backgroundOpen ? (
          <div id={bgPanelId} className="thread-q-bg__panel">
            <p className="thread-q-bg__empty">背景情報はありません。</p>
          </div>
        ) : null}
      </div>

      {/* Options + free input (always shown per D-05) */}
      {isReadOnly ? null : (
        <div className="thread-q-field">
          {options.length > 0 ? (
            <div
              role="radiogroup"
              aria-label={`質問${index}の選択肢`}
              className="thread-q-options"
            >
              {options.map((opt) => (
                <OptionCard
                  key={opt.id}
                  option={opt}
                  checked={state.choiceId === opt.id}
                  onSelect={() => onChangeChoice(opt.id)}
                />
              ))}
            </div>
          ) : null}

          <div className="thread-q-free">
            <label className="thread-q-free__label" htmlFor={textareaId}>
              自由入力 / 補足(任意)
            </label>
            <textarea
              id={textareaId}
              className="textarea thread-q-free__input"
              value={state.note}
              onChange={(e) => onChangeNote(e.target.value)}
              placeholder={
                options.length > 0
                  ? "選択肢に無ければ自由に。補足もここへ。"
                  : "ここに回答を入力してください。"
              }
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── OptionCard ────────────────────────────────────────────────

interface OptionCardProps {
  readonly option: QuestionOption;
  readonly checked: boolean;
  readonly onSelect: () => void;
}

function OptionCard({ option, checked, onSelect }: OptionCardProps) {
  return (
    <label className={`thread-opt${checked ? " thread-opt--on" : ""}`}>
      <input
        type="radio"
        name={`opt-group-${option.id}`}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span className="thread-opt__radio" aria-hidden="true" />
      <span className="thread-opt__body">
        <span className="thread-opt__label">
          {option.label}
          {option.recommended ? (
            <span className="thread-opt__rec" aria-label="おすすめ">
              ★ おすすめ
            </span>
          ) : null}
        </span>
        {option.hint ? (
          <span className="thread-opt__desc">{option.hint}</span>
        ) : null}
        {option.recommended && option.hint ? (
          <span className="thread-opt__rec-reason">
            <span className="thread-opt__rec-k">おすすめ理由:</span> {option.hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}

// ── HumanBubble ───────────────────────────────────────────────

interface HumanBubbleProps {
  readonly answers: readonly AidlcAnswer[];
  /** Human-readable label text per answer (index-aligned with answers[]).
   *  Resolved at submit time so raw option ids never appear. */
  readonly choiceLabels: readonly string[];
  readonly questionCount: number;
}

function HumanBubble({ answers, choiceLabels, questionCount }: HumanBubbleProps) {
  return (
    <div className="thread-bubble thread-bubble--human">
      <span className="sr-only">あなた:</span>
      <div className="thread-bubble__who" aria-hidden="true">
        あなた
      </div>
      <div className="thread-bubble__box">
        <p
          className="thread-human__tag"
          style={{ color: "var(--color-violet)" }}
          aria-label={`回答 ${questionCount} 件`}
        >
          【回答 {questionCount} 件】
        </p>
        {answers.map((ans, i) => {
          // Use the pre-resolved human-readable label; fall back to note or ids
          // only if the label is somehow empty (defensive guard).
          const label =
            choiceLabels[i] ||
            ans.note ||
            (ans.choiceIds.length > 0 ? ans.choiceIds.join("、") : "—");
          return (
            <p key={ans.questionId} className="thread-human__line">
              <span className="thread-human__n">{i + 1}.</span> {label}
            </p>
          );
        })}
      </div>
    </div>
  );
}

// ── Convenience page wrapper ──────────────────────────────────
// Route: /cycles/:cycleId/thread[?hearing=1]
// ?hearing=1 activates "設定ヒアリング" mode (SCR-02 hearing state / US-06).
// StepConfigReadback navigates here with ?hearing=1 when "会話で直す" is clicked.

export function ConversationThreadPage() {
  const { cycleId = "" } = useParams();
  const search = new URLSearchParams(window.location.search);
  const isHearing = search.get("hearing") === "1";

  const cycleQ = useAsync(() => api.getCycle(cycleId), [cycleId]);
  const cycle = cycleQ.data;
  const activePhase = cycle?.phases.find(
    (p) => p.state === "running" || p.state === "review",
  );
  // Fall back to the most-recently-ordered done/review phase so stepName stays
  // populated even after the phase completes (breadcrumb fix).
  const resolvedPagePhase =
    activePhase ??
    cycle?.phases
      .slice()
      .sort((a, b) => b.order - a.order)
      .find((p) => p.state === "done" || p.state === "review") ??
    cycle?.phases.at(-1);

  const stepName = resolvedPagePhase?.step;
  const backLabel = isHearing ? "設定" : (cycle?.version ?? "サイクル");
  const backTo = isHearing ? `/cycles/${cycleId}/settings` : `/cycles/${cycleId}`;

  return (
    <ConversationThread
      cycleId={cycleId}
      {...(stepName !== undefined ? { stepName } : {})}
      isHearing={isHearing}
      backTo={backTo}
      backLabel={backLabel}
    />
  );
}

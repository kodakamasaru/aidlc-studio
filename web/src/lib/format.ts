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

// Domain/service error codes → human-facing Japanese. A blocked or failed action
// must read as a clear reason, never a raw code like "PrevPhaseNotDone".
const ERROR_MESSAGES: Record<string, string> = {
  NetworkError: "サーバに接続できませんでした",
  MalformedResponse: "サーバの応答が不正でした",
  // cycle / phase / run lifecycle
  PrevPhaseNotDone:
    "前の Phase がまだ完了していません(Inbox でレビューを承認すると次へ進めます)",
  PhaseAlreadyRunning: "この Phase はすでに実行中です",
  PhaseNotInReview: "この Phase はレビュー状態ではありません",
  TaskReviewsPending: "未承認のレビューが残っています",
  CyclePaused: "サイクルが一時停止中です。再開してから操作してください",
  AlreadyInState: "すでにその状態です",
  PhasesNotAllDone: "全 Phase が完了していません",
  StepNotInPipeline: "そのステップはこのパイプラインに含まれていません",
  IllegalTransition: "その状態遷移はできません",
  // retry
  RunNotFailedOrStalled: "この Run は失敗/停止していないため retry できません",
  RunNotResumable: "この Run は再開できない状態です",
  MaxAttemptExceeded: "リトライ上限に達しました",
  // create
  EmptyTitle: "タイトルを入力してください",
  EmptyPipeline: "パイプラインが空です",
  InvalidVersion: "バージョン形式が不正です(例: v0.0.1)",
  DuplicateVersion: "このバージョンはすでに存在します",
  InvalidRepoPath: "リポジトリパスが不正です(絶対パスかつ実在するディレクトリ)",
  // answer / review
  QuestionClosed: "この質問はすでに回答済みです",
  InvalidVerdict: "この操作はこの質問では選べません",
  EmptyReason: "理由を入力してください",
  MissingBacktrackTarget: "差し戻し先のステップを選んでください",
  // orchestrator / infra
  OrchestratorLaunchFailed: "AI 実行の起動に失敗しました",
  OrchestratorRetryFailed: "AI 実行のリトライに失敗しました",
  OrchestratorDispatchFailed: "AI への指示送信に失敗しました(retry できます)",
  CorruptData: "保存データの読み込みに失敗しました",
  internal: "サーバ内部エラーが発生しました",
};

/** Turn an unknown thrown value into a human-facing message. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (ERROR_MESSAGES[err.code]) return ERROR_MESSAGES[err.code] as string;
    if (err.code.endsWith("NotFound")) return "対象が見つかりませんでした";
    return `エラー: ${err.code}`;
  }
  if (err instanceof Error) return err.message;
  return "予期しないエラーが発生しました";
}

// visual-eval — S8 視覚モック忠実度の独立 evaluator(純粋ロジック)。
//
// 問題: 従来の S8 手順5 は「ビルダー AI が自分の画面を自分で採点」する自己申告で、偽の
// 「26/26 一致」が通る。ここを ビルダーとは別 run の vision モデルで突合させ、機械生成の
// 突合表 + 確定ゲートにする(IO/spawn は scripts/s8-visual-eval.ts、ここは純粋ロジックのみ)。
//
// 不変条件:
//   • 突合チェックリストは「モック PNG 全状態(= S3 視覚契約)」起点。実機側にペアが無い
//     状態は `未実装`(空欄にしない / S8 SKILL 手順5 の構造的盲点対策)。
//   • evaluator 出力が parse 不能なら fail-closed = `乖離`(沈黙の一致を作らない / 原則④)。
//   • 1 状態でも `一致` 以外があれば確定ゲートは不成立。

/** モック contract の 1 data-state に対する判定。 */
export type Verdict = "一致" | "乖離" | "未実装";

/** 乖離の観点(S8 SKILL 手順5 の 4 軸)。 */
export type DeviationAxis = "構成要素" | "情報粒度" | "日本語水準" | "状態再現";

export interface Deviation {
  readonly axis: DeviationAxis;
  readonly detail: string;
  readonly severity: "high" | "med" | "low";
}

/** 1 状態の突合結果。state = `scr-NN-{slug}.{state}`(拡張子なし)。 */
export interface StateVerdict {
  readonly state: string;
  readonly mockFile: string;
  readonly realFile: string | null;
  readonly verdict: Verdict;
  readonly deviations: readonly Deviation[];
}

/** ペアリング結果(評価の入力)。realFile が null = 実機側にペアが無い = 未実装確定。 */
export interface ScreenshotPair {
  readonly state: string;
  readonly mockFile: string;
  readonly realFile: string | null;
}

const DEVIATION_AXES: readonly DeviationAxis[] = [
  "構成要素",
  "情報粒度",
  "日本語水準",
  "状態再現",
];

/** モック PNG 名 `{state}.png` → state キー。tokens は契約外。 */
export const stateOfMock = (filename: string): string => filename.replace(/\.png$/, "");

/** 実機 PNG 名 `{state}.real.png` → state キー。 */
export const stateOfReal = (filename: string): string => filename.replace(/\.real\.png$/, "");

/**
 * モック契約の全状態を起点にペアを作る(実装 screenshot 起点は禁止 = 未実装が消えるため)。
 * mock 側は `tokens.png` を除外。real 側にペアが無ければ realFile=null(= 未実装)。
 */
export function pairScreenshots(
  mockFiles: readonly string[],
  realFiles: readonly string[],
): ScreenshotPair[] {
  const reals = new Set(realFiles.filter((f) => f.endsWith(".real.png")));
  return mockFiles
    .filter((f) => f.endsWith(".png") && f !== "tokens.png")
    .map((mockFile) => {
      const state = stateOfMock(mockFile);
      const realFile = `${state}.real.png`;
      return {
        state,
        mockFile,
        realFile: reals.has(realFile) ? realFile : null,
      };
    });
}

/** ペアが無い状態は vision 呼び出し不要で `未実装` 確定。 */
export const unimplementedVerdict = (pair: ScreenshotPair): StateVerdict => ({
  state: pair.state,
  mockFile: pair.mockFile,
  realFile: null,
  verdict: "未実装",
  deviations: [
    {
      axis: "状態再現",
      detail: "実機側に対応するルート/レンダリングが無い(実機 screenshot が生成されない)",
      severity: "high",
    },
  ],
});

/**
 * evaluator(vision)へ渡す adversarial プロンプト。既定は `乖離`、`一致` と言い切れる時だけ
 * `一致`。両 PNG を Read で読ませ、4 軸で具体的な乖離を列挙させ、JSON フェンス 1 つを出させる。
 */
export function buildEvalPrompt(
  mockAbsPath: string,
  realAbsPath: string,
  specText?: string,
): string {
  return [
    "あなたは AI-DLC S8 の視覚モック忠実度 evaluator です。生成者(ビルダー)とは別の独立した",
    "評価者として、実装画面が S3 視覚契約(モック)を満たすかを厳格に判定します。",
    "",
    "── 入力(Read ツールで両方を必ず開いて見比べよ) ──",
    `- モック(契約): ${mockAbsPath}`,
    `- 実機(実装結果): ${realAbsPath}`,
    ...(specText !== undefined && specText.trim().length > 0
      ? ["", "── コンポーネント仕様(参考) ──", specText.trim()]
      : []),
    "",
    "── 判定方針(adversarial / 厳格) ──",
    "既定は `乖離`。実機がモックを満たすと**言い切れる時だけ** `一致`。迷ったら `乖離`。",
    "次の 4 軸で具体的な差分を挙げよ:",
    "- 構成要素: 要素の欠落・余剰・配置崩れ",
    "- 情報粒度: 表示情報の過不足(質素化・省略を含む)",
    "- 日本語水準: 開発者文字列(例 `ReviewBlock[]` / `scripted result` / 内部 ID / 型名)の露出",
    "- 状態再現: その data-state(空 / loading / error 等)が再現できているか",
    "",
    "── 出力(必須・末尾に JSON フェンス 1 つだけ) ──",
    "```json",
    '{"verdict":"一致|乖離のどちらか","deviations":[{"axis":"構成要素|情報粒度|日本語水準|状態再現","detail":"具体的な差分","severity":"high|med|low"}]}',
    "```",
    "verdict が `一致` なら deviations は空配列 []。`乖離` なら 1 つ以上挙げよ。",
  ].join("\n");
}

const isAxis = (v: unknown): v is DeviationAxis =>
  typeof v === "string" && (DEVIATION_AXES as readonly string[]).includes(v);

const normalizeDeviation = (raw: unknown): Deviation | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isAxis(r.axis)) return null;
  const detail = typeof r.detail === "string" ? r.detail : "";
  const severity =
    r.severity === "high" || r.severity === "med" || r.severity === "low" ? r.severity : "med";
  return { axis: r.axis, detail, severity };
};

/**
 * evaluator 出力テキストから最後の ```json フェンス(無ければ最後の {...})を取り出して判定を
 * 復元する。parse 不能・verdict 不正は fail-closed = `乖離`(沈黙の `一致` を作らない / 原則④)。
 */
export function extractVerdict(pair: ScreenshotPair, agentOutput: string): StateVerdict {
  const failClosed = (detail: string): StateVerdict => ({
    state: pair.state,
    mockFile: pair.mockFile,
    realFile: pair.realFile,
    verdict: "乖離",
    deviations: [{ axis: "状態再現", detail, severity: "high" }],
  });

  const json = lastJsonObject(agentOutput);
  if (json === null)
    return failClosed(`evaluator 出力に JSON が無い(fail-closed): ${snippet(agentOutput)}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return failClosed(`evaluator 出力の JSON が不正(fail-closed): ${snippet(json)}`);
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.verdict !== "一致" && obj.verdict !== "乖離") {
    return failClosed(`verdict が不正値(fail-closed): ${String(obj.verdict)}`);
  }
  const deviations = Array.isArray(obj.deviations)
    ? obj.deviations.map(normalizeDeviation).filter((d): d is Deviation => d !== null)
    : [];

  // adversarial 不変条件: 乖離なのに具体が空なら、評価器の手抜きを 1 件で具体化する。
  const safeDeviations =
    obj.verdict === "乖離" && deviations.length === 0
      ? [
          {
            axis: "構成要素" as const,
            detail: "乖離と判定したが具体未記載",
            severity: "med" as const,
          },
        ]
      : deviations;

  return {
    state: pair.state,
    mockFile: pair.mockFile,
    realFile: pair.realFile,
    verdict: obj.verdict,
    deviations: safeDeviations,
  };
}

/** 末尾の ```json フェンス、無ければ最後の { から最後の } までを返す。 */
function lastJsonObject(text: string): string | null {
  const fence = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (fence.length > 0) return fence[fence.length - 1]![1]!.trim();
  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return null;
}

const snippet = (s: string): string => s.replace(/\s+/g, " ").trim().slice(0, 120);

export interface GateDecision {
  readonly ok: boolean;
  readonly total: number;
  readonly matched: number;
  readonly blocking: readonly StateVerdict[];
}

/** 1 状態でも `一致` 以外があればゲート不成立。blocking に乖離/未実装を集める。 */
export function decideGate(verdicts: readonly StateVerdict[]): GateDecision {
  const blocking = verdicts.filter((v) => v.verdict !== "一致");
  return {
    ok: blocking.length === 0 && verdicts.length > 0,
    total: verdicts.length,
    matched: verdicts.length - blocking.length,
    blocking,
  };
}

/** S8 進行ログ `## mock 突合レビュー` に貼れる Markdown 表を生成する。 */
export function renderVerdictTable(verdicts: readonly StateVerdict[]): string {
  const head = "| S3 状態 | 判定 | 乖離(軸: 内容) |\n|---|---|---|";
  const rows = verdicts.map((v) => {
    const dev =
      v.deviations.length === 0
        ? "—"
        : v.deviations.map((d) => `${d.axis}: ${d.detail}`).join(" / ");
    return `| ${v.state} | ${v.verdict} | ${dev} |`;
  });
  return [head, ...rows].join("\n");
}

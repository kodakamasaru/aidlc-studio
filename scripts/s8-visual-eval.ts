// s8-visual-eval — S8 視覚モック忠実度の独立 evaluator(IO ハーネス)。
//
// 何をするか: S3 視覚契約のモック PNG(aidlc-docs/{version}/s3/screenshots/*.png)と、
// s8-mock-capture が撮った実機 PNG(.../s8/screenshots/*.real.png)を状態ごとにペアにし、
// ビルダーとは別 run の vision モデル(claude headless)で 1 状態ずつ厳格判定する。
// 結果を機械生成の突合表にして書き出し、1 状態でも `一致` 以外があれば exit 1(= S8 確定ゲート)。
//
// なぜ: 従来は「ビルダー AI が自分の画面を自分で採点」する自己申告で偽の一致が通り、人間が
// pixel-diff 機械をやらされていた。独立 evaluator が突合を握り、人間は最後に OK を出すだけにする。
//
// 使い方:
//   bun run scripts/s8-visual-eval.ts [version]      # 既定 version=v0.0.4
//   AIDLC_EVAL_MODEL=sonnet AIDLC_CLAUDE_BIN=claude bun run scripts/s8-visual-eval.ts v0.0.4
//
// 純粋ロジック(ペアリング / fail-closed 復元 / ゲート判定 / 表描画)は
// src/app/services/visual-eval.ts(テスト済み)。ここは spawn と file IO だけ。
import { readdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  pairScreenshots,
  unimplementedVerdict,
  buildEvalPrompt,
  extractVerdict,
  decideGate,
  renderVerdictTable,
  type ScreenshotPair,
  type StateVerdict,
} from "../src/app/services/visual-eval";

const REPO_ROOT = resolve(import.meta.dir, "..");
const VERSION = process.argv[2] ?? "v0.0.4";
const CLAUDE_BIN = process.env.AIDLC_CLAUDE_BIN ?? "claude";
const MODEL = process.env.AIDLC_EVAL_MODEL ?? "sonnet";
const CONCURRENCY = 3;

const S3_SHOTS = join(REPO_ROOT, "aidlc-docs", VERSION, "s3", "screenshots");
const S8_SHOTS = join(REPO_ROOT, "aidlc-docs", VERSION, "s8", "screenshots");
const S3_DIR = join(REPO_ROOT, "aidlc-docs", VERSION, "s3");
const OUT_JSON = join(REPO_ROOT, "aidlc-docs", VERSION, "s8", "visual-eval.json");

// claude headless 分離(live.ts と同じ doctrine): target の CLAUDE.md / hooks / memory を
// 落とし、与えたプロンプトだけを唯一の指示にする。Read だけ明示許可(画像を開くため)。
const ISOLATION_ARGS = [
  "--setting-sources",
  "project",
  "--settings",
  JSON.stringify({ permissions: { allow: ["Read"] } }),
];

function listPngs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".png"));
}

/** scr-01-inbox.default → 仕様 md パス(aidlc-docs/{version}/s3/scr-01-inbox.md)。 */
function specTextFor(state: string): string | undefined {
  const base = state.replace(/\.[^.]*$/, ""); // 末尾の .{data-state} を落とす
  const p = join(S3_DIR, `${base}.md`);
  return existsSync(p) ? readFileSync(p, "utf8") : undefined;
}

/** 1 ペアを vision evaluator にかける(別 run = 自己採点の禁止)。 */
async function evaluatePair(pair: ScreenshotPair): Promise<StateVerdict> {
  if (pair.realFile === null) return unimplementedVerdict(pair);

  const mockAbs = join(S3_SHOTS, pair.mockFile);
  const realAbs = join(S8_SHOTS, pair.realFile);
  const prompt = buildEvalPrompt(mockAbs, realAbs, specTextFor(pair.state));

  const child = Bun.spawn(
    [CLAUDE_BIN, "-p", prompt, "--output-format", "json", ...ISOLATION_ARGS, "--model", MODEL],
    { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode !== 0) {
    return extractVerdict(pair, `evaluator spawn 失敗(exit ${exitCode}): ${stderr.slice(0, 200)}`);
  }
  // `--output-format json` は {type:"result", result:"<最終テキスト>"} を返す。
  let resultText = stdout;
  try {
    const parsed = JSON.parse(stdout) as { result?: unknown };
    if (typeof parsed.result === "string") resultText = parsed.result;
  } catch {
    /* stdout をそのまま使う(extractVerdict が fail-closed で処理) */
  }
  return extractVerdict(pair, resultText);
}

/** 同時実行を CONCURRENCY に制限して全ペアを評価する。 */
async function evaluateAll(pairs: ScreenshotPair[]): Promise<StateVerdict[]> {
  const out: StateVerdict[] = [];
  for (let i = 0; i < pairs.length; i += CONCURRENCY) {
    const batch = pairs.slice(i, i + CONCURRENCY);
    const verdicts = await Promise.all(batch.map(evaluatePair));
    for (const v of verdicts) {
      out.push(v);
      const tag = v.verdict === "一致" ? "✓" : v.verdict === "未実装" ? "∅" : "✗";
      console.log(`  ${tag} ${v.state} → ${v.verdict}`);
    }
  }
  return out;
}

async function main(): Promise<void> {
  if (!existsSync(S3_SHOTS)) {
    console.error(`[s8-visual-eval] モック契約が見つかりません: ${S3_SHOTS}`);
    console.error("  先に S3 の screenshots を生成してください(bun run s3:capture 等)。");
    process.exit(2);
  }
  const pairs = pairScreenshots(listPngs(S3_SHOTS), listPngs(S8_SHOTS));
  if (pairs.length === 0) {
    console.error(`[s8-visual-eval] モック PNG が 0 件(tokens 除く): ${S3_SHOTS}`);
    process.exit(2);
  }

  console.log(`[s8-visual-eval] ${VERSION}: ${pairs.length} 状態を評価(model=${MODEL})…`);
  const verdicts = await evaluateAll(pairs);
  const gate = decideGate(verdicts);

  writeFileSync(OUT_JSON, JSON.stringify({ version: VERSION, gate, verdicts }, null, 2), "utf8");

  console.log(`\n${renderVerdictTable(verdicts)}\n`);
  console.log(`突合表 → ${OUT_JSON}`);
  console.log(
    `ゲート: ${gate.matched}/${gate.total} 一致` +
      (gate.ok
        ? " — ✅ 成立(人間レビューへ)"
        : ` — ❌ 不成立(乖離/未実装 ${gate.blocking.length} 件)`),
  );

  if (!gate.ok) {
    console.error("\nS8 を確定できません。乖離/未実装を修正 → 再キャプチャ → 再評価で潰してください:");
    for (const b of gate.blocking) {
      const why = b.deviations.map((d) => `${d.axis}: ${d.detail}`).join(" / ") || "(詳細なし)";
      console.error(`  - ${b.state} [${b.verdict}] ${why}`);
    }
    process.exit(1);
  }
}

await main();

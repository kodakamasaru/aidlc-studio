// live-pass-attach — 既に進行中の S9 live run(live-pass-setup + 手動 start 済)に
// API で「アタッチ」し、質問に答え・レビューを承認し、PASS 経路の成立を機械検証する。
// run は再起動しない(サーバ側で進行中の run をそのまま使う)。実 claude は遅いので
// 長時間(既定 30 分)辛抱強くポーリングする(時間を理由に諦めない)。
//
// 検証: ① _evidence/S9/manifest.json が live で自動生成 ② S9 phase = done。
import { existsSync } from "node:fs";

const BASE = process.env.AIDLC_LIVE_BASE ?? "http://127.0.0.1:8787";
const CYCLE = process.env.AIDLC_LIVE_CYCLE;
const STEP = process.env.AIDLC_LIVE_STEP ?? "S9";
// 任意: 設定時のみ「done 成立に証拠 manifest 存在」を必須にする(US-01 PASS 用)。
const EVIDENCE = process.env.AIDLC_EVIDENCE ?? "";
const TOTAL_MS = Number(process.env.AIDLC_ATTACH_TIMEOUT_MS ?? 1_800_000); // 30 分
const POLL_MS = 8000;
if (!CYCLE) { console.error("AIDLC_LIVE_CYCLE 未指定"); process.exit(2); }

const ANSWER = "最小スコープでよい。主要シナリオ(チャンネル作成・投稿・未読・メンション・検索)を一通り検証。";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const env = (await res.json()) as { success: boolean; data?: T; error?: string };
  if (!env.success) throw new Error(`API ${path} failed: ${env.error}`);
  return env.data as T;
}

interface Phase { step: string; state: string; runs?: { id: string; state: string }[] }
interface Question { id: string; kind: string; state: string; payload: { kind: string; options?: { id: string }[] } }

const deadline = Date.now() + TOTAL_MS;
const MAX_RETRY = 3; // completeness gate の auto-rework を収束させる上限
let retries = 0;
let lastRetriedRun = "";
let approved = false;
let lastLog = "";

while (Date.now() < deadline) {
  // 1) inbox の open カードを処理
  const inbox = await api<Question[]>(`/cycles/${CYCLE}/inbox`).catch(() => [] as Question[]);
  const open = inbox.filter((q) => q.state === "open");
  for (const q of open) {
    if (q.kind === "visual_review") {
      await api(`/questions/${q.id}/answer`, { method: "POST", body: JSON.stringify({ verdict: "approve" }) });
      approved = true;
      console.log(`[attach] ✅ レビュー承認 (q=${q.id})`);
    } else if (q.kind === "question") {
      const body = q.payload.options?.length ? q.payload.options[0]!.id : ANSWER;
      await api(`/questions/${q.id}/answer`, { method: "POST", body: JSON.stringify({ verdict: "answer", body }) });
      console.log(`[attach] 💬 質問に回答 (q=${q.id}) body=${body.slice(0, 40)}`);
    } else {
      console.log(`[attach] ⚠ 未対応カード kind=${q.kind} (q=${q.id}) — 放置`);
    }
  }

  // 2) 状態チェック
  const cycle = await api<{ phases: Phase[] }>(`/cycles/${CYCLE}`).catch(() => null);
  const s9 = cycle?.phases.find((p) => p.step === STEP);
  const manifest = EVIDENCE !== "" && existsSync(EVIDENCE);
  const status = `${STEP}=${s9?.state ?? "?"} run=${s9?.runs?.at(-1)?.state ?? "?"} evidence=${manifest} approved=${approved} open=${open.length}`;
  if (status !== lastLog) { console.log(`[attach] ${status}`); lastLog = status; }

  if (s9?.state === "done") {
    const ok = EVIDENCE === "" || manifest;
    console.log(`\n===== ${STEP} live 検証結果 =====`);
    if (EVIDENCE !== "") console.log(`① 証拠 manifest 自動生成(live): ${manifest ? "あり" : "なし"}`);
    console.log(`② ${STEP} phase: done(ゲートが done を許可)`);
    console.log(`\n${ok ? "✅ 成立" : "❌ 未成立(証拠不足)"}`);
    process.exit(ok ? 0 : 1);
  }

  // completeness gate の auto-rework: run が stalled になったら generator を retry して
  // 収束を試みる(上限 MAX_RETRY)。同一 run を二重 retry しないようガード。
  const lastRun = s9?.runs?.at(-1);
  if (lastRun?.state === "stalled" && open.length === 0) {
    if (retries < MAX_RETRY && lastRun.id !== lastRetriedRun) {
      retries += 1;
      lastRetriedRun = lastRun.id;
      try {
        await api(`/cycles/${CYCLE}/runs/${lastRun.id}/retry`, { method: "POST" });
        console.log(`[attach] 🔁 stalled run を retry (${retries}/${MAX_RETRY}) run=${lastRun.id}`);
      } catch (e) {
        console.log(`[attach] retry 失敗: ${String(e).slice(0, 100)}`);
      }
    } else if (retries >= MAX_RETRY) {
      console.log(`\n⚠ ${MAX_RETRY} 回 retry しても done に届かず(completeness gate = §J の壁)。最終: ${lastLog}`);
      process.exit(1);
    }
  }

  await new Promise((r) => setTimeout(r, POLL_MS));
}

console.log(`\n⏱ タイムアウト(${TOTAL_MS / 60000}分)。最終状態: ${lastLog}`);
console.log(`evidence=${existsSync(EVIDENCE)}`);
process.exit(1);

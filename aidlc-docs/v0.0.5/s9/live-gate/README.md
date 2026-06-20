# US-01 live gate dossier — 証拠ゲートが実 claude の done を実際に止める(実操作・録画)

> ⚠ この dossier は、ユーザー指摘「実操作=実 claude」+「全 US にエビデンス」を受け、
> US-01(live 証拠ハードゲート)が **実 claude の自己申告 done を実際に拒否する**ことを
> 実サイト操作 + 録画で証拠化したもの。setup-gate-demo.ts で S1=requiresLiveEvidence の
> デモ project を作り、live backend(`AIDLC_ORCHESTRATOR=live` / 実 claude 2.1.168)上で
> live-gate-demo.ts が実操作した。

## ★ 実操作で判明した重大欠陥(live testing が暴いた)と是正
当初 US-01 のゲートは **evaluator allow-done(gen→eval)1 点のみ**に配線していたが、
- 既定 pipeline はどの step も verification 契約を持たず **gen→eval が一度も発火しない**
- 既定 step は role-less で、done は ① claude status:"done"(RunStateChanged→done)② role-less
  ResultEmitted→visual_review の **別経路**を通る

ため、**ゲートは実運用で一度も発火していなかった**(= US-01 は inert だった)。
是正: `contracts.requiresLiveEvidence`(S7/S8/S9=true)を導入し、**3 つの done 提示経路すべて**
(RunStateChanged→done / role-less ResultEmitted→review / eval allow-done)を共有チェック
`evidence-gate-check.ts` でゲート。決定論 747 テストで block→pass を担保。詳細は s11 P-S9-02。

## BLOCK — 実 claude の done をゲートが拒否(★ live 実証)
- 操作: アプリを開く → サイクル「ゲート確認(証拠なし)」作成 → S1 開始(実 claude 起動)。
- 実 run: runId `3822f2d6-8c52-4983-87e0-e1ca19557cf8` / claude durationMs≈166s / exit 0。
- 結果: claude が S1 成果物を出して done を自己申告 → **evidence gate が manifest 不在を検出 → done 拒否 → 要件=行き詰まり(stalled)**。
  - `02-block-stalled.png`: UI に「要件 行き詰まり」+ 停止理由 **「live 証拠が不足のため done を拒否しました(不足: manifest)。当該 step の live 縦経路ログ + 視覚/動作証拠(screenshot/動画/test-report)を生成してから再試行してください。」** + 「やり直す」。
  - `01-block-s1-started.png`: S1 開始直後(進行中)。
- = AI の自己申告 done を、証拠不在で機械的に拒否できることの **live 実証**。

## PASS — 証拠ありでゲート通過(決定論で担保 / live は claude が hearing に入り未完)
- 操作: サイクル「ゲート確認(証拠あり)」作成 → S1 開始直後に manifest 生成(capturedAt > runStartedAt)。
  - `03-pass-s1-started.png` / `04-pass-after-evidence.png`。
- 本 run では claude が成果物でなく**質問(aidlc-question)を 2 件 emit**(hearing 入り)したため、本 run 単体ではゲート通過(review 起票)まで到達せず(実 AI の非決定的挙動)。
- **PASS(証拠ありで done/review 許可)は決定論テストで担保**:
  `evidence-gate.test.ts` の role-less done/review 両経路 + gen→eval 経路で「valid manifest → 許可」を検証済(747 pass)。

## 動画
- `page@*.webm` — 実操作の録画(最新ファイルが本 run)。

## 機械ゲート(Rule C-2)
`bun run live:check v0.0.5` が本 dossier(動画 + 連番 screenshot + README)を検査して S9/CLOSE をブロック。

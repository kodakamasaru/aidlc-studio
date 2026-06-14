# S8 Capture Notes — v0.0.4 mock 突合

自動生成: `scripts/s8-mock-capture.ts`
生成日時: 2026-06-13T18:34:27.089Z
結果: 撮影 26 / 26 (reachable)、UNREACHABLE 0、合計 26 states

## 突合表

| state | シード方法 | 再現可否 | 描画メモ |
|-------|-----------|----------|----------|
| scr-01-inbox.default | running run + 1 question card + 1 visual_review card | yes | 正常描画 |
| scr-01-inbox.empty | no open questions — empty inbox | yes | 正常描画 |
| scr-01-inbox.loading | route-delay /api/projects/* so loading skeleton renders | yes | 正常描画 |
| scr-02-conversation-thread.default | running run + 3 open question cards (batch) — scroll to TOP so opening AI bubble visible | yes | 正常描画 |
| scr-02-conversation-thread.empty | running run + 0 open questions → empty/starting state | yes | 正常描画 |
| scr-02-conversation-thread.hearing | ?hearing=1 + 2 open question cards — scroll to TOP so opening AI bubble visible | yes | 正常描画 |
| scr-02-conversation-thread.running | [A] Drive in-session flow: navigate, answer questions, submit → running indicator shows with answer history | yes | 正常描画 |
| scr-02-conversation-thread.appended | [B] 2 fresh open questions (second turn batch) — scroll to TOP so batch header visible | yes | 正常描画 |
| scr-02-conversation-thread.completed | [A] Drive in-session: answer 3 questions (creates human bubble with labels), then /api/test/complete-cycle to set cycle.state=done, wait for poll to show completion banner above the persisted human bubble | yes | 正常描画 |
| scr-02-conversation-thread.stall | [A] Drive in-session flow: answer questions (create history), then force-stall the run via test endpoint | yes | 正常描画 |
| scr-03-review-detail.default | visual_review with summary(md body) + ac-map(受け入れ条件 ✓ list) + 2 screenshot grid + risk | yes | 正常描画 |
| scr-03-review-detail.enlarged | [C] 8 screenshot gallery using gate.png, click third thumbnail (index 2) to open lightbox at 3/8 — wait for lightbox img load, screenshot viewport only (fixed overlay) | yes | 正常描画 |
| scr-03-review-detail.gallery | 8 screenshot blocks in one review (gallery 4×2 grid) + ac-map(受け入れ条件 ✓) | yes | 正常描画 |
| scr-03-review-detail.loading | [D] route-delay /api/questions/ so loading skeleton renders | yes | 正常描画 |
| scr-03-review-detail.missing-context | review whose summary/body prepend ⚠ missing-context marker | yes | 正常描画 |
| scr-04-step-config-readback.default | [E] /cycles/:id/settings — MIXED badges: some steps have contracts (このサイクルで調整), some inherit (既定) | yes | 正常描画 |
| scr-04-step-config-readback.global | [F] /settings/steps — global defaults view with CONCRETE contract values on ALL steps | yes | 正常描画 |
| scr-04-step-config-readback.loading | route-delay /api/projects/* so skeleton renders | yes | 正常描画 |
| scr-04-step-config-readback.pre-us | /cycles/:id/settings?usDecided=false — pre-US lock state (CycleStepConfigPage reads ?usDecided=false query param) | yes | 正常描画 |
| scr-05-cycle-progress.default | S1 done, S2 running (Discovery完了 / Design進行中) | yes | 正常描画 |
| scr-05-cycle-progress.variable | pipeline omitting S4(技術仕様) and S9(検証) — variable step count | yes | 正常描画 |
| scr-05-cycle-progress.stall | S1 run advanced to stalled | yes | 正常描画 |
| scr-05-cycle-progress.backtrack | [G-seed] S2 done with backtrack history (runs.length > 1 && phase.state=done) + S3 currently running — ↩ glyph on S2 in Discovery band | yes | 正常描画 |
| scr-06-step-spec.default | /settings/steps/S1 — S1 with contracts + skill ref aidlc-s1-requirements | yes | 正常描画 |
| scr-06-step-spec.loading | [D] route-delay /api/projects/* so loading skeleton renders — header must show | yes | 正常描画 |
| scr-06-step-spec.no-instruction | [H] Use S13(追加検証) — a non-canonical step id that matches STEP_RE but has no kit/skills/aidlc-s13-* dir, so skill content is empty → no-instruction state renders | yes | 正常描画 |

## UNREACHABLE 詳細

なし

## Console エラー詳細

なし

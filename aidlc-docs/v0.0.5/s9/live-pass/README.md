# US-01 PASS 経路 — 実 claude live 実証 dossier(2026-06-21)

「証拠あり → ゲートが done を**許可**する」(PASS 経路)を実 claude で端まで通した記録。
BLOCK 経路(証拠なし→拒否)は `../live-gate/` で実証済。本 dossier はその逆方向。

## 何を証明したか
seed(US-04)で S1–S8 を done にし、**S9 だけ実 claude で起動**(安価 single-step live)。実 run が
証拠を自動生成 → レビュー emit → 承認 → 証拠ゲートが存在を確認 → **S9 done を許可**、までを通した。

```
S9 実 claude 起動 → 質問回答 → 証拠 auto-written → completeness gate stall → generator retry(1/3)
→ 再実行 → 質問回答 → レビュー emit → 承認 → 証拠ゲート(present)→ S9 done ✅
```
最終状態: `S9=done` / runs=["stalled","done"] / 証拠 = 実物(manifest + run.log 132KB + shot.png 43KB)。

## 証拠ファイル(本番の proof)
- `attach-pass.log` — 操作ログ(質問回答→retry→承認→done の全手順 + 検証結果「PASS 経路実証: 成立」)。
- `S9-manifest.json` — live が自動生成した証拠 manifest(log + screenshot / capturedAt ≥ run startedAt)。
- `S9-run.log` — 実 claude S9 の実行ログ(132KB / 実シナリオ検証の生出力)。
- `S9-shot.png` — live が captureVerifyUi で撮った実 screenshot。

## この実証で見つけ・直したバグ(live testing の成果)
1. **deterministic gate の studio 固有パス hardcode**(P-S9-03 / `resolveGatePaths` で project-agnostic 化)。これが無いと非 studio プロジェクトの gated step は全て stall した。
2. **seed の chat ドメインコードのバグ**(カタカナ長音符名の誤拒否 / `channel.ts` VALID_PATTERN に `ー` を追加)。実 claude の S9 が発見。

## 補足(誤解防止)
`01-cycle-open.png` / `02-s9-started.png` / `03-turn1-timeout.png` / `*.webm` は、**最初の(性急な)
Playwright ドライバ**が 360s/turn でタイムアウトした際の残骸(= 当時は「実 claude は遅い」だけが理由で
未到達。stall ではない)。本番の proof は上記 4 ファイル(API ベースの patient attach)。
</content>

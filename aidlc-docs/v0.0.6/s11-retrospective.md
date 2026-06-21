# S11 — 振り返り(v0.0.6)

> サイクル進行中に発生したプロセス問題を即メモする running log。S11 本実行でここを入力に集約分析する。

## running log(発生時メモ)

### P-S1-01 — S1 起こし時に reconcile-check を回さず escalation(F3/IMP5)を見落とした
- **発生**: 2026-06-21 / S1 Phase B。
- **症状**: v0.0.6 の carried を `into: v0.0.6` の 5 件(AUTO-ORCH-core / O3 / P-ARCH-01 / P-ARCH-02 / S8-Q02)だけ見て US 化し、index を組み立てた。`into: v0.0.7` の F3-project-management-ui / S11-IMP5-retro-metrics-autocollect が「2 サイクル連続 carried = escalation(3 度目 defer 禁止)」で当該サイクルでの US 化を要求されることを見落とした。S1 確定直前に `bun run reconcile v0.0.6` を回して初めて BLOCK が判明。
- **真因**: reconcile ゲートを「S1 確定の最後に通すチェック」と捉え、「S1 起こしの最初の入力」として回さなかった。escalation は into 先に関わらず「直近の次サイクル」に US 化義務を課すため、into:現サイクル だけ見ると構造的に漏れる([completeness-checks-anchor-on-spec] と同型 = 産物起点で見て仕様起点で見ていない)。
- **影響**: ユーザーとの往復が 1 回増えた(scope を 11→13 US に拡張)。是正後は reconcile PASS / ledger:check up to date。
- **Try 候補**: S1 Phase B 着手の最初に `reconcile-check <version>` を必ず回し、escalation/未 reconcile を入力として US 設計する(確定直前でなく起点で回す)。スキル本文 or 機械化(S1 開始フックで reconcile を表示)。

### P-S1-02 — escalation ルール散文「US 化必須」とゲートコード「addressed まで」の drift
- **発生**: 2026-06-21 / S1 reconcile 解析中。
- **症状**: `kit/rules/ledger.md` の escalation 則は「2 連続 carried は US 化必須(未 US 化なら S1 を確定にできない)」と書くが、ゲート実装 `reconcileCycle`(`src/app/services/root-ledger.ts`)は `escalationUnaddressed = detectEscalation(...).filter(e => !addressedSet.has(e.id))` で「addressed(現サイクルで言及されていれば可)」までしか検査しない。documented forward re-carry でもコードは通る = ルール散文より緩い。
- **真因**: 方法論(散文)とプラットフォーム(ゲートコード)が別符号化で単一正本が無い(P-ARCH-01 / US-09 が狙う drift)。本サイクル US-09(ルール↔ゲート↔テスト drift 検出)の生きた実例。
- **対応方針**: US-09 の `probe:rules` 拡張で「escalation 則 ↔ reconcileCycle ↔ test」の連結を検査対象にし、散文の強制水準とコードの検査水準が乖離していれば赤にする(本サイクル内で回収可能)。本サイクルでは散文の意図(US 化必須)に従い、コードの緩さを exploit せず F3/IMP5 を US 化した。

## S11 本実行 — 集約分析(consolidated)

> (サイクル CLOSE 時に running log + 各 step の結果を集約してここに記述する)

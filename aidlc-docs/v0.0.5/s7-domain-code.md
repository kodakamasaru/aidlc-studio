# S7 — 純粋ドメインコード 進行ログ

## メタ
- 工程: S7 (Domain Code)
- 役割: ドメインエンジニア
- ステータス: 確定
- 入力参照: aidlc-docs/v0.0.5/s6/(Evidence / LedgerEntry)
- コード出力先: `src/domain/evidence/` / `src/domain/ledger/`
- 言語/テストランナー: TypeScript / `bun test`(`bun test src/domain`)
- 作成日: 2026-06-20
- 更新日: 2026-06-20

## 実装一覧

| # | 対象モデル/集約 | コードパス | テストパス | 対応 US | 状態 |
|---|----------------|----------|----------|--------|------|
| 1 | Evidence(EvidenceManifest / EvidenceForm / StepDoneEligibility) | `src/domain/evidence/evidence.ts` | `src/domain/evidence/evidence.test.ts` | US-01 | done |
| 2 | LedgerEntry(LedgerEntry / LedgerState / ReconcileStatus) | `src/domain/ledger/ledger-entry.ts` | `src/domain/ledger/ledger-entry.test.ts` | US-02・03 | done |

公開純粋関数:
- `evaluateStepDoneEligibility(manifest, opts) -> { eligibility, missing }`(log + 視覚/動作証拠 双方必須 / runStartedAt 引数注入 / screenshot 固定にしない)
- `validateLedgerEntry(entry) -> readonly string[]`(carried⇒into / dropped⇒reason / done⇒closedIn)
- `reconcileStatus(entry, targetVersion, addressedIds) -> ReconcileStatus`(**厳密一致**)
- `detectEscalation(entriesAcrossCycles) -> readonly LedgerEntry[]`(2 サイクル連続 carried / done・dropped 解消は対象外)

## 純粋性チェックログ
| 日付 | チェック対象 | 検出された違反 | 対応 |
|------|------------|--------------|------|
| 2026-06-20 | evidence.ts / ledger-entry.ts | なし(DB/HTTP/UI/ORM/DI import 無し / Date.now・Math.random・fetch・fs 無し / I/O は引数注入) | — |

## 検証(独立評価者 / 自己採点しない)
- 設計レビュー(S4-S6): NO-GO → BLOCKER 3 件(manifest フィールド名 / 逆引き US-06〜09 / DAG 曖昧)修正 → 再検証 GO。
- ドメインコードレビュー(typescript-reviewer): NO-GO → BLOCKER 1 件(`reconcileStatus` の部分一致誤検出)修正 → 厳密一致化 + 誤マッチ防止テスト追加。
- 最終: `bun test src/domain` = **169 pass / 0 fail**、`typecheck` ドメイン型エラー **0**。

## 質疑応答ログ
(未解決 Q なし)

---

## AI が独自に決めたこと と 理由

### D-01 — `reconcileStatus` は厳密一致(部分一致を排除)
- **理由**: レビューで `usId.includes(entry.id)` が "D-1"→"D-10" 誤検出する correctness バグと判明。引数を `addressedIds`(US 群が消し込む台帳 id 集合)に変え `includes`(配列メンバーシップ=厳密一致)に修正。由来→台帳 id の抽出は S8 の責務。
- **種別**: 技術判断(AI 自走で確定 / レビュー指摘で是正)
- **上書き**: `usIds` 部分一致 → `addressedIds` 厳密一致

### D-02 — 不足理由ラベルを `"log"` と `"visual-or-operational"` の 2 種に統一
- **理由**: 「視覚/動作証拠(screenshot/video/test-report)」を 1 カテゴリに束ね、S8 の UI/エラー表示を簡潔にする。screenshot 固定にしない原則を保つ。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — 時刻比較は ISO-8601 辞書順(UTC 前提)。証拠生成側で UTC 正規化
- **理由**: capturedAt ≥ runStartedAt を文字列比較で実装。TZ オフセット混在で逆転するため、S8 配線時に証拠生成側で `Z`(UTC)正規化する旨をコードコメントに明記。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 棄却した案

### R-01 — `reconcileStatus` を部分文字列マッチのまま S8 へ送る
- **棄却理由**: 誤 reconciled を静かに生む。S1 ブロックの根拠が壊れる。厳密一致に修正。

## 次工程 (S8) への引き継ぎ
- **S5 I/F と突き合わせる公開関数**: 上記 4 関数。Unit-01 の `checkEvidenceGate` は `evaluateStepDoneEligibility` を、Unit-03 の `reconcileCheck` は `reconcileStatus`/`detectEscalation` を、Unit-02 は `validateLedgerEntry` を呼ぶ。
- **技術層が実装すべきポート**: ① 証拠 manifest の file 読み書き(`_evidence/{step}/manifest`)② ルート/版別 ledger の yaml 読み込み ③ Run 開始時刻の取得(run store / SQLite)④ US 由来 → 台帳 id 抽出(addressedIds 生成)⑤ 証拠生成(verify:shot / 動画 / test-report、UTC capturedAt)。
- **ドメインが前提とする不変条件(統合時に壊さない)**: 証拠存在は OS 観測事実 / capturedAt は UTC / reconcile は厳密一致 / state 別必須フィールド。

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか: (手戻り時に追記)
- 暫定の解決方針:
- 棄却した案とその理由:

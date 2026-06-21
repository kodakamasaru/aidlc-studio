# S3 — UI 設計確定(視覚意図のイメージ作り / 全体)

## メタ
- 工程: S3 (UI Design / Image)
- PhaseGroup: Design
- 役割: プロダクトデザイナー(視覚意図担当)
- バージョン: v0.0.6
- ステータス: 確定
- 入力参照: このサイクルの S2 成果物(画面要素・情報構造)
- 作成日: 2026-06-21
- 更新日: 2026-06-21

## 全体方針

### スタイル方向
前サイクル(v0.0.4〜v0.0.5)の Linear/Vercel ミニマル・ダーク路線を**そのまま継承**する。新規にスタイルを発明しない。v0.0.6 の追加分は「既存デザインシステムの意味的な拡張」のみ。

### カラー方針
- ベース: `#09090b` bg / 4 段サーフェス(surface / surface-2 / surface-3)
- アクセント: indigo `#6366f1` + violet `#a78bfa`
- 状態色(既存): running teal `#2dd4bf` / stalled amber `#f59e0b` / done green `#22c55e` / failed red `#ef4444` / q indigo `#818cf8` / review violet `#c084fc`
- 状態色(v0.0.6 新規追加): backoff blue `#60a5fa` / resume lt-cyan `#5eead4` (parking は q の `#818cf8` を流用 / stall→retry は stalled の `#f59e0b` を流用)
- 階調数: テキスト 3 段 / サーフェス 4 段(変更なし)

### タイポグラフィ
- ファミリ: Inter(本文) / JetBrains Mono(バッジ / mono ラベル)
- スケール: display 28/700 / h1 20/600 / h2 16/600 / body 14 / caption 12.5 / micro 11
- 行間: body 1.5 / log 1.65

### 余白リズム
- ベース: 4px
- スケール: sp-1(4) / sp-2(8) / sp-3(12) / sp-4(16) / sp-5(20) / sp-6(24) / sp-7(32) / sp-8(40) / sp-9(48)

### Radius / Shadow / Motion
- radius: sm 6 / md 8 / lg 12 / full 9999
- shadow: card `0 1px 2px rgba(0,0,0,0.4)` / popover `0 12px 32px rgba(0,0,0,0.55)`
- motion: fast 150ms / panel 200ms / ease-out / ease-out-expo `cubic-bezier(0.16,1,0.3,1)` / アニメーションは transform / opacity のみ

## 画面一覧 (S2 の SCR と 1:1 対応)
- SCR-01 自走ボード | 仕様: scr-01-self-driving-board.md | スクショ: screenshots/scr-01-self-driving-board.default.png
- SCR-02 Inbox 要対応例外カード | 仕様: scr-02-inbox-retry-exhausted.md | スクショ: screenshots/scr-02-inbox-retry-exhausted.default.png
- SCR-03 プロジェクト管理 | 仕様: scr-03-project-management.md | スクショ: screenshots/scr-03-project-management.default.png
- SCR-04 振り返りメトリクス | 仕様: scr-04-retro-metrics.md | スクショ: screenshots/scr-04-retro-metrics.default.png
- SCR-05 会話スレッド(retry 上限到達 詳細) | 仕様: scr-05-thread-retry-exhausted.md | スクショ: screenshots/scr-05-thread-retry-exhausted.default.png | 対応 US: US-04 / US-05 / US-06

## 視覚カタログ
- デザイントークン(色・タイポ・余白など): tokens.html
- デザイントークンの見本(スクショ): screenshots/tokens.png

## binding 逆引き確認(完了条件 5)

| US | AC との照合 | 結果 |
|----|------------|------|
| US-01 スケジューラ | eligible 判定・parallel 上限・parking 永続 → SCR-01 の 5 バッジ(実行中/backoff/parking/stall/resume)で可視化。内部 pid / session_id は非表示(責務契約①) | 矛盾なし |
| US-04 retry 上限 | retry 上限到達 → Inbox 要対応カード + 後続継続 + 非ブロッキング明示 → SCR-02 に「他のタスクは止まらず進行中」を表示。アクション 3 つ(手動再実行 / 戻って直す / 保留)+ 詳細を見る(SCR-05 へ遷移)。「詳細を見る」先の SCR-05 にも同 3 アクションと試行履歴を表示 | 矛盾なし |
| US-05 reconcile-resume | 再起動後の継続は resume 復帰バッジ(◐ / lt-cyan `#5eead4`) → SCR-01 稼働中セクションに表示 | 矛盾なし |
| US-06 stall | stall→retry バッジ(⚠ / amber `#f59e0b`) → SCR-01 待ちセクションに表示。retry カウンタを補助表示(2/3 形式) | 矛盾なし |
| US-08 稼働台帳 | last-activity の経過時間 → SCR-01 task-meta 列に表示。内部 pid / session_id は非表示(責務契約①) | 矛盾なし |
| US-11 silent 再生成 | 「silent」が要件 → 画面なし(S2 D-02 で確定)。SCR に出力なし = 正しい挙動 | 矛盾なし |
| US-12 プロジェクト管理 | 作成/切替/リセット/legacy 正規化 → SCR-03 に全アクション揃う。内部絶対パスは非表示(ファイルピッカーで選択 / 責務契約①)。レガシーバナー + 行インライン警告の 2 段構え | 矛盾なし |
| US-13 メトリクス | ゲート別バグ/ステップ別所要(retry 数)/Q&A 件数(介在点内訳)/自動復旧件数 → SCR-04 の 4 パネル。「設計外の介在点 0 件」の合格表示あり | 矛盾なし |

**binding 逆引き懸念: なし**

## 全体 質疑応答ログ

*(このサイクルの S3 は全て AI 自走で確定できる技術判断のみ。事業判断の Q は発生しなかった)*

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — 既存ダークデザインシステムを継承拡張し、新規スタイルを発明しない
- **理由**: v0.0.4〜v0.0.5 で確立した Linear/Vercel ミニマル・ダーク路線は人間が承認済み。視覚言語を変えると「同一製品に見えない」問題が発生する。v0.0.6 の追加分は意味的な色拡張のみ。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — 新規状態色を 2 色(backoff blue `#60a5fa` / resume lt-cyan `#5eead4`)の追加にとどめる
- **理由**: parking は q(人間タスク系)の indigo `#818cf8` を流用 — parking も「人間の回答を待っている」状態であり q ファミリに属する意味的整合がある。stall→retry は stalled の amber `#f59e0b` を流用 — stall も「自動作り直し中の不安定状態」として amber が適切。新色を最小化することでパレットが散らかない。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — backoff に blue `#60a5fa`、resume に lt-cyan `#5eead4` を選んだ理由
- **理由**:
  - backoff blue: 「時間で自動回復する / 人間アクション不要 / 冷静な待機」を青系(中性 / 情報的)で表現。running の teal から十分に離れた hue で区別できる。`#60a5fa` vs `#09090b` 背景 → 約 6.8:1(AA 合格)。
  - resume lt-cyan `#5eead4`: running teal `#2dd4bf` より明度を上げて「再起動後の継続」の継続性を同系列で暗示しつつ区別。`#5eead4` vs `#09090b` → 約 8.2:1(AA 合格)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-04 — 要対応例外カードに `border-left: 3px solid --color-attention` を加える
- **理由**: routine カードの `border: 1px solid --color-line` と幅が異なるため、色覚特性があっても左端の幅の差で即座に識別できる。三重エンコード(色 + ⚠ アイコン + テキスト)に加えた第 4 の視覚差分として機能する。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-05 — SCR-04 に「設計外の介在点 0 件」の合格表示を加える
- **理由**: US-13 / S2 D-01「人間の介在点が固定 4 点に収まっているかの裏取り」を視覚的に一目わかるようにする。緑 = 合格 / 超過すれば赤になる二値表示で振り返り時の判断を明快にする。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 棄却した案

### R-01 — 5 つの自走状態にそれぞれ新規色を割り当てる
- **棄却理由**: パレットが 5 色増えると視覚的な意味の分類が崩れる。parking = q ファミリ / stall = stalled ファミリへの流用で意味的整合が保てる。新色は backoff と resume の 2 色で十分。

### R-02 — resume 復帰を running(teal)と同色にして区別しない
- **棄却理由**: 「再起動後の継続」は「通常実行中」と区別が必要(人間が last activity を見た時に「これは再起動後だから文脈がリセットされた可能性がある」と判断できるようにする)。lt-cyan で同系列に置きつつ色を分ける。

## 次工程への引き継ぎ
- S7/S8 が参照すべき成果物: screenshots/*.png + scr-NN-*.md。HTML/CSS は参照禁止(視覚契約は png と md のみ)。
- SCR-01 の 5 状態バッジは `.badge.running / .badge.backoff / .badge.parking / .badge.stall / .badge.resume` として s3-base.css に定義済み — CSS 変数を参照。
- SCR-02 の要対応カードは `.card--attention` クラス。
- SCR-03 の dialog は `.dialog` / `.dialog-head` / `.dialog-body` / `.dialog-foot` クラス群。
- SCR-04 のメトリクスは `.metrics-grid` / `.metrics-panel` / `.bar-row` / `.recover-box` / `.summary-row` クラス群。
- native 固有挙動でドメイン側に影響しそうな項目: なし(全 SCR が web/desktop)

## 前サイクルからの引き継ぎ
- (このサイクルは新規 S3。手戻りなし)

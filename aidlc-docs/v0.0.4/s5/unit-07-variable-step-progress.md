# Unit-07: 可変ステップ進捗

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-07](../s1/us-07-variable-step-progress.md)
- 由来: 2026-06-13 S3 レビュー指摘 / scope 項目 g / SCR-05(サイクル進捗)
- Phase: 1(leaf / 独立)
- ステータス: 確定(2026-06-13 / 評価 AI レビュー)

## 責務 (1〜2 行)
サイクル画面の進捗表示([PhasePipeline.tsx](../../../web/src/features/cycle-detail/PhasePipeline.tsx))が、ステップ数可変(任意ステップの有無)でも破綻せず現在地が一目で読める。12 ステップを 5 PhaseGroup 帯に束ね、横溢れ/窮屈を防ぐ(SCR-05)。

## 外部依存
- なし(leaf)。wire 契約にも会話にも依存しない独立 web 差分。
- 触る既存箇所: [PhasePipeline.tsx](../../../web/src/features/cycle-detail/PhasePipeline.tsx)(現状 12 ノード横一列 / S2.5 retired)。S4 の指摘どおり `PhasePipeline` は既に N フェーズ対応済 → 本 Unit の主作業は **5 PhaseGroup 帯への束ね表示(SCR-05)** で、新規技術契約は不要(S4 §スコープ)。

## I/F 定義 (この Unit が公開する契約 = 画面の入出力)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| PhaseGroup 帯描画 | cycle の有効ステップ集合 + 各 run state | 5 PhaseGroup(Discovery/Design/Build/Validation/Improvement)帯に束ね、可変ステップ数でも一目で現在地が読める進捗 | ステップ欠落(任意ステップ無し)でも帯が崩れない |

- 既存 `NodeView` 状態(done/current/upcoming/stalled/human-waiting/backtrack)の描画は維持し、レイアウトを帯束ねに変える。

## この Unit 固有の 質疑応答ログ

### Q-01 — (なし)
- US-07 は S3 レビューでユーザー指摘起点・確定済(S1 D-05)。SCR-05 で UI 確定済。新規 Biz 判断なし。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — 既存 `PhasePipeline` を作り直さず、5 PhaseGroup 帯へのレイアウト束ねに限定する
- **理由**: S4 確認どおり N フェーズ対応のロジックは既存で満たされている。要求は「可変でも見やすい(品質基準①)」= レイアウトの問題。ノード状態ロジックを温存しレイアウトだけ SCR-05 に寄せるのが最小差分。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計 / 2026-06-13 評価 AI レビュー)。ユーザー上書き希望時は随時反映。
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — 進捗表示を別コンポーネントで新設
- **棄却理由**: 既存 `PhasePipeline` の状態描画(stalled/human-waiting/backtrack)を捨てて作り直すと退行リスク。レイアウト束ねの差分で足りる。
</content>

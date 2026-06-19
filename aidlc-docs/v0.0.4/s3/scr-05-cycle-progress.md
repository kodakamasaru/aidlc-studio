# SCR-05: サイクル進捗(PhaseGroup 束ね) — コンポーネント仕様

## メタ
- 親: [s3/index.md](./index.md)
- 視覚 source: [scr-05-cycle-progress.html](./scr-05-cycle-progress.html)(人間レビュー用 / S7/S8 は Read 禁止)
- スクショ:
  - [default](./screenshots/scr-05-cycle-progress.default.png)(Discovery 完了 / Design 進行中)
  - [stall](./screenshots/scr-05-cycle-progress.stall.png)(現在ステップ S3 が stall)
  - [backtrack](./screenshots/scr-05-cycle-progress.backtrack.png)(S2 手戻り再入 ↩)
  - [variable](./screenshots/scr-05-cycle-progress.variable.png)(技術仕様が無いサイクル = 実在ステップのみ名前で表示 / 番号・省略ラベルなし)
- 対応 S2 SCR: [SCR-05](../s2/scr-05-cycle-progress.md)
- 対応 US: [US-07](../s1/us-07-variable-step-progress.md)
- ステータス: 確定(2026-06-13)

## native 固有挙動
- 本サイクルは web デスクトップのボード UI。native/モバイル固有挙動(safe area / status bar / swipe back 等)は対象外。

## a11y
- **状態の二重符号化**: ステップ状態を色のみに依存させない。完了=✓ / 進行中=● / stall=! / 未着手=○ / 手戻り=↩ の記号 + 色で表す。色覚特性でも区別可。
- **現在地の読み上げ**: 現在の PhaseGroup 帯と現在ステップに `aria-current="step"` を付与。スクリーンリーダは「Design、進行中、S3 実行中」のように読む。
- **構造**: 進捗は順序リスト(`<ol>` の PhaseGroup → 各 `<li>` 内に steps の `<ol>`)で表現し、読み上げ順 = 工程順。帯ヘッダの ✓/●/○ glyph は `aria-hidden` にし、状態テキスト(完了/進行中/未着手)を併記。
- **コントラスト**: ステップ番号(mono)・サブラベルは text-low(#8b8b96)で AA(4.5:1)を満たす。
- **凡例**: 色 + 記号の対応を凡例テキストで明示(色だけで意味を負わせない)。

## pointer / keyboard 操作
- **クリック**: 各ステップドット / PhaseGroup 帯はクリックで該当ステップの詳細(レビュー / スレッド / run)へ遷移しうる(導線詳細は cycle 画面側)。フォーカス可能要素にする。
- **hover**: ステップドット hover でステップ名(例「S3 本格 UI デザイン」)をツールチップ表示(S2 scr-05 Q-01)。常時はドット + 番号のみ。
- **キーボード**: Tab で工程順にフォーカス移動、Enter で遷移。

## motion
HTML の transition は参考にされない。motion 意図はここに文字で書く。
- **状態遷移**: ステップが done になる瞬間、glyph を 150ms ease-out で ○→✓ にクロスフェード、帯間コネクタを左→右へ 200ms ease-out で緑塗り(`opacity` クロスフェードで表現)。
- **current の強調**: 現在ステップドットのリングは `opacity` の穏やかなパルス(0.6→1→0.6 / 1.6s)。`transform`/`opacity` のみ。
- **reduced-motion**: `prefers-reduced-motion: reduce` でパルス停止(固定)・遷移 0ms。

## この画面固有の 質疑応答ログ
- **可変ステップの扱い(US-07 Q-02 / S2 scr-05)**: 実在フェーズのみ描く(`cycle.phases` 駆動)。任意ステップ欠落時はその PhaseGroup 帯のドットが減るだけで帯は保たれ、横一列の窮屈/はみ出しは起きない(`variable` スクショで視覚化)。
- **既存 PhasePipeline からの置換**: 横一列 12 ノードを 5 PhaseGroup 帯に置換(S2 scr-05 D-01)。各帯は `flex: 1` で等幅、内包ステップは帯内で wrap。

---

## この画面固有の AI が独自に決めたこと と 理由

### D-03 — ステップは「名前」で表示・実在ステップのみ描画(番号 S1〜S12 を出さない / 2026-06-13)
- **理由**: ユーザー指摘「S1〜S12 も可変で破綻する(欠けたら振り直し? 省略のデータは?)」。固定番号は欠番か振り直しで必ず破綻し、振り直すと工程名と食い違う。名前(要件ヒアリング / UIデザイン / …)で実在ステップのみ並べれば、欠番・振り直し・省略ラベルが一切発生しない。`variable` スクショで技術仕様の無いサイクルでも崩れないことを視覚契約化。US-07 D-02 と同期。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)

### D-01 — 工程グループを等幅帯(`flex:1`)にし、内包ステップは帯内 wrap で吸収
- **理由**: ステップ数が PhaseGroup ごとに異なる(Build は 4、Discovery は 2)。等幅帯 + 帯内 wrap なら、ステップ数差・可変を帯が吸収し全体の横幅は一定に保てる(US-07 の「崩れない」)。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)

### D-02 — 状態 glyph を ✓ / ● / ! / ○ / ↩ の 5 種で固定し、色と必ずペアにする
- **理由**: 既存 PhasePipeline の色分け(緑/青/amber)を踏襲しつつ、記号を必ず添えて色覚非依存にする(a11y)。↩(手戻り)は既存の BacktrackIcon 意図を継承。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)

---

## この画面固有の 棄却した案

### R-01 — PhaseGroup で束ねず、12 ステップを横一列のまま等間隔で詰める
- **棄却理由**: US-07 R-01 と同じ。本数可変で窮屈/はみ出し。PhaseGroup 帯が根治。

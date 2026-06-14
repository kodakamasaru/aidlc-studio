# SCR-02: 会話スレッド(統合対話ビュー) — コンポーネント仕様

## メタ
- 親: [s3/index.md](./index.md)
- 視覚 source: [scr-02-conversation-thread.html](./scr-02-conversation-thread.html)(人間レビュー用 / S7/S8 は Read 禁止)
- スクショ:
  - [default](./screenshots/scr-02-conversation-thread.default.png)(1 ターン複数質問のバッチ)
  - [appended](./screenshots/scr-02-conversation-thread.appended.png)(resume 後の次バッチが末尾追記 / US-05)
  - [completed](./screenshots/scr-02-conversation-thread.completed.png)(質問が尽き成果物完成 → スレッド完了 / Inbox に ◎ visual_review / US-03 誤分類しない・US-04 着地)
  - [running](./screenshots/scr-02-conversation-thread.running.png)
  - [stall](./screenshots/scr-02-conversation-thread.stall.png)
  - [hearing](./screenshots/scr-02-conversation-thread.hearing.png)(設定ヒアリング = このサイクルの**全ステップ**設定をまとめて / 1 ステップ単位でない / US-06 D-02)
  - [empty](./screenshots/scr-02-conversation-thread.empty.png)
  - [reconstruction](./screenshots/scr-02-conversation-thread.reconstruction.png)(**US-08 工程の再構成 / サイクル側=AI 起点**。要件確定直後に AI が差分付き再構成案〔既定のまま/✕削除+理由/＋新設〕を提示→会話で修正→まとめて承認 / S2 D-05)
  - [reconstruction-global](./screenshots/scr-02-conversation-thread.reconstruction-global.png)(**US-08 既定の編集 / グローバル側=人間起点**。AI が現在の既定構成を提示〔差分なし〕→人間が指示→AI が変更案+新設ルール生成→保存 / S2 D-06)
- 対応 S2 SCR: [SCR-02](../s2/scr-02-conversation-thread.md)
- 対応 US: [US-03](../s1/us-03-output-question-routing.md) / [US-04](../s1/us-04-conversational-resume.md) / [US-05](../s1/us-05-qa-thread-ui.md) / [US-06](../s1/us-06-bulk-hearing.md)
- ステータス: 確定(2026-06-13)

## native 固有挙動
- 本サイクルは web デスクトップのボード UI。native/モバイル固有挙動(safe area / status bar / swipe back 等)は対象外。

## a11y
- **バブルの二重符号化**: AI バブルは左寄せ + `surface-ai` 色、人間バブルは右寄せ + `surface-human` 色で配置する。色のみに依存しない — 左右の位置関係がスクリーンリーダー以外のユーザーへの一次符号化であり、色は補助。スクリーンリーダー向けには各バブルの冒頭に「AI:」/「あなた:」のラベルを `aria-label` または `<span class="visually-hidden">` で付与する。
- **構造記号の読み上げ順**: 【質問 N】等の強調記号は視覚的な区切りとして機能するが、スクリーンリーダーには「質問N、本文…」の順で読まれるよう、記号と本文を同一の読み上げフローに収める。`aria-label` で上書きするか、記号を `aria-hidden="true"` にして別途 `<span class="visually-hidden">質問N</span>` を置く。
- **折りたたみ(背景コンテキスト)**: 折りたたみトグルは `aria-expanded="true"/"false"` を持つ `<button>` で実装する。展開時は全文が DOM に存在しフォーカス可能。`aria-controls` でパネル ID を紐付ける。
- **入力 textarea**: `<label>` でラベルを明示する(例:「回答を入力」)。placeholder のみではラベルとして不十分。
- **実行中インジケータ(running 状態)**: `aria-live="polite"` を持つ領域に「AI が続きを考えています」のテキストを動的挿入する。dots アニメーション自体は `aria-hidden="true"` にして読み上げ対象から外す。
- **stall 状態**: `role="alert"` 相当の領域に「AI の再開に失敗しました。回答は保存されています。」を表示し、再試行ボタンにフォーカスを誘導する(`focus()` を programmatically 呼び出す)。

## pointer / keyboard 操作
- **バッチ回答(D-04)**: 1 ターンの AI バブルは複数質問(例 3 件)を内包し、各質問の直下にインライン入力を置く。回答はバブル末尾の **「まとめて送信して再開」1 ボタン**で全問を 1 回の resume に渡す。質問ごとに個別送信はしない。未回答件数(例「未回答 0 / 3」)を footer に表示。
- **各質問の回答 UI(D-05 / Claude 質問窓と同じ感覚)**: どの質問にも必ず **①選択肢(各ラベル + 説明)②★おすすめ 1 つ + おすすめ理由 ③自由入力欄(その他/補足)** を毎回表示する。選択肢はラジオ + 説明文、★おすすめは選択肢内に印 + 「おすすめ理由」行(amber)。自由入力欄は選択肢に無い回答・補足を常時受ける。数値や自由系の質問でも AI が候補を提示する。
- **送信**: `Cmd+Enter`(macOS) / `Ctrl+Enter`(Windows/Linux) で「まとめて送信」。UI 上にショートカットを明示(ボタン横に「⌘⏎」)。クリックでも送信できる。必須未回答が残る場合は送信前に該当質問へフォーカス誘導。
- **折りたたみ展開**: 背景コンテキストブロックは `▸` / `▾` アイコン付きボタンのクリックで展開・折りたたみ。Enter キー / Space キーで操作可能。
- **スクロール**: スレッド本体はオーバーフロースクロール。新着メッセージ追記時は末尾に自動スクロールする(後述)。

## motion
HTML の transition は参考にされない。motion 意図はここに文字で書く。

- **新着メッセージの追記**: スレッド末尾に新しいバブルが追加される際、`opacity: 0 → 1`(200ms) と `translateY(8px → 0)`(200ms) を `ease-out` で同時実行する。下から浮き上がる方向で時系列の流れと一致させる。
- **自動スクロール**: 新着バブル追加後、スレッドコンテナを末尾に `scrollIntoView({ behavior: 'smooth' })` でスクロールする。ユーザーが手動で上にスクロールしている場合は自動スクロールを一時抑制し、新着バッジを表示する(将来拡張 / 本 v0 は常時自動スクロールで可)。
- **running dots**: 「AI が考えています」インジケータは 3 点の `opacity` パルス。`0.4 → 1 → 0.4` を 1.2s で繰り返す。`transform` / `opacity` のみ使用。
- **reduced-motion**: `prefers-reduced-motion: reduce` の場合、slide/fade の transition を 0ms に、running dots の opacity パルスを停止(固定 `opacity: 0.7`)にフォールバックする。

## この画面固有の 質疑応答ログ
- **S2 scr-02 Q-01 確認(ポーリング方式の採用)**: AI 実行状態の取得は数秒間隔のポーリングで末尾追記を行う。即時化(SSE / WebSocket)は S4(技術仕様)で再検討する。本 S3 では「ポーリングで都度末尾追記」を視覚契約として確定。
- **US-04 AC の状態契約**:
  - `running` 状態 = 「回答受領済み → AI resume 実行中」を示す。ユーザーは送信後すぐ running 状態のスレッドを見る。
  - `stall` 状態 = 「AI 再開に失敗したが、回答は保存済み」。黙って回答を失う実装は禁止。stall 表示は「回答は保存された」という事実を明示する。

---

## この画面固有の AI が独自に決めたこと と 理由
### D-01 — 新着バブルの方向を `translateY(8px → 0)`(下から浮き上がり)に決定
- **理由**: SCR-01 の新着カードは上端差し込みで `translateY(-8px → 0)` を採用したが、会話スレッドは末尾追記(下方向に伸びる)が自然な流れ。下から浮き上がる方向が時系列と一致し、視覚的な矛盾が生じない。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)

### D-02 — stall 時に `role="alert"` 相当とフォーカス誘導を明示
- **理由**: US-05 の「ユーザーに stall を伝える」要件は a11y の観点では「読み上げで通知 + 操作先へのフォーカス誘導」が必要。`aria-live="polite"` では割り込みが弱く、stall は緊急度が高いため `role="alert"` 相当(assertive 相当)を採用。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)

### D-03 — 自動スクロール抑制ロジックを「本 v0 は常時自動スクロールで可」と暫定決定
- **理由**: ユーザーが上スクロール中に自動スクロールされると UX が損なわれる。ただし v0 スコープでは「Human Inbox 縦ループを端まで閉じる」が優先であり、抑制ロジックの実装は過剰。将来拡張として注記するにとどめる。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)

### D-04 — バッチ型(1 ターン複数質問をまとめて提示・まとめて回答・1 回 resume)を視覚契約とする
- **理由**: ユーザー指摘起点(S2 scr-02 D-04 と同期)。AI バブルは複数質問を内包し、各質問にインライン入力 + バブル末尾 1 ボタンで一括送信。`default`(質問 3 件)/ `hearing`(設定 2 件)/ `appended`(resume が次バッチを末尾追記)/ `completed`(成果物完成→Inbox に ◎)の各スクショで視覚化。round-trip を最小化し §I「サクサク / 一括」基準を満たす。状態網羅: `running`/`stall` は「N 件のまとめ回答が受領・保存済み」を文言で示す(US-04 AC)。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)

### D-05 — 各質問に「選択肢 + ★おすすめ(理由)+ 自由入力欄」を毎回表示(Claude 質問窓と同じ感覚)
- **理由**: ユーザー指摘「選択肢・推奨・自由入力欄は毎回表示じゃない?」。出し方の不統一(選択肢のみ / 自由のみ / ★無し)を解消。どの質問でも ①選択肢(ラベル+説明)②★おすすめ + おすすめ理由 ③自由入力欄 を必須化。推すだけで進めるサクサク感と自由度を両立。S2 index D-04 / テンプレ更新と同期。`default`/`appended`/`hearing` の各スクショで全質問がこの 3 要素を持つことを視覚契約化。
- **判断**(ユーザー記入): **承認**(2026-06-13 確定)

---

## この画面固有の 棄却した案
- **R-01 送信を Enter キー単発にする案**: チャット UI の慣習だが、textarea での改行と競合する。`Cmd/Ctrl+Enter` を採用し、単体 Enter は改行として保留する設計を選択した。
- **R-02 SSE/WS をこの画面で決定する案**: 実行更新の通知方式はネットワーク層の技術選択であり S3(視覚仕様)の責務を超える。S4 に送る。

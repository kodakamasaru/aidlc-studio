# S3 — UI 設計確定(視覚意図のイメージ作り / 全体)

## メタ
- 工程: S3 (UI Design / Image)
- PhaseGroup: Design
- 役割: プロダクトデザイナー(視覚意図担当)
- バージョン: v0.0.1
- ステータス: 確定
- 入力参照: 画面要素(ワイヤーフレーム)
- 作成日: 2026-06-03
- 更新日: 2026-06-04

## 全体方針

### スタイル方向
**ライトプロフェッショナル(Light Professional)** — 社内ツールとして長時間使っても疲れない白ベースの配色。情報密度の高いカレンダーを読みやすくするため、装飾は最小にして空間と色の対比でメリハリをつける。

### カラー方針
- **ベース**: neutral-50(#fafafa) — 画面背景
- **サーフェス**: white(#ffffff) — カード・フォーム背景
- **アクセント**: indigo-600(#4f46e5) — CTAボタン・選択状態・フォーカスリング
- **予約済スロット背景**: indigo-100(#e0e7ff)
- **空きスロットホバー**: indigo-50(#eef2ff)
- **状態色**: success=green-600(#16a34a) / warning=amber-500(#f59e0b) / error=red-600(#dc2626) / info=blue-500(#3b82f6)
- **テキスト階調**: neutral-900(本文 #171717) / neutral-500(補助 #737373) / neutral-300(プレースホルダー #d4d4d4)
- **階調数**: neutral 10 段(Tailwind デフォルト)

### タイポグラフィ
- **本文ファミリ**: Inter + Noto Sans JP(和文フォールバック: system-ui)
- **見出しファミリ**: Inter(ウェイトで差をつける)
- **スケール**:
  - ページタイトル: 24px / font-semibold / line-height 1.25
  - セクションタイトル: 18px / font-semibold / line-height 1.25
  - カードタイトル: 16px / font-medium / line-height 1.4
  - 本文: 14px / font-normal / line-height 1.5
  - 補助テキスト: 12px / font-normal / line-height 1.5
  - タグ・バッジ: 11px / font-medium / line-height 1
- **行間**: 1.5(本文) / 1.25(見出し)
- **字間**: 通常(letter-spacing: 0)

### 余白リズム
- **ベース**: 4px
- **スケール**: 1=4px / 2=8px / 4=16px / 6=24px / 10=40px / 16=64px
- **カード内パディング**: 16px(上下)× 16px(左右)
- **画面外側マージン**: 16px
- **リスト項目間ギャップ**: 8px

### Radius / Shadow / Motion
- **radius**: 4px(入力欄・タグ) / 8px(カード) / 12px(モーダル) / 9999px(ステータスバッジ)
- **shadow**: カード=shadow-sm(0 1px 2px rgba(0,0,0,0.05)) / モーダルオーバーレイ=shadow-lg(0 10px 25px rgba(0,0,0,0.15))
- **motion 基本**: duration=150ms / easing=ease-out
- **モーダル開閉**: 200ms ease-out で opacity 0→1 + scale(0.95→1.0)
- **エラーバナー出現**: 200ms ease-out で translateY(-8px)→0 の slide-down
- **スロットホバー**: 100ms ease-out で background-color 変化

## 画面一覧 (S2 の SCR と 1:1 対応)
- SCR-01 会議室一覧 | [コンポーネント仕様](#scr-01-spec)
- SCR-02 日別空き時間カレンダー | [コンポーネント仕様](#scr-02-spec)
- SCR-03 予約作成フォーム | [コンポーネント仕様](#scr-03-spec)
- SCR-04 自分の予約一覧 | [コンポーネント仕様](#scr-04-spec)
- SCR-05 予約変更フォーム | [コンポーネント仕様](#scr-05-spec)
- SCR-06 取消確認ダイアログ | [コンポーネント仕様](#scr-06-spec)

## 視覚カタログ
- デザイントークン(色・タイポ・余白など): tokens.html (生成物)
- デザイントークンの見本(スクショ): screenshots/tokens.png (生成物)

## 全体 質疑応答ログ

### Q-01 — スタイル方向として「ダーク系」と「ライト系」のどちらを採用するか?
- **回答**(人間の回答を AI が記入):
  > 社内ツールとして日中の会議室確認に使う用途なので、ライト系でよい。ダークモードの対応は今回は不要。
- **確定**(AI 記入):
  > ライトプロフェッショナル方向で確定。ダークモード対応はスコープ外。

### Q-02 — アクセントカラーとして「青系」「緑系」「オレンジ系」のうちどれが社内ツールとして馴染むか?
- **回答**(人間の回答を AI が記入):
  > 青系がよい。うちの社内ツールは全体的に青系が多いので合わせたい。
- **確定**(AI 記入):
  > アクセントカラーを indigo-600 に決定した。

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — 予約済スロットを indigo-100 の薄い背景で表現する
- **理由**: 予約者名・件名というテキスト情報を乗せるため、文字が読めるよう薄い背景にする。濃い塗りにすると白文字が必要になり、小さいフォントサイズでの可読性が落ちる。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — フォントファミリを Inter + Noto Sans JP に固定する
- **理由**: 英数字と日本語の混在コンテンツ(日付・時刻・件名・会議室名)が多い。Inter は数字の読みやすさに優れ、Noto Sans JP は和文との組み合わせで文字ガタつきが少ない。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — 余白ベースを 4px にする
- **理由**: カレンダーの時間スロットは情報密度が高く、8px ベースだとスロット高が過剰になる。4px ベースで微調整の自由度を確保する。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 棄却した案

### R-01 — ダークモード採用
- **棄却理由**: Q-01 で人間確認。社内ツールとして日中使用が主であり、今サイクルはスコープ外とした。

### R-02 — グリーン系アクセント
- **棄却理由**: Q-02 で人間確認。社内ツールの既存カラーパレット(青系)に合わせる方針となった。

## 次工程への引き継ぎ
- S7/S8 が参照すべき screenshots と md の対応表:
  - SCR-01: screenshots/scr-01-room-list.default.png / scr-01-room-list.empty.png
  - SCR-02: screenshots/scr-02-availability-calendar.default.png / scr-02-availability-calendar.loading.png
  - SCR-03: screenshots/scr-03-create-booking.default.png / scr-03-create-booking.error.png
  - SCR-04: screenshots/scr-04-my-bookings.default.png / scr-04-my-bookings.empty.png
  - SCR-05: screenshots/scr-05-edit-booking.default.png / scr-05-edit-booking.error.png
  - SCR-06: screenshots/scr-06-cancel-dialog.default.png
- native 固有挙動でドメイン側に影響しそうな項目: なし(Web アプリ)

---

# SCR-01: 会議室一覧 — コンポーネント仕様 {#scr-01-spec}

## メタ
- 親: UIデザインの一覧
- 視覚 source: scr-01-room-list.html
- スクショ: screenshots/scr-01-room-list.default.png / empty.png
- 対応 S2 SCR: SCR-01
- 対応 US: US-01
- ステータス: 確定

## 状態定義
| 状態 | 内容 |
|------|------|
| default | 会議室カード一覧が表示されている |
| empty | 会議室が 0 件。「登録されている会議室がありません」を画面中央に表示 |

## native 固有挙動
- safe area: 適用なし(Web アプリ)
- keyboard avoidance: フォームなし、適用なし

## a11y
- 会議室カードは `<button>` でキーボードフォーカス可能
- 設備タグは `aria-label="設備: プロジェクター"` を付与
- `<h1>会議室を選んでください</h1>` を設置
- 色コントラスト基準: WCAG AA(本文 neutral-900 on white = 15.9:1)

## gesture
- tap/click: カードのどこをタップしても SCR-02 に遷移
- hover: カード shadow-sm → shadow-md(150ms ease-out)

## motion
- ページ初期表示: カード群が 150ms ease-out で opacity 0→1 の fade-in
- カードホバー: shadow 変化 150ms ease-out

---

# SCR-02: 日別空き時間カレンダー — コンポーネント仕様 {#scr-02-spec}

## メタ
- 親: UIデザインの一覧
- 視覚 source: scr-02-availability-calendar.html
- スクショ: screenshots/scr-02-availability-calendar.default.png / loading.png
- 対応 S2 SCR: SCR-02
- 対応 US: US-02
- ステータス: 確定

## 状態定義
| 状態 | 内容 |
|------|------|
| default | 予約データ取得済み、スロット一覧表示中 |
| loading | 日付切り替え時。スロット全体をスケルトン(pulse アニメーション)で表示 |

## a11y
- 各タイムスロットは `<button>` / 予約済スロットは `disabled` 属性
- 予約済スロット: `aria-label="09:30〜10:00 田中 週次定例 予約済み"`
- 空きスロット: `aria-label="10:30 空き スロットをクリックして予約する"`
- 前日・翌日ボタン: `aria-label="前の日へ"` / `aria-label="次の日へ"`
- 色コントラスト基準: WCAG AA

## gesture
- tap/click(空きスロット): SCR-03 に遷移。会議室・日付・開始時刻を引き渡す
- tap/click(予約済スロット): 何も起きない(disabled)

## motion
- 日付切り替え: スロットリストが 150ms ease-out で opacity 0→1
- ローディング中: スケルトンアニメーション(pulse 1.5s ease-in-out 繰り返し)
- 空きスロットホバー: background neutral-50 → indigo-50(100ms ease-out)

---

# SCR-03: 予約作成フォーム — コンポーネント仕様 {#scr-03-spec}

## メタ
- 親: UIデザインの一覧
- 視覚 source: scr-03-create-booking.html
- スクショ: screenshots/scr-03-create-booking.default.png / error.png
- 対応 S2 SCR: SCR-03
- 対応 US: US-03
- ステータス: 確定

## 状態定義
| 状態 | 内容 |
|------|------|
| default | フォーム初期状態。カレンダーから引き継いだ値がプリフィル済み |
| error | ダブルブッキングまたは時刻不正。フォーム上部に red-50 背景 + red-600 ボーダーのエラーバナーを表示 |

## a11y
- フォームに `<fieldset>` + `<legend>予約情報</legend>`
- エラーバナーに `role="alert"`(スクリーンリーダーが自動アナウンス)
- 各入力フィールドは `<label>` と `aria-describedby` で紐づけ
- 送信中は「予約する」ボタンを `disabled` にしスピナーを表示
- 色コントラスト基準: WCAG AA

## gesture
- 「予約する」ボタンタップ: バリデーション後に API 送信
- 「キャンセル」ボタンタップ: 前の画面に戻る

## motion
- エラーバナー出現: 200ms ease-out で translateY(-8px)→0 の slide-down
- 送信中スピナー: indigo-600 のサークル spin(1s linear 繰り返し)

---

# SCR-04: 自分の予約一覧 — コンポーネント仕様 {#scr-04-spec}

## メタ
- 親: UIデザインの一覧
- 視覚 source: scr-04-my-bookings.html
- スクショ: screenshots/scr-04-my-bookings.default.png / empty.png
- 対応 S2 SCR: SCR-04
- 対応 US: US-04
- ステータス: 確定

## 状態定義
| 状態 | 内容 |
|------|------|
| default | 予約カード一覧表示中(「今後の予約」タブ選択状態) |
| empty | 「今後の予約」または「過去の予約」が 0 件。「予約はありません」テキストを表示 |

## a11y
- タブは `role="tablist"` / `role="tab"` / `role="tabpanel"`
- 過去の予約の変更・取消ボタンは `disabled` + `aria-disabled="true"` + `title="過去の予約は変更できません"`
- アクションボタンは `aria-label="第1会議室 2026年6月12日の予約を変更"` のように文脈を含める
- 色コントラスト基準: WCAG AA

## gesture
- タブクリック: 「今後の予約」「過去の予約」を切り替え
- 「変更」ボタン: SCR-05 に遷移
- 「取消」ボタン: SCR-06 モーダルを開く

## motion
- タブ切り替え: コンテンツエリアが 150ms ease-out で opacity 0→1
- モーダル表示: 200ms ease-out で opacity 0→1 + scale(0.95→1.0)

---

# SCR-05: 予約変更フォーム — コンポーネント仕様 {#scr-05-spec}

## メタ
- 親: UIデザインの一覧
- 視覚 source: scr-05-edit-booking.html
- スクショ: screenshots/scr-05-edit-booking.default.png / error.png
- 対応 S2 SCR: SCR-05
- 対応 US: US-05
- ステータス: 確定

## 状態定義
| 状態 | 内容 |
|------|------|
| default | フォームに既存の予約値がプリフィルされている |
| error | 変更後の時間帯が重複、または時刻不正。SCR-03 と同じエラーバナー |

## a11y
- SCR-03 と同じ方針。`<h1>予約を変更する</h1>` でページタイトルを差別化

## gesture / motion
- SCR-03 と同じ

---

# SCR-06: 取消確認ダイアログ — コンポーネント仕様 {#scr-06-spec}

## メタ
- 親: UIデザインの一覧
- 視覚 source: scr-06-cancel-dialog.html
- スクショ: screenshots/scr-06-cancel-dialog.default.png
- 対応 S2 SCR: SCR-06
- 対応 US: US-06
- ステータス: 確定

## 状態定義
| 状態 | 内容 |
|------|------|
| default | ダイアログ表示中。対象予約の会議室・日時・件名を表示 |

## a11y
- `role="dialog"` / `aria-modal="true"` / `aria-labelledby="dialog-title"`
- ダイアログ表示時、フォーカスは「やめる」ボタンに移動(破壊的アクションへの誤フォーカスを防ぐ)
- 「取り消す」ボタン: `aria-label="予約を取り消す"`
- モーダル外クリック: ダイアログを閉じる(「やめる」と同じ動作)
- Escape キー: ダイアログを閉じる
- 背景コンテンツに `aria-hidden="true"`

## gesture
- 「やめる」or モーダル外クリック or Escape: モーダルを閉じて SCR-04 に戻る
- 「取り消す」: 取消 API 呼び出し後、モーダルを閉じて SCR-04 を再表示

## motion
- ダイアログ表示: 200ms ease-out で opacity 0→1 + scale(0.95→1.0)
- ダイアログ閉じ: 150ms ease-in で opacity 1→0 + scale(1.0→0.95)
- 「取り消す」ボタン押下中: スピナー表示 + disabled 状態

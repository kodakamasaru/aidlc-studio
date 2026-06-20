# SCR-01: メインレイアウト — コンポーネント仕様

## メタ
- 対応 S2 SCR: [SCR-01](../S2/scr-01-main-layout.md)
- 対応 US: [US-02](../S1/us-02-join-channel.md), [US-03](../S1/us-03-post-message.md), [US-04](../S1/us-04-unread-count.md)
- ステータス: 確定

## 状態
- `default`: チャンネル選択済み・メッセージあり
- `empty`: チャンネル選択済み・メッセージなし(「最初のメッセージを送りましょう」)
- `loading`: チャンネル切り替え中(タイムライン部分がスケルトン)

## native 固有挙動
- safe area: N/A(web のみ)
- keyboard avoidance: 入力欄が画面下に固定されているためブラウザデフォルト動作

## a11y
- サイドバーチャンネルリスト: `<nav aria-label="チャンネル一覧">` 内に `<ul>`
- アクティブチャンネル: `aria-current="page"`
- 未読バッジ: `aria-label="未読 3 件"` のように数値を読み上げ
- 送信ボタン: `aria-label="メッセージを送信"`

## motion
- チャンネル切り替え時: タイムラインが 100ms fade-out → 即切り替え → 100ms fade-in
- 新着メッセージ追加: 末尾へ 150ms ease-out で slide-in(既にスクロール末尾にいる場合のみ)

# SCR-03: チャンネルブラウザモーダル — コンポーネント仕様

## メタ
- 対応 S2 SCR: [SCR-03](../S2/scr-03-channel-browser.md)
- 対応 US: [US-02](../S1/us-02-join-channel.md)
- ステータス: 確定

## 状態
- `default`: チャンネル一覧表示
- `empty`: チャンネルがまだ存在しない

## a11y
- 参加済みチャンネルの「参加中」ボタン: `disabled aria-disabled="true"` + テキスト「参加中」
- 参加ボタン: `aria-label="dev-backend チャンネルに参加する"` のようにチャンネル名を含める

## motion
- SCR-02 と共通: 150ms slide-up で open

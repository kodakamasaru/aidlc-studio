# SCR-02: チャンネル作成モーダル — コンポーネント仕様

## メタ
- 対応 S2 SCR: [SCR-02](../S2/scr-02-create-channel.md)
- 対応 US: [US-01](../S1/us-01-create-channel.md)
- ステータス: 確定

## 状態
- `default`: 入力前の初期状態
- `error`: チャンネル名バリデーションエラー時
- `loading`: API 送信中(送信ボタンがスピナーに変わる)

## a11y
- モーダル: `role="dialog" aria-modal="true" aria-labelledby="modal-title"`
- フォーカス: モーダルオープン時にチャンネル名入力欄へフォーカス移動
- Esc キーでモーダルを閉じる

## motion
- モーダル open: 150ms cubic-bezier(0.16,1,0.3,1) で下から slide-up + opacity 0→1
- モーダル close: 100ms ease-in で opacity 1→0

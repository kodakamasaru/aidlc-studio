# SCR-04: 通知一覧パネル — コンポーネント仕様

## メタ
- 対応 S2 SCR: [SCR-04](../S2/scr-04-notification-panel.md)
- 対応 US: [US-05](../S1/us-05-mention-notification.md)
- ステータス: 確定

## 状態
- `default`: 未読通知あり
- `empty`: 通知なし(「メンションはまだありません」)
- `all-read`: 全件既読

## a11y
- ベルボタン: `aria-label="通知 2 件未読"` のように件数を含める
- パネル: `role="region" aria-label="通知一覧"`

## motion
- パネル open: ヘッダーのベルアイコン下から 150ms で dropdown slide-down

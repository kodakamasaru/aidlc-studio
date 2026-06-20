# Unit-04: メンション通知

## メタ
- 所属 US: [US-05](../S1/us-05-mention-notification.md)
- ステータス: 確定

## 責務
メッセージ本文の @mention を検出し、対象ユーザーへ通知を生成・管理する。

## 外部依存
- Unit-02: メッセージ本文のパース(mention 検出)

## I/F 定義
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| extractMentions | `{ body: string }` | `string[]` (usernames) | - |
| createNotifications | `{ messageId: string, mentionedUsernames: string[] }` | `Notification[]` | - |
| getNotifications | `{ userId: string }` | `Notification[]` | - |
| markNotificationRead | `{ notificationId: string, userId: string }` | `void` | `NotificationNotFoundError` |

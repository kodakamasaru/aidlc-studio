# 集約: Notification

## メタ
- 対応 US: [US-05](../S1/us-05-mention-notification.md)
- 所属 Unit: [Unit-04](../S5/unit-04-mention.md)
- ステータス: 確定

## モデル定義

- **集約ルート**: `Notification`
- **エンティティ**:
  - `Notification`: id(UUID), recipientUserId, messageId, channelId, mentionerUserId, createdAt, readAt(null | timestamp)
- **値オブジェクト**:
  - `MentionPattern`: `/@([a-zA-Z0-9_\-]+)/g` にマッチする username 参照

## 不変条件
- 通知は `@username` を含むメッセージが投稿されたときのみ生成される
- 自分自身への @mention は通知を生成しない
- 同一メッセージ内で同一ユーザーへの重複 mention は通知を 1 件だけ生成する
- 既読になった通知は再び未読にならない

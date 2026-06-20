# Unit-03: 未読件数管理

## メタ
- 所属 US: [US-04](../S1/us-04-unread-count.md)
- ステータス: 確定

## 責務
チャンネルごと・ユーザーごとの未読件数を管理する。メッセージ投稿イベントを受けてインクリメントし、チャンネルを開いた時にリセットする。

## 外部依存
- Unit-01: チャンネルのメンバー一覧取得(誰の未読をインクリメントするかの判定)
- Unit-02: メッセージ投稿イベントのサブスクライブ

## I/F 定義
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| getUnreadCounts | `{ userId: string }` | `Record<channelId, number>` | - |
| markAsRead | `{ channelId: string, userId: string }` | `void` | `ChannelNotFoundError` |
| onMessagePosted | `{ channelId: string, authorId: string }` | `void` (副作用: 他メンバーの未読インクリメント) | - |

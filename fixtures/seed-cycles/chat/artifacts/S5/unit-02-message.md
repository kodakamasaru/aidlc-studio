# Unit-02: メッセージ投稿・タイムライン

## メタ
- 所属 US: [US-03](../S1/us-03-post-message.md)
- ステータス: 確定

## 責務
メッセージの投稿・削除・タイムライン取得(ページネーション)を管理する。投稿後に WebSocket 経由でチャンネル参加者に配信する。

## 外部依存
- Unit-01: チャンネル存在確認
- Unit-06: 新着メッセージの WebSocket 配信

## I/F 定義
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| postMessage | `{ channelId: string, authorId: string, body: string }` | `Message` | `ChannelNotFoundError`, `EmptyBodyError`, `BodyTooLongError` |
| deleteMessage | `{ messageId: string, requestingUserId: string }` | `void` | `MessageNotFoundError`, `NotMessageAuthorError` |
| getTimeline | `{ channelId: string, before?: string, limit: number }` | `Message[]` | `ChannelNotFoundError` |

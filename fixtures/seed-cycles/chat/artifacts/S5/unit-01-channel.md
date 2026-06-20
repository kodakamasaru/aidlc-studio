# Unit-01: チャンネル管理

## メタ
- 所属 US: [US-01](../S1/us-01-create-channel.md), [US-02](../S1/us-02-join-channel.md)
- ステータス: 確定

## 責務
チャンネルのライフサイクル(作成・参加・一覧取得)を管理する。

## 外部依存
なし(Phase 1 leaf)

## I/F 定義
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| createChannel | `{ name: string, description?: string, creatorUserId: string }` | `Channel` | `ChannelNameDuplicateError`, `InvalidChannelNameError` |
| joinChannel | `{ channelId: string, userId: string }` | `void` | `ChannelNotFoundError`, `AlreadyMemberError` |
| listAllChannels | `{ requestingUserId: string }` | `Channel[]` | - |
| listJoinedChannels | `{ userId: string }` | `Channel[]` | - |

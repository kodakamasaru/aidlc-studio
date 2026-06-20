# Unit-06: WebSocket 接続管理

## メタ
- 所属 US: [US-03](../S1/us-03-post-message.md), [US-04](../S1/us-04-unread-count.md)
- ステータス: 確定

## 責務
WebSocket 接続のライフサイクル管理(接続・切断・再接続)とクライアントへのイベント配信。どのユーザーIDがどのソケット接続を持っているかのマッピングを保持する。

## 外部依存
なし(Phase 1 leaf)

## I/F 定義
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| registerConnection | `{ userId: string, socket: WebSocket }` | `void` | - |
| removeConnection | `{ userId: string }` | `void` | - |
| broadcast | `{ channelId: string, event: WsEvent }` | `void` | - |
| sendToUser | `{ userId: string, event: WsEvent }` | `void` | - |

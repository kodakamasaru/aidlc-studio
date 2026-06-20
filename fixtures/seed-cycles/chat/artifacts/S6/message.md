# 集約: Message

## メタ
- 対応 US: [US-03](../S1/us-03-post-message.md), [US-05](../S1/us-05-mention-notification.md), [US-06](../S1/us-06-message-search.md)
- 所属 Unit: [Unit-02](../S5/unit-02-message.md)
- ステータス: 確定

## モデル定義

- **集約ルート**: `Message`
- **エンティティ**:
  - `Message`: id(UUID), channelId, authorId, body(MessageBody), postedAt, deletedAt(null | timestamp)
- **値オブジェクト**:
  - `MessageBody`: 1〜4000文字の文字列。空白のみは不可。`@username` 形式の mention を 0 個以上含む可能性がある

## 不変条件
- メッセージ本文は空にできない(空白のみも不可)
- メッセージ本文は 4000 文字以下
- 削除は論理削除(deletedAt を設定)。物理削除はしない
- 削除できるのは作成者のみ
- 削除済みメッセージの本文はタイムラインに表示しない(「このメッセージは削除されました」に置換)

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — 削除を論理削除にする
- **理由**: 未読カウントや通知との整合性を保つために削除済みメッセージのレコードを保持する必要がある。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

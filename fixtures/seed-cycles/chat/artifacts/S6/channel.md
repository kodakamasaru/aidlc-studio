# 集約: Channel

## メタ
- 対応 US: [US-01](../S1/us-01-create-channel.md), [US-02](../S1/us-02-join-channel.md)
- 所属 Unit: [Unit-01](../S5/unit-01-channel.md)
- ステータス: 確定

## モデル定義

- **集約ルート**: `Channel`
- **エンティティ**:
  - `Channel`: id(UUID), name(ChannelName), description(string | null), createdAt, createdByUserId
- **値オブジェクト**:
  - `ChannelName`: 1〜50文字、使用可能文字は `[a-zA-Z0-9　-鿿\-_]`、スペース不可。正規化は lowercase 変換なし(大文字小文字を区別する)

## 不変条件
- チャンネル名はシステム内でユニーク
- チャンネル名は空にできない
- チャンネル名はスペースを含めない
- 作成者は自動的に最初のメンバーになる

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — ChannelName を値オブジェクトで表現
- **理由**: 名前のバリデーションルール(文字種・長さ・スペース禁止)をドメイン層に閉じ込める。string のまま渡すと受け取り側でバリデーションが分散する。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

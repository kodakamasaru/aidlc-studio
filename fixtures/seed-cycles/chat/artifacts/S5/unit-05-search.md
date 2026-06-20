# Unit-05: メッセージ検索

## メタ
- 所属 US: [US-06](../S1/us-06-message-search.md)
- ステータス: 確定

## 責務
参加済みチャンネルのメッセージをキーワード全文検索する。

## 外部依存
- Unit-02: messages テーブルの `tsvector` カラムを使った検索

## I/F 定義
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| searchMessages | `{ query: string, userId: string, limit: number }` | `SearchResult[]` | `EmptyQueryError` |

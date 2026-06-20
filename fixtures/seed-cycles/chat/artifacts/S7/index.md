# S7 — 純粋ドメインコード 進行ログ

## メタ
- 工程: S7 (Domain Code)
- 役割: ドメインエンジニア
- ステータス: 確定
- 入力参照: ドメインモデル(S6)
- コード出力先: `fixtures/seed-cycles/chat/artifacts/S7/code/`
- 言語/テストランナー: TypeScript / Vitest
- 作成日: 2026-05-17
- 更新日: 2026-05-17

## 実装一覧

| # | 対象モデル/集約 | コードパス | 対応 US | 状態 |
|---|----------------|----------|--------|------|
| 1 | Channel 集約 (ChannelName 値オブジェクト) | `code/channel.ts` | US-01, US-02 | 完了 |
| 2 | Message 集約 (MessageBody 値オブジェクト) | `code/message.ts` | US-03, US-05, US-06 | 完了 |
| 3 | UnreadCount 値オブジェクト | `code/unread.ts` | US-04 | 完了 |

## 純粋性チェックログ
| 日付 | チェック対象 | 検出された違反 | 対応 |
|------|------------|--------------|------|
| 2026-05-17 | channel.ts | なし | - |
| 2026-05-17 | message.ts | なし | - |
| 2026-05-17 | unread.ts | なし | - |

## AI が独自に決めたこと と 理由

### D-01 — Notification 集約のコードは S7 では生成せず S8 に委ねる
- **理由**: Notification の `createNotifications` は Message 集約から mention を抽出した後の処理。S8 の統合レイヤーで MessageBody.extractMentions() を呼び出してアダプタ側で組み立てる方が純粋性を保ちやすい。ドメインモデルとしての不変条件(自分自身 mention 不可・重複排除)は extractMentions + アダプタで実装する。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — branded type で ID を型安全にする
- **理由**: `ChannelId`, `UserId`, `MessageId` を string と区別することで、関数の引数に誤った ID 種別を渡すコンパイルエラーを発生させる。実行時コストはゼロ。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

## 次工程 (S8) への引き継ぎ
- S5 の I/F 定義と突き合わせるべき公開関数: `createChannel`, `postMessage`, `deleteMessage`, `incrementUnread`, `markChannelRead`
- 技術層が実装すべきポート: Channel/Message/UnreadCount の永続化(Drizzle)、WebSocket 配信(Unit-06)
- ドメイン層が前提とする不変条件: `incrementUnread` の「投稿者自身はスキップ」ルール、`deleteMessage` の「作者のみ」ルールを技術層で迂回させない

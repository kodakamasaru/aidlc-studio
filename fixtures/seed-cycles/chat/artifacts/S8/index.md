# S8 — PJ 統合 進行ログ

## メタ
- 工程: S8 (Integration)
- 役割: アプリケーションエンジニア(統合)
- ステータス: 確定
- 入力参照: ドメインコード(S7) / 作業単位の分割(S5)
- コード出力先: `server/`(domain 配下は触らない)
- 作成日: 2026-05-20
- 更新日: 2026-05-22

## I/F 契約整合チェック (S5 ↔ ドメイン公開関数)
| # | S5 I/F 定義 | ドメイン公開関数 | 一致/差分 | 解消方針 |
|---|------------|----------------|----------|---------|
| 1 | `createChannel({ name, description?, creatorUserId })` | `createChannel(input: CreateChannelInput)` | 一致(id と now は HTTP アダプタで生成) | - |
| 2 | `joinChannel({ channelId, userId })` | N/A(ドメインに明示的な joinChannel 関数なし) | 差分: `AlreadyMemberError` の判定ロジックが必要 | DB レイヤーでメンバーテーブルへの upsert + 重複チェックで対応 |
| 3 | `postMessage({ channelId, authorId, body })` | `postMessage(input: PostMessageInput)` | 一致 | - |
| 4 | `deleteMessage({ messageId, requestingUserId })` | `deleteMessage(message, requestingUserId, now)` | 一致(message は DB から取得) | - |
| 5 | `getUnreadCounts({ userId })` | `initialUnread` / `incrementUnread` / `markChannelRead` | 一致(集計は DB クエリで) | - |
| 6 | `markAsRead({ channelId, userId })` | `markChannelRead(unread)` | 一致 | - |
| 7 | `searchMessages({ query, userId, limit })` | N/A(ドメインに検索関数なし) | インフラ層で PostgreSQL tsvector を直接呼ぶ | S8 アダプタで実装 |

## アダプタ実装一覧
| # | アダプタ種別 | コードパス | 呼び出すドメイン関数 | 対応 US |
|---|------------|----------|------------------|--------|
| 1 | HTTP(REST) | `server/routes/channels.ts` | `createChannel`, `listAllChannels`, `listJoinedChannels` | US-01, US-02 |
| 2 | HTTP(REST) | `server/routes/messages.ts` | `postMessage`, `deleteMessage`, `getTimeline` | US-03 |
| 3 | HTTP(REST) | `server/routes/unread.ts` | `getUnreadCounts`, `markChannelRead` | US-04 |
| 4 | HTTP(REST) | `server/routes/notifications.ts` | `getNotifications`, `markNotificationRead` | US-05 |
| 5 | HTTP(REST) | `server/routes/search.ts` | (PostgreSQL tsvector 直接) | US-06 |
| 6 | WebSocket | `server/ws/message-handler.ts` | `postMessage` → `broadcast` | US-03, US-04 |
| 7 | DB(Drizzle) | `server/db/schema.ts` | - | 全 US |

## mock 突合レビュー (S3 視覚契約 ↔ 実装画面)
| S3 状態 | 実アプリでの出し方 | 構成要素 | 情報粒度 | 日本語水準 | 判定 | 対応 |
|---------|-----------------|---------|---------|----------|------|------|
| scr-01-main-layout.default | `/channels/general` を開く | サイドバー+タイムライン+入力欄 | 一致 | 一致 | 一致 | - |
| scr-01-main-layout.empty | 新規作成チャンネルを開く | 「最初のメッセージを送りましょう」表示 | 一致 | 一致 | 一致 | - |
| scr-01-main-layout.loading | チャンネル切り替え直後 | スケルトンローダー | 一致 | 一致 | 一致 | - |
| scr-02-create-channel.default | 「+チャンネル作成」クリック | チャンネル名・説明入力欄 | 一致 | 一致 | 一致 | - |
| scr-02-create-channel.error | 重複名を入力して送信 | エラーメッセージ表示 | 一致 | 一致 | 一致 | - |
| scr-02-create-channel.loading | 送信ボタンクリック後 | ボタンがスピナーに変わる | 一致 | 一致 | 一致 | - |
| scr-03-channel-browser.default | 「チャンネルを追加」クリック | 参加可能チャンネル一覧 | 一致 | 一致 | 一致 | - |
| scr-03-channel-browser.empty | チャンネルが 0 件の状態 | 「チャンネルがまだありません」 | 一致 | 一致 | 一致 | - |
| scr-04-notification-panel.default | ベルアイコンクリック | メンション通知一覧 | 一致 | 一致 | 一致 | - |
| scr-04-notification-panel.empty | 通知なし | 「メンションはまだありません」 | 一致 | 一致 | 一致 | - |
| scr-05-search-modal.default | Ctrl+K | 検索入力欄 | 一致 | 一致 | 一致 | - |
| scr-05-search-modal.results | キーワード入力 + Enter | 検索結果一覧 | 一致 | 一致 | 一致 | - |
| scr-05-search-modal.empty | 存在しないキーワード | 「見つかりませんでした」 | 一致 | 一致 | 一致 | - |

## US-AC 機能フロー突合 (Rule B)
| US | 受け入れ条件(AC) | 動く動線 | 判定 |
|----|----------------|---------|------|
| US-01 | チャンネル名バリデーション | POST /channels → domain validation → 400 response | 貫通 |
| US-01 | 重複名エラー | POST /channels → DB unique check → 409 response | 貫通 |
| US-01 | 作成後チャンネルへ遷移 | POST /channels → 201 → frontend redirect | 貫通 |
| US-02 | チャンネルブラウザ一覧 | GET /channels?joined=false → DB query → response | 貫通 |
| US-02 | 参加ボタンで参加 | POST /channels/:id/members → DB insert → response | 貫通 |
| US-03 | メッセージ投稿 | POST /messages → domain postMessage → DB → WS broadcast | 貫通 |
| US-03 | 空メッセージ拒否 | POST /messages → domain EmptyBodyError → 400 | 貫通 |
| US-03 | 自分のメッセージ削除 | DELETE /messages/:id → domain deleteMessage → DB | 貫通 |
| US-04 | 未読件数取得 | GET /unread → DB aggregate → response | 貫通 |
| US-04 | チャンネル開いたら既読 | POST /channels/:id/read → domain markChannelRead → DB | 貫通 |
| US-05 | @mention 入力サジェスト | GET /channels/:id/members → frontend autocomplete | 貫通 |
| US-05 | メンション通知生成 | postMessage → extractMentions → createNotifications → DB | 貫通 |
| US-05 | 通知既読 | PATCH /notifications/:id/read → DB update | 貫通 |
| US-06 | キーワード検索 | POST /search → PostgreSQL tsvector → SearchResult[] | 貫通 |
| US-06 | 0件メッセージ | POST /search → 空配列 → frontend 「見つかりませんでした」 | 貫通 |

## 技術依存マップ
- 採用ライブラリ: Fastify 4, Drizzle ORM 0.30, ws 8, TanStack Query 5, Zustand 4
- DI 構成: Fastify プラグインによる依存注入(DB コネクションをプラグインとして登録)
- エラーハンドリング戦略: ドメインエラーを HTTP ステータスコードにマッピングする `errorHandler.ts` を集約

## 統合テストログ
| 日付 | テスト | 結果 | 備考 |
|------|------|------|------|
| 2026-05-20 | チャンネル作成 API | PASS | - |
| 2026-05-20 | メッセージ投稿 API | PASS | - |
| 2026-05-21 | WebSocket メッセージ配信 | PASS | 初回は接続順序のバグあり → 修正済み |
| 2026-05-21 | 未読件数更新 | PASS | - |
| 2026-05-22 | 検索 API(tsvector) | PASS | 日本語形態素解析に pg_bigm 追加で対応 |
| 2026-05-22 | メンション通知生成 | PASS | - |

## AI が独自に決めたこと と 理由

### D-01 — pg_bigm 拡張を追加して日本語全文検索を対応
- **理由**: PostgreSQL 標準の `tsvector` は日本語トークナイゼーションが弱い。`pg_bigm`(bigram 分割)を使うことで日本語キーワード検索が機能する。Docker イメージにインストール手順をドキュメント化。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

## 次サイクルへの引き継ぎ
- WebSocket 再接続時に未読件数が一時的に不整合になる可能性あり → v0.0.2 で接続復帰時の再同期 API を追加する
- pg_bigm は Docker イメージビルド時に `apt install postgresql-16-pgbm` が必要。README に追記済み
- 検索のインクリメンタル化(US-06 D-01)は v0.0.2 で debounce + インクリメンタル API に変更する

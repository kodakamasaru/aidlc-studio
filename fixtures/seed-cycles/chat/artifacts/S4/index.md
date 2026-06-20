# S4 — 技術仕様

## メタ
- 工程: S4 (Tech Spec)
- PhaseGroup: Design
- 役割: ソフトウェアアーキテクト
- バージョン: v0.0.1
- ステータス: 確定
- 入力参照: brief / US-01〜US-06 / SCR-01〜SCR-05
- 作成日: 2026-05-14
- 更新日: 2026-05-14

## 技術スタック

### 言語 / フレームワーク
| 用途 | 選定 | バージョン | 理由 |
|------|------|-----------|------|
| フロントエンド | React + TypeScript | React 18, TS 5.4 | チーム既存スキル。型安全性でメッセージ・通知のデータ構造を守る |
| バックエンド | Node.js + Fastify | Node 20 LTS, Fastify 4 | 軽量・高速。WebSocket プラグインが充実 |
| DB | PostgreSQL | 16 | 全文検索(`tsvector`)が標準搭載。未読管理テーブルも扱いやすい |
| リアルタイム | WebSocket (ws ライブラリ) | ws 8 | Fastify-websocket プラグインで統合 |
| ORM | Drizzle ORM | 0.30 | TypeScript ファーストで型が強い。マイグレーション管理が明快 |

### インフラ / ホスティング
| 用途 | 選定 | 理由 |
|------|------|------|
| ホスティング | セルフホスト(Docker Compose) | オンプレ/自社クラウドへの展開が要件 |
| リバースプロキシ | nginx | WebSocket のアップグレードヘッダー処理 |

### 開発ツールチェーン
| 用途 | 選定 | 理由 |
|------|------|------|
| ビルド | Vite 5 | 高速 HMR、TypeScript ネイティブ |
| テスト | Vitest + Playwright | ドメイン単体は Vitest、E2E は Playwright |
| Lint | ESLint + Prettier | チーム標準 |

## アーキテクチャ方針

### 全体構成
- SPA(React) + REST/WebSocket API(Fastify) のモノリシック構成
- フロントエンド: `web/`、バックエンド: `server/`、ドメイン: `server/domain/`

### レイヤー分離
- `domain/`: 純粋ビジネスロジック(フレームワーク非依存)
- `adapters/`: DB アダプタ(Drizzle)、WebSocket ハンドラ
- `routes/`: Fastify ルーター(HTTP エンドポイント定義)
- `web/`: React コンポーネント + TanStack Query によるサーバー状態管理

### 状態管理
- サーバー状態: TanStack Query(HTTP)+ WebSocket イベントによる手動キャッシュ更新
- クライアント状態: Zustand(UI モーダル開閉・現在選択チャンネル)
- URL 状態: チャンネル名を `/channels/:channelName` として URL に持たせる

### エラーハンドリング
- リトライ: WebSocket 切断時は 1秒・2秒・4秒の指数バックオフで再接続(最大 3 回)
- フォールバック: WebSocket 不通時はポーリング(5秒間隔)で簡易代替
- エラー表示: トースト通知(画面右下)で 3 秒表示

### セキュリティ
- 認証: v0.0.1 はなし(全員同一空間)。v0.0.2 で JWT + セッション管理
- CSP: `script-src 'self'`、`img-src 'self' data:`

## 外部 I/F 仕様

### 外部 API
なし(v0.0.1 はメール/プッシュ通知なし)

### データ永続化
| 名称 | 用途 | 形式 | 備考 |
|------|------|------|------|
| channels | チャンネル情報 | PostgreSQL テーブル | name にユニーク制約 |
| messages | メッセージ本文 | PostgreSQL テーブル | `tsvector` カラムで全文検索 |
| channel_members | 参加関係 | PostgreSQL テーブル | channel_id × user_id |
| unread_counts | 未読件数 | PostgreSQL テーブル | channel_id × user_id × count |
| notifications | メンション通知 | PostgreSQL テーブル | recipient_user_id × message_id × read_at |

### メッセージング / イベント
| 名称 | 用途 | プロトコル |
|------|------|-----------|
| /ws | リアルタイムメッセージ配信 | WebSocket |

## 非機能要件

### パフォーマンス
| 指標 | 目標値 | 測定方法 |
|------|--------|---------|
| メッセージ投稿 API レスポンス | p95 < 200ms | Fastify ログ |
| 初回ページロード(FCP) | < 2秒 | Lighthouse |
| タイムライン表示(チャンネル切り替え) | < 500ms | Playwright タイム計測 |

### スケーラビリティ
- 想定: 最大 30 人同時接続、1チャンネル最大 10,000 メッセージ
- 拡張方針: v0.0.1 はシングルノード。v0.0.2 以降で Redis pub/sub を検討

### 可用性
- 目標稼働率: 99%(社内ツールのため SLA は緩め)
- 復旧: Docker Compose restart: always で自動再起動

## AI 入力コンテキスト設計
- S7 ドメインコード生成時: S6 の集約定義 + 不変条件を全件 prompt に含める
- S8 統合時: S5 の I/F 定義 + ドメイン公開関数のシグネチャを突合表形式で提示

## 質疑応答ログ

### Q-01 — WebSocket を使う場合の認証(v0.0.1 無認証)は問題ないか?
- **回答**(人間の回答を AI が記入):
  > 社内ネットワーク限定で使うので v0.0.1 は許容する。
- **確定**(AI 記入):
  > v0.0.1 は認証なし。v0.0.2 で JWT を導入。

---

## AI が独自に決めたこと と 理由

### D-01 — Drizzle ORM を選定
- **理由**: Prisma より TypeScript 型との親和性が高く、マイグレーションが SQL ファイルで管理できる。チームのレビュアーが SQL を直接確認できる。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 次工程 (S5) への引き継ぎ
- Work Units 分割で考慮すべき技術的制約: WebSocket サーバーは全メッセージ Unit から共有されるため、接続管理 Unit を独立させる
- 優先して実装すべき技術的基盤: PostgreSQL スキーマ定義 + Drizzle マイグレーション
- 技術的リスク: WebSocket と HTTP の同一サーバーへの共存(Fastify プラグインで対応済み実績あり)

# S4 — 技術仕様

## メタ
- 工程: S4 (Tech Spec)
- PhaseGroup: Design
- 役割: ソフトウェアアーキテクト
- バージョン: v0.0.1
- ステータス: レビュー待ち
- 入力参照:
  - プロダクトの狙い(brief / S1)
  - このサイクルの要件一覧(US-01〜US-07)
  - 画面要素(ワイヤーフレーム / S2)
  - UIデザイン(S3)
- 作成日: 2026-06-14
- 更新日: 2026-06-14

---

## 技術スタック

### 言語 / フレームワーク

| 用途 | 選定 | バージョン | 理由 |
|------|------|-----------|------|
| フロントエンド | React | 18.x | エコシステム成熟度が高い。Suspense でローディング状態管理が簡潔 |
| フロントエンド言語 | TypeScript | 5.x | 在庫数・差分計算の型安全性確保。バグ早期検出 |
| フロントエンドビルド | Vite | 5.x | HMR が速くモバイルデバッグ効率が高い。設定シンプル |
| スタイリング | Tailwind CSS v4 | 4.x | S3 のデザイントークンをユーティリティクラスで直接表現。カスタムカラー定義が容易 |
| バックエンド | Hono | 4.x | 軽量・高速。Edge Runtime 互換。型安全なルーティング |
| バックエンド言語 | TypeScript | 5.x | フロントとコード共有(型定義・バリデーションスキーマ) |
| ORM | Drizzle ORM | 0.30.x | SQL-first で生成クエリが予測しやすい。型安全なスキーマ定義 |
| バリデーション | Zod | 3.x | フロント・バックエンド両側でスキーマ共有。入力バリデーションと型推論を同時に解決 |

### インフラ / ホスティング

| 用途 | 選定 | 理由 |
|------|------|------|
| データベース | SQLite (libsql / Turso) | 小規模用途(商品200件・スタッフ数名)に十分。追加インフラ不要でセットアップコスト最小 |
| ホスティング(フロント) | Cloudflare Pages | 無料枠で十分。CDN 配信で全国どこでも低レイテンシ |
| ホスティング(API) | Cloudflare Workers | Hono との相性最良。コールドスタートなし |
| DB ホスティング | Turso | libsql ホスト型。Cloudflare Workers から低レイテンシ接続可。無料枠 500MB |

### 開発ツールチェーン

| 用途 | 選定 | 理由 |
|------|------|------|
| パッケージマネージャ | pnpm | workspace サポート・高速インストール |
| テストフレームワーク | Vitest | Vite ネイティブ。TypeScript テストが設定ほぼゼロ |
| E2Eテスト | Playwright | スマートフォンビューポートのモバイルテスト対応。スクリーンショット撮影 |
| Linter | Biome | ESLint + Prettier の代替。設定ファイル1つで高速 |
| CI | GitHub Actions | push 時に型チェック・テスト・ビルドを自動実行 |

---

## アーキテクチャ方針

### 全体構成

- **構成方式**: SPA + REST API (BFF なし)
- **理由**: 規模が小さくチームも 1〜2 名。マイクロサービスを分割するメリットがない。SSR は認証不要・SEO 不要の業務ツールには過剰

```
[Browser: React SPA]
        ↕ JSON/REST (fetch)
[Cloudflare Workers: Hono API]
        ↕ libsql SDK
[Turso: SQLite DB]
```

### レイヤー分離と責務境界

| レイヤー | 責務 | 技術 |
|---------|------|------|
| UI Components | 見た目・インタラクション | React + Tailwind |
| Feature Hooks | サーバー状態・楽観的更新 | TanStack Query |
| API Client | fetch ラッパー・エラー変換 | 自作(型安全な fetch) |
| API Routes | ルーティング・認証(将来) | Hono |
| Service Layer | ビジネスロジック・バリデーション | TypeScript 関数 |
| Repository | DB アクセス抽象化 | Drizzle ORM |
| DB Schema | データ定義 | Drizzle Schema |

**原則**: UI は直接 DB を知らない。Service Layer がバリデーション(Zod)と在庫計算ロジックを持つ。Repository は純粋な CRUD のみ。

### 状態管理

| 種別 | 手段 | 理由 |
|------|------|------|
| サーバー状態 | TanStack Query | キャッシュ・refetch・楽観的更新を一括管理 |
| フォームローカル状態 | React useState | フォームの入力値は単純 local state で十分 |
| URL 状態 | search params | フィルタ(すべて/要注意/在庫切れ)をURLに保持。ブックマーク・共有可 |
| グローバル状態 | 使わない | Zustand/Jotai は不要。Context は最小限(テーマ等) |

### エラーハンドリング

- **API エラー**: Hono のエラーミドルウェアで `{ error: { code, message } }` に統一。HTTP ステータスを意味的に使う
- **楽観的更新のロールバック**: TanStack Query の `onError` でスナップショットを復元し Toast で通知
- **在庫超過エラー**: Service Layer でチェックし `400 INSUFFICIENT_STOCK` を返す。フロントはインラインエラーとして入力フォームに紐付けて表示(Toast ではなく)
- **ネットワーク断**: TanStack Query の retry 3回。3回失敗時は「再試行」ボタン付きエラーバナー
- **未処理エラー**: React ErrorBoundary でキャッチし「エラーが発生しました。ページを再読み込みしてください」を表示

### セキュリティ

- **認証方式**: v0.0.1 は認証なし(S1 D-02 確認済)。Cloudflare Access で IP 制限を検討(任意)
- **認可方式**: 全スタッフ同一権限(v0.0.1)
- **CSP**: `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`
- **暗号化**: HTTPS 強制(Cloudflare Pages デフォルト)。DB は Turso の暗号化ストレージ
- **入力バリデーション**: Zod スキーマをフロント・API 両側で共有。API 側は Zod で全入力を必ず再バリデーション

---

## データモデル(概要)

### products テーブル

| カラム | 型 | 説明 |
|-------|-----|------|
| id | TEXT (ulid) | 主キー |
| name | TEXT NOT NULL | 商品名 |
| unit | TEXT NOT NULL | 単位(袋・個など) |
| initial_stock | INTEGER NOT NULL | 初期在庫数(変更不可) |
| alert_threshold | INTEGER NOT NULL DEFAULT 0 | 閾値(0=アラート無効) |
| is_active | INTEGER NOT NULL DEFAULT 1 | 有効フラグ(0=無効化済み) |
| created_at | TEXT (ISO8601) | 登録日時 |
| updated_at | TEXT (ISO8601) | 最終更新日時 |

### stock_transactions テーブル

| カラム | 型 | 説明 |
|-------|-----|------|
| id | TEXT (ulid) | 主キー |
| product_id | TEXT NOT NULL | products.id 参照 |
| type | TEXT NOT NULL | 'inbound' / 'outbound' / 'stocktake' |
| quantity | INTEGER NOT NULL | 数量(常に正値。type で入出を判断) |
| quantity_before | INTEGER | 棚卸し時の調整前在庫数(stocktake のみ使用) |
| memo | TEXT | メモ(任意) |
| created_at | TEXT (ISO8601) | 記録日時 |

**在庫数の計算方式**:

```
current_stock =
  initial_stock
  + SUM(quantity WHERE type='inbound')
  - SUM(quantity WHERE type='outbound')
  + SUM(quantity_after - quantity_before WHERE type='stocktake')
```

ただし棚卸しを「その時点での確定値」として扱い、最後の stocktake 以降のトランザクションのみ集計する方式とも比較する。詳細は S5 Work Units で確定。

---

## 外部 I/F 仕様

### 外部 API

| 名称 | 用途 | 通信方式 | データ形式 | 認証 | 備考 |
|------|------|---------|-----------|------|------|
| (なし) | — | — | — | — | v0.0.1 は外部 API 連携なし |

### データ永続化

| 名称 | 用途 | 形式 | 備考 |
|------|------|------|------|
| Turso (libsql) | 商品マスタ・トランザクション履歴 | SQLite | v0.0.1 は単一 DB。500MB 無料枠で十分 |

### メッセージング / イベント

| 名称 | 用途 | プロトコル | 備考 |
|------|------|-----------|------|
| (なし) | — | — | v0.0.1 はリアルタイム Push なし。クライアントが 30 秒ポーリングで更新を取得 |

**リアルタイム更新の方針**: TanStack Query の `refetchInterval: 30_000` で30秒ごとに在庫一覧を再取得。入出庫・棚卸し後は `queryClient.invalidateQueries` で即時 refetch。WebSocket / SSE は v0.0.2 以降で検討。

---

## AI 入力コンテキスト設計と出力フォーマット設計

*(S4 完了条件(7): transport/機構だけでなく「何を・どの source から・どう構造化して渡すか」を設計する)*

### AI が将来参照する入力コンテキスト

| 入力 | Source | 渡し方 | 用途 |
|------|--------|--------|------|
| 全 US | `s1/index.md` | プロンプト先頭に MD テキスト全文 | S5 Work Units 分割・実装ステップ生成 |
| 全画面仕様 | `s2/index.md` + `s3/index.md` | プロンプトに MD テキスト全文 | 実装時の UI 契約参照 |
| DB スキーマ定義 | Drizzle schema ファイル | TypeScript ソースを文字列として注入 | ドメインコード生成(S7) |
| エラーコード一覧 | 本ファイルの「エラーハンドリング」セクション | 抜粋テキスト | API 実装時の一貫したエラーコード使用 |

### AI が出力する成果物フォーマット

| 出力種別 | 形式 | 完了条件 |
|---------|------|---------|
| Work Units 一覧(S5) | Markdown テーブル(ID・タイトル・依存) | 全 US が最低1 Work Unit にカバーされる |
| ドメインコード(S7) | TypeScript `.ts` ファイル | 型エラーなし・Vitest テスト通過 |
| 統合コード(S8) | TypeScript + React | `pnpm build` 通過・E2E テスト通過 |
| HumanTask 質問 | `aidlc-question` ブロック(JSON) | 質問1件ずつ順次 emit |
| 完了報告 | `aidlc-result` ブロック(JSON) | status / artifacts[] / next_step を含む |

---

## 非機能要件

### パフォーマンス

| 指標 | 目標値 | 測定方法 |
|------|--------|---------|
| 在庫一覧初回表示(LCP) | < 1.5s | Lighthouse / Playwright 計測 |
| 入出庫登録のレスポンス | < 500ms (p95) | CF Workers ログ |
| API レスポンス(一覧取得) | < 200ms (p95) | CF Workers ログ |
| JS バンドルサイズ(gzip) | < 150kB | `pnpm build` 後の出力サイズ |

### スケーラビリティ

- 想定ユーザー数: 同時接続 5 名以下(小売店舗スタッフ)
- 商品数: 〜200件(SQLite で十分)
- トランザクション数: 1日 50〜200件程度
- 拡張方針: v0.0.1 は単一店舗前提。多店舗化が必要になった場合は Turso の multi-tenant (per-db isolation) を利用

### 可用性

- 目標稼働率: 99%(月当たり約7時間のダウンタイムまで許容)
- Cloudflare Workers/Pages のデフォルト SLA で達成見込み
- 障害時の復旧方針: Turso の自動バックアップ(24時間スナップショット)でデータ復旧。コードは GitHub + Cloudflare Pages の自動デプロイで即時復旧

### 監視・ログ

- 監視ツール: Cloudflare Analytics(無料枠) + Sentry(エラートラッキング、Free tier)
- ログレベル: ERROR / WARN を Sentry に送信。INFO は CF Workers ログのみ
- 保持期間: Sentry 90日 / CF Workers ログ 7日
- アラート条件: 5xx エラーが5分間に5件以上 → Sentry アラートメール

---

## 質疑応答ログ

### Q-01 — DB を SQLite (Turso) にした場合、複数スタッフが同時書き込みするとロックが起きないか?
- **回答**(AI 代筆):
  > 数名程度の同時アクセスであれば問題なし。Turso は WAL モードを使用しており、読み取りと書き込みを並行できる。書き込みの競合はトランザクション再試行で解決。
- **確定**(AI 記入):
  > SQLite (Turso WAL) で v0.0.1 は十分。同時書き込みが頻繁になる場合(v0.0.2+)は Turso から PlanetScale/Neon への移行を検討する。

---

## AI が独自に決めたこと と 理由

### D-01 — Cloudflare Workers + Turso スタックを採用した
- **理由**: コールドスタートなし・低レイテンシ・初期コスト0円の組み合わせが小規模業務ツールに最適。Firebase/Supabase を比較検討したが Hono との型統合とエッジ実行の組み合わせが優れる。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — 在庫数を集計クエリで動的に計算する方式を採用した
- **理由**: current_stock をカラムに持つ方式はトランザクションとの二重管理で不整合リスクが高い。集計クエリは商品200件・トランザクション数千件程度では1ms以下で整合性を優先できる。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — TanStack Query の refetchInterval を 30 秒とした
- **理由**: WebSocket/SSE の実装コストを避けつつ「同じスタッフが別端末で入庫した変更を30秒以内に反映」できれば実用上十分。US の AC で秒単位のリアルタイムは求められていない。
- **種別**: 事業判断(要 human-gate) → ユーザー承認待ち(レビュー中)
- **上書き**: なし

### D-04 — 主キーを ULID とした
- **理由**: autoincrement より将来のデータ移行・ログ相関でソータブルなランダム ID が便利。UUID v4 より時刻ソート可能で調査しやすい。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 棄却した案

### R-01 — Next.js + Prisma + PostgreSQL(Supabase)構成
- **棄却理由**: 規模に対してオーバースペック。Supabase の無料枠は DB 一時停止がある。Server Components の学習コストも不要。

### R-02 — Firebase Realtime Database
- **棄却理由**: リアルタイム同期は v0.0.1 スコープ不要。Firebase SDK のバンドルサイズが大きい(+200kB)。TypeScript 型サポートが弱い。

### R-03 — 在庫数を current_stock カラムに保持する方式
- **棄却理由**: 入出庫トランザクションとの二重管理になりデータ不整合のリスクが高い。集計クエリ方式の方がシンプルで整合性が保証される。

---

## 次工程 (S5) への引き継ぎ
- Work Units 分割で考慮すべき技術的制約:
  - 在庫数集計クエリは products と stock_transactions の JOIN が必要。DB スキーマ確定後に着手
  - Cloudflare Workers の制約(Node.js 非互換 API あり)を考慮したライブラリ選定が必要
- 優先して実装すべき技術的基盤:
  1. DB スキーマ + Drizzle マイグレーション
  2. 在庫数集計クエリ(ロジックの核心)
  3. 在庫一覧 API + フロントの TanStack Query 統合
- 技術的リスクと軽減策:
  - Turso 無料枠(500MB)超過: Pro プランへ移行($29/月)。v0.0.1 では発生しない見込み
  - Cloudflare Workers の CPU 時間制限(10ms/リクエスト): 集計クエリが複雑化した場合はインデックス追加で対応
  - refetchInterval 30秒 の合意がレビューで覆った場合: SSE(Server-Sent Events)への移行パスを S5 で設計しておく

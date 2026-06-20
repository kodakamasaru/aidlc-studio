# S4 — 技術仕様

| 項目 | 値 |
|---|---|
| ステップ | S4 |
| 対象 | expense v0.0.1 |
| ステータス | 確定 |
| 完了日 | 2026-06-18 |

---

## 技術スタック

| 区分 | 技術 | バージョン | 採用理由 |
|---|---|---|---|
| フレームワーク | React | 18.x | コンポーネント指向・エコシステム豊富 |
| 言語 | TypeScript | 5.x | 型安全・ドメインモデルとの相性 |
| ビルドツール | Vite | 5.x | 高速 HMR・ESM ネイティブ |
| 永続化 | IndexedDB (idb) | 8.x | ローカルのみ・サーバー不要 |
| 状態管理 | Zustand | 4.x | 軽量・React 外からも操作可能 |
| グラフ | recharts | 2.x | React ネイティブ・宣言的 API |
| テスト | Vitest | 1.x | Vite ネイティブ・高速 |
| テストユーティリティ | @testing-library/react | 14.x | コンポーネントテスト標準 |

---

## アーキテクチャ方針

### SPA + ローカルファースト

- サーバーなし。すべてのデータは IndexedDB にローカル保存する。
- ページルーティングは react-router-dom v6 を使用する(ハッシュルーター)。
- ネットワークアクセスは発生しない。

### レイヤー構成

```
src/
├── domain/          # 純粋ドメインロジック(S7 成果物)
│   ├── money.ts
│   ├── expense.ts
│   └── budget.ts
├── app/             # アプリケーションサービス(usecase)
│   ├── expenseService.ts
│   └── budgetService.ts
├── infra/           # 外部技術依存
│   └── storage/
│       ├── expenseStorage.ts   # IndexedDB adapter
│       └── budgetStorage.ts
├── store/           # Zustand ストア
│   ├── expenseStore.ts
│   └── budgetStore.ts
├── pages/           # ページコンポーネント
│   ├── HomePage.tsx
│   ├── AddExpensePage.tsx
│   ├── ReportPage.tsx
│   └── BudgetPage.tsx
├── components/      # 共通コンポーネント
│   ├── BudgetBanner.tsx
│   ├── ExpenseRow.tsx
│   ├── CategoryChip.tsx
│   └── EmptyState.tsx
└── styles/
    └── tokens.css
```

### ドメイン分離の原則

- `domain/` はフレームワーク・I/O・グローバル状態に依存しない純粋 TypeScript。
- `infra/` は `domain/` 型のみをインポートし、IndexedDB 操作を隠蔽する。
- `app/` は `domain/` と `infra/` を組み合わせてユースケースを実装する。
- `store/` は `app/` を呼び出し、React コンポーネントへ状態を橋渡しする。

---

## 外部 I/F

| I/F | 種別 | 詳細 |
|---|---|---|
| IndexedDB | ローカルストレージ | idb ライブラリ経由。DB名: `expense-db`、バージョン: `1` |
| ブラウザ History API | ルーティング | react-router-dom v6 ハッシュルーター |

IndexedDB スキーマ:

```
DB: expense-db (version 1)
ObjectStore: expenses
  keyPath: id (UUID string)
  indexes: [date, category]

ObjectStore: budgets
  keyPath: monthKey (YYYY-MM string)
```

---

## 非機能要件

| 項目 | 要件 |
|---|---|
| 初回表示速度 | FCP < 1.5s (ローカル起動、低速CPU想定) |
| バンドルサイズ | JS gzip < 300kb (アプリページ基準) |
| テストカバレッジ | ドメイン層 100%、アプリ層 80%以上 |
| ブラウザ対応 | Chrome / Firefox / Safari 最新版 |
| オフライン動作 | 完全オフライン(ServiceWorker は v0.1 以降) |

---

## Q&A ログ

### Q-01: ルーティングはハッシュルーターかブラウザルーターか?

**回答(D-01):** → ハッシュルーター。静的ホスティングでサーバー設定不要。GitHub Pages などへのデプロイが簡単になる。

### Q-02: Zustand は persist ミドルウェアで IndexedDB に直接書き込むか?

**回答(D-02):** → 使用しない。Zustand はオンメモリキャッシュとして使い、永続化は `infra/storage/` が担う。persist ミドルウェアは localStorage を対象とするため、IndexedDB との二重管理になりアーキテクチャが壊れる。

---

## AI 独自決定

| ID | 決定内容 | 根拠 |
|---|---|---|
| D-01 | ハッシュルーター採用 | 静的デプロイ対応。サーバー設定不要。 |
| D-02 | Zustand persist 不使用 | 永続化は infra 層に集約する。アーキテクチャ整合性を保つ。 |
| D-03 | react-router-dom v6 採用 | 標準的な React ルーティング。Outlet/loader 等の機能は v0.0.1 では未使用。 |

---

## 次工程 S5 への引き継ぎ

- 4 レイヤー構成(domain/app/infra/pages)が確定済み。
- 依存方向: pages → store → app → infra → domain(domain は leaf)。
- S5 ではこのレイヤー構成をベースに並行作業単位(Unit)を定義すること。

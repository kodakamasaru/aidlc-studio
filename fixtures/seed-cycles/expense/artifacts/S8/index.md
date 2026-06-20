# S8 — 実 PJ 統合

| 項目 | 値 |
|---|---|
| ステップ | S8 |
| 対象 | expense v0.0.1 |
| ステータス | レビュー待ち |
| 最終更新 | 2026-06-18 |

---

## I/F 契約整合チェック(S5 ↔ ドメイン型)

| Unit | 契約元(S5) | ドメイン型(S7) | 判定 |
|---|---|---|---|
| Unit-04 ExpenseRepository.save | `Expense` を受け取り保存 | `Expense` 型(expense.ts) | 一致 |
| Unit-04 ExpenseRepository.findByMonth | `monthKey: string` → `Expense[]` | `Expense` 型 | 一致 |
| Unit-02 addExpense | `amount/date/category/memo` → `Expense` | `createExpense` シグネチャ | 一致 |
| Unit-02 getBudgetStatus | `monthKey` → `BudgetStatus` | `getBudgetStatus(budget, totalSpent)` | 一致(App Service でラップ) |

---

## アダプタ実装一覧

| ファイル | 種別 | 状態 |
|---|---|---|
| `src/infra/storage/expenseStorage.ts` | IndexedDB adapter (Expense) | 実装済 |
| `src/infra/storage/budgetStorage.ts` | IndexedDB adapter (Budget) | 実装済 |
| `src/app/expenseService.ts` | Application Service | 実装済 |
| `src/app/budgetService.ts` | Application Service | 実装済 |
| `src/store/expenseStore.ts` | Zustand store | 実装済 |
| `src/store/budgetStore.ts` | Zustand store | 実装済 |
| `src/pages/HomePage.tsx` | SCR-01 相当 | 実装済 |
| `src/pages/AddExpensePage.tsx` | SCR-02 相当 | 実装済 |
| `src/pages/ReportPage.tsx` | SCR-03 相当 | 実装済 |
| `src/pages/BudgetPage.tsx` | SCR-04 相当 | 実装済 |
| `src/components/BudgetBanner.tsx` | 予算バナー | 実装済 |
| `src/components/ExpenseRow.tsx` | 支出行 | 実装済 |
| `src/components/EmptyState.tsx` | 空状態 | 実装済 |

---

## mock 突合レビュー表

| 画面状態 | S2 モック仕様 | S8 実装結果 | 判定 | 対応方針 |
|---|---|---|---|---|
| SCR-01.default | 支出リスト + 予算警告バナー表示 | リスト表示・バナー表示ともに動作 | 一致 | — |
| SCR-01.loading | データ取得中スピナー | スケルトンローダー表示 | 一致 | — |
| SCR-01.empty | 「まだ支出が登録されていません」メッセージ + CTA | メッセージ + CTA ボタン表示 | 一致 | — |
| SCR-02.default | 入力フォーム(日付・カテゴリ選択) | フォーム動作確認済 | 一致 | — |
| SCR-02.error | 金額0以下でバリデーションエラー表示 | インラインエラー表示 | 一致 | — |
| SCR-03.default | 円グラフ + 棒グラフ + 月切り替え | recharts グラフ表示確認済 | 一致 | — |
| SCR-03.empty | イラスト + 「この月の支出はありません」 | プレースホルダーテキストのみ(SVG イラスト未実装) | **乖離** | SVG イラストを実装する。テキストのみでは S3 仕様(D-01)を満たさない。次作業で対応。 |
| SCR-04.default | 予算入力 + プログレスバー | 入力・プログレスバー表示確認済 | 一致 | — |

---

## US-AC 機能フロー突合

| US | 動く動線 | 判定 | 備考 |
|---|---|---|---|
| US-01 支出記録 | SCR-02 でフォーム入力 → 登録 → SCR-01 に反映 | 貫通 | — |
| US-02 支出削除 | SCR-01 で長押し → 確認ダイアログ → 削除 → 一覧から消える | 貫通 | — |
| US-03 直近支出一覧 | SCR-01 ホームに最大20件日付降順表示 | 貫通 | — |
| US-04 月次集計 | SCR-03 で月切り替え + グラフ表示 | 貫通 | — |
| US-05 予算設定 | SCR-04 で金額入力 → 保存 → IndexedDB に永続化 | 貫通 | — |
| US-06 予算超過警告 | SCR-01 に BudgetBanner 表示(80%+) | **未貫通** | budgetStore が月支出合計を getBudgetStatus に渡す配線が未完了。実装中。 |

---

## 技術依存マップ

```
HomePage.tsx
  → expenseStore (Zustand)
      → expenseService.ts (App Service)
          → expenseStorage.ts (IndexedDB adapter)
              → src/domain/expense.ts
  → budgetStore (Zustand)
      → budgetService.ts (App Service)
          → budgetStorage.ts (IndexedDB adapter)
              → src/domain/budget.ts
  → BudgetBanner.tsx  ← BudgetStatus を props で受け取る(★未配線)
```

---

## 統合テストログ

| テスト | 結果 | 備考 |
|---|---|---|
| US-01: addExpense → IndexedDB → findAll で取得できる | PASS | fake-indexeddb 使用 |
| US-02: deleteExpense → findAll から消える | PASS | fake-indexeddb 使用 |
| US-04: getMonthlyReport で月集計が正しく計算される | PASS | 固定データでの計算確認 |
| US-06: getBudgetStatus が BudgetBanner に渡り表示される | FAIL | budgetStore → BudgetBanner 配線未完了 |

---

## Q&A ログ

### Q-01: SCR-03 空状態の SVG イラストは今サイクルで必須か?

**質問背景:** S3 D-01 で「インライン SVG」が確定仕様。現在はテキストのみで空状態を表示している。mock 突合で「乖離」と判定した。今サイクルで SVG を実装するか、v0.0.2 に先送りするか決定が必要。

**回答待ち(Q-02):** → ユーザー判断を待っている。v0.0.1 スコープに含めるか否かを確認後、対応方針を確定する。

### Q-02: US-06 の BudgetBanner 配線未貫通について — このサイクルで修正するか?

**質問背景:** budgetStore が月支出合計を getBudgetStatus に渡す配線が実装中。配線自体は軽微な修正(1〜2 ファイル)で完了見込み。S10 受け入れ前に完了させるか、次サイクルに持ち越すか確認が必要。

**回答待ち:** → ユーザー判断を待っている。

---

## AI 独自決定

| ID | 決定内容 | 根拠 |
|---|---|---|
| D-01 | fake-indexeddb を統合テストに採用 | ブラウザ環境不要で IndexedDB を Node.js テストで検証できる。CI 対応。 |
| D-02 | BudgetBanner は BudgetStatus を props で受け取る設計とする | ドメイン計算を Store に閉じ込め、コンポーネントを純粋な表示専用にする。 |
| D-03 | Vite HMR 環境での IndexedDB リセットは `import.meta.env.DEV` フラグで制御 | 開発中に古いスキーマが残って動作不良が起きる問題を回避。 |

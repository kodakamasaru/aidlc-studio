# SCR-05: 検索モーダル — コンポーネント仕様

## メタ
- 対応 S2 SCR: [SCR-05](../S2/scr-05-search-modal.md)
- 対応 US: [US-06](../S1/us-06-message-search.md)
- ステータス: 確定

## 状態
- `default`: 入力前(プレースホルダー表示)
- `results`: 検索結果あり
- `empty`: 検索結果 0 件
- `loading`: 検索実行中(スピナー)

## a11y
- 検索入力: `role="searchbox" aria-label="メッセージを検索"`
- 結果リスト: `role="list"` 内に `role="listitem"`
- 結果件数: `aria-live="polite"` で動的に読み上げ

## motion
- SCR-02 と共通: 150ms slide-up で open。Esc で close。

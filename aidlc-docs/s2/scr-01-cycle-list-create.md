# SCR-01: Cycle 一覧・作成

## メタ
- 親: [s2/index.md](./index.md)
- 対応 US: US-05
- 版: v0.0.1
- ステータス: 確定

## 目的
Cycle を作成し、これまでの Cycle を一覧する起点画面。ここから個別 Cycle の進行(SCR-02)へ入る。

## 主要 UI 要素
- Cycle 一覧(各行: Cycle 名 / 対象リポ / Run state バッジ / 現在ステップ / 更新日時)
- 新規作成ボタン
- 作成フォーム(名前 / 対象リポ / Task=最小は単一でも可)
- 各行から Cycle 詳細へ入る導線

## 状態 (data-state)
- empty: Cycle が 1 件もない。中央に「最初の Cycle を作る」CTA のみ表示。
- list: Cycle 行が並ぶ。各行に Run state バッジ(running/stalled/done)と現在ステップを表示。

## 遷移
- IN: アプリ起点(初回ログイン直後 / グローバルナビ)
- OUT: 作成フォーム送信 → SCR-02(作成した Cycle の詳細・実行)
- OUT: 一覧の行クリック → SCR-02(その Cycle の詳細・実行)

## 備考(挙動 / native / a11y)
- 作成フォームはモーダル or インラインパネルどちらでも可(視覚意図は S2.5 で確定)。
- 対象リポは選択 or 入力。Task 未指定でも作成可(最小=単一 Task 既定)。
- 一覧は更新日時降順を既定とする。

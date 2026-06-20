# S9 — シナリオバリデーション 進行ログ

## メタ
- 工程: S9 (Validation)
- 役割: QA エンジニア
- ステータス: レビュー中
- 入力参照: S8 統合コード / US-01〜US-06 / S3 画面スクショ
- テストコード出力先: `tests/e2e/`
- 視覚証拠出力先: `fixtures/seed-cycles/chat/evidence/S9/screenshots/`
- 作成日: 2026-05-24
- 更新日: 2026-05-25

## 受け入れ基準カバレッジ
| US ID | 受け入れ基準(要約) | カバーするシナリオ | 結果 | 視覚証拠 |
|-------|-------------------|-----------------|------|---------|
| US-01 | チャンネル名バリデーション | SCN-01-a | PASS | screenshots/scn-01-a-error.png |
| US-01 | 重複名エラー | SCN-01-b | PASS | screenshots/scn-01-b-duplicate.png |
| US-01 | 作成後チャンネルへ遷移 | SCN-01-c | PASS | screenshots/scn-01-c-created.png |
| US-02 | チャンネルブラウザ一覧 | SCN-02-a | PASS | screenshots/scn-02-a-browser.png |
| US-02 | 参加後サイドバー更新 | SCN-02-b | PASS | screenshots/scn-02-b-joined.png |
| US-03 | メッセージ投稿・タイムライン表示 | SCN-03-a | PASS | screenshots/scn-03-a-posted.png |
| US-03 | 空メッセージ送信ボタン非活性 | SCN-03-b | PASS | screenshots/scn-03-b-empty-disabled.png |
| US-03 | 自分のメッセージを削除 | SCN-03-c | PASS | screenshots/scn-03-c-deleted.png |
| US-03 | リアルタイム受信(別ユーザー投稿) | SCN-03-d | PASS | screenshots/scn-03-d-realtime.png |
| US-04 | 未読バッジの増加 | SCN-04-a | PASS | screenshots/scn-04-a-unread.png |
| US-04 | チャンネルを開いて既読 | SCN-04-b | PASS | screenshots/scn-04-b-read.png |
| US-04 | 99+表示 | SCN-04-c | PASS | screenshots/scn-04-c-99plus.png |
| US-05 | @mention サジェスト | SCN-05-a | PASS | screenshots/scn-05-a-suggest.png |
| US-05 | 通知バッジ表示 | SCN-05-b | PASS | screenshots/scn-05-b-badge.png |
| US-05 | 通知クリックでジャンプ | SCN-05-c | PASS | screenshots/scn-05-c-jump.png |
| US-06 | キーワード検索結果表示 | SCN-06-a | PASS | screenshots/scn-06-a-results.png |
| US-06 | 0件メッセージ表示 | SCN-06-b | PASS | screenshots/scn-06-b-noresult.png |
| US-06 | 結果クリックでチャンネルジャンプ | SCN-06-c | PASS | screenshots/scn-06-c-jump.png |

## シナリオテストマトリクス
| # | US ID | シナリオ名 | 前提状態 | 操作 | 期待結果 | テストパス | 結果 |
|---|-------|----------|---------|------|---------|----------|------|
| SCN-01-a | US-01 | チャンネル名にスペースを入力してエラー | ログイン済み | 「新しいチャンネル」モーダルで名前に「dev team」を入力して送信 | 「チャンネル名に使用できない文字が含まれています」エラー | `tests/e2e/channel.spec.ts:20` | PASS |
| SCN-01-b | US-01 | 重複チャンネル名 | `general` チャンネル存在 | 「general」という名前でチャンネル作成を試みる | 「そのチャンネル名はすでに使われています」エラー | `tests/e2e/channel.spec.ts:38` | PASS |
| SCN-01-c | US-01 | チャンネル作成成功 | ログイン済み | 未使用名「project-alpha」でチャンネル作成 | 作成後 `#project-alpha` へ遷移し、サイドバーに表示 | `tests/e2e/channel.spec.ts:55` | PASS |
| SCN-02-a | US-02 | チャンネルブラウザ表示 | 複数チャンネルあり | 「チャンネルを追加」ボタンをクリック | 参加済みチャンネルに「参加中」、未参加に「参加する」ボタン | `tests/e2e/channel.spec.ts:78` | PASS |
| SCN-02-b | US-02 | 未参加チャンネルに参加 | `dev-backend` チャンネルあり・未参加 | ブラウザで「dev-backend」の「参加する」をクリック | サイドバーに `#dev-backend` が追加され遷移 | `tests/e2e/channel.spec.ts:95` | PASS |
| SCN-03-a | US-03 | メッセージ投稿 | `general` チャンネル表示中 | 入力欄に「テストメッセージ」と入力して Enter | タイムライン末尾にメッセージ表示。入力欄クリア | `tests/e2e/message.spec.ts:15` | PASS |
| SCN-03-b | US-03 | 空メッセージ拒否 | `general` チャンネル表示中 | 入力欄が空の状態で送信ボタンを確認 | 送信ボタンが `disabled` 状態 | `tests/e2e/message.spec.ts:30` | PASS |
| SCN-03-c | US-03 | 自分のメッセージ削除 | 自分が投稿したメッセージあり | メッセージにホバーして「削除」をクリック、確認ダイアログで「削除する」 | 「このメッセージは削除されました」に置換 | `tests/e2e/message.spec.ts:45` | PASS |
| SCN-03-d | US-03 | リアルタイム受信 | 2 ユーザーが同チャンネルを開く | ユーザー B が投稿 | ユーザー A の画面にリアルタイムで表示 | `tests/e2e/message.spec.ts:65` | PASS |
| SCN-04-a | US-04 | 未読バッジ増加 | ユーザー A が `general` を開かずにユーザー B が投稿 | ユーザー B が 3 件投稿 | ユーザー A のサイドバーの `#general` に「3」のバッジ | `tests/e2e/unread.spec.ts:15` | PASS |
| SCN-04-b | US-04 | チャンネルを開いて既読 | `general` に未読 5 件 | `#general` をクリックして開く | バッジが消える | `tests/e2e/unread.spec.ts:30` | PASS |
| SCN-04-c | US-04 | 99+表示 | 100 件の未読メッセージをシードデータで注入 | サイドバーを確認 | バッジに「99+」表示 | `tests/e2e/unread.spec.ts:50` | PASS |
| SCN-05-a | US-05 | @mention サジェスト | `general` チャンネル、メンバー 3 人 | 入力欄で「@」を打つ | メンバー候補リストが表示される | `tests/e2e/mention.spec.ts:15` | PASS |
| SCN-05-b | US-05 | 通知バッジ | ユーザー A が `@yamada` をメンション | ユーザー B(yamada)でログイン | ベルアイコンにバッジが表示 | `tests/e2e/mention.spec.ts:30` | PASS |
| SCN-05-c | US-05 | 通知クリックでジャンプ | 通知一覧にメンション通知あり | 通知をクリック | 対象チャンネル・メッセージへ遷移し通知が既読 | `tests/e2e/mention.spec.ts:50` | PASS |
| SCN-06-a | US-06 | キーワード検索 | messages に「スタンドアップ」含む 3 件あり | Ctrl+K で検索モーダルを開き「スタンドアップ」Enter | 3 件の結果が降順で表示 | `tests/e2e/search.spec.ts:15` | PASS |
| SCN-06-b | US-06 | 0件検索 | - | 「xyzxyz未使用キーワード」で検索 | 「見つかりませんでした」表示 | `tests/e2e/search.spec.ts:30` | PASS |
| SCN-06-c | US-06 | 結果クリックでジャンプ | 検索結果あり | 結果の 1 件をクリック | 対象チャンネルへ遷移し該当メッセージ付近にスクロール | `tests/e2e/search.spec.ts:45` | PASS |

## バグ一覧
| # | 深刻度 | US ID | 再現手順 | 期待 | 実際 | 証拠 | ステータス |
|---|-------|-------|---------|------|------|------|----------|
| BUG-01 | MEDIUM | US-06 | 日本語キーワードで検索 | 結果が表示される | 結果 0 件 | screenshots/bug-01-jp-search.png | 修正済み(pg_bigm 導入) |
| BUG-02 | LOW | US-04 | WebSocket 切断後に再接続 | 未読件数が正しく表示 | 再接続直後に未読件数がリセットされる | logs/bug-02-ws-reconnect.txt | 既知問題・v0.0.2 対応 |

## テスト実行ログ
| 日時 | テスト | 結果 | 所要時間 |
|------|------|------|---------|
| 2026-05-24 09:15 | channel.spec.ts 全件 | PASS (5/5) | 12s |
| 2026-05-24 09:28 | message.spec.ts 全件 | PASS (4/4) | 18s |
| 2026-05-24 09:47 | unread.spec.ts 全件 | PASS (3/3) | 9s |
| 2026-05-24 10:02 | mention.spec.ts 全件 | PASS (3/3) | 11s |
| 2026-05-24 10:14 | search.spec.ts(日本語) | FAIL (1/3) | 8s |
| 2026-05-24 10:45 | pg_bigm 導入後 search.spec.ts | PASS (3/3) | 9s |
| 2026-05-25 14:00 | 全スイート再実行 | PASS (18/18) | 67s |

## AI が独自に決めたこと と 理由

### D-01 — Playwright を採用し実 DB で E2E を実行
- **理由**: S9 は mock 禁止(スキル仕様)。Docker Compose で test DB を立ち上げ、テスト後にクリーンアップするスクリプトを `tests/e2e/setup.ts` に配置。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — BUG-02(WebSocket 再接続時の未読リセット)を既知問題として v0.0.2 に持ち越し
- **理由**: LOW 深刻度かつ修正には WebSocket 再接続 API の設計変更が必要(S8 引き継ぎ参照)。v0.0.1 の基本フローには影響しない。
- **種別**: 事業判断(要 human-gate) → S10 で人間判断を求める

## 次サイクルへの引き継ぎ
- BUG-02(WebSocket 再接続時の未読リセット)は v0.0.2 の S1 で reconcile が必要
- pg_bigm のインストール手順を README に記載済み。次サイクルの Docker ベースイメージ変更時に注意
- 99+ 表示のシードデータ注入方法を `tests/e2e/fixtures/seed-unread.ts` に切り出した(次サイクルで再利用可)

# S3 — UI 設計確定(視覚意図のイメージ作り / 全体)

## メタ
- 工程: S3 (UI Design / Image)
- PhaseGroup: Design
- 役割: プロダクトデザイナー(視覚意図担当)
- バージョン: v0.0.1
- ステータス: 確定
- 入力参照: 画面要素(ワイヤーフレーム) SCR-01〜SCR-05
- 作成日: 2026-05-14
- 更新日: 2026-05-14

## 全体方針

### スタイル方向
- ダークモード優先のミニマルデザイン。Slack に慣れたエンジニアが違和感なく使えることを基準に、過度な装飾を排して情報密度を高める。

### カラー方針
- ベース: `#1a1d21`(深いチャコール)
- サーフェス: `#222529`(カード・サイドバー背景)
- アクセント: `#4a9eff`(送信ボタン・未読バッジ・アクティブチャンネル)
- 状態色: success `#2bac76`、warning `#e8a838`、error `#e8534a`、info `#4a9eff`
- テキスト: primary `#d1d2d3`、secondary `#8a8b8c`、inverse `#1a1d21`
- 階調数: neutral 9 段

### タイポグラフィ
- ファミリ: 本文 `Inter, "Hiragino Sans", sans-serif` / コード `"JetBrains Mono", monospace`
- スケール: チャンネル名 14px/medium、メッセージ本文 15px/normal、投稿者名 15px/semibold、タイムスタンプ 12px/normal、バッジ 11px/bold

### 余白リズム
- ベース: 4px
- スケール: xs=4px, sm=8px, md=12px, lg=16px, xl=24px, 2xl=32px

### Radius / Shadow / Motion
- radius: sm=4px(バッジ)、md=6px(入力欄・カード)、lg=8px(モーダル)
- shadow: モーダルに `0 8px 24px rgba(0,0,0,0.5)`
- motion: hover 100ms ease-out、モーダル open 150ms cubic-bezier(0.16,1,0.3,1) slide-up

## 画面一覧 (S2 の SCR と 1:1 対応)
- [SCR-01 メインレイアウト](./scr-01-main-layout.md) | [スクショ参照](./screenshots/scr-01-main-layout.default.png)
- [SCR-02 チャンネル作成モーダル](./scr-02-create-channel.md) | [スクショ参照](./screenshots/scr-02-create-channel.default.png)
- [SCR-03 チャンネルブラウザ](./scr-03-channel-browser.md) | [スクショ参照](./screenshots/scr-03-channel-browser.default.png)
- [SCR-04 通知一覧パネル](./scr-04-notification-panel.md) | [スクショ参照](./screenshots/scr-04-notification-panel.default.png)
- [SCR-05 検索モーダル](./scr-05-search-modal.md) | [スクショ参照](./screenshots/scr-05-search-modal.default.png)

## 視覚カタログ
- [デザイントークン](./tokens.md)

## 全体 質疑応答ログ

### Q-01 — ライトモードも用意するか?
- **回答**(人間の回答を AI が記入):
  > v0.0.1 はダークのみ。ライトモードは v0.0.2 以降。
- **確定**(AI 記入):
  > v0.0.1 はダークモード固定。

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — Inter フォントを採用
- **理由**: 多言語(英数字・日本語)の混在環境で可読性が高く、web フォントとして安定して使える。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## 棄却した案

### R-01 — glassmorphism スタイル
- **棄却理由**: チャットのように情報密度が高い画面では背景のぼかし表現がノイズになる。シンプルなフラットダークに統一する。

## 次工程への引き継ぎ
- S7/S8 が参照すべき screenshots と md の対応表: scr-01〜scr-05 の各状態(default/empty/loading/error)
- native 固有挙動でドメイン側に影響しそうな項目: なし(web アプリのみ)

---
name: aidlc-s3-ui-design
description: AI-DLC S3。S2 で確定した情報構造に対し、視覚意図(色 / タイポ / 余白 / 状態 / 階層 / 密度)を HTML イメージで作る。**HTML は実装テンプレートではなくイメージのリファレンス**。S7/S8 は screenshots/*.png + *.md だけ参照し、HTML/CSS コード構造は参照禁止。ユーザーが「UI 詰めたい」「見た目決めたい」「デザイン固めたい」と言ったとき、または s2/ が確定して s3/ がまだ無いときに呼ぶ。
---

# AI-DLC S3: UI 設計確定(視覚意図のイメージ作り)

## あなたの役割

あなたは **プロダクトデザイナー(視覚意図担当)** です。S2 のプロダクトデザイナー(情報構造担当)とは **別人格**。

S2 が固めた「画面で何を伝えるか / どんな情報構造か」を受けて、**「どう見える / どう感じる」**を視覚アウトカムで固めるのが責務。色・タイポ・余白・状態(default/hover/loading/empty/error)・階層・密度をデザイナーとして決め、HTML で **イメージとして** 表現する。

**最重要**: S3 の HTML は **視覚意図のリファレンス**であって、**コード移植元ではない**。S7/S8 は HTML を絶対に Read せず、HTML から生成された `screenshots/*.png` と コンポーネント仕様 `*.md` だけを参照する。

なぜそんな運用にするか — 過去 v0.0.1 で S6/S7 が UI を「実装しやすさ」「実機確認以外だから」を理由に独断で質素化した事故が起きたため。S3 を設けて視覚契約を先に固め、Construction 工程が **視覚アウトカム(色 / 余白 / 階層)を契約として受け取る** が、**実装テクニック(HTML タグ / CSS / Tailwind)は参照させない** という構造で防ぐ。

## PhaseGroup

- **Design** — 視覚契約・技術仕様を固める工程群(S3, S4)

## いまどこにいるか

- フェーズ: **Design** の S3
- 前: `aidlc-docs/{version}/s2/`(画面モック + 情報構造の Biz 合意済)
- 後: S4(Tech Spec, 任意)または S5(Work Units)
- **S5 着手時点で S3 が `確定` していること**が前提
- 関連参照: `[[aidlc-s3-image-only-contract]]` / `[[feedback-no-scope-cut-by-construction]]`

## 入出力と完了条件

| 項目 | 内容 |
|------|------|
| 入力 | `aidlc-docs/{version}/s2/index.md` と `s2/scr-NN-*.md` 群(全 SCR が `確定`) |
| 出力 | `aidlc-docs/{version}/s3/` 配下に下記 4 種:<br>① `index.md`(全体方針・Q&A・D)<br>② `tokens.html` + 1 SCR ごとに `scr-NN-{slug}.html`(視覚イメージ source)<br>③ 1 SCR ごとに `scr-NN-{slug}.md`(コンポーネント仕様 / native 固有挙動 / a11y / motion)<br>④ `screenshots/*.png`(`bun run s3:capture` で自動生成) |
| 完了条件 | (1) 全 SCR に html + md + screenshots が揃う / (2) tokens.html が `bun run s3:capture` で tokens.png として撮れている / (3) ユーザーがブラウザで html を見て視覚意図を承認 / (4) screenshots/ が最新の html と一致(古いキャプチャが残っていない) / (5) **触る US の binding/AC と矛盾しないか逆引き確認済**(矛盾あれば該当 US の確定記録を引用して整合 / operating-model「設計ステップの binding 逆引きゲート」) |

## 進め方

0. **最初に必ず**:
   - `aidlc-docs/{version}/s2/index.md` と `s2/scr-NN-*.md` を全件読む。各 SCR の「目的・主要要素・対応 US」を把握。
   - `aidlc-docs/{version}/s3/` が既にあれば中身を読む。`index.md` の引き継ぎセクションを最優先で反映。
   - 無ければ `aidlc-docs/{version}/s3/` を作り、テンプレで `index.md` を新規作成。
   - **以降の質疑応答は md 上で行う**: AI が `### Q-NN` を md に追記 → **ユーザーが IDE で md を直接編集して `回答` を書き込む** → AI が次のやり取りで `確定` を埋める。

1. **視覚方針の擦り合わせ**(`index.md` で集約):
   - スタイル方向(editorial / minimal / glassmorphism / bento / dark luxury など)
   - カラー方針(ベース / アクセント / 状態色 / 階調数)
   - タイポグラフィ方針(フォントファミリ × 2 まで / hero / body / caption の scale)
   - 余白リズム(8px ベース / 4px ベース など)
   - radius / shadow / motion の基本値
   - これらを `tokens.html` に視覚カタログとして並べる(色チップ / タイポサンプル / 余白サンプル / shadow サンプル)。

2. **1 画面 = 1 HTML ファイル**で起こす:
   - ファイル名: `scr-NN-{kebab-slug}.html`(S2 の SCR 番号と完全一致)
   - 同一画面の状態(default / hover / focus / loading / empty / error / disabled)は **同じ html 内に `data-state="..."` 属性付きの section で並列定義**(後段の Playwright がこれをセレクタにキャプチャ)
   - 例:

     ```html
     <section data-state="default" data-screen="scr-01-home">...</section>
     <section data-state="loading" data-screen="scr-01-home">...</section>
     <section data-state="empty" data-screen="scr-01-home">...</section>
     ```

3. **1 画面 = 1 コンポーネント仕様 md** を併設(`scr-NN-{slug}.md`):
   - native 固有挙動(iOS swipe / Android back / safe area / status bar / keyboard avoidance)
   - a11y(VoiceOver / TalkBack ラベル / focus order / 色コントラスト基準)
   - gesture(tap / long press / swipe / pan の意図)
   - motion(「200ms ease-out で fade-in」みたいに **文字で**書く / HTML の `transition` プロパティは参考にされない)
   - **これらは HTML では表現しきれないため md で明文化する**

4. **`bun run s3:capture` でスクリーンショット生成**:
   - `scripts/s3-capture.ts`(Playwright headless Chromium)が `.html` の `data-state` section ごとに `screenshots/{scr-name}.{state}.png` を書き出す
   - `tokens.html` も `screenshots/tokens.png` として撮る
   - 撮影前に古い screenshots を全削除(古い html と新しい html の混在を防ぐ)

5. AI が独自に決めたパレット・タイポ・余白・状態網羅などは **`index.md` または該当 `scr-NN-*.md` の「AI が独自に決めたこと と 理由」に `### D-NN` で追記**。ユーザーは `判断` で `承認 / 上書き / 保留` を選ぶ。

6. Biz レビューはブラウザで html を開いてもらって視覚承認を取る(screenshots だけだと細部が潰れるため source 確認は人間 OK / S7/S8 だけ html を見ない)。

7. 完了条件 4 つが全て埋まったら `index.md` のステータスを `確定` にして S4(任意)または S5 を案内。

## 成果物テンプレート

### `aidlc-docs/{version}/s3/index.md`

```markdown
# S3 — UI 設計確定(視覚意図のイメージ作り / 全体)

## メタ
- 工程: S3 (UI Design / Image)
- PhaseGroup: Design
- 役割: プロダクトデザイナー(視覚意図担当)
- バージョン: vX.Y.Z
- ステータス: 進行中 | レビュー待ち | 確定
- 入力参照: [s2/index.md](../s2/index.md)
- 作成日: YYYY-MM-DD
- 更新日: YYYY-MM-DD

## 全体方針

### スタイル方向
- 例: editorial / minimal / glassmorphism / bento / dark luxury

### カラー方針
- ベース:
- アクセント:
- 状態色(success / warning / error / info):
- 階調数(neutral 9 段 / 11 段 など):

### タイポグラフィ
- ファミリ(本文 / 見出し):
- スケール(hero / h1 / h2 / body / caption / micro):
- 行間 / 字間方針:

### 余白リズム
- ベース(4px / 8px):
- スケール(xs / sm / md / lg / xl):

### Radius / Shadow / Motion
- radius:
- shadow:
- motion(基本 duration / easing):

## 画面一覧 (S2 の SCR と 1:1 対応)
- [SCR-01 {タイトル}](./scr-01-{slug}.html) | [仕様](./scr-01-{slug}.md) | [スクショ](./screenshots/scr-01-{slug}.default.png)
- ...

## 視覚カタログ
- [tokens.html](./tokens.html) — ブラウザで開く
- [tokens.png](./screenshots/tokens.png) — スクショ

## 全体 質疑応答ログ

### Q-01 — {問いの本文}
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  >

---

## 全体 AI が独自に決めたこと と 理由

### D-01 — {決定の内容}
- **理由**:
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

---

## 棄却した案

### R-01 — {案の内容}
- **棄却理由**:

## 次工程への引き継ぎ
- S7/S8 が参照すべき screenshots と md の対応表:
- native 固有挙動でドメイン側に影響しそうな項目:

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか:
- 暫定の解決方針:
- 棄却した案とその理由:
```

### `aidlc-docs/{version}/s3/tokens.html` の骨子

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <title>tokens — S3 視覚カタログ</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: { /* 意図のあるカラートークン */ },
            spacing: { /* 余白スケール */ },
            fontFamily: { /* ファミリ */ },
          }
        }
      };
    </script>
  </head>
  <body class="p-8 space-y-12 bg-white text-neutral-900">
    <section data-state="colors">...</section>
    <section data-state="typography">...</section>
    <section data-state="spacing">...</section>
    <section data-state="radius-shadow">...</section>
    <section data-state="motion">...</section>
  </body>
</html>
```

### `aidlc-docs/{version}/s3/scr-NN-{slug}.html` の骨子

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <title>SCR-NN: {画面名}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="p-0 m-0 bg-neutral-50">
    <!-- 状態ごとに section を並列定義 / Playwright がこれを撮る -->
    <section data-state="default" data-screen="scr-NN-{slug}" class="min-h-screen">
      <!-- デフォルト状態の画面 -->
    </section>
    <section data-state="loading" data-screen="scr-NN-{slug}" class="min-h-screen">
      <!-- ローディング状態 -->
    </section>
    <section data-state="empty" data-screen="scr-NN-{slug}" class="min-h-screen">
      <!-- 空状態 -->
    </section>
    <!-- 必要に応じて error / disabled / focused なども -->
  </body>
</html>
```

### `aidlc-docs/{version}/s3/scr-NN-{slug}.md`(コンポーネント仕様)

```markdown
# SCR-NN: {画面名} — コンポーネント仕様

## メタ
- 親: [s3/index.md](./index.md)
- 視覚 source: [scr-NN-{slug}.html](./scr-NN-{slug}.html)(人間レビュー用 / S7/S8 は Read 禁止)
- スクショ:
  - [default](./screenshots/scr-NN-{slug}.default.png)
  - [loading](./screenshots/scr-NN-{slug}.loading.png)
  - [empty](./screenshots/scr-NN-{slug}.empty.png)
- 対応 S2 SCR: [SCR-NN](../s2/scr-NN-{slug}.md)
- 対応 US: [US-NN](../s1/us-NN-{slug}.md)
- ステータス: 進行中 | レビュー待ち | 確定

## native 固有挙動
- safe area:
- status bar:
- keyboard avoidance:
- iOS swipe back / Android back:
- pull-to-refresh:

## a11y
- VoiceOver / TalkBack ラベル:
- focus order:
- 色コントラスト基準(WCAG AA/AAA):

## gesture
- tap:
- long press:
- swipe:
- pan / drag:

## motion
- 例: 200ms ease-out で fade-in / 300ms cubic-bezier(0.16, 1, 0.3, 1) で slide-up
- **HTML の `transition` プロパティは参考にされない**。motion 意図はここに文字で書く

## この画面固有の 質疑応答ログ
### Q-01 — {問いの本文}
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  >

---

## この画面固有の AI が独自に決めたこと と 理由
### D-01 — {決定の内容}
- **理由**:
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

---

## この画面固有の 棄却した案
### R-01 — {案の内容}
- **棄却理由**:
```

## やってはいけないこと

- S2 を読まずに画面イメージを描く
- HTML を「実装が楽になる構造」で書く(視覚アウトカムの再現性が最優先 / DOM 構造は S7/S8 が参照しないので最適化しない)
- 配色 / 階層 / 余白を tokens なしのインライン値で書く(変更時に追えなくなる)
- 状態(loading / empty / error / disabled / focused)を default だけ描いて省略する → 状態網羅性が S7/S8 実装契約の質を決める
- 1 ファイルに 10 画面まとめて書く(画面 = 1 HTML を守る)
- screenshots/ を gitignore する(差分レビュー対象に含める)
- 古い screenshots を放置したまま `.html` を変更する → `bun run s3:capture` 前に全削除
- **このスキルから S7/S8 に「HTML を Read していい」と示唆する**(契約の根幹を壊す)

## やり直しの判断

- **S2 に戻る**: 情報構造そのものに不足 / 矛盾が見つかった(画面要素の追加・統合・削除が必要)
- **S1 に戻る**: そもそも US の網羅が足りない / 認識ずれが視覚化して初めて見えた(まれだが起きる)
- **このまま S3 で書き直す**: 視覚方針の方向性が違った(スタイル選定 / カラー方針の練り直し)

戻る際は対象 md 末尾の **前サイクルからの引き継ぎ** に 1〜3 行で書く(全量コピーしない):

- 何が漏れていたか
- 暫定の解決方針
- 棄却した案とその理由

PDF P.10「コンテキスト管理の原則」より、**情報量より質**。**前サイクルのコンテキストは全量引き継がない**。

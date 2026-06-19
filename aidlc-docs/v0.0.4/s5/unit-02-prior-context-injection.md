# Unit-02: 前段文脈注入

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-01](../s1/us-01-prior-artifact-context.md)
- 由来: carried #3 / S4 C5・D-04(解決ロジック + 絞り規則)
- Phase: 1(leaf / 独立)
- ステータス: 確定(2026-06-13 / 評価 AI レビュー)

## 責務 (1〜2 行)
step 起動時に、当該サイクル `aidlc-docs/{version}/` の **done 済み前段 step の index + 直接依存成果物**を解決し、[`PromptComposer`](../../../src/app/services/prompt-composer.ts) の `contextPaths` に渡す(解決ロジックは app/engine 側)。トークン肥大時は段階縮退し、欠落は可視マーカで黙らせない(原則④)。

## 外部依存
- なし(leaf)。`PromptComposer.compose` は既に `ComposeInput.contextPaths?` を受け取り、未指定時 brief.md に既定する(調査済)。本 Unit は**呼び出し側の配線**のみで composer 内部は変えない(US-01 D-01: composer は受け取るだけ)。
- 触る既存箇所: [engine-service.ts](../../../src/app/services/engine-service.ts) の `artifactPaths()`(現状 `[]` を返すスタブ)/ run 起動時の launch context 構築([cycle-service.ts](../../../src/app/services/cycle-service.ts) `persistThenLaunch`)。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| `resolveContextPaths(cycle, step)` | 当該 cycle + 着手 step | `string[]`(解決済 path) | path 不在 → 可視マーカ(`※ 前段文脈が見つかりません`)を合成 prompt に残す(欠落を黙らせない) |
| step→必要前段 宣言マップ | step 定義 | 必要前段 step 集合 | step 個別ハードコード禁止(US-01 AC) |

- **絞り規則**(S4 C5/D-04): 既定 = 各前段 step `index.md` 全件 + 当該 step が直接依存する成果物本体。閾値超過時は段階縮退「直前 step は index+主要成果物 / それ以前は index のみ」。

## この Unit 固有の 質疑応答ログ

### Q-01 — (なし)
- 絞り規則は S4 D-04 で確定。解決を app/engine に置く点も US-01 D-01 で確定。新規 Biz 判断なし。

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — step→必要前段 を宣言的マップで持つ(個別 if 分岐にしない)
- **理由**: US-01 AC「解決ロジックが個別ハードコードでない」。canonical step 集合に対し「この step は直前まで done 全部 + 直接依存成果物」を宣言で表すと、step 追加時にマップ 1 行追加で済み分岐が散らからない。
- **判断**: AI 裁量で確定(責務契約①: 内部コード設計 / 2026-06-13 評価 AI レビュー)。ユーザー上書き希望時は随時反映。
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — 過去版(別サイクル)成果物も文脈に含める
- **棄却理由**: 文脈汚染・トークン肥大。サイクル内に閉じる(過去版横断は Wiki/ledger の役割 / US-01 R-01・S4 D-04)。
</content>

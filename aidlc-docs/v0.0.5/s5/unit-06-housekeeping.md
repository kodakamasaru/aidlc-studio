# Unit-06: housekeeping(独立小修正)

## メタ
- 親: 作業単位の一覧
- 所属 US: [US-06](../s1/us-06-scripted-jp-placeholder.md), [US-07](../s1/us-07-multiturn-allowed.md), [US-08](../s1/us-08-thread-badge.md), [US-09](../s1/us-09-dead-code-stepconfig.md)
- ステータス: 確定

## 責務 (1〜2 行)
相互依存のない 4 件の独立小修正を一括で捌く: scripted レビュー summary 日本語化 / server.ts allowed に multi-turn 追加 / 会話スレッドのバッジ整合(run→review) / dead code(StepConfigPage.tsx)削除。

## 外部依存
- なし(leaf)。各修正は独立。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| US-06 | scripted fixture | summary 文言を日本語化(live 不変) | — |
| US-07 | src/server.ts | allowed 配列に "multi-turn" 追加(happy fallback 解消) | — |
| US-08 | web 会話スレッド | レビュー emit 後バッジを review トークンへ(S3 SCR-02 視覚契約) | — |
| US-09 | web/src | StepConfigPage.tsx 削除(build/tsc/playwright green) | 参照残存 → ビルド失敗で検出 |

## この Unit 固有の 質疑応答ログ
(未解決 Q なし)

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — 4 件を 1 Unit に束ねるが US 単位の検証は個別に行う
- **理由**: 並行開発単位としては 1 Unit(index D-01)だが、各 US の AC は個別に満たす(US-08 は S3 視覚契約、US-09 は build green 等)。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この Unit 固有の 棄却した案
(なし)

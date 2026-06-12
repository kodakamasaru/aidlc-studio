# Unit-03: PromptComposer 新設 & live prompt 実合成

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-03](../s1/us-03-live-prompt-from-skill.md)
- Phase: 2(クリティカルパス)
- ステータス: 確定

## 責務 (1〜2 行)
app 層に **PromptComposer を新設**(現状コード不在)し、live prompt を「スキル本文 + StepDef.contracts + brief/前段成果物」から契約どおり合成。`live.ts` の 1 文スタブ `defaultBuildPrompt` を composer 呼び出しへ差し替える。

## 外部依存
- **Unit-02** の skillRef→実 dir 解決を呼ぶ(スキル本文の場所特定)。
- ファイル読み出しポート。**⚠ 現状 `Fs` ポート(`app/ports/sys.ts`)は `exists()` のみで本文 read 不可**。本 Unit のスコープに **`Fs.read(path)` の追加(+ fake/adapter 更新)or 新規 FileReader ポート**を含む(infra 直読みを避け hexagonal を保つため)。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| (拡張)`Fs.read(path)` 追加 | path | ファイル内容(文字列) | 不在/読取失敗はエラー(現状 `exists` のみ。本 Unit で追加) |
| `PromptComposer.compose` | `role`(generator\|evaluator), `step`, cycle 文脈(brief/前段成果物 path, StepDef.contracts) | 合成済み prompt 文字列(Core 常時 + Step Payload 遅延の2層) | スキル dir 不在は**明示エラー**(silent fallback 禁止) |
| `live.buildPrompt`(差し替え) | `RunLaunch` | composer 由来の prompt | 同上 |

## 不変条件
- gen と eval で別 payload(S4 §3.3)。
- スキル本文取得は Unit-02 の skillRef 実 dir 解決経由のみ(live が独自に dir 名を組まない)。
- `bun test:live` は加算層([[real-ai-tests-additive]])。決定的スイートは composer の合成結果(3 source 含有)を fixture で検証。

## この Unit 固有の 質疑応答ログ
### Q-01 — 合成契約 doc の置き場(operating-model に恒久ルール / scope の design ノートに cycle 固有)
- **回答**(ユーザー記入):
  > 
- **確定**(AI 記入):
  > (暫定: 合成順序・所有は operating-model、payload の cycle 固有部は実装。S4 D-02。)

---

## この Unit 固有の AI が独自に決めたこと と 理由
### D-01 — PromptComposer は app 層 + Fs ポート経由(net-new と明示)
- **理由**: 合成は副作用(ファイル読み)を伴うユースケースなので app。スキル本文は Fs ポート経由で読み hexagonal を守る。現状不在のため新設 1 Unit(S4 CRITICAL 反映)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

### D-02 — `Fs` ポートに read を追加(現状 `exists` のみ)を本 Unit のスコープに含める
- **理由**: S5 評価 AI 指摘。現 `Fs` は存在検査のみ(`sys.ts:27`)で本文を読めない。composer が「Fs ポート経由で読む」を成立させるには read 能力の追加が前提。infra 直読みにすると hexagonal 違反になるため、ポート拡張を U03 に含める。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ): 

---

## この Unit 固有の 棄却した案
### R-01 — スキル本文全文を常に prompt に注入
- **棄却理由**: 2層(Core 常時 + Step Payload 遅延)に反しコンテキスト浪費。必要層だけ要求する。

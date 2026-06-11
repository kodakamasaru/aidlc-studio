# Unit-05: Completeness Gate & Descope ポリシー

## メタ
- 親: [s5/index.md](./index.md)
- 所属 US: [US-03](../s1/us-03-completeness-gate.md)(E)
- Phase: Phase 4
- レイヤ: `app/services/`(決定的ポリシー)+ `domain/task/`(backlog 化)
- ステータス: 確定

## 責務 (1〜2 行)
evaluator が `CompletenessBlock.addressed` に書いた **判断**の差分を **決定的に処理**する app 層ポリシー。理由なし gap は自動差し戻し、AI の理由付き見送り申請のみ HumanTask 化、承認で `domain/task`(backlog)へ自動化。全 gap 解消まで Step を done にしない(hard gate / 原則#2・#6 / S4 §3.5)。

## 外部依存
- **Unit-03**: evaluator の `CompletenessBlock`(requirements ↔ addressed)・gen→eval 往復・`OrchestratorPort.retry`(自動差し戻し)。
- 既存: `domain/task/`(Task 集約)・`task-repo`・`domain/question/`(descope 申請 = HumanTask)・cycle/SCR-02・SCR-05 の判断 UI。

## I/F 定義 (この Unit が公開する契約)

| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| `evaluateCompleteness(block)` | `CompletenessBlock` | `{ gaps: Req[] }`(requirements − addressed の差分) | — |
| descope policy | gaps + AI 見送り申請(理由) | 下表の分岐(差し戻し / descope HumanTask / done 許可) | 理由なし見送りは発生させない |
| 「見送る」承認 | requirement | `domain/task` に backlog Task 自動化(不可逆 → 確認あり) | — |
| 「前のステップからやり直す」 | gap 原因 | AI が **推奨ステップ + 理由**を提示(固定でない) | — |

**ポリシー分岐(決定的)**:

| 状況 | 挙動 | 人間に出るか |
|---|---|---|
| gap あり / 見送り申請なし | evaluator fail → generator 自動差し戻し | 出ない |
| AI が理由付きで見送り申請 | descope HumanTask 発火(理由必須) | 出る |
| gap ゼロ | Step done 許可 | — |

- 人間の選択肢: **つくる(差し戻し)/ 見送る(backlog 化)/ 後回し(backlog deferred)/ 前のステップからやり直す**。

## 主な AC(US 由来)
- 理由なし gap は人間に出さず自動差し戻し。理由付き申請のみ descope HumanTask。
- 「見送る」承認 → backlog Task 自動化(確認あり)。全 gap 解消まで Step done にしない。
- E2E で「理由なし gap→自動差し戻し」「AI 申請→人間判断→backlog/再実行/やり直し」両フロー pass。

## この Unit 固有の 質疑応答ログ

### Q-01 — 「前のステップからやり直す」の推奨ステップ判定は決定的 policy か AI か
- 提案: gap 原因の **意味解釈**は AI(evaluator)が推奨ステップ+理由を出す。policy は提示と分岐の手続きだけ決定的に持つ(判断=AI / 処理=決定的の分離 / S4 D-04)。
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  >

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — 「判断」は AI、「処理」は決定的 policy に分離する
- **理由**: S4 D-04。requirement が満たされたかは意味解釈なので evaluator が `addressed` に書く。差分→差し戻し/descope/backlog 化の手続きは決定的でないと漏れる。責務を分ける。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

### D-02 — descope 承認を backlog Task に自動化する(原則#6 の記録)
- **理由**: US-03 D-01。人間が「落とす」を選んだ requirement を忘却から守る。将来サイクルで再検討可能にし、人間判断なしに descope しない原則の証跡にする。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

---

## この Unit 固有の 棄却した案

### R-01 — gap を必ず人間に投げる(旧 S1 案)
- **棄却理由**: US-03 D-03(S3 反映)。受信箱が溢れる。理由なし gap は AI が自分で作り直し、人間には理由付き見送りだけ届ける。

# 集約: Facts(確定事項 / AI 不変・人間は版付き編集可)

## メタ
- 親: [s5/index.md](./index.md)
- 対応 US: [US-17](../s1/us-17-decision-history.md)(+ [US-12](../s1/us-12-answer-question.md)/[US-13](../s1/us-13-visual-review-step.md)/[US-14](../s1/us-14-backtrack-ai-initiated.md)/[US-15](../s1/us-15-backtrack-human-initiated.md) の回答時に追記)
- 所属 Unit: [Unit-03](../s3/unit-03-human-inbox.md)
- ステータス: 確定
- MVP: ◎(回答時に追記される。通覧 UI = US-17 は v0.0.x)

> **旧称 Decision**。AI-DLC の各 md にある「確定」(Q への確定回答・D 決定)をドメイン化したもの = **確定事項(Fact)**。人間の判断が確定した瞬間の append-only 記録。Wiki / Ledger の源泉。

## モデル定義 (DDD 採用)

**集約ルート**: `Fact`(確定した判断。**AI からは不変・人間からは版付きで編集可**。集約 = 1 Fact + その版履歴)

```
Fact (集約ルート)
 ├─ id: FactId
 ├─ questionId: QuestionId    // 由来の Question(ID 参照)
 ├─ cycleId: CycleId          // どの Cycle の確定事項か(ID 参照)
 ├─ source: ai | human        // 起票元(AI 回答記録 か 人間起票か)
 ├─ confirmedAt: Instant      // 初版の確定時刻(ISO-8601 / 順序の基準)
 ├─ currentVersion: int       // 有効な版(= revisions の最新)
 └─ revisions: FactRevision[] // 版履歴(append-only。編集で 1 版増える)

FactRevision (版 / 不変・追記のみ)
 ├─ version: int              // 1 始まり
 ├─ verdict: Verdict          // approve | reject | answer | confirm
 ├─ statement: Text           // 何が確定したか(確定の本文)
 ├─ reason: Text?             // なぜそう決めたか(reject/backtrack は必須)
 ├─ editedBy: ai | human      // 初版は答えた経路、以降の編集は human
 └─ at: Instant               // この版の時刻
```

> 値オブジェクト `Verdict` は [question.md](./question.md) と共有(共有 types 層)。
> **有効な確定 = `revisions[currentVersion]`**。過去版は不変で残り、US-17 の追跡に使う。

## 操作

| 操作 | 入力 | 出力 / 効果 | エラー |
|------|------|------|--------|
| append | { questionId, cycleId, verdict, statement, reason? } | Fact(version 1, source=回答経路) | EmptyReasonOnReject |
| editFact(人間のみ) | { factId, statement?, reason?, verdict? } | 新 FactRevision(version+1, editedBy=human)。旧版は不変保持 | NotHumanEditor / EmptyReasonOnReject |
| listByCycle | { cycleId } | Fact[](有効版 = currentVersion / confirmedAt 昇順) | — |
| listByQuestion | { questionId } | Fact[] | — |
| getHistory | { factId } | FactRevision[](全版・時系列) | FactNotFound |

> 初版生成は `answerQuestion`(Question)/ `requestBacktrack` からのみ。**AI 経路に `editFact` / `delete` は無い**(AI は append のみ)。`editFact` は**人間操作専用**で、旧版を消さず新版を積む。

## 不変条件
- **INV-1(版は append-only)**: `revisions` は追記のみ。**既存の FactRevision は決して書き換え・削除されない**(US-17「なぜそう決めたかを辿る」= 履歴の真実)。「編集」は新しい版を積む操作であって、過去版の破壊ではない。
- **INV-2(AI は不変・人間は版付き編集可)**: **AI は Fact を append するのみ**で `editFact`/`delete` を持たない。**人間のみ `editFact` で新版を作れる**(editedBy=human、version+1)。有効な確定 = `revisions[currentVersion]`。
- **INV-3**: 手戻り(backtrack)も**新しい Fact として積む**(別 Question 由来の別 Fact)。Fact の「編集」(同一 Fact の版追加)とは区別する。
- **INV-4**: `verdict` が `reject`(手戻り含む)のとき `reason` 必須(初版・編集版とも)。
- **INV-5**: 他集約(Question / Cycle)は **ID 参照**のみ。Fact は自分の整合性(版の追記性)だけを守る。
- **INV-6(源泉)**: Ledger(外部記憶)の持ち越し entry や Wiki の facts section(確定事項)は、この Fact の**有効版**を源泉として AI が再生成する(Fact が真実、Wiki/Ledger は投影)。人間が editFact で確定を直すと投影も追従する。

## この集約固有の 質疑応答ログ

### Q-01 — Facts を独立集約(Question と別)にする境界でよいか?
- 観点: Question は `open→answered/dismissed` で可変、Fact は別集約(index D-03 / Q-02)。append-only にすべきか、人間編集を許すか。
- **回答**(ユーザー記入):
  > AI側からは不変、人間側は変えられた方が良い場面もありそう → フォローQで「人間は直接編集可(バージョン付)」を選択
- **確定**(AI 記入):
  > **AI は append-only(不変)/ 人間は版付きで編集可**で確定。Fact は `revisions[]`(append-only)を持ち、初版は回答経路が積む。**`editFact` は人間専用**で新版(version+1, editedBy=human)を積み、旧版は不変保持(US-17)。有効な確定 = 最新版。Wiki/Ledger 投影は有効版を源泉に再生成(人間編集に追従)。Question との別集約は維持。

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — Facts を独立集約にし「AI 不変 / 人間版付き編集可」にする(旧 Decision を確定事項として昇格)
- **理由**: S3 D-02「Decision は append-only」を踏まえつつ、ユーザー指摘「AI からは不変・人間は変えたい場面がある」を反映。Fact を版履歴(`revisions[]` append-only)で持ち、AI は積むだけ、人間のみ `editFact` で新版を積める。これで「人間が確定を直せる」かつ「過去版は壊さない(US-17)」を両立。ユビキタス言語は AI-DLC の「確定」に合わせ **Facts(確定事項)** に改名(Q-02)。可変な Question に内包しない(整合性境界が別)。
- **判断**(ユーザー記入): 承認(Q-01 + フォローQ で確定)
- **上書き内容**(上書き時のみ):

### D-02 — Fact(各版)に `statement`(何が確定したか)を持たせる
- **理由**: 旧 Decision は verdict/reason のみで「結局何が真実になったか」が読み取りにくかった。`statement`(確定の本文)を加えると、Wiki の確定事項 section や ledger entry を Fact の有効版から機械生成しやすく、US-17 の通覧も「何が・なぜ」で読める。人間の `editFact` はこの statement/reason/verdict を新版で直す。
- **判断**(ユーザー記入): 承認(Q-01 確定に同梱)
- **上書き内容**(上書き時のみ):

---

## この集約固有の 棄却した案

### R-01 — Fact を完全 append-only にし、人間の修正も「新しい別 Fact を積む」だけにする
- **棄却理由**: ユーザーが「人間は直接編集できる方がよい」を選択。別 Fact を積むと「どれが有効な確定か」が曖昧になり通覧が煩雑。同一 Fact の**版追加(editFact)**で「編集」を表し、有効版 = 最新・過去版は不変保持とする方が UX と監査性を両立できる(INV-1/2)。

### R-02 — Fact を素朴に in-place 上書き(版を残さない)
- **棄却理由**: 履歴が壊れ US-17(なぜそう決めたか追跡)が成立しない。編集は必ず版を積み、旧版を不変で残す。

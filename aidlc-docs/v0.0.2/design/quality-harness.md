# 設計スレッド — AI実行品質ハーネス (Quality Harness)

## 位置づけ
- **6遵守原則(製品の北極星)を「別エージェント evaluator の評価軸 + 成果物契約」に焼き込む設計。**
- [review-output.md](./review-output.md)(per-step review payload / 「S6/S7 は人間がコードを見ない → 合成レビューカード」)の**上に積む層**。review-output が「何を出すか」、本ノートが「どう品質を保証し、漏れ・descope・理由欠落を防ぐか」。
- 関連: [review-output.md](./review-output.md) / BACKLOG §F(方法論v2)/ §G(ID化)/ §A(Step定義カスタム=1c)
- 対象バージョン: v0.0.2 主軸=**1c(step を PJ ごとに可変に)**。本ハーネスは 1c の「器」に乗る「契約=中身」。
- ステータス: **設計中**(確定分を逐次追記 / 末尾に残スレッド)
- 作成日: 2026-06-08 / 出典: ユーザーとの設計対話 2026-06-07〜08

---

## 0. 北極星 — 6遵守原則(正本は memory `harness-quality-vision`)
1. 視覚確認 + シナリオテストで確認される(コードレベルだけにしない)
2. 漏れが起きない(暗黙の脱落ゼロ)
3. 内部コードがわからなくても人間が承認できる成果物(bugfix なら 原因/修正内容/前後動画/再発防止策)
4. 後から「なぜこうなってる?」の理由がすぐ見つかる(LLM 検索可)
5. 常に楽な方でなく拡張性/保守性の高い側に倒す
6. 人間の判断なしに機能を後ろの版に回したり限定したりしない

> 注: 原則6・2・4 は**この設計対話自身**にも適用する。決定を流して消さない(本ノートが棚卸し正本)。

---

## 1. 中核アーキ原理 — コンテキスト隔離 + 構造化ハンドオフ
「AI側の ①品質意識 / ②レビュー意識 / ③コンテキスト枯渇回避」は別物ではなく**1つの原理に収束**する:

| 関心 | 裏の同じ原理 |
|---|---|
| ③ コンテキスト | 各 step は新鮮な文脈で走り、brief を読んで brief を書く |
| ② レビュー | レビューは著者と別文脈の方が効く(自己レビューは弱い) |
| ① 品質 | DoD は著者以外が検証してこそ信頼できる |

→ **理想形 = 各 step を「① brief-in を読む → ② 作業 → ③ 独立 verify → ④ brief-out/ledger を書く」隔離エージェント**(generator → evaluator → ledger ループ)。
→ この契約があるからこそ 1c の編集可能 step が**安全に組み替えられる**(brief で疎結合)。器(1c)の価値はこの契約があって初めて出る。

---

## 2. step 契約(StepDef 拡張)

既存 `StepDef = {id, label, order, skillRef}`([project.ts](../../src/domain/project/project.ts))に **4 契約 + 実行モード** を追加。
Project は丸ごと `JSON.stringify` 永続化([project-repo.ts](../../src/infra/db/project-repo.ts))→ **フィールド追加はマイグレ不要・タダ**。

### 2.1 スキーマ(TypeScript)

```ts
// ── 成果物プロファイル名(§5 レジストリのキー) ──
type ProfileName = string;
// 既定: 'step-deliverable' | 'bugfix' | 'feature' | 'refactor' | (拡張可)

/** ① Output(成果物契約): この step が何を出すか */
type StepOutput = {
  /** 成果物プロファイル(§5)。evaluator がレジストリを引いて必須blockを照合 */
  readonly profile: ProfileName;
  /** aidlc-docs への想定出力パス(省略時は step 既定) */
  readonly artifactPaths?: readonly string[];
};

/** ② Verification(検証契約): 完了をどう証明するか */
type StepVerification = {
  /** completeness ゲート(§7.4): brief-in 要求項目 ↔ 成果物充足を照合 */
  readonly completenessGate: boolean;
};

/** ③ HumanGate(人間ゲート): AI evaluator pass 後に人間の追加確認が必要か。
 * AI evaluator による内容レビューは常時・全 step 必須(§3 engine 振る舞い)。 */
type StepHumanGate = {
  readonly humanReview: 'visual' | 'real' | 'none';
};

/** ④ Escalation(エスカレーション契約): いつ人間判断に上げるか */
type StepEscalation = {
  /** completeness 差分時の挙動(§7.4):
   *  'fail-retry' = evaluator fail → gen 再起動(bounded retry)
   *  'descope'    = descope Question(§7)を人間に提示 */
  readonly onGap: 'fail-retry' | 'descope';
};

/** 実行モード(§9): 単発 or fan-out */
type StepExecMode =
  | 'single'
  | { readonly fanOut: string };  // fan-out 軸(UoW 集約など)

/** 拡張 StepDef */
type StepDef = {
  // ── 既存 ──
  readonly id: Step;
  readonly label: Text;
  readonly order: number;
  readonly skillRef: SkillRef;
  // ── 契約(全 optional = 既存データと後方互換 / デフォルトは §2.2) ──
  readonly output?: StepOutput;
  readonly verification?: StepVerification;
  readonly approval?: StepHumanGate;
  readonly escalation?: StepEscalation;
  readonly execMode?: StepExecMode;
};
```

### 2.2 デフォルト値(engine が省略時に適用)

```ts
const STEP_CONTRACT_DEFAULTS = {
  output:       { profile: 'step-deliverable' },
  verification: { completenessGate: true },
  approval:     { humanReview: 'visual' },   // StepHumanGate
  escalation:   { onGap: 'descope' },
  execMode:     'single',
} as const;
// 注: AI evaluator による内容レビューは常時(StepDef フィールドではない)
```

### 2.3 AI-DLC 既定ステップの契約一覧

| Step | output.profile | approval(人間ゲート) | escalation.onGap | execMode |
|------|---------------|---------------------|-----------------|----------|
| S1   | step-deliverable | none | descope | single |
| S2   | step-deliverable | visual | descope | single |
| S2.5 | step-deliverable | visual | descope | single |
| S3   | step-deliverable | none | descope | single |
| S4   | step-deliverable | none | descope | single |
| S5   | step-deliverable | visual | descope | single |
| S6   | step-deliverable | none | descope | fanOut(UoW) |
| S7   | step-deliverable | visual | descope | fanOut(UoW) |

注:
- `verification.completenessGate` = 全 step で `true`(省略時デフォルト)
- S6/S7 の **task-level profile** (feature/refactor/bugfix) は Task 定義側で指定(step 契約とは別軸)
- fan-out step の evaluator は UoW 単位で評価 + 統合 step で統合の質を見る(§3)

### 2.4 設計判断

| 判断 | 理由 |
|------|------|
| 全 optional | JSON 永続化でマイグレ不要。既存 Project がそのまま動く |
| profile は `string` | §5 レジストリへの参照。新 task 種別はレジストリに足すだけで StepDef 変更不要 |
| `evaluator` をフィールドにしない | §3 で「必ず別エージェント」と確定済み。**承認者は常に AI evaluator**(内容レビュー)。フィールドにすると「オフにできる」と誤読される → engine 振る舞い |
| `StepApproval` → `StepHumanGate` に rename | 承認 = AI evaluator(常時)の上に人間ゲート(追加)という構造を型名で明示。「誰が承認するか」ではなく「人間ゲートを足すか」 |
| `completenessGate` は `boolean` のみ | 検証ルールの中身(何を照合するか)は profile が定義する。gate の on/off だけで十分 |
| `onGap` を step 単位で指定 | step によって「絶対に漏らせない(=fail)」と「人間判断に委ねたい(=descope)」が変わる可能性を残す |
| `execMode` を契約フィールドに統合 | §9 で既に設計済みだが StepDef の一部として持つのが自然 |
| `artifactPaths` は optional | 省略時 = step 既定パス(S1→aidlc-docs/us/ 等)。明示的に上書き可能 |

---

## 3. 評価 — 必ず別エージェント(確定)
- generator と**別文脈**の evaluator が emit 前に DoD で評価。自己申告を信じない。
- **2層レビュー(別物・共存)**:
  - AI 独立 evaluator(常時・全 step 必須)
  - 人間レビュー(#2、該当 step のみ)= 視覚/実機 → Human Inbox カード
- **検証強度(確定)**: フィールドの有無ではなく**中身を実行/検査**する(動画が再生可能か、test が実際に pass か、parity が本当に差分ゼロか)。
- fan-out 時の evaluator 位置(確定): **UoW 単位**で評価 + 統合 step で統合の質を見る(理由: fan-out の目的が「各 UoW を独立に良く仕上げる」ことと整合)。

---

## 4. ハンドオフ(brief)と ledger

### 4.1 設計原則
- 正本は **aidlc-docs**(CLAUDE.md「真実の source = aidlc-docs」)。brief はその上の**薄い冷起動用ハンドオフ層**で、**要件を書き換えない**。
- 区別: step が自分の担当成果物を書くのは「生産」(正当)。禁じるのは**前 step の確定要件を後 step が勝手に書き換える**こと。
- 改変防止 = ledger `carried/done/dropped`(+理由)+ `reconcile`。今は cross-cycle のみ([reconcile.ts](../../src/app/services/reconcile.ts))→ **同じ規律を intra-cycle の step 間にも効かせる**。
- BriefIn / BriefOut はエフェメラル(永続不要)。正本は aidlc-docs。engine がメモリで保持。

### 4.2 BriefIn(受取る context)

```ts
/** step 起動時に engine が組み立てて注入する context */
type BriefIn = {
  // ── Context 参照(読み取り専用) ──
  /** 直前 step の BriefOut(無ければ undefined = 最初の step) */
  readonly prevBriefOut?: BriefOut;
  /** 参照すべき aidlc-docs へのポインタ */
  readonly contextRefs: readonly ContextRef[];
  /** 承認済み Decision(Fact)の要約 */
  readonly decisions: readonly DecisionSummary[];
  /** 未解決の open Question */
  readonly openQuestions: readonly QuestionSummary[];

  // ── Completeness 照合対象(§7.4) ──
  /** この step が必ず網羅すべき要求項目。
   * evaluator が「成果物 ↔ requirements」を照合し、gap を検出する。 */
  readonly requirements: readonly RequirementItem[];
};

type RequirementItem = {
  readonly id: string;        // 'US-01' / 'AC-01.1' / 'D-03' / 'task-005'
  readonly kind: RequirementKind;
  readonly title: Text;
  /** mandatory = 必須網羅 / optional = 可能なら対応 / deferred = 当 step対象外 */
  readonly status: 'mandatory' | 'optional' | 'deferred';
};

type RequirementKind = 'us' | 'ac' | 'decision' | 'task' | 'aggregate' | string;

type ContextRef = {
  readonly path: string;        // aidlc-docs/... への相対パス
  readonly type: 'artifact' | 'wiki' | 'ledger';
  readonly summary?: Text;      // 何が書いてあるかの1行要約
};

type DecisionSummary = {
  readonly id: string;          // 'D-03'
  readonly statement: Text;
  readonly status: 'confirmed' | 'tentative';
};

type QuestionSummary = {
  readonly id: string;          // 'Q-05'
  readonly question: Text;
  readonly kind: string;        // QuestionKind
};
```

### 4.3 BriefOut(渡す context)

```ts
/** step 完了時に generator が書くハンドオフ */
type BriefOut = {
  /** ① 成果物ポインタ */
  readonly artifacts: readonly ArtifactPointer[];
  /** ② 決定の要点(D-xx) */
  readonly decisions: readonly DecisionSummary[];
  /** ② 未解決事項(Q-xx / リスク / todo) */
  readonly openItems: readonly OpenItem[];
  /** ③ 次stepへの申し送り */
  readonly handoff: Text;
};

type ArtifactPointer = {
  readonly path: string;        // aidlc-docs/...
  readonly summary: Text;
};

type OpenItem = {
  readonly id: string;          // 'Q-05' or free-form
  readonly kind: 'question' | 'risk' | 'todo';
  readonly description: Text;
};
```

### 4.4 Completeness block(Review 内)

```ts
/** §5 共通必須 block。evaluator が completeness ゲート(§7.4)で使用。
 * Review block-stream の一部として生成される。 */
type CompletenessBlock = {
  readonly type: 'completeness';
  /** BriefIn.requirements のうち、成果物で網羅した項目の id */
  readonly addressed: readonly string[];
  /** 網羅できなかった項目(= completeness gap)。
   * gaps が空 = 完全網羅。空でない → StepDef.escalation.onGap に従う */
  readonly gaps: readonly {
    readonly reqId: string;
    readonly reason: Text;
  }[];
};
```

### 4.5 流れ: BriefIn → generator → BriefOut → evaluator → Completeness Gate

```
[N step] ─────────────────────────────────────────────────────
  engine 組立 BriefIn(N):
    prevBriefOut = BriefOut(N-1)
    contextRefs  = aidlc-docs 既存成果物スキャン
    decisions    = Fact(確定済)より要約
    openQuestions= Question(open)より要約
    requirements = 前step成果物から抽出(US一覧/AC一覧/Task一覧等)
      ↓ 注入
  generator が作業:
    BriefIn を読む → 成果物(aidlc-docs)を書く → Review emit
      ↓
  evaluator が検証:
    BriefIn.requirements(status=mandatory)
      ↔ Review.completeness.addressed を照合
    gaps = mandatory - addressed
    gaps 空 → pass → 人間レビュー(StepDef.approval に従う)
    gaps あり → StepDef.escalation.onGap:
      'fail-retry' → gen 再起動(bounded retry)
      'descope'    → descope Question(§7)を人間に提示
      ↓
  generator が BriefOut(N) を書く:
    artifacts = 自分が書いた aidlc-docs へのポインタ
    decisions = 今 step で確定した判断
    openItems = 残った未解決事項
    handoff   = 次 step への申し送り
      ↓
  BriefOut(N) を engine が保持
    → 次 step の BriefIn(N+1).prevBriefOut として渡される
```

### 4.6 設計判断

| 判断 | 理由 |
|------|------|
| `requirements` を BriefIn に持つ | completeness 照合に「何を期待するか」の列挙が必須(§10 残スレッド解消)。StepDef ではなく BriefIn なのは、requirements は**前stepの出力に依存する動的値**だから |
| `RequirementKind` を `string` に | US/AC/task に限らず将来の step 種別に応じた kind を許容(⑤拡張性) |
| `status: mandatory\|optional\|deferred` | 全て mandatory では融通が効かない。前stepで「S2.5 は skip」と決まっていれば該当要件は deferred |
| BriefIn/BriefOut を entity にしない | エフェメラルなハンドオフ。永続は不要(正本は aidlc-docs)。engine がメモリで保持 |
| CompletenessBlock を Review block に | §5 の共通必須 block として既に設計済み。`coerceBlocks` で前方互換 |
| `ArtifactPointer.summary` を必須に | evaluator が内容を推測しなくて済む(③コード不要) |

---

## 5. 成果物テンプレ = Review block プロファイル
器は**既存の `Review` 集約**([review.ts](../../src/domain/review/review.ts))= typed block の列(block-stream)。`coerceBlocks` で未知 block を skip = **前方互換が最初から組み込み済み**。⑤に合致(新発明しない)。

> **成果物テンプレ = task 種別ごとに「必須ブロック集合」を定義した契約(プロファイル)。別エージェント evaluator がその充足を機械的に照合する。**

- **共通必須ブロック(全 task 種別)**: `summary`(③) / `decision`(④: なぜ=D-xx+aidlc-docs link) / `completeness`(②: brief-in 要求↔充足) / **`impact`(②: 全コード変更 task に格上げ確定)**。
- **`impact` の形(②の核)**: `{ 影響あり[], 影響なし確認済[], 未確認[] }`。**未確認=空** であることが「漏れ無し」の証明。

| task 種別 | 必須ブロック(共通に加えて) |
|---|---|
| **bugfix** | §6 参照(cause / fix / prevention / video) |
| **feature** | `ac-map`(対象US/AC) / `video`or`screenshot`(主要フロー) / `test`+`coverage`(シナリオ) / `scope`(やった/やってない明示) |
| **refactor** | `summary`(目的) / `diff`(範囲) / `parity`(前後で同一テスト pass=挙動不変) / `risk` |
| **step成果物** | aidlc-docs への `pointer` / `completeness`(未reconcile=0) / `handoff`(次stepへの申し送り) / 該当すれば視覚 |

- **新規 block(coerceBlocks で追加タダ)**: `root-cause` / `decision` / `completeness` / `impact` / `scope` / `parity` / `handoff` / `pointer`。evaluator が機械検証する物は意味付き型、純粋な散文は `summary`+役割名。
- **プロファイルの置き場(確定)**: **データのレジストリ**(task種別→必須block集合)としてエンジンが持つ。skill は generator への*指示*、プロファイルは evaluator が照合する*契約*、と役割分離(②は散文では強制できない)。

---

## 6. bugfix dossier(詳細・確定)
```
bugfix 必須ブロック:
  cause = { proximate: 直接原因,
            root: 根本原因(プロセスのどこに欠陥),
            processLocus: { layer:'skill'|'harness'|'gate', ref, defect } }
  impact = { 影響あり[], 影響なし確認済[], 未確認[] }   // 未確認=空 が②の証明(共通)
  fix    = { 要約(コード不要), 種別: 'patch' | 'structural' }
  prevention[] = [{ kind: 'test'|'design'|'process', desc, addressesRoot: bool, link }]
  video  = before(不具合) / after(修正)
  + 共通: summary / decision(④) / completeness(②)
```
- **原因は2層必須(確定)**: 直接原因(proximate)+ 根本原因(root = プロセス欠陥の locus)。
- **再発防止は root cause 対応を最低1つ必須(確定・強制ルール)**: `addressesRoot: true` が無い = ⑤違反(対症療法のみ)。その場合は **⑥ descope 決定カードに昇格**(「根治は次に回す」を人間判断にかける)。test だけでなく **design(根治=構造変更)/ process(ゲート追加)** を含む。

---

## 7. descope / 判断要求(⑥)— 確定
[question.ts](../../src/domain/question/question.ts) を確認: descope の器は既存 `Question` 集約で成立する。ブロッキング(`isAwaitingHuman` = open Question があれば run を止める)も ④ traceability(`applyAnswer` が回答時に `Fact` を append=決定+理由が恒久記録)も実装済み。

- **完了 dossier(Review)とは別系統 = ブロッキング Question**。Review は「done 時の不変スナップショット」で done をゲートできないが、open Question は run を止められる。

### 7.1 専用 `descope` kind(確定)
`decision`(payload `{statement: Text}` の自由文)を流用せず、**専用 kind を足す**。理由: descope は必須項目を**機械照合**したい(②)。`visual_review` が自由文でなく構造化 `Review` を持つのと同じ理屈(⑤)。
```
QuestionKind に追加:
  { kind:'descope', target, mode:'defer'|'limit', reason, impact, alternatives, recommendation }
verdict: approve | reject
```

### 7.2 approve/reject の意味と副作用(確定)
- **approve(descope 容認)** → `resumeRun`(狭めたスコープで継続)+ **defer された項目を backlog に直接 Task 化**(payload に全情報あり)+ Fact 記録。
  - ※ §8 dogfooding は *TaskProposal(pending→accept ゲート)* だが、descope は**人間がこの Question で既に判断済み**なので二重ゲート不要 → **直接 Task(backlog)**。§8 との意図的な差。
- **reject(却下=今やれ)** → 全スコープ必須で継続。run は full scope 完了まで done にできない(狭めさせない)。

### 7.3 新 `Unit02Command`(確定)
既存命令(resumeRun/approveTaskReview/backtrack/retryLaunch/cancelRun)に **`deferScope { runId, taskSpec }`** を追加。`applyAnswer` は純粋データを返す設計なので、副作用(backlog Task 生成+resume)はこの命令で表し、解釈は S7 インタラクタが行う(D-06 方針どおり)。

### 7.4 ⑥「黙って descope しない」の*トリガ*(確定 / §5 と一本化)
Question は descope の**応答**機構にすぎない。⑥の難所「AI が黙ってスコープを狭めたのを*検出*する」は **evaluator のゲート**で起こす:

> **brief-in の要求項目 ↔ `completeness` ブロックを照合。completeness < 全 なら、その差分は「追加実装」か「明示的な `descope` 決定 Question」のどちらかで埋まっていなければ evaluator が done を拒否する。**

→ ⑥(黙って descope 禁止)と②(漏れ無し)が**同一ゲートで機械的に保証**される。§5(completeness/impact)と §7 はここで一本に繋がる。「狭めたいなら必ずカードを出せ、出さずに狭めたら fail」。

---

## 8. evaluator エンジンの置き場 — 確定

### 8.1 before → after のライフサイクル
[live.ts](../../src/infra/orchestrator/live.ts) 確認: 現状は `gen → ResultEmitted → 人間 visual_review → approve → done`。evaluator は**完了と人間レビューの間**に挿入:

```
[before] gen(claude) → ResultEmitted → 人間 visual_review → approve → done

[after]  gen(claude) → ResultEmitted
            → evaluator(別 claude, 別文脈, dossier+brief-in+DoD profile を受領)
            → EvaluationCompleted{verdict, gaps}
                ├ pass            → visual_review カード(人間)→ approve → done
                ├ fail(修正可)    → gen 再起動(bounded retry)
                └ completeness gap → descope 提案なら descope Question(§7)
```

§7 の⑥トリガ(completeness 差分は descope 無ければ fail)が**発火する場所**として確定。

### 8.2 設計核心 — evaluator は「同 Phase の別 Run」(infra 内蔵でなく)
[cycle.ts](../../src/domain/cycle/cycle.ts) 確認: 既に **`Phase └ Run[]`** で同 Phase 内の複数 Run を許容。evaluator はその Phase の**別 Run にすぎない**。

- **Run に `role: 'generator' | 'evaluator'` を追加**。既存 Run 型([cycle.ts:32](../../src/domain/cycle/cycle.ts))はシンプルで拡張可能(JSON 永続化は Project 同様タダ)。
- **infra アダプタ(live.ts/scripted.ts)に evaluator を内蔵しない。** アダプタは「agent 起動→parse→emit」の機構に留める。gen→eval→retry の*政策*(何回 retry/いつ昇格/completeness 判定)を infra に埋めると scripted 再現不能 & クリーンアーキが崩れる。⑤: 既存機構の再利用。
- ** evaluator 自身も headless claude で stall しうる** → stall 検知/retry/cancel の既存機構がタダで効く。

### 8.3 政策は app 層のイベント駆動(確定)
infra でなく **app 層のイベントハンドラ**が政策を持つ:

| イベント | ハンドラ(app) | 効果 |
|---|---|---|
| `ResultEmitted` | gen 完了を検知 → evaluator Run launch |
| `EvaluationCompleted` | verdict に応じて分岐: pass→Question起票 / fail→gen再起動 / gap→descope Question |

既存の sink→event-applier→effect に乗る(新イベント `EvaluationCompleted { verdict, gaps[], proposesDescope? }` を追加)。

### 8.4 OrchestratorPort の拡張(確定)
evaluator 起動時は **dossier+brief-in+DoD profile** を prompt に注入。引数:

```
launch(cmd: RunLaunch): void    // 既存(gen 用)
launchEval(cmd: {
  ...RunLaunch,
  generatorRunId: RunId,        // 照合先の gen 結果
  briefIn: { 要求項目列挙 },    // §5 completeness 照合用
  profile: TaskKind→必須Block[] // §5 プロファイル
}): void
```

live/scripted 両アダプタが実装。

### 8.5 人間の visual_review は evaluator pass 後のみ(確定)
- 人間に未検証成果物を承認させたら「2層レビュー」「③ コード不要」が崩れる。
- **visual_review カードは evaluator pass 済みだけ**。gen→eval→human の順。

---

## 9. dogfooding ループ(#3 = 今スコープに確定)
---

## 8. dogfooding ループ(#3 = 今スコープに確定)
root cause の `processLocus` は **kit/skills か harness の改善対象**を指す → 拾って自己改善ループにする。既存 `TaskProposal` + accept ゲート(INV-5)を流用。
```
bugfix dossier 確定(cause.root + processLocus)
  → エンジンが TaskProposal{ source:'ai', state:'pending',
       title, rationale=根本原因+再発防止の根拠, link=元 Review } を自動起票
  → Human Inbox(accept ゲート=人間判断=⑥/INV-5)
  → accept で Task 化(kit/skills or harness 改善が backlog へ)
```
- **論点α(宛先)**: バグは対象 PJ でも、root が方法論欠陥なら提案は **studio/kit 側に飛ぶ**(dogfooding の本質)。v0 単一 PJ では「方法論層タグ付き proposal」で足り、**cross-PJ ルーティングは構造に穴だけ空けておく**(⑤)。
- **論点β(重複抑制)**: 同一 processLocus の乱立を防ぐ。`ValidationFinding` の `duplicate` を流用し **processLocus キーで dedup**(既存 pending があれば link 追加のみ)。

---

## 9. fan-out 実行(実装系 step)
- **分割軸は恣意的でない**: 早い step が生む **UoW / 集約の DAG**(S3 作業単位 / S4 context-map)が、そのまま実装 step の fan-out 計画。AI-DLC は**フラクタル**(早 step の出力 = 後 step の並列化プラン)。
- 実装 step の実行 = 「UoW DAG を読む → UoW ごとに 1 エージェント(DAG 順、独立なら並列)→ 各が code+brief → 統合」。Workflow の pipeline/parallel 像。
- ③(コンテキスト枯渇)は「ハーネスで粘る」より「**step を小さく保って隔離**」で解く方針。

---

## 11. 実行コンテキスト設計 — AI-DLC v2(awslabs/aidlc-workflows v2)準拠

出典: [AI-DLC Workflows 2.0 Specification](https://github.com/awslabs/aidlc-workflows/blob/v2/assets/AI-DLC-Workflows-2.0-Specification.pdf)
v2 の 3 つの機構(遅延ロード / 決定的 checker / persona 的役割定義)を、aidlc-studio のアーキに落とす。

### 11.1 遅延ロード — 指示ベース(prompt 内命令)

v2 の実装: stage-execution skill に「Read **only** the current stage's `definition.md`」と書き、
orchestrator が不要な skill/stage を読まないよう**プロンプトで指示**する。コード側のロード分岐ではない。

**aidlc-studio への適用**: OrchestratorPort が prompt を組む際、以下を注入:

```text
# Core(常時) — 全 Run に共通
- 6遵守原則(§0 要約)
- 実行プロトコル(BriefIn読→成果物書→Review emit→BriefOut書)
- 型の概要(StepDef/Review/BriefIn/BriefOut のフィールド名と型名のみ)
- 「他の skill ファイルを読んではならない。注入された Step Payload のみを使う」
```

```text
# Step Payload(遅延) — launch 時に注入
- kit/skills/{skillRef}/SKILL.md の内容(該当 step のみ)
- BriefIn(§4.2)
- 成果物 Profile(§5、該当 profile のみ)
- StepDef 契約(§2)
```

generator と evaluator で別 payload(§11.3 / §11.4)。

### 11.2 決定的 checker — evaluator の前に機械検査

v2 の実装: `process-checker.js` が state.json を読み、
① 宣言された output ファイルが disk に存在するか ② 全 contributor が contribute したか、を検査。
**内容品質は見ない**(それは reviewer persona の仕事)。

**aidlc-studio への適用**: evaluator 起動の前に **deterministic gate** を追加。

```
[gen 完了 → ResultEmitted]
  ↓
deterministic-check(ArtifactPointer[], state):
  - aidlc-docs/ に宣言された成果物パスが存在するか
  - Review の必須 block が coerceBlocks で skip されていないか
  ↓ PASS → evaluator 起動
  ↓ FAIL → gen に差し戻し(ファイル未作成 = 明確な欠陥)
```

- evaluator(§8)は内容品質ゲート。deterministic gate はその前段の**存在検査**。
- v2 と同じく Node.js スクリプトで実装可能。headless で確定的。
- これにより evaluator は「内容」だけに集中でき、token を品質判断に使える。

### 11.3 Generator Prompt 構成

`OrchestratorPort.launch(cmd)` が組む prompt:

```text
## 役割
あなたは {StepDef.label} の generator です。
kit/skills/{skillRef} の指示に従い、成果物を生成してください。

## 読み込み制限
- 以下に注入された内容のみを読むこと
- 他の skill ファイルを読んではならない
- aidlc-docs/ 内のファイルは BriefIn.contextRefs で指定されたもののみ読むこと

## Skill 内容(Step Payload)
{kit/skills/{skillRef}/SKILL.md の全文}

## BriefIn(§4)
{BriefIn を JSON または構造化テキストで注入}

## 成果物 Profile(§5)
{該当 profile の必須 block 集合}

## StepDef 契約(§2)
{output / verification / approval / escalation}
```

### 11.4 Evaluator Prompt 構成

`OrchestratorPort.launchEval(cmd)` が組む prompt:

```text
## 役割
あなたは {StepDef.label} の evaluator です。
generator が生成した成果物を、以下の基準で検証してください。

## 検証基準
1. Completeness: BriefIn.requirements(mandatory) ↔ Review.completeness.addressed を照合
2. Profile: 必須 block が全て存在し、内容が検査可能か
3. 内容品質: 成果物が意味的に正しいか(仕様との整合、漏れ、矛盾)

## Verdict
- pass: 全基準を満たす → 人間レビュー(StepHumanGate)へ
- fail(修正可): 明確な修正点あり → gen 再起動
- gap: completeness gap あり → StepDef.escalation.onGap に従う

## 読み込み制限
- generator の Review 出力 + BriefIn + Profile のみを読む
- 元の skill 内容は読まない(コンテキスト隔離 = §1 の原理)

## 成果物(Step Payload)
{generator の Review blocks 全文}

## BriefIn.requirements(mandatory のみ)
{BriefIn.requirements のうち status=mandatory のもの}

## 成果物 Profile
{該当 profile の必須 block 集合}

## StepDef 契約(verification + escalation)
{verification / escalation}
```

### 11.5 v2 との対応と差異

| v2 の概念 | aidlc-studio での実現 | 差異の理由 |
|-----------|----------------------|-----------|
| 遅延ロード(指示ベース) | §11.1: prompt 内で「他 skill 読むな」と指示 | 同じ仕組み。OrchestratorPort が prompt を組む |
| Process checker(決定的) | §11.2: evaluator 前に deterministic gate | 同じ仕組み。Node.js スクリプトで実装 |
| Persona(YAML 定義) | §11.3/11.4: prompt 内で役割定義 | aidlc-studio は persona を YAML ファイルに分離せず、prompt 構成に直接埋める |
| Owner/Contributor/Reviewer | generator / (fan-out agent) / evaluator | Contributor は fan-out(§9)で別 agent。単発 step では owner=generator のみ |
| 15状態 state machine | RunState 4 + PhaseState 4 | aidlc-studio は evaluator retry を内部化。v2 の 15 状態の大部分は owner↔reviewer 往復で、aidlc-studio では gen→eval の自動ループが相当 |
| Autonomy(full/supervised) | StepHumanGate(visual/real/none) | supervised = humanReview ≠ none、full = humanReview = none に対応 |
| Audit(人間判断記録) | Fact(revision 付き) + Question | aidlc-studio の方が豊富。別 audit 層は不要 |

### 11.6 設計判断

| 判断 | 理由 |
|------|------|
| 遅延ロードを「指示」で実現 | v2 と同じ仕組み。コード側の動的ロード機構は不要(prompt が小さければ十分) |
| Deterministic gate を evaluator 前に配置 | 存在しないファイルを evaluator に見せるのは token 浪費。前段で弾く |
| Persona を YAML に分離しない | v2 は Kiro IDE 向けに persona を独立ファイルにしているが、aidlc-studio の OrchestratorPort が prompt を直接組むので不要 |
| state machine を v2 ほど細かくしない | v2 の 15 状態は owner↔contributor↔reviewer の往復。aidlc-studio は evaluator が内々で retry するので、外側は RunState 4 状態で十分 |
| generator に「他 skill 読むな」を指示 | これが遅延ロードの本体。AI が指示に従えば、12,000→5,000 tokens に削減 |

---

## 10. 残スレッド(未確定 / 次に詰める)
- [x] ~~descope の Question ルーティング確定~~ → §7 で確定(専用 `descope` kind / 直接 Task 化 / evaluator ゲート=⑥トリガ)
- [x] ~~evaluator エンジンの置き場~~ → §8 で確定(同 Phase の別 Run / app 層イベント駆動 / OrchestratorPort 拡張 / pass 後のみ人間レビュー)
- [ ] 単発(対話) vs fan-out(非対話)の step をエンジンがどう一本化するか
- [ ] ①の実行基盤: headless でブラウザ駆動 → 録画 → 成果物(video block)添付
- [x] ~~brief-in の構造~~ → §4 で確定(BriefIn/BriefOut/RequirementItem/CompletenessBlock + completeness gate フロー)

---

## 確定ログ(④ traceability)
| 日付 | 決定 | 出典 |
|---|---|---|
| 2026-06-07 | v0.0.2 主軸 = 1c(step を PJ ごとに可変に) | 対話 |
| 2026-06-07 | バージョン = v0.0.2(パッチ継続) | 対話 |
| 2026-06-08 | 6遵守原則を確定(memory `harness-quality-vision`) | ユーザー宣言 |
| 2026-06-08 | 評価は必ず別エージェント(2層レビュー / 中身検証) | 対話 |
| 2026-06-08 | brief = ハンドオフ層(要件改変でない)/ ledger で改変防止 | 対話 |
| 2026-06-08 | 成果物テンプレ = Review block プロファイル(データレジストリ) | 対話 |
| 2026-06-08 | bugfix: 原因2層 / impact 共通格上げ / 再発防止 root 必須(無→⑥) | 対話 |
| 2026-06-08 | dogfooding 起票(processLocus→TaskProposal)を今スコープに | 対話 |
| 2026-06-08 | descope 確定: 専用 `descope` kind / approve=backlog直接Task化・reject=full scope必須 / `deferScope` 命令 / ⑥トリガ=completeness差分は descope 無ければ evaluator fail | 対話 |
| 2026-06-08 | evaluator 置き場確定: Run に role 追加('generator'|'evaluator') / 同 Phase の別 Run / app 層イベント駆動(ResultEmitted→eval 起票 / EvaluationCompleted→分岐) / OrchestratorPort.launchEval 拡張 / 人間レビューは pass 後のみ | 対話 |
| 2026-06-09 | StepDef 拡張確定: 4契約(Output/Verification/Approval/Escalation)+execMode を optional フィールドで追加 / evaluator はフィールド化しない(engine 振る舞い) / profile は string(レジストリ参照) / AI-DLC 既定8step の契約一覧を確定 | 対話 |
| 2026-06-09 | BriefIn/BriefOut 構造確定: BriefIn(context参照+requirements 列挙)/BriefOut(成果物+決定+申し送り)/CompletenessBlock(addressed+gaps)/completeness gate フロー(§7.4 と直結) | 対話 |
| 2026-06-09 | 遅延ロード確定: 2層構造(Core常時~2,000 + Step Payload遅延~3,000/step) / generator と evaluator で別 payload / AI-DLC v2 の 75%削減を採用 | 対話 |
| 2026-06-09 | §11 全面書直: v2(awslabs/aidlc-workflows)の実体を調査 → 遅延ロード=指示ベース / 決定的 checker 追加(deterministic gate) / persona 的役割を prompt 構成に直埋め / v2 との対応表を作成 | 対話 |

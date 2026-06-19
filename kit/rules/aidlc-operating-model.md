# aidlc-studio — リポジトリ運用 (AI-DLC v2)

このリポジトリは **AI-DLC(AI と人間が協調する開発プロセス) v2** で開発する。
4 層構造(Cycle > PhaseGroup > Step > Run)× 12 Step(S1-S12)で進行。**AI は生成・提案 + 開発内部判断は自走。人間が判断するのは事業判断(US/mock 契約・受け入れ・スコープ・descope・優先度)のみ**(精密な定義は下記「AI 開発部 ⇄ 事業部 の責務契約」)。

一次資料はリポ直下の `AIと人間が協調する開発プロセス.pdf`(13 ページ)。
各スキルに要点は埋め込み済みなので、通常運用で PDF を直接読む必要はない。

## 基本姿勢(全工程で共通)

1. **事業判断は人間 / 開発内部判断は AI 自走** — 受け入れ・US/mock 契約・スコープ・descope・優先度は人間が最終判断。開発内部の技術判断(命名・分割・実装手段・テスト戦略・調査の進め方)は AI が自走で決め、`D-NN` に記録して事後 double-check。**human-gate でない所で手を止めない**(下記 責務契約②)。
2. **AI 出力は叩き台** — 「AI が言った」前提で遠慮なく否定する。
3. **手戻りを恐れない** — 前に進むことで考慮漏れが早く見つかる。手戻りはコストではなく品質への投資。
4. **出力の質より対話の質** — 問いの立て方が成果を左右する。
5. **コンテキストの質を保つ** — 情報量より質。次のステップに必要な情報のみ引き継ぐ(全量は渡さない)。
6. **方法論の改善は必ず platform 側にも反映する(全工程・常時 / v0.0.4 ユーザー指摘)** — このリポは「方法論(kit/)」と「それを headless 実行する platform(src/ / orchestrator/ / web/)」の2面を持つ。**片面(kit テキスト)だけ直して「直した」としない**。どの工程でも、方法論・契約・規約を変えたら必ず ⓐ **到達**: それが composer の注入経路(`responsibility-contract.md` / `aidlc-operating-model.md` / `SKILL.md` 本文)に乗り live プロンプトへ実際に届くか(非注入ファイルへのリンク参照は headless に届かない / live は sandbox kit コピーゆえ再同期要 [[verify-test-resyncs-kit]])、ⓑ **能力**: そのルールが platform 側のコード(ゲート/検証/配線)を必要とするなら、テキストだけで終えず platform に対応能力を持たせる(無ければ次サイクル US 化 = Rule E)、の2点を確認する。「テキストは行動を変えない、構造が変える」(P36)を全工程に効かせる。

## AI 開発部 ⇄ 事業部 の責務契約(最上位・全工程 binding)

> **正本は [`responsibility-contract.md`](./responsibility-contract.md)。** 本体はそこにあり、ここでは複製しない。
> 全工程・全 Step を貫く最上位の行動規範(①相手は内部コードを知らない / ②止まってよいのは human-gate だけ / ③done=納品できる状態 / ④US と mock が最上位契約)。**他のルール・スキルと衝突したらこれが勝つ。出力前に必ず 4 ゲートを通す。**

## 階層構造

```
Cycle (実行単位 ≒ 1 バージョン)
  └ PhaseGroup (大区分: Discovery / Design / Build / Validation / Improvement)
      └ Step (S1-S12 / 各 Step が 1 つの SKILL.md に対応)
          └ Run (1 回の Agent 起動 / state: running | stalled | done | failed + retry)
```

- 現行 3 層(Cycle > Phase > Run)から **PhaseGroup を新設**、旧 Phase を Step にリネーム。
- PhaseGroup は Step のグルーピングのみで、実行順序は Step 番号(S1→S12)に従う。

## PhaseGroup × Step 一覧

### Discovery (要件を発見する)

| Step | スキル | 役割 | やること | 成果物 |
|------|--------|------|----------|--------|
| S1 | `aidlc-s1-requirements` | プロダクトディスカバリーリード | プロダクト発見(3 必須質問 + brief.md 生成) + US 展開(3 視点) | `aidlc-docs/brief.md`(全版共通) + `aidlc-docs/{vX}/s1/`(index + 1 US 1 ファイル) |

### Design (設計を固める)

| Step | スキル | 役割 | やること | 成果物 |
|------|--------|------|----------|--------|
| S2 | `aidlc-s2-wireframe` | プロダクトデザイナー(情報構造) | 画面/フローで Biz とすり合わせ(意図と情報構造) | `aidlc-docs/{vX}/s2/`(index + 1 画面 1 ファイル) |
| S3 | `aidlc-s3-ui-design` | プロダクトデザイナー(視覚意図) | 視覚アウトカム(色/タイポ/余白/状態/階層/密度)を HTML イメージで作成 + screenshot 生成 | `aidlc-docs/{vX}/s3/`(index + tokens.html + 1 画面 = .html + .md + screenshots/) |
| S4 | `aidlc-s4-tech-spec` | ソフトウェアアーキテクト | 技術スタック・アーキテクチャ方針の確定(**任意**) | `aidlc-docs/{vX}/s4-tech-spec.md`(単一ファイル、省略可) |

### Build (実装する)

| Step | スキル | 役割 | やること | 成果物 |
|------|--------|------|----------|--------|
| S5 | `aidlc-s5-work-units` | ソフトウェアアーキテクト | 並行開発単位(Unit)と I/F 定義 + 依存 DAG + 着手順 | `aidlc-docs/{vX}/s5/`(index + Unit DAG + 1 Unit 1 ファイル) |
| S6 | `aidlc-s6-domain-model` | ドメインモデラー | ドメインモデル設計(DDD/非DDD) | `aidlc-docs/{vX}/s6/`(index + 1 集約 1 ファイル) |
| S7 | `aidlc-s7-domain-code` | ドメインエンジニア | 純粋ドメインコード(技術非依存) | `src/domain/` + `aidlc-docs/{vX}/s7-domain-code.md` |
| S8 | `aidlc-s8-integration` | アプリケーションエンジニア(統合) | 実 PJ アーキへの統合 | `src/` 配下 + `aidlc-docs/{vX}/s8-integration.md` |

### Validation (検証する)

| Step | スキル | 役割 | やること | 成果物 |
|------|--------|------|----------|--------|
| S9 | `aidlc-s9-scenario-validation` | QA エンジニア | E2E/シナリオテスト + 視覚証拠(モック禁止) | `aidlc-docs/{vX}/s9-validation.md` |
| S10 | `aidlc-s10-human-acceptance` | プロダクトマネージャー(人間主役) | US ごとの最終承認/差し戻し | `aidlc-docs/{vX}/s10-acceptance.md` |

### Improvement (改善する)

| Step | スキル | 役割 | やること | 成果物 |
|------|--------|------|----------|--------|
| S11 | `aidlc-s11-retrospective` | プロセスアナリスト | サイクル振り返り(品質/リスク/手戻り分析) | `aidlc-docs/{vX}/s11-retrospective.md` |
| S12 | `aidlc-s12-workflow-improvement` | メソドロジーエンジニア | StepDef/契約の改善提案 + 次サイクル改善項目 | `aidlc-docs/{vX}/s12-improvement.md` |

### PhaseGroup 間の依存

- Discovery(S1) → Design(S2) は直列
- S3 は S2 確定後に開始し、S5/S6 と **並行可能**(視覚意図と集約設計は独立検討可)。ただし S7 着手の時点で S3/S6 の両方が `確定` していることが前提
- S4(tech-spec)は任意。複雑なプロジェクトでのみ省略せず実施
- Build(S5-S8)は直列。S5→S6→S7→S8
- Validation(S9-S10)は S8 完了後に直列
- Improvement(S11-S12)は S10 完了後に直列

### S3 と S7/S8 の境界(極めて重要)

- **S3 = 視覚意図のリファレンス(イメージ作り)**。HTML はその表現手段に過ぎず、コード移植元ではない。
- **S7/S8 がイメージ参照するのは `screenshots/*.png` と コンポーネント仕様 `*.md` のみ**。`*.html` / `tokens.html` の **Read は禁止**(HTML/CSS コード構造のリーク防止)。
- S7/S8 はゼロベースでネイティブ idiom で実装する。HTML から机上で移植しない。
- トークン値(色 hex / spacing px / type rem)は **意図の言語化** として記録に残るが、S7/S8 で literal にコピーする義務はない — 実装側で同じ視覚アウトカムを自然に表現する。

## 設計ステップの binding 逆引きゲート(S3/S4/S6 / v0.0.3 S11 BT-1 起因の恒久ルール)

設計系ステップ(**S3 / S4 / S6**)は、確定の**前に**「自分が触る US の binding/AC と矛盾しないか」を**逆引きで**確認する。矛盾があれば、該当 US の確定記録(S1 の AC / binding)を引用して整合させてから確定する。整合できない(= US 側が間違っている)なら、勝手に設計判断で上書きせず upstream(S1)に Q として戻す。

- **なぜ**: v0.0.3 で S6 が「ステップラベルは web に置く」と設計判断したが、これは US-02 の binding(単一 constant が id×平易ラベル×skillRef を持つ機械可読正本)と矛盾し、S8 実装中まで顕在化せず手戻り(BT-1)になった。設計が確定要件を逆引きしない構造が原因。
- **どこで**: 各 SKILL.md の完了条件に 1 項目として追加済。設計判断を進行ログに残すときは「どの US の binding/AC と照合したか」を併記する。

## サイクル scope.md の必須内容(v0.0.3 S11 改善 #1/#3 / 恒久ルール)

サイクルのチャーター `aidlc-docs/{vX}/scope.md`(成果物 step ではないが、サイクル冒頭で固定する)は、次の 2 つを必ず含める:

1. **ユーザー明示の追加制約**セクション — AC には現れないがユーザーが会話で握った制約(例: 「S8 内で実 claude 貫通まで」)を**サイクル冒頭で明文化**する。S9/S10 のレビュー突合インベントリは AC と並べてこれを必ず潰す(突合側のルールは「自動レビュー pipeline」§ に既出)。
   - **なぜ**: v0.0.3 で US-04/05 は AC 上は合格だったが、ユーザー明示指示に未達で S10 却下(BT-2③)。AC だけのレビューでは構造的に検出不能だった。
2. **「貫通」等の達成語の定義** — live/実 AI を扱うサイクルでは、成功基準に出てくる「貫通」が**どの run を指すか(生成 / 評価 / screenshot)**を列挙し、各々 partial 許容か・本サイクル必達かを事前にユーザーと握る。
   - **なぜ**: v0.0.3 で「実 claude 貫通」が生成 run のみか評価 run まで含むか曖昧で、却下の主因になった。

## live prompt 合成契約(US-03 / 恒久ルール)

live(実 Claude headless)を起動するときのプロンプトは、**3 source を決まった順序・所有で合成**する(`app/services/prompt-composer.ts` = 唯一の合成器)。1 文スタブで起動しない。

**3 source(順序 = 上から)**:
1. **Core(常時)** — role(generator|evaluator)+ AI-DLC 工程の同一性。所有 = composer。
2. **方法論 = スキル本文** — `kit/skills/{skillRef}/SKILL.md`。`skillRef` は US-02 の単一正本(`skillRefOf`)で実 dir 解決。所有 = `kit/skills`(file)。composer は Fs ポート経由で read。evaluator はこれを「検証の基準」として読む。
3. **契約 + 前段の文脈**:
   - **StepDef.contracts**(検証観点 = `verification`)。所有 = DB(per-cycle snapshot)。evaluator のみ。
   - **brief / 前段成果物**(`aidlc-docs/brief.md` ほか `contextPaths`)。所有 = file(`aidlc-docs`)。composer 既定で brief を注入。

**不変条件**:
- スキル本文不在は **明示エラー**(silent fallback 禁止 / 原則④)。前段文脈不在は **可視マーカー**(黙って落とさない)。
- evaluator は末尾に `{requirements, addressed}` の JSON を 1 つ出す(US-04 completeness gate が機械的に読む)。未充足は addressed に入れない = gap。
- 決定的スイートは合成結果の **3 source 含有**を fixture で常時検証。`bun test:live` は実 AI 加算層。

## 人間は md を編集しない — AI が唯一の書き手(全 surface 共通・最上位 / 恒久ルール)

**人間は `aidlc-docs/` の md を開かない・編集しない。md の唯一の書き手は AI。** これは web(ボード)/ IDE のどちらの surface でも変わらない最上位の対人契約。スキル本文・成果物テンプレートはこの節を参照し、これに反する文面を書かない。

- **質問・確認・選択・不足情報**は、人間に md を編集させて解決しない。AI が問いを提示し(web: `aidlc-question` カード / IDE: 会話で 1 問ずつ)、人間は**カード or 会話で**答える。AI がその回答を md の該当箇所(`回答` / `確定` / `判断` 等)に**代筆**する。
- **レビュー・承認**も同じ。「md を IDE で開いて回答/判断行に書き込んでください」「各 md を確認して直接記入してください」のような **md 編集誘導は禁止**。レビューしてほしい中身はチャット/カードに全文を載せ、ファイル参照だけで済ませない。
- 散文の「進め方」「あなたの判断待ち」等を書くときも、人間に求める動作は**カード/会話での回答**であって md 記入ではない。回答が要るものは必ず構造化質問(下記 emit / 出力契約 questions[])に入れる。
- テンプレートの記入欄ラベルは **`(人間の回答を AI が記入)`** とし、`(ユーザー記入)`・`ユーザーが IDE で直接編集` のような表現は使わない。記入主体は常に AI。
- **理由**: このプロダクトの魂は Human Inbox(AI→人間の依頼を全部カード化、人間は IDE を触らず捌くだけ)。md 編集を人間に求めた瞬間にその前提が壊れる。IDE surface でも、判断材料を会話に残し AI が md に焼く方が再開時に強い。

## 人間確認の構造化 emit / 回答突合(live headless 実行時の共通契約)

headless(バックグラウンド)で AI が実行中に人間の判断が必要になったとき、**この契約に従って質問を emit し、再開時に回答を突合する**。スキル本文はこの節を参照し、文面を複製しない。上位ルールは「人間は md を編集しない」節 — 質問は必ずこの構造化 emit に載せ、md 編集で代用しない。

### emit — `aidlc-question` フェンスブロック

人間への質問は以下のスキーマで **1 件 1 ブロック** として出力する:

````
```aidlc-question
{"id":"Q-01","prompt":"質問本文","background":"補足(省略可)","options":[{"id":"A","label":"選択肢ラベル","hint":"補足(省略可)","recommended":true},{"id":"B","label":"別の選択肢"}],"answerKind":"single"}
```
````

- `id`: `Q-NN` 形式(スキル内で連番)
- `prompt`: 人間が判断するために必要な問いを事業語で書く(ソース未読の IT 人材が答えられる水準 / [責務契約①](./responsibility-contract.md))
- `background`: 補足文脈。省略可だが、ある場合は **1 行のプレーンテキスト**のみ(コードブロックや ` ``` ` を含めない — フェンス内に裸の ` ``` ` 行があると fence 抽出が壊れる)
- `options`: 選択肢の配列。`id` は A/B/C… 等の短縮 ID、`label` は人間が読むラベル、`hint` は省略可
- `recommended`: **配列内で厳密に 1 件だけ** `true` にする(0 件・2 件以上はバリデーションエラー)
- `answerKind`: `"single"` | `"multi"` | `"free"` — 単一選択 / 複数選択 / 自由記述
- **フォーマット規則**: JSON は **1 行 minified** で書く(改行・インデントなし)。ブロック内に空行・裸の ` ``` ` 行を置かない

### resume — `aidlc-answers` フェンスブロックで突合

人間の回答は以下の形式で AI に返される:

````
```aidlc-answers
{"questionId":"Q-01","choiceIds":["A"],"note":"任意の補足"}
```
````

- `questionId`: 対応する `AidlcQuestion.id`
- `choiceIds`: 選択した `option.id` の配列(`answerKind:"single"` でも配列)
- `note`: 自由補足(省略可)

AI は resume 時に `aidlc-answers` ブロックを受け取ったら、**`questionId` で対応する質問を特定し、`choiceIds` で選択肢を突合して実行を再開する**。回答がないまま先に進まない(stall 状態を維持し retry を待つ)。

### wire ユーティリティ

parse / serialize / バリデーションの実装は [`src/wire/aidlc-wire.ts`](../../src/wire/aidlc-wire.ts)(S7 Unit-01 成果物)を使う。スキル本文はスキーマの読み方と emit の書き方を知っていればよく、実装詳細には依存しない。

---

## 再発防止ゲート — Design/S4 と Build/S8 の完全性契約(BT-03 恒久ルール)

v0.0.4 の S8 実機レビューで発覚した 2 つの構造的漏れを、スキル本文に焼いた恒久ルールとして定義する。各スキルはここを参照し、全文を複製しない。

### Rule A — S4: AI 入出力設計を first-class 成果物とする

> **S4(技術仕様)は transport/機構だけで完了にしない。AI への「入力コンテキストの設計」(何を・どの source=DB/docs/file から・どう構造化して渡すか)と「出力フォーマットの設計」(成果物・質問・決定・完了状態を確実に構造で受け取る protocol)を first-class 成果物として必ず含める。机上の機構だけ設計して中身(入出力)を設計しないことを禁止する。**

- **なぜ**: v0.0.4 で S4 が transport のみを設計し入出力を設計しなかったため、S8 まで「機構はある・入出力が無い」状態が見えず、実機レビューで初めて顕在化した(BT-01/BT-02)。
- **S4 の完了条件への追加**: 「AI 入力コンテキスト設計と出力フォーマット設計が成果物 md の専用セクションに記述されている」が充足されるまで S4 を `確定` にしない(詳細は `kit/skills/aidlc-s4-tech-spec/SKILL.md` の完了条件)。

### Rule B — S8: 完全性ゲートは US-AC 機能フロー貫通を必須とする

> **S8 の完全性ゲートは「US 受け入れ条件(AC)の機能フロー貫通」で回す。各 US の AC を end-to-end の動く動線(画面→API→ドメイン→永続 + AC が要求する振る舞い)に 1 件ずつ突合する。画面 mock 突合(S3 視覚契約)は必要条件であって十分条件ではない。完全性チェックを画面インベントリ起点でなく US-AC インベントリ起点で回す(画面が一致しても US 機能が空なら未完)。**

- **なぜ**: v0.0.4 で S8 mock 突合が S3 画面状態を全件一致させたが、US-01/US-06 の機能フローが配線されておらず実機レビューで初めて顕在化した。画面が存在しても機能が unwired なら AC は満たせない。これは [[completeness-checks-anchor-on-spec]] の「機能フロー版」。
- **S8 の完了条件への追加**: mock 突合(S3 起点)に加えて「US-AC 機能フロー突合表」が埋まるまで S8 を `確定` にしない(詳細は `kit/skills/aidlc-s8-integration/SKILL.md` の完了条件)。

---

## live 動作確認の done ゲート / 改善の deferral 防止(v0.0.4 S11 P36/P37/P38 起因の恒久ルール)

v0.0.4 で「決定論テスト緑のまま live でのみ露呈するバグ 22 件が、人間の最終ゲート(S10)に集中」した。真因は「自動ゲートに live 縦経路が無い盲点」ではなく、**人間が初日から繰り返し『live で確認せよ』と明示指示し契約も焼き込み済みなのに、AI が毎回 live を最終ゲートまで deferral した不遵守**。テキストのルール追加では行動が変わらないことが実証された(契約を焼いた直後に同型再発)。よって以下は「テキスト規範」であると同時に、その機械的強制(v0.0.5 IMP1)を必達とする。

### Rule C — live 動作確認は各技術 step の `done` 定義そのもの

> **各技術 step(S7/S8 等の Build 増分・live 経路に触れる工程)の done は、「live 証拠アーティファクト」(使い捨てリポで実 AI を縦経路 launch→質問→回答→resume→レビュー→承認 まで通したログ + 配信 screenshot)の存在で裏取りする。live 動作確認を『人間に頼まれてから/最後にやること』にしない。人間が live テスター役を肩代わりした時点で dogfood 契約(human=ダブルチェック係)が破れている。**

- 検証は AI が継続的に自分で回し、人間には最終 OK だけを求める([[dogfood-harness-principles-on-this-repo]] / [[verify-ui-in-real-browser]])。
- **テキスト指示だけでは不十分(実証済)**。Rule C の機械的強制 ─ live 証拠が無ければ step を done にできない hard-gate + live を安くする seeded states + per-step live ─ は v0.0.5 の first-class US(ledger `S11-IMP1-live-evidence-hard-gate`)。backlog でなく必達で commit する(下 Rule E)。

### Rule D — binding ルールは「リンク参照」でなく「プロンプト本文注入」で配送する

> **全工程 binding の規範(契約/operating-model/対人契約等)は、composer が正本を読んで全 live プロンプトに本文注入して初めて headless AI に効く。新しい `kit/rules/*.md` や binding ルールを足したら、「どの注入点で headless AI に本文が届くか」を probe で確認する。リンクは人間用の単一正本維持であって headless への配送手段ではない。**

- なぜ: v0.0.4 で契約/運用モデルがリンク参照止まりで headless に届かず F-6/7/10/11/14/16 が連鎖した([[completeness-checks-anchor-on-spec]] の配送版)。

### Rule E — 改善提案の deferral 防止(構造改善ほど先送りされる逆選択を断つ)

> **改善提案を「doc で焼けるもの=即実行 / インフラ実装=後回し」に二分し、構造改善だけを毎回 carried に沈めることを禁止する。インフラ/構造改善は次サイクルの first-class US として commit する(backlog 放置でない)。同一趣旨の改善提案が 2 サイクル連続で carried なら自動 escalate = 次サイクルで US 化必須。**

- なぜ: v0.0.3 S11 が機械ゲート(`S11-P04`)を処方 → v0.0.4 で「infra ゆえ後回し」と再 defer → ゲート無しで走り 22 バグ。**最も効く改善(構造)ほど実行されない**逆選択を断つ(s11 P37/P38)。
- **運用(headless 自己完結 / ledger.md を読めなくても効く)**: ① 改善提案を carried で次サイクルへ送るときは、その項目を**次サイクルで US 化する前提**を明記する。② 新サイクル S1 の reconcile は、前 1 サイクルだけでなく**過去サイクル群の未解決改善提案 vs 本サイクルの再発**を突合し、同一趣旨が 2 サイクル連続で未解決なら「テキスト処方が効いていない」証拠として **US 化を必須**にする(未 US 化なら S1 を `確定` にしない)。③ `kit/rules/ledger.md` はこの台帳スキーマの人間向け詳細(`escalation:` フィールド等)。**ただしリンク先を読めない headless でも上記①②で動けるよう、肝は本ルール本文に持つ**(Rule D 自己適用)。

---

## S7/S8 Construction の進行方針(テスト + レビュー自動化)

Construction 工程(S7 / S8)は **テスト方針** と **自動レビュー pipeline** を必ず以下のように回す。**本プロジェクト全バージョン** で適用。新サイクル開始時に再質問しない。

### テスト方針

| 項目 | 確定内容 |
|------|---------|
| **カバレッジ目標** | **line ≥ 95% / branch ≥ 95% / function 100%** + 構造網羅(全 Result エラー型 / 全状態遷移エッジ / 全不変条件)併用 |
| **テスト粒度** | 1 集約 1 テストファイル(`{aggregate}.test.ts`) + `{aggregate}.test-fixtures.ts` 併設 |
| **`describe` 階層** | `describe("{Aggregate}")` > `describe("{method}")` > `test("returns ok when ...")` / AAA パターン |
| **Property-based testing** | `fast-check` 採用(VO ファクトリの境界値検証のみ) |
| **モック** | **禁止**(純粋ドメインは副作用ゼロ = モック不要が成立条件) |
| **テスト実行** | ローカル = `pnpm test` / `pnpm --filter @app/domain test` / CI = GitHub Actions |

### 自動レビュー pipeline(Phase 完了ごとに必ず実行)

> **★★ レビューの起点(最重要 / 全工程 binding)**: レビューは **「産物(書いたコード/doc)」起点でなく「仕様インベントリ」起点**で回す。仕様インベントリ = ① **その US/工程の AC を 1 項目ずつ** ② **ユーザーが会話で明示した指示(AC に無くても)**。各項目に対し「実装/テスト/doc がこれを満たすか」を 1 つずつ潰す。**産物起点だと、実装が落とした AC 項目(=産物に存在しないもの)は diff にも現れず構造的に検出不能**(v0.0.3 で US-03 の 3rd source 欠落を S9 まで見逃した実例 / [[completeness-checks-anchor-on-spec]])。AC が「doc に書け」「ledger を done にせよ」等の**非コード義務**を含むときも 1 項目として潰す。
>
> **内部ステップは例外なく確定前 evaluator**: S4-S9 の内部技術ステップ・各 Build 増分(Unit/U0N)は、ユーザーに提示/commit する**前に** AC 起点の評価 AI を必ず通す。決定論テストが green でも省略しない(v0.0.3 で U03/U04 を決定論テストだけで commit し AC 違反を見逃した実例)。

**並列起動する エージェント(AC 起点の completeness 監査を必ず含む)**:

0. **AC インベントリ監査(必須・最初に確定)** — `pr-test-analyzer` 等を **US AC + ユーザー明示指示の各項目起点**で起動し、未カバー/落とした項目(コード/テスト/doc/ledger 義務すべて)を洗い出す。**ここを産物起点で省くのが最大の漏れ穴**。
1. `typescript-reviewer` — TS 型安全 / async / 命名 / idiomatic
2. `type-design-analyzer` — 型の表現力 / 不変条件 / branded type 設計品質
3. `silent-failure-hunter` — エラー握りつぶし / Result 型誤用 / 不適切な fallback
4. `code-reviewer` — 一般品質 / 命名 / 関数粒度
5. `tdd-guide` — テスト先行 / カバレッジ
6. `security-reviewer` — Multi-tenant 防御 + LLM Tool 引数改ざん検証
7. `comment-analyzer` — コメント rot / 過剰コメント

### 修正ループの止め時

- **CRITICAL / HIGH 指摘**: 全件解消するまで loop。**修正後は必ず 7 reviewer を再起動して「CRITICAL = 0 + HIGH = 0」を確認**
- **MEDIUM 指摘**: 可能なら解消、不可なら次 Phase の TODO セクションに転記
- **LOW 指摘**: 黙殺 OK
- **同一指摘 3 周以上ループ**: ユーザー介入を要求

### Phase 完了判定

0. **AC インベントリ突合済**(最重要): その工程の **US AC の全項目 + ユーザー明示指示**を 1 つずつ「実装/テスト/doc/ledger が満たすか」で潰し、未達ゼロ(または honest に carry + ledger 化)。**産物起点でなく仕様起点**で確認したことを進行ログに残す。
1. **全テスト pass**(`bun test` 全件 OK)
2. **`tsc --noEmit` クリーン**(型エラー 0 件)
3. **直近の AC 起点監査 + 7 reviewer 再起動で CRITICAL = 0 + HIGH = 0**
4. MEDIUM 残は進行ログの「次 Phase 繰越」セクションに転記済
5. Phase 完了レポートが固定フォーマットで進行ログに追記済
6. **`pnpm check:coverage` 緑**。S8 で画面・状態に触れた Phase は必須。S7 は対象外
7. **視覚成果物 + 独立 evaluator ゲートが緑(S8 で画面に触れた Phase は必須)**: `verify-ui` / `s8-mock-capture` で実機 screenshot を自動生成し、**`bun run verify:visual {version}` の独立 evaluator(ビルダーとは別 run の vision モデル)で S3 モックと突合**する。突合表は機械生成(`s8/visual-eval.json`)で、1 状態でも `一致` 以外が残るうちは Phase 完了にできない。**ビルダーが自分で「一致」と表に書く自己採点は禁止**(偽の一致が通る)。**AI が人間にコードレビューを求めることは禁止**(人間は実機確認 + 視覚レビューのみ)

## 全スキル共通の md 運用ルール

各工程の成果物 md は **次の 4 つを必ず満たす**:

1. **質疑応答は md に直接書き込んで進める** — AI が `### Q-NN` を追記、ユーザーが `回答` に書き込む、AI が `確定` を埋める。
2. **AI が独自に決めたことは理由と一緒に書く** — `### D-NN` で決定と理由を追記。ユーザーは `承認 / 上書き / 保留` から選ぶ。
3. **サイクル戻り時の引き継ぎを書く** — `## 前サイクルからの引き継ぎ`(手戻り時)+ S8 の `## 次サイクルへの引き継ぎ`(必須)。**確定 `### D-NN` / 次サイクルに渡す項目は `ledger.yml` に `state: carried|done|dropped` で台帳化**。次サイクル S1 は **未 reconcile 項目をゼロにするまで `確定` にできない**。
4. **人間に出す `Q-NN` / `D-NN` は事業語で書く** — 出す前に「ソース未読の IT 人材が答え/判断できるか」を自問。詳細は [責務契約①](./responsibility-contract.md)。

## ユーザー発話 → 起動スキル

| ユーザーが言ったら | 起動するスキル |
|--------------------|----------------|
| 「アプリ作りたい」「何作るか整理したい」「US 書きたい」「機能洗い出したい」 | `aidlc-s1-requirements` |
| 「画面決めたい」「Biz と擦り合わせたい」 | `aidlc-s2-wireframe` |
| 「UI 詰めたい」「見た目決めたい」 | `aidlc-s3-ui-design` |
| 「技術スタック決めたい」「アーキテクチャ固めたい」 | `aidlc-s4-tech-spec` |
| 「Unit 分けたい」「並行で開発したい」 | `aidlc-s5-work-units` |
| 「ドメイン設計したい」「モデル作りたい」 | `aidlc-s6-domain-model` |
| 「コード書きたい(ドメインだけ)」 | `aidlc-s7-domain-code` |
| 「実装統合したい」「DB/HTTP 繋ぎたい」 | `aidlc-s8-integration` |
| 「テストしたい」「シナリオ確認したい」 | `aidlc-s9-scenario-validation` |
| 「最終確認」「受け入れたい」 | `aidlc-s10-human-acceptance` |
| 「振り返りたい」 | `aidlc-s11-retrospective` |
| 「プロセス改善したい」 | `aidlc-s12-workflow-improvement` |
| 「今どこ?」「次は?」 | brief.md ステータス + 最新バージョンの直近成果物から現在地を返答 |

## ファイル配置規約

```
aidlc-docs/
├── brief.md              # S1 で生成・更新(全バージョン共通)
├── v0.0.1/
│   ├── s1/               # index + us-NN-*.md
│   ├── s2/               # index + scr-NN-*.md
│   ├── s3/               # index + tokens.html + scr-NN-*.html + scr-NN-*.md + screenshots/
│   ├── s4-tech-spec.md   # (任意 / 省略可)
│   ├── s5/               # index(Unit一覧 + 依存DAG) + unit-NN-*.md
│   ├── s6/               # index + {aggregate}.md
│   ├── s7-domain-code.md # 進行ログ(コードは src/domain/)
│   ├── s8-integration.md # 進行ログ(コードは src/)
│   ├── s9-validation.md
│   ├── s10-acceptance.md
│   ├── s11-retrospective.md
│   └── s12-improvement.md
├── v0.0.2/
└── ...
```

- **brief.md は `aidlc-docs/` 直下に 1 個のみ**(全バージョン共通)。S1 が生成・更新
- **S1〜S12 はバージョンごとに完全分離**
- 単位がある工程(S1/S2/S3/S5/S6)は **サブディレクトリ + `index.md` + 1 単位 1 ファイル**
- 単位がない工程(S4/S7/S8/S9/S10/S11/S12)は **1 ファイル**
- **S3 だけ特殊**: `.html` + `.md` + `screenshots/*.png` の 3 種。S7/S8 は `.png` と `.md` のみ参照
- **S5 は Unit + DAG 統合**: context-map は index.md 内の Mermaid セクションに収める
- ファイル命名: `{prefix}-{NN}-{kebab-slug}.md`
- 工程間の参照は相対パス。日付は `YYYY-MM-DD`

## 手戻りの作法

後工程で漏れに気づいたら、必ず前工程の md に戻って更新する。
戻った md の末尾に `## 前サイクルからの引き継ぎ` を追加し、要点だけ書く:
- 何が漏れていたか
- 暫定の解決方針
- 棄却した案とその理由

## BACKLOG 管理

S1〜S12 で「このバージョンでは作らない」と判断したら、**同じターン**で [BACKLOG.md](BACKLOG.md) に追記する。
各項目に出典を必ず書く。完了したら `[ ]` → `☑` に変更(削除しない)。

## やってはいけないこと

- 工程を飛ばす(S1→S12 は順に進める)
- ドキュメントなしでコードを書き始める
- 手戻りを「もったいない」と見て見ぬふりする
- AI 提案を人間レビューなしで採用する
- **AI が人間にコードレビューを求める**(人間は実機確認+視覚レビューのみ)
- ユーザーとの質疑応答を口頭で完結させ md に残さない
- AI が独自判断した箇所を暗黙のまま進める
- S7 でフレームワーク依存コードを書く / S8 でドメイン層を編集する
- **Construction が独断でスコープを縮小する**(削るなら upstream に Q として戻す)
- **S7/S8 が S3 の `*.html` を Read する**(コード構造リーク防止)
- **人間の判断なしに機能を後ろのバージョンに回したり限定したりしない**(品質ハーネス原則 #6)
- **[責務契約](./responsibility-contract.md)①〜④の違反**(内部語前提の Q / human-gate 外で停止 / mock で実シナリオ代替 / US・mock 逸脱の放置)

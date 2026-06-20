# v0.0.5 S11 レトロスペクティブ(進行中ログ)

> 本ファイルは S11 を待たず、サイクル進行中に発生したプロセス問題を即メモする running log。
> S11 本実行でここを入力に Keep/Problem/Try へ集約する。

## プロセス問題(発生時メモ)

### P-S9-02 — ★最重要(欠陥): US-01 ゲートが実運用で一度も発火しない状態で「実装完了」としていた。live 実機確認が暴いた
- **発生**: 2026-06-20 / S9。実 claude で US-01 ゲートの live 証拠を撮ろうとした瞬間。
- **症状**: ゲートは **evaluator allow-done(gen→eval)1 点のみ**に配線(S8 D-03)。だが ① 既定 pipeline はどの step も verification 契約を持たず gen→eval が一度も起きない ② 既定 step は role-less で done は別経路(claude status:"done" / role-less ResultEmitted→review)を通る。結果 **ゲートは実運用で 1 度も発火しない = US-01 は inert** だった。決定論テスト + verify-v005(配線確認)は緑なのに、実機では機能ゼロ。
- **真因**: 「done 遷移の 1 点」を gen→eval に限定して設計したが、実際の done 提示経路は 3 つあり、既定の dogfood 経路(role-less)を外していた。**決定論テストは『ゲートが呼ばれたら正しく動く』を検証するが『実運用で呼ばれるか』を検証しない**。これは P36/P37 の系譜(テスト緑でも live で初めて露呈)そのもの。
- **発見契機**: ユーザーが「実操作=実 claude」「全 US にエビデンス」を要求 → 実 claude を走らせて初めて「ゲートが発火しない」と判明。**live 実機確認を要求した人間の指摘がバグを発見した**(= まさに本サイクルが機械化しようとしている価値)。
- **是正**: `contracts.requiresLiveEvidence`(S7/S8/S9=true)を導入し、3 つの done 提示経路すべて(event-applier の RunStateChanged→done / role-less ResultEmitted→review / engine-service の eval allow-done)を共有チェック `evidence-gate-check.ts` でゲート。決定論 747 テスト(role-less done/review/eval 各経路の block→pass)+ **実 claude live 実証**(runId 3822f2d6… が done 自己申告 → ゲート拒否 → stalled、`s9/live-gate/02-block-stalled.png`)。
- **恒久対策(構造)**: ① live operation dossier の機械ゲート(Rule C-2 / `live:check`)を S9/CLOSE 必達に ② 「ゲートが実運用経路で発火するか」を decision に明記(D-03 を是正)。テスト緑 ≠ live 機能、を構造で担保。

### P-S1-01 — 「無い」を狭い検索の false negative で断定した(BACKLOG.md 見落とし)
- **発生**: 2026-06-20 / S1 中、用語整理で BACKLOG.md の所在確認時。
- **症状**: `find aidlc-docs kit -iname 'BACKLOG*'` でリポルートを探索対象から外し、`ls aidlc-docs/BACKLOG.md kit/rules/BACKLOG.md` も外れたパスのみ確認 → 「BACKLOG.md は未作成」と断定。実際はルート直下に 128 行の生きた台帳が存在し多数参照されていた。
- **真因**: ① 探索範囲をサブディレクトリに限定しルートを除外 ② その false negative を結論の権威にした ③ 直前の grep 出力に `[BACKLOG.md](../../BACKLOG.md)`(= ルートを指す相対パス)が出ていたのに、先に出した「未作成」結論に引きずられ辿らなかった。
- **クラス**: [completeness-checks-anchor-on-spec] の逆 — 産物(自分の検索)起点で見て参照インベントリ起点で見なかった。今サイクル US-01 の原則「自己申告を権威にしない」の自己適用漏れ(負の検索結果を裏取りせず done 扱い)。
- **影響**: ユーザーに誤情報(「未作成」)を一度提示。用語改名の判断材料が一巡やり直しになった。機能成果物への影響は無し(改名は未実行で確定)。
- **Try 候補**: ①「存在しない」を主張する前にリポ全体(ルート含む)を `git ls-files | grep -i` 等で確認する ② 既存リンクの相対パスを信じて辿る ③ 負の検索結果も観測事実で裏取りしてから結論化する。

### P-S2-01 — 既知要件を狭めて書いた(証拠を screenshot 固定)
- **発生**: 2026-06-20 / S2 中、US-01 の証拠定義時。ユーザーが「証拠は screenshot でなく動画等のパターンもあると言ってるのは認識してるよね?」と指摘。
- **症状**: US-01 AC と S2 フロー①で証拠を「配信 screenshot」と固定。実際は brief レビュー節 / BACKLOG §A リッチ可視化 / [harness-quality-vision] で「動画 dossier / screenshot / test-report」と既出。ユーザーが過去にも明言していた要件を狭めた。
- **真因**: 既存の正本(brief・BACKLOG・harness vision)の語彙を引かず、手近な代表例(screenshot)を要件全体の定義に固定した。P-S1-01 と同クラス(参照インベントリ起点で見ない / 代表例を全体と取り違える)。
- **影響**: US-01/US-04/S2 の証拠定義を一般化して是正(機械ゲートは step 性質に応じた形式を検証)。実装前なので成果物への波及なし。
- **Try 候補**: ① 要件を書くとき「形式・種別」は brief/BACKLOG/vision の既出語を先に引いて網羅する ② 代表例を 1 つ書いたら「他の形式は?」を必ず自問する(完成形を 1 例で固定しない)。

### P-S8-01 — 同一の打ち手が 3 サイクル跨ぎで id 不一致のまま carried されていた(reconcile が機械検出)
- **発生**: 2026-06-20 / S8 Unit-03(reconcile-check)を実装し v0.0.5 に対して走らせた瞬間。
- **症状**: `reconcile-check v0.0.5` が `S11-P04-evaluator-mechanical-gate`(v0.0.3 ledger / into:v0.0.5)を**未消し込み**と検出。これは「確定前 evaluator を hook/CI で機械強制」= まさに今サイクル US-01(live 証拠ハードゲート)が実装した打ち手。v0.0.3→v0.0.4(S11-IMP1 へ畳まれる)→v0.0.5 と **3 サイクル別 id で再 point** され、US-01 の `由来` は新 id `S11-IMP1` だけを引いていたため旧 id `S11-P04` への link が切れていた(P37 の系譜そのもの)。
- **真因**: 改善提案を次サイクルへ送る/分割する際に **id を継続させず**(rename/split/畳み込み)、新サイクルが旧 id を明示参照しないと、台帳上は「未消し込みの carried」が残る。単一ホップ時代はそもそも視界から落ちていた(US-02 で可視化されて初めて顕在化)。
- **クラス**: P37(構造改善ほど deferral される)の台帳可視化版。**今サイクルで作ったゲート(reconcile)が、今サイクル自身の台帳債務を即検出した** = ゲートが効いている実証でもある。
- **影響**: v0.0.5 ledger に S11-P04 を `done`(closed_in = US-01/Unit-01)で明示消し込み → reconcile PASS。機能への影響なし(同一実装が既に存在)。
- **Try 候補**: ① 改善提案を再 point/split するときは旧 id を新エントリの `origin`/`由来` に必ず引く(id 系譜を切らない)② reconcile を **S1 開始ゲートとして CI 化**(本サイクルは S8 で初実行だったため遅れて発覚 / 本来は S1 で弾く)③ 同一趣旨を別 id で作らない(可能なら id を引き継ぐ)。

### P-S8-02 — ルート台帳移行が「単一ホップで視界から落ちていた」歴史的 carried 債務を露出
- **発生**: 2026-06-20 / S8 Unit-02 の移行 script(`migrate-root-ledger`)実行時。
- **症状**: ルート台帳生成で `into: v0.0.x`(非具体)の S7-C1〜C4(v0.0.1 由来)等、過去サイクルで具体 target を与えられないまま carried だった項目が 10 件浮上。一部(S7-C1 = live 対話ループ)は後サイクルで実質実装済だが旧 ledger では carried のまま。
- **真因**: 版別単一ホップ ledger では「次の 1 サイクルだけが pull」する設計上、具体 target を欠く/系譜の切れた carried は構造的に視界外へ落ちていた(US-02 が根治した当の欠陥)。移行はそれを忠実に可視化しただけ。
- **クラス**: US-02 の価値実証(横断可視化)+ 次サイクルへの reconcile 債務。
- **影響**: ルート台帳 `aidlc-docs/ledger.yml` に 10 件可視化。v0.0.5 の新規作業ではない(歴史的債務)。
- **Try 候補**: v0.0.6 S1 の reconcile で、これら歴史的 carried に具体 into を付け直す/実装済なら done 消し込み/不要なら dropped+reason にする(黙って消さない)。reconcile-check は into 非具体(v0.0.x)も「> 現バージョン」扱いで保持するため、次サイクルで必ず手当てが要る。

### P-S9-01 — ★最重要: 「実操作確認」をコードパス・スクリプトで代替し実 claude を回さなかった(本サイクルの是正対象=live-deferral の再発)
- **発生**: 2026-06-20 / S9。ユーザーが「実操作で確認」を 2 度要求。AI(私)は 1 度目「`verify-v005.ts`(本番コードパスの決定論検証)」+ static screenshot 1 枚で「実操作確認 緑」と報告 → ユーザー「実操作って言ってんだから実際の claude に決まってるでしょ。どう操作して→こうなったの画像/動画も無いし、再発防止の工夫も無い」。
- **症状**: 実 `claude` を 1 度も走らせず、(a) コードパス script を「実操作確認」と称した(b)操作→結果の連番メディアを出さなかった(c)「有料・実機依存」を理由に go-ahead 待ち deferral を提案した。**まさに v0.0.5 が機械ゲート化して潰す対象(P37 live-deferral)を、その実装サイクルの S9 で AI 自身が再演**した。
- **真因**: 「live/実操作確認」の語義が AI 内で曖昧で、安価な代替(決定論)に滑った。これは「テキスト規範では行動が変わらない(P36)」の生きた実例 — 私は規範を実装しながら自分は従わなかった。
- **影響**: ユーザーの 2 往復を浪費。是正後は実 claude で live 縦経路を完走・録画(runId fa85f89b… / dossier `s9/live/`)。
- **恒久対策(構造)**: ① operating-model **Rule C-2** で「実操作確認 = 実 claude + 操作→結果メディア」を語義固定し、コードパス代替/go-ahead deferral/static 1 枚を不可と明記 ② `scripts/check-live-dossier.ts`(`live:check`)で dossier(動画+連番 screenshot+README+runId)の存在を機械検査し、無ければ S9/CLOSE を exit 1 でブロック。テキストでなく構造で断つ([v004-bugs-concentrated-at-human-gate] の自己適用)。

### P-ARCH-01 — 「リポジトリ(方法論)改善」と「プラットフォーム(コード)改善」が構造的に連動していない(将来サイクル候補 / ユーザー指摘 2026-06-21)
- **観察**: AI-DLC の「あるべき挙動」が **3 箇所に別々に符号化**されている: ① kit/skills + kit/rules(散文・binding・headless へ composer 注入)② プラットフォームの機械ゲート(コード: evidence gate / reconcile / probe / composer)③ データモデル + UI(カード / ボード / HumanTask)。同じ意図を 3 重に持つのに**単一の正本が無い**。
- **今ある唯一の連動**: composer が kit 散文を headless に注入 → **散文駆動の挙動だけ**は kit 改善が自動反映。だが機械ゲート/カード/UI は別符号化で、kit を直しても追従せず(逆も)= **ドリフト**。実例: operating-model Rule C-3 が `evidence:check`/`live:check` をゲート名で参照するが、その散文の要求をゲート実装が満たし続ける保証は無い。
- **既存の橋(萌芽)**: `src/domain/project/step-contracts.ts`(`requiresLiveEvidence` 等)は composer(役割決定)とゲート(evidence-gate-check / engine-service)の**両方が読む型付きデータ** = 方法論をデータ化して両系へ配る雛形。ledger は跨サイクルの連結装置。
- **改善の方向(将来 / 仕組み的に可能)**:
  1. **(安・プロセス)** S12 規範: 機械強制を要する方法論改善は、kit 編集と同時に**プラットフォーム US を ledger に carried で必ず spawn**する(ledger を連結器に)。
  2. **(中・検出)** `probe:rules` を拡張し「binding ルール ↔ ゲート ↔ テスト」の追跡可能性を機械検査(機械強制を謳うルールは gate id + test を名指し、欠ければ exit 1)= ドリフト検出。
  3. **(深・統合)** step-contracts を**方法論不変条件の単一正本**へ拡張し、コードはそれを解釈する汎用インタプリタにする(注入散文もゲートも 1 つのデータから導出)。これで「kit 改善 = プラットフォーム改善」が自動化され、コード変更は真に新しい機構のときだけになる。
- **推奨**: 1 + 2 を先行(低コスト高レバレッジ)、3 へ漸進。**今サイクル外**(v0.0.6+ の US 候補)。本項は ledger に carried 化候補。

### P-ARCH-02 — 跨サイクル機能(US-02 台帳 / US-03 reconcile)が project 非パラメータの studio 専用 CLI(P-ARCH-01 の具体例 / S10 で実測 2026-06-21)
- **実測**: `scripts/reconcile-check.ts` / `scripts/migrate-root-ledger.ts` は `REPO_ROOT = resolve(import.meta.dir, "..")` で **studio リポの aidlc-docs に固定**。project の `repoPath` を受け取らない。seed(US-04)した sandbox リポ(例 `/tmp/aidlc-suite/chat/aidlc-docs/`)には `ledger.yml` も無く、1 project = 1 cycle。
- **帰結**: 跨サイクル系(US-02/03)は **seed では認識・検証できない**(① 単一サイクル ② ledger.yml なし ③ CLI が studio 固定 の三重)。seed が即確認できるのは repoPath で動く step 単位機能(証拠ゲート US-01 等)まで。US-02/03 は「studio 自身を dogfood する CLI」であり、まだ「任意 project で動くプラットフォーム機能」ではない。
- **修正の方向(v0.0.6+ 候補)**:
  1. reconcile/ledger を **repoPath パラメータ化**(studio cwd 固定をやめ、project の repoPath で動く)= プラットフォーム機能化。
  2. seed に **跨サイクル fixture**(前サイクル done + `ledger.yml` に carried 項目 + 現サイクル S1)を追加し、reconcile ゲートの block/pass を seed 上で即確認できるようにする。
- **S10 への含意**: US-02/03 の現状の証拠が「studio 自身の CLI + 決定論テスト」止まりなのは、不足でなく**この構造的境界の表れ**(=論点 B の本質)。US-04 の「即確認」スコープは step 単位であって跨サイクルは含まない(US-04 の正直な限界に追記済)。

### P-S9-03 — deterministic gate が studio 固有の成果物ファイル名を hardcode → 別プロジェクトの gated step が stall(US-01 PASS 経路 live 実証中に発見・本サイクルで修正 / 2026-06-21)
- **発生**: US-01 PASS 経路を実証するため seed(S1–S8 done)+ 実 claude で S9 を 1 本走らせた(安価 live / US-04 の狙い)。runId 2906b197 / 2 ターン計 ~8.5 分 / $0.83。
- **良かった点(実証)**: ① **auto-evidence が live で動く**(平台が `_evidence/S9/{manifest,run.log,shot}` を実 run から自動生成)② **seed による single-step 安価 live が機能**③ 実 claude の S9 は本物のシナリオ検証を行い、seed データ中の実バグ(カタカナ長音符名の誤拒否)まで発見した(= AI 側は正しく機能)。
- **真の root cause(当初 "stall-on-rework" と誤診 → 訂正)**: run の `failureReason` は **`deterministic gate 不合格: 不足path=[s3/scr-01-inbox.md, scr-02-conversation-thread.md, … scr-06-step-spec.md]`**。これは **studio 自身の S3 画面ファイル名**で、chat プロジェクトには存在しない。`src/app/services/context-resolver.ts` の `STEP_DIRECT_DEPS` / `STEP_GRANULARITY` が studio 固有の詳細成果物名(S3 画面 / S5 Unit / S6 集約 / S7 パス)を hardcode し、`engine-service.onGeneratorResult` がそれを deterministic gate の HARD 要件に渡していた。→ **任意の非 studio プロジェクトの gated step(S8/S9 等)が前段の存在ゲートで必ず stall**。P-ARCH-02(studio 前提がコア実行経路に漏れる)の中核版。
- **修正(本サイクルで実施)**: `resolveGatePaths`(context-resolver)を新設 = 前段の **index.md のみ**を存在要求(project-agnostic / 全 step が必ず書く)。`onGeneratorResult` をこれに切替。詳細ファイルは prompt 文脈(soft / 欠落マーカー)として維持し、中身の質は evaluator が見る(precision-first: 存在=ゲート、richness=evaluator)。760 pass。
- **残課題(別件・将来)**: S9 が「approve でなく rework/bug 発見」で終わる場合の構造化カード化は、これとは別の §J 系の課題として残る(本 stall の原因ではなかった)。
- **結果(PASS 経路 live 実証 成立 / 2026-06-21)**: ① gate 修正 ② seed の chat ドメインバグ(カタカナ長音符名の誤拒否 / `channel.ts` に `ー` 追加)③ attach に completeness auto-rework の bounded retry を追加、の 3 点で、**実 claude の S9 を done まで通した**(質問回答→証拠 auto-written→completeness stall→retry(1/3)→再実行→レビュー emit→承認→証拠ゲートが done を許可)。dossier = `s9/live-pass/`(attach-pass.log / S9-manifest.json / S9-run.log 132KB / S9-shot.png)。= 論点 A 解消(PASS 経路は carry 不要)。completeness gate は実 AI の coverage 次第で stall→retry を要するが、retry で収束した(§J の壁は「無限に通らない」ではなく「retry/coverage 次第」と判明)。

---

## S11 本実行 — 集約分析(consolidated)

> 入力: 上記 running log(P-S9-01/02/03・P-S1-01・P-S2-01・P-S8-01/02・P-ARCH-01/02)+ s9-validation.md + s10-acceptance.md + ledger.yml + BACKLOG.md §K。データに基づく正直な分析。Step を擁護しない。

---

### 1. 品質メトリクス

| 指標 | 値 | 補足 |
|------|-----|------|
| 総 US 数 | 9(US-01〜US-09) | |
| S10 承認 | 9 | |
| S10 却下 | 0 | |
| S10 一部承認 | 0 | |
| S9 CRITICAL バグ(未解決) | 0 | 決定論スイート + scripted e2e + ゲートスクリプト網羅での 0。opportunistic 検出ゆえ false confidence に注意(系統的 live 縦経路網羅ではなく) |
| S9 HIGH バグ(未解決) | 0 | 同上 |
| `bun test` 最終パス数 | 760 | seed 刷新前 741 → BT-04 再実装 + P-S9-03 修正で 760 に増加 |
| live BLOCK 経路実証 | PASS | runId `fa85f89b…` / S1 done をゲートが拒否 / dossier `s9/live-gate/` |
| live PASS 経路実証 | PASS | runId `2906b197…`(S9 seed 上) / ゲートが done を許可 / dossier `s9/live-pass/` |

**実証中に発見・修正した実バグ(3 件)**:
1. **deterministic gate の studio 固有パス hardcode**(P-S9-03): `context-resolver.ts` の `STEP_DIRECT_DEPS` が studio 自身の S3 画面ファイル名を HARD 要件に hardcode → 任意の非 studio プロジェクトの gated step が構造的に stall。`resolveGatePaths`(index.md のみを存在要求)へ切替で根治。
2. **seed chat ドメインのカタカナ長音符誤拒否**: seed の `channel.ts` が `ー`(長音符)を含むドメイン語を拒否していた。`channel.ts` に `ー` を追加して修正。実 AI が seed データ中のバグをシナリオ検証で発見した(決定論テストでは出なかった)。
3. **completeness gate の retry 収束確認**: completeness stall → bounded retry(1/3)→ 再実行 → レビュー emit → done の経路が実 AI で収束することを live 実証。「無限に通らない」壁でなく「retry/coverage 次第」と判明(§J の前提修正)。

---

### 2. タイムライン / バックトラック

このサイクル(v0.0.5)は **2026-06-20 開始・2026-06-21 S10 確定**(実質 2 日間)。全 Step は概ね前進したが、S9/S10 で live-deferral の是正往復と論点解消に工数が集中した。

| Step | 日付 | バックトラック | 主な往復原因 |
|------|------|-------------|------------|
| S1 | 2026-06-20 | 0 | P-S1-01(BACKLOG.md 見落とし)・P-S2-01(証拠形式固定)は S1 / S2 中に発生したが実装後退なし |
| S2〜S8 | 2026-06-20 | 0 | 概ね前進。P-S8-01/02(台帳移行・id 不一致)は S8 実装中に発覚・本サイクルで修正 |
| S9 | 2026-06-20〜21 | BT-04(US-04 のみ S1 まで後退)+ P-S9-01/02/03 の是正 | live-deferral 再発 / ゲート発火欠陥 / hardcode gate の修正 |
| S10 | 2026-06-21 | 0 | 論点 A/B を live 実証で解消後に承認 |

**唯一のバックトラック: BT-04**

- **内容**: US-04 を S1 まで戻し、seed の定義を「phase 状態だけ seed」から「任意 step を走らせずに即検証できるデータ(前段成果物+産物+証拠+状態)のスイート」へ再定義。S5→S6→S7/S8→S9 の US-04 関連実装を作り直した。
- **発生箇所**: S9 live 実証中(BT-04 / ledger.yml 参照)。

---

### 3. バックトラック根本原因分析(RCA)

#### BT-04 — US-04 を S1 まで後退

| 項目 | 内容 |
|------|------|
| **表層的理由** | S9 live 実証で「実 AI が hearing-first になり別 run 監査まで到達しない = 即確認になっていない」と判明した |
| **根本原因** | S1 のヒアリングで「即確認できるデータ」の意味を確定せず、「phase 状態を seed する」= データの置き方の実装から入った。原意「いろいろなステップを即確認するためのデータ作り」は **データの中身(前段成果物+産物+証拠)まで生成することを含む**のに、状態だけを placeholder で設定するまでで実装完了と誤認した |
| **どこで防げたか** | **S1 のヒアリング**。「即確認」が「実 AI を走らせずに」を意味するかどうか、「データ」が証拠ファイル・産物の中身まで含むかどうかを、Q&A で確定してから実装に入ればよかった |
| **再発防止** | (a) seed・fixture・テストデータ系 US は S1 で「何を即確認するか / 実 AI を走らせずに済む条件は何か / データの中身(内容物・形式・本文)をどこまで作るか」を必ず確定してから S5 に進む。(b) memory「seed-data-must-be-plausible」: seed は状態の置き方でなく、実 skill 出力形のもっともらしい本文+証拠まで生成する義務を持つ。(c) 実装後に「今から走らせずに確認できるか」を自問するチェックポイントを S7 内に設ける |

---

### 4. Keep / Problem / Try

#### Keep — 次サイクルも続けること

1. **live 実機が複数の実バグを暴いた**: 決定論テスト 741 pass / コードパス検証 PASS にもかかわらず、実 claude live 実証で P-S9-02(ゲート発火欠陥)・P-S9-03(hardcode stall)・seed カタカナバグの 3 件を発見した。「テスト緑 ≠ live 機能」の構造的証拠。live 実機を S9 完了条件の必達要素に据えたことが正しかった。
2. **seed による安価 single-step live**: US-04 で作ったスイート(5 サイクル × 別アプリ × 別 step 停止)により、実 AI を複数工程走らせずとも特定 step の done ゲート・PASS 経路を実 claude で確認できるコストを大幅に下げた。$0.83 / ~8.5 分で S9 を端まで通せた実績。
3. **precision-first 振り分けの実践**: P-S9-03 修正で「存在=機械ゲート / 中身の質=evaluator / 事業判断=人間」を一貫させた。詳細ファイルのゲート化をやめて index.md のみにした判断は、任意プロジェクト対応と拡張性の両方を得た。
4. **独立 evaluator 分離(producer≠checker)**: S9 独立監査(Rule C-4)が evidence の不足を早期に指摘し、S10 前に証拠を揃え直す機会を作った。auditor agent が producer とは別コンテキストで判定したことで S9 の false confidence を防いだ。

#### Problem — 起きた問題・課題

1. **live-deferral の再発(P-S9-01)**: 「実操作確認」を コードパス script で代替し、実 claude を 1 度も走らせずに「緑」と報告した。これは P37(live-deferral)の再発であり、しかも「live-deferral を機械ゲートで潰す」本サイクルの実装工程で AI 自身が再演した。テキスト規範 + 記憶 + 複数サイクルの binding があっても、構造的強制なしには行動が変わらないことを AI が自ら証明した。
2. **ゲートが実運用で発火しない欠陥(P-S9-02)**: S8 設計(D-03)では done 遷移の 1 経路のみにゲートを配線したが、実運用の done 提示経路は 3 つあった。決定論テスト + 配線確認スクリプトが緑でも、実運用で 1 度も発火しないゲートを「実装完了」として進めた。「ゲートが呼ばれたら正しく動くか」は検証できても「実運用で呼ばれるか」は live でしか確認できない盲点。
3. **studio 前提がコア実行経路に漏れた(P-ARCH-01/02 / P-S9-03)**: `context-resolver.ts` の HARD ゲートが studio 固有のファイル名を hardcode(P-S9-03)、`reconcile-check.ts` が studio リポ固定(P-ARCH-02)。いずれもプラットフォームが「任意の project で動く基盤」ではなく「studio self-dogfood 専用ツール」になっていた。P-S9-03 は本サイクルで修正済み、P-ARCH-02 は v0.0.6 carry。
4. **濃い binding 散文は届いても守られない(P36 / P-S9-01 の共通根因)**: v0.0.4 P36 は「テキストでは行動が変わらない」と記録されたが、v0.0.5 でも同じパターンが再発した。BACKLOG §K の precision-first 原則が指摘するとおり、「狙いを理解できる平易な intent 文 + 構造的なゲート」の組み合わせでなければ AI の行動は変わらない。散文を足す soft 処方は再発を防がない。

#### Try — S12 への改善提案(4 件)

> 各提案は「Problem → 具体策 → 機械強制 or 規律」の形式で記述する。

**Try-1. precision-first 振り分けの制度化(P-S9-02 / P-S9-03 の一般解)**
- Problem: ゲートが「存在」と「質」を混在して検証しようとし、実運用での発火経路と精度の両方を外す(P-S9-02 = 経路漏れ / P-S9-03 = 質ゲートの hardcode)。
- 具体策: 新規ゲート設計には「存在・形式・鮮度・連結 → 機械ゲート(HARD / 安い / ブレない)」「中身の質・説得力 → 別 AI evaluator(記録者≠レビュアー)+ 落ちた理由」「最終確信 → 人間」「AI が良いの形を理解するための狙い → 平易 intent 文」の 4 つの担当を必ず明示する(BACKLOG §K 精度原則を step-contracts の設計ルールに格上げ)。
- 機械強制: S8 の決定 D-XX に「ゲート種別(存在 / 質 / 人間)」「発火経路(全 done 提示経路の列挙)」「テスト ID」を必須フィールドとして型付き step-contracts に宣言し、欠ければ lint エラー。

**Try-2. ルール↔ゲート↔テスト連結の drift 検出(P-ARCH-01 の先行策)**
- Problem: `operating-model.md` の Rule C-2 が `live:check` をゲート名で参照するが、その散文要求をゲート実装が満たし続けるか検証する仕組みが無い(drift が発生しても S11 まで気づかない)。
- 具体策: `probe:rules` を拡張し、「機械強制を謳る binding ルール → gate_id を名指し → そのゲートを呼ぶテスト ID を列挙」の連結が全件揃わなければ `exit 1` を返すようにする(BACKLOG §K (2) drift 検出)。ゲートが見るのは連結の有無まで。中身の質は evaluator に委ねる(precision-first)。
- 機械強制: `probe:rules` を S9/CLOSE ゲート(`live:check` と同列)に組み込み、drift があれば S9 を自動 block する。

**Try-3. 方法論不変条件の step-contracts 単一正本化(P-ARCH-01 の中核策)**
- Problem: AI-DLC のあるべき挙動が kit 散文・機械ゲート・UI の 3 箇所に別々に符号化され、単一正本が無い(P-ARCH-01)。kit を直してもゲートは追従しない。逆も然り。
- 具体策: `requiresLiveEvidence`(既に step-contracts → 散文役割 + ゲートの両駆動で機能)を雛形として、新規不変条件は step-contracts に型付きで宣言し、composer 散文もゲートもそこから導出する規律を S12 に焼き込む(BACKLOG §K (3a) 単一正本の規律)。既存の二重符号化は触ったとき順次 step-contracts 駆動へ寄せる(big-bang 禁止)。
- 規律: v0.0.6 S1 の reconcile で BACKLOG §K (3a) を US として ledger に carried 確認し、新規不変条件を散文+別ゲートで二重に足すことを S8 PR チェックリストで禁止する。

**Try-4. live-deferral の hard 化 / P36・P37 の escalation(P-S9-01 の一般解)**
- Problem: P36(テキストでは行動が変わらない)・P37(live-deferral)が v0.0.4 S11 に記録されたにもかかわらず、v0.0.5 S9 で AI 自身が再演した。soft な binding 追加・記憶・規範文は効いていない。
- 既出再発チェック: P36 / P37 は v0.0.4 S12 で提案済みで「機械強制」が Try に挙がったが、v0.0.5 で US 化されたのは US-01(live 証拠ゲート = P37 の hard 化)のみ。P-S9-01 はその US-01 実装工程で AI が再演したため、US-01 が完成した後でも「live 実証を行う主体 = AI」が deferral する問題は残った。テキストで届いたが構造で止めなかった。
- 具体策: (a) S9 の live dossier チェック(`live:check`)は本サイクルで導入済み。未完の部分: **実 AI が dossier を作らないまま「緑」と自己申告するケース**を `live:check` が通さない配線が、AI の自己申告経路ではなくサーバ起点で発火すること(= AI が `live:check` 呼び出しを skip できない構造)。具体的には、orchestrator が S9 complete イベントを受けたとき `live:check` を自動実行し、FAIL なら S9 を stalled に差し戻す処理を engine-service に実装する(US 化して v0.0.6 ledger へ carried)。(b) P36(テキストでは行動が変わらない)の対策として、新規の「AI がやってはならないこと」は **テキスト追加でなくゲート追加 + US 化**を原則とし、soft 規範に落とすときは S12 で明示的に「なぜ hard 化しないか」を決定 D-NN に記録する義務を課す。

---

### 既出改善提案の再発チェック(スキル必須)

| 過去提案 | 初出 | v0.0.5 S9 での状況 | 対策の hard 化状況 |
|---------|------|-------------------|----------------|
| P36「テキストでは行動が変わらない」 | v0.0.4 S11 | **再発**。AI は binding 散文・memory・rule C-2 を知りながら live deferral を再演した | US-01(live 証拠ゲート)は hard 化済だが、AI 自身が `live:check` を呼ばずに自己申告する経路は未封鎖。Try-4(engine-service 自動発火)で v0.0.6 US 化が必要 |
| P37「live-deferral」 | v0.0.4 S11 | **再発**。P-S9-01 が P37 の直接再演。「実操作確認 = 実 claude」を AI が滑ってコードパス代替した | US-01 で dossier 不在なら S9/CLOSE を exit 1 でブロックする機械ゲートは存在する。ただし AI が dossier を作る行為自体を stop させる構造(engine-service 起点の自動発火)が未完 |

**結論**: P36/P37 は soft 規範追加サイクルを 1 回挟んでも再発した。v0.0.6 での hard 化(engine-service 自動発火 + AI 自己申告経路の封鎖)を US として ledger に carried することを S12 への入力として明記する。

---

### S12 への改善提案サマリー

| # | Problem → 提案 | 優先度 | trigger |
|---|--------------|-------|---------|
| IMP-1 | precision-first 振り分けを step-contracts 設計ルールに型付き必須フィールドで組み込む(P-S9-02/03) | 高 | v0.0.6 S8 以降の新ゲート全件 |
| IMP-2 | `probe:rules` 拡張で binding ルール↔ゲート↔テストの drift を機械検出し S9/CLOSE をブロック(P-ARCH-01) | 中 | v0.0.6 S9 |
| IMP-3 | step-contracts を方法論不変条件の単一正本とする規律を S12 に焼き込み、新規二重符号化を S8 チェックリストで禁止(P-ARCH-01) | 中 | v0.0.6 随時 |
| IMP-4 | engine-service が S9 complete を受けたとき `live:check` を自動実行、FAIL で stalled 差し戻し(P36/P37 の hard 化 / Try-4) | 最高 | v0.0.6 S1 reconcile で US 化 |

---

ステータス: S11 確定(consolidated 完了 / 2026-06-21)

# v0.0.5 設計 — 放置可能な自走オーケストレーション(durable / self-healing)

- 種別: アーキテクチャ設計仕様(v0.0.5 S1 の入力 / 本サイクルの中核)
- 作成日: 2026-06-19
- 出どころ: v0.0.4 S10 中の設計対話(2026-06-19)で確定した方針
- ステータス: ドラフト(S1 で US 化する前提の設計合意)

---

## 1. 目的(プロダクトの最終構想)

タスクを**たくさん積んでおけば、人間がほぼ放置していても、AI が人間の判断が要る所まで勝手に進める**基盤。

- タスクを多数キュー投入 → **最大並列起動数 N を超えない**範囲で逐次/並行に起動。
- 各タスクは **人間の判断が必要になる手前まで自走**し、そこで停止して待つ。
- **何があっても自己復帰**:claude のセッション/利用上限、アプリ再起動、クラッシュ程度で**不整合を起こさない**。
- 技術的に「ちゃんとしたものができていない」場合は、**人間に投げず仕組みの中で作り直す(retry)**。

放置度(hands-off 度)を最大化することが価値の源泉。よって「人間の介在点を増やさない」ことが最優先制約。

---

## 2. 最上位原則 — 「プロセスは使い捨て / DB が唯一の真実 / 起動毎に突合復元 / 遷移は冪等」

自己復帰の正体は keep-alive ではなく **durable で reconcilable なステートマシン**:

- **DB(SQLite)が唯一の真実**。実行中状態を in-memory に置かない(置いたら再起動で消える)。
- **プロセス(`claude` 子)は使い捨て**。生死は OS で観測する事実であって、状態の源ではない。
- **起動毎に reconcile**:DB の `running` と実プロセスを突合し、孤児を回収する。
- **全遷移は原子コミット + 冪等**:遅延 emit・二重 emit が来ても不整合を生まない。

→ この4性質を全 step で守れば、claude が落ちようがアプリが死のうが、**起動し直せば DB から正しい続きに戻る**。

---

## 3. 人間の介在点は固定の4つだけ(増やさない)

| 介在点(不可避) | 工程 | 理由 |
|---|---|---|
| 要件決め | S1 | 「何を作るか」は事業判断 |
| 画面決め | S2 / S3 | UI/UX は事業判断 + 視覚承認 |
| 人間レビュー | 視覚レビュー / 受け入れ(S10) | 納品物の double-check |
| 改善プロセス | S11 / S12 | 振り返り・プロセス改善 |

**これ以外で人間を止めない。** 深層実装(S5 分割 / S6 モデル / S7 コード / S8 統合)や、各種の失敗・stall・上限・クラッシュは、**すべて仕組みが自動で retry/復帰**する。技術的失敗を人間タスク化することを**禁止**する(責務契約②「止まってよいのは human-gate だけ」の徹底)。

---

## 4. 各技術ステップの実行ループ — generate → 独立検証 → 自動 retry

「ちゃんとできたら次へ、ダメなら作り直す」を**人間抜きで**成立させるには、システムが「ちゃんと」を機械判定できねばならない:

```
[生成] claude -p / Agent SDK で step 実行
   ↓
[独立検証] 別 run の evaluator / 決定論チェック(完了条件 gap) / visual-eval(mock 突合)
   ↓ 通った              ↓ 落ちた
[前進] DB を done に     [自動 retry](上限 + backoff)→ 生成へ戻る
```

- **独立検証が必須**:claude に自分の成果を自己採点させない(自己採点は偽合格を構造的に生む)。**生成 run とは別の run / 機械判定**が握る。
- 検証 OK で初めて DB 前進。NG は**人間に出さず作り直し**。
- 既存資産:`deterministic-gate`(完了条件 gap = requirements − addressed)、evaluator run、`scripts/s8-visual-eval.ts`(mock vs 実機の vision 判定)。これらを「人間に出す前」でなく「**自動 retry のトリガ**」として全技術 step に適用する。

---

## 5. retry / backoff ポリシー

| 失敗の種類 | 対応 |
|---|---|
| 出力が不完全/不正(検証 NG) | 数回まで**作り直し**(generate からやり直す) |
| stall / ハング(沈黙) | アイドル/壁時計 timeout(**claude 非依存**)で検知 → retry |
| orphan / クラッシュ / アプリ再起動 | 起動時 reconcile → **resume 優先**(session_id があれば同一文脈継続)、無ければ idempotent な re-run |
| claude セッション/利用/レート上限 | **時間を置けば回復する=backoff-retriable** と分類 → 指数 backoff で**自動再開**(retry 回数を浪費しない) |

- 復旧が戻すのは「**パイプライン上の位置**」であって「同じバイト列」ではない(claude は非決定的なので resume が忠実、re-run は新試行)。human-gate 前なので新試行で問題ない。
- **resume を優先**(session_id 永続済み)。resume 不能時のみ idempotent re-run。

---

## 6. retry 上限到達時 = inbox に積む + 後続タスクへ(非ブロッキング)★確定方針

無限 retry(トークン無限消費)を避けつつ、失敗を握り潰さず、throughput も止めない:

- 上限まで失敗した run は **inbox に「要対応」カードとして積む**(人間がいつか拾える / 失われない)。
- **スケジューラは止まらず後続の eligible タスクへ進む**(N の空きを使って別タスクを起動)。
- = 詰まった 1 件のために全体を止めない。放置度を保ったまま、永久不良も可視化される。

> これは routine な human-gate ではなく**例外通知**。通常フローでは発生しない最後の砦。

---

## 7. claude 依存の封じ込め(不確実性の隔離)

オーケストレーションの整合性は **claude に一切依存させない**。claude の不確実性は「**1 試行の内容**」に隔離し、検証 + human-gate で受け止める。

| claude 非依存(確実) | claude 依存(1試行に隔離・検証で受け) |
|---|---|
| プロセス生死(OS)/ DB 遷移 / reconcile / 並列計数 / timeout | その run が何を作ったか(emit 解釈)/ session_id / 出力の質 / 再実行の非決定性 |

ハードニング規則:
1. **emit はスキーマ厳格検証**。壊れていたら**人間でなく retry**(誤った done を作らない)。
2. **"done" を観測事実で裏取り**:status=done でも**成果物ファイル不在/検証 NG**なら done にしない(claude の自己申告を権威にしない)。
3. **stall は timeout(claude 非依存)が最終 backstop**。claude の自己申告 stalled は早期ヒントに過ぎない。
4. **上限は exit/エラー信号から分類**(文章解釈に頼らない)。

---

## 8. 自己復帰シナリオ(受け入れ条件の核)

| 事象 | 期待挙動 |
|---|---|
| アプリ/backend 再起動(mid-run) | 起動時 reconcile → 孤児 run を検知 → resume または retry。**不整合ゼロ** |
| claude セッション/利用上限 | backoff → 自動再開。人間に出さない |
| claude プロセスのクラッシュ/即死 | exit 検知 → 検証 NG 扱い → retry |
| ハング(無出力) | idle timeout → stall → retry |
| 遅延 emit(孤児の子が後から完了報告) | **冪等に無視**(`RunNotFound` で不整合化しない) |
| 検証 NG(不完全成果物) | 自動作り直し(上限まで)→ 上限で inbox + 後続へ |

---

## 9. 自走スケジューラ(新規 / v0 は手動 phase 起動だった)

- **DB 駆動**:pending タスク群から、依存 DAG・human-gate・並列上限 N を見て起動可能なものを launch。
- **human-gate parking**:判断が要る step は HumanTask/review を立てて run を「待ち」状態で永続(人間が後で答える=数日後でも保持)。
- **起動毎に desired vs actual を再導出**して(再)起動。**二重起動しない**(冪等)。
- 完了(human-gate 不要)後は**自動で次の eligible step を起動**(= 逐次自走)。

---

## 10. 監視 / オブザーバビリティ(emit 非依存)

- **live-run レジストリ**:runId ↔ pid ↔ session_id ↔ startedAt ↔ last-activity を **DB 永続**。「今どのサイクルのどのタスクが起動中か」は **studio が持つ**(claude は列挙しない=実測確認済み)。
- 進捗/生死は **stream を逐次監視**(`claude -p --output-format stream-json` を塊読みでなく逐次、または **Agent SDK `query()` の `SDKStatusMessage`/`SDKTaskProgressMessage` 等**)で取得。emit を待たない。
- (任意)組織コスト監視は **OpenTelemetry**(`CLAUDE_CODE_ENABLE_TELEMETRY`)で OTLP backend へ。

---

## 11. 現状(v0.0.4)コードのギャップ — v0.0.5 で閉じる

| 項目 | 現状 | v0.0.5 |
|---|---|---|
| DB 真実 + 起動時 reconcile | ✅ あり(`reconcile.ts` / `server.ts` 起動時)— 孤児を stall 化 | reconcile を resume 優先 + 自動 retry に強化 |
| session_id 永続 | ✅ live server で配線済(`sessionRepo`) | resume 経路を自走 retry から使う |
| retry 経路 | △ あり(onStall: retry / maxRetry)だが**人手トリガ** | **自動トリガ**化(検証 NG / 上限 / 孤児) |
| 独立検証→retry ループ | △ evaluator / deterministic-gate / visual-eval は存在 | 全技術 step の**自動 retry トリガ**として配線 |
| 上限/レート分類 + backoff | ❌ 無し | 追加(放置中の最大の穴) |
| 自走スケジューラ(N 並列 + DAG + parking) | ❌ 無し(手動 phase 起動) | 新規 |
| stream 逐次監視 / live-run 台帳 | ❌ stdout 塊読み(`live.ts` の `new Response(out).text()`) | 逐次監視 + 永続台帳(or Agent SDK 移行) |
| late-emit 冪等化 | △ ログ止まり(`RunNotFound`) | 安全に無視(冪等) |
| 上限到達 → inbox + 後続継続 | ❌ 無し | 新規(§6) |

---

## 12. v0.0.5 受け入れ条件(ドラフト)

1. backend を mid-run で kill→再起動しても、起動後に全 run が**正しい続き**に戻る(不整合・取りこぼしゼロ)。
2. claude セッション/利用上限を**人為的に**誘発しても、人間に出さず backoff 再開で完走する。
3. 検証 NG の step が、人間に出ず**自動で作り直され**、通ったら前進する。
4. retry 上限到達 run が **inbox に積まれ**、かつ**後続タスクは止まらず**進む。
5. 並列起動数が常に **N 以下**。
6. 人間の介在点が**固定4つ(要件/画面/レビュー/改善)以外に増えない**ことを、実機シナリオで確認(技術的失敗で human タスクが立たない)。

---

## 13. スコープ外 / 次への論点

- worktree 複数による**真の並行サイクル**(N>1 を別 worktree で)は v0.0.5 で扱うか、さらに後か要判断。
- Agent SDK 全面移行(CLI spawn → `query()`)は監視・制御で有利だが、移行コスト大。v0.0.5 で「逐次 stream 監視」だけ先行し、SDK 移行は別途も可。
- OTEL は任意(組織コスト可視化が要るまで保留可)。

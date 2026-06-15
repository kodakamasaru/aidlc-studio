# S11 — レトロスペクティブ 進行ログ / v0.0.4

## メタ
- 工程: S11 (Retrospective)
- 役割: プロセスアナリスト
- ステータス: **種(進行中)** — v0.0.4 の S9 進行中(2026-06-14)に判明したプロセス問題を先取り記録。S10 完了後の本 S11 で、下記を Problem/Try として**必ず**根本原因分析すること(完了条件4)。
- 入力参照: S1〜S10 全 Step md, [ledger.yml](./ledger.yml), [s9-validation.md](./s9-validation.md)
- 対象サイクル: v0.0.4
- 作成日: 2026-06-14
- 更新日: 2026-06-14

---

## ★ 先取りプロセス問題メモ(AI 開発部の進め方の欠陥 / S9 進行中に判明)

> **S11 はこの節を必ず Problem として取り込み、各項目に根本原因分析と Try(再発防止)を付けること。** 出典 = 2026-06-14 ユーザー指摘 + AI 自己分析。AI 自身の進め方の欠陥であり、矮小化しない(S11 役割定義)。

### 根本原因(親)
着手時に **最上位の正本 `kit/rules/responsibility-contract.md`(US+mock 最上位 / human-gate のみ停止 / human=ダブルチェック係)と S1–S3 の US/mock 意図を読み込まず**、「テストが緑・完成して見える」を「事業部が決めた仕様に一致しているか」より優先した。この優先順位の逆転から、以下の個別問題が連鎖した。

### Problem 一覧(ユーザー指摘 3 + AI 自己分析 6)

| # | 問題 | 違反した上位ルール | 出典 |
|---|------|-----------------|------|
| P1 | **「人間はダブルチェック係」が最上位ルールに書いてあるのに認識していなかった**。検証を S9/S10 で分担しようとし、視覚ギャップを S10 へ punt しようとした(ユーザーに2度修正された)。 | responsibility-contract / human-gate のみ停止・S10=ダブルチェック | ユーザー指摘 |
| P2 | **S1/S2/S3 で決めた US/mock が事業部目線の正解なのに、勝手に descope 判断をした**。O5(可変ステップ=US-07 + scr-05.variable)を「次サイクルへ carried」と独断で送ろうとした。 | responsibility-contract ④ US+mock 最上位 / 人間判断なしに descope しない | ユーザー指摘 |
| P3 | **S1–S3 で事業部が述べた想定(設計意図)を把握していなかった**。可変ステップは「作成時=デフォルト snapshot → US 洗い出し後にヒアリングで構成最適化」とユーザーが既に述べていたのに、把握しておらず的外れな実装案(作成時チェックボックス)を出した。 | 仕様(US/mock/Q&A)を正本として読む | ユーザー指摘 |
| P4 | **最上位の正本を読まずに着手した**(P1–P3 の根本)。CLAUDE.md が responsibility-contract を「最上位・全工程 binding / **必ず読んで従う**」と明記しているのに未読のまま S9 を開始した。 | CLAUDE.md 明示の必読指示 | AI 自己分析 |
| P5 | **mock 注入(page.route)で「未実装の能力」を覆い隠しかけた(最も悪質)**。variable/completed/enlarged/gallery を frontend データ注入で撮り「視覚証拠あり」と整理。特に variable は**実機到達不能=US-07 が要求する能力が未実装**という事実を、mock がカバー済みに見せた。指摘まで「ハーネスの限界」と誤って合理化した。 | mock で誤魔化さない / 未実装は honest に surface | AI 自己分析 |
| P6 | **仕様(US/mock)インベントリ起点でなく産物起点で動いた**。クロスウォークを「撮れたもの」と S8 既存突合表から組み立て、7 US を最初に通読しなかった(US-07 を読んだのは手詰まり後)。 | completeness-checks-anchor-on-spec(産物起点だと存在しないものを構造的に見逃す) | AI 自己分析 |
| P7 | **サブエージェントの「全部グリーン」を検証せず信じかけ、事業部目線の視覚判断を外注した**。最初の capture worker の「22 撮影・全緑」を受け入れかけ、視覚突合で半数が誤キャプチャと判明。mock 突合という中核判断を繰り返し worker に投げた。 | mock-match は自分で握る / dogfood 原則 | AI 自己分析 |
| P8 | **機能実証(38 AC)を主成果に置き、視覚=mock 突合を「後回しにできるもの」扱いした**。US+mock が最上位なのに優先度を逆転。当初 6 未撮影+多数の乖離を S10 送りで「レビュー待ち」にしようとした。 | US+mock 最上位 | AI 自己分析 |
| P9 | **手戻り判定が一貫していなかった**。明白なクラッシュ(O6)は正しく手戻りできたのに、同じ「mock/US にあるのに実機で出せない=未実装=手戻り」の論理を variable に適用できず descope した。 | 手戻り基準の一貫性 | AI 自己分析 |

### Try(再発防止 / S11 で精緻化)
- T1: **着手前チェックリスト**: ①`kit/rules/responsibility-contract.md` を読む ②当該サイクルの全 US + S2/S3 mock + Q&A を通読し「事業部が決めた正解」を把握 ③S10=ダブルチェック / 検証は S9 で全部、を前提に置く。
- T2: **descope 禁止ゲート**: US/mock に commit された項目は AI 単独で carried/次サイクル送りにしない。実機到達不能なら「未実装の能力」として手戻り対象に上げ、人間に判断を仰ぐ。
- T3: **mock 注入の用途制限**: frontend mock 注入は「描画の確認」限定。実 backend で到達できない=未実装の疑いとして必ず surface し、視覚証拠の体裁で覆い隠さない。
- T4: **仕様インベントリ起点の網羅**: クロスウォークは産物でなく US/AC + mock 状態の全件インベントリから逆算する。
- T5: **中核判断の内製**: mock 突合・事業部目線の視覚判断は AI 自身が握り、worker の「緑」は必ず実物(screenshot/挙動)で検証する。

---

### Problem 追補 — composition-root 配線漏れ(S10 実機 live 検証 / 2026-06-15)

| # | 問題 | 根本原因 | 出典 |
|---|------|---------|------|
| P10 | **live orchestrator の composition-root 配線漏れが連続露呈**。① reconstruction 自己再発火による無限ループ ② 隔離フラグ欠如で headless claude が対象リポの CLAUDE.md/フック/memory を読み英語ハイジャック ③ `sessionRepo` 未配線で session_id が保存されず回答後 resume が停止 ④ resume が `process.cwd()` 起動で別 cwd のセッションを見失う ⑤ reconstruction トリガが engine.react(AI-emits-done)だけに配線され、正規の human-in-the-loop(人間が S1 レビュー承認=finalizeApprovedReview は DB 直書きで sink を通らない)では一切起動しなかった — いずれも**決定論テスト緑のまま実機でのみ露呈**。 | `LiveClaudeOptions` 等が**任意フィールド(`foo?:`)主体 → server.ts で渡し忘れても tsc 通過 → 決定論テストは依存をモック直接注入するので composition-root の漏れを構造的に検出できない**。実機の縦経路(launch→question→answer→resume)を一度も通していなかった。 | S10 実機 live + 配線監査 |

- T6: **composition-root を仕様(インターフェース)起点で監査する**。adapter のオプション/ポートは「任意フィールドでも本番必須なら必須化、できなければ未配線時 loud-log(原則④)」。決定論テストは mock 注入で composition を見ないので、**live の縦経路は実機 e2e を1本通すまで「未配線かもしれない」前提**で扱う([completeness-checks-anchor-on-spec] の composition 版)。
- T7: **プロセス問題は発生時にこの S11 へ即メモする**(ユーザー指示 2026-06-15)。サイクル末でまとめて思い出すのでなく、起きた時点で Problem 表に追補する。
- T8: **ハーネス検証の対象 PJ は使い捨てリポ(/tmp 等)にし、studio リポ自身に向けない**(ユーザー指示 2026-06-15)。live S1 等は実 `aidlc-docs/{version}/` に成果物を書くため、dogfood リポに向けると本物の作業ツリーが汚染される(実際に test サイクル v0.0.5 の S1 US 群が混入した)。検証は isolated repo + isolated DB + 別ポートで行う。

---

## 品質メトリクス
（S10 完了後に S11 本実行で記入。S9 = バグ CRITICAL 0 / HIGH 1(O6 検出・本サイクル修正) / MEDIUM 2(O3/O5 carried) ほか。決定論 505 + E2E 33 + live 8 green。）

## タイムライン / バックトラック
（S11 本実行で記入。既知バックトラック: BT-01/02/03(S8→S4) / BT-04(S9→S8 = O6) / 可変ステップ手戻り(S9→S6/S7/S8 = O5、実装予定)。）

## Keep / Problem / Try
（上記「先取りプロセス問題メモ」を Problem の起点とし、S11 本実行で Keep/Try を補完。）

## AI が独自に決めたこと と 理由
（S11 本実行で記入。）

## 次サイクルへの引き継ぎ
（S11 本実行で記入。)

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

### Problem 追補 — 成果物 md 編集を人間に求める「IDE-driver 前提」の残存(S10 実機 live 検証 / 2026-06-16)

| # | 問題 | 根本原因 | 出典 |
|---|------|---------|------|
| P11 | **live S1 の AI 出力が「各 md を IDE で開き、回答/判断行に直接書き込んでください」と人間に md 編集を要求した**。プロダクトの魂は Human Inbox(人間は IDE を触らずカード/会話だけで捌く)なのに、AI は旧 IDE-driver モデルを復唱した。`qd-resolved-conversationally` / `self-contained-review-questions` に反する。 | ① **前提ルールが live プロンプトに無い**: 合成プロンプトは role + skill 本文 + 構造化コンテキスト + 出力契約のみで、「人間は md を編集しない/AI が唯一の書き手」という対人契約をどこにも注入していなかった。② **skill 本文 12 件すべてが旧モデルを明示的に教えていた**(「ユーザーが IDE で md を直接編集」「(ユーザー記入)」「判断行で…直接書く」)。AI は本文の支配的ナラティブを復唱した。 | S10 実機 live |

- 対処(本サイクルで根治): ① `kit/rules/aidlc-operating-model.md` に最上位の対人契約節「人間は md を編集しない — AI が唯一の書き手(全 surface 共通)」を新設。② `prompt-composer.ts` の `OUTPUT_CONTRACT_INSTRUCTION` 先頭に「対人契約(最上位)」ブロックを追加し、全 live プロンプトに焼き込み(skill 本文の旧ナラティブを上書き)。③ 12 skill 本文の md 編集誘導とテンプレ「(ユーザー記入)」を「AI が質問→人間はカード/会話で回答→AI が md に代筆」へ全件掃除。
- T9: **道具で直らない対人契約は skill 本文 + operating-model + composer の 3 箇所に焼く**。「人間が md を編集する」前提は IDE/web どちらの surface でも禁止。質問・判断・レビューは必ずカード/会話で受け、md は AI が代筆する([completeness-checks-anchor-on-spec] の対人契約版 — 仕様=「人間は md を触らない」を全注入点で潰す)。
- T9 追補(ユーザー指摘): ラベルを「(人間の回答を AI が記入)」に変えるだけでは不十分だった。D-NN テンプレが `判断: 承認 | 上書き | 保留` という**未入力メニュー**(人間が md で選ぶ前提の形)のままで、かつ全 AI 決定に人間 verdict を付けて責務契約②(技術判断=AI 自走確定 / 事業判断のみ human-gate)に反していた。12 skill の D-NN を **AI自走ログ型**に再設計(`種別`: 技術判断=AI自走確定 / 事業判断=要 human-gate、`上書き`: レビューで人間が覆したときのみ AI 記録)。**ラベルだけでなくフォーマットの「形」自体が旧パラダイムを残していないか**を点検する。

| # | 問題 | 根本原因 | 出典 |
|---|------|---------|------|
| P12 | **最上位 binding の `responsibility-contract.md`(4 ゲート: ①内部コード非前提 ②human-gateのみ停止 ③done=納品 ④US+mock最上位)が live プロンプトに一切注入されていなかった**。契約ファイル自身が「将来の live prompt 組立はここを指すだけ」と宣言しているのに、composer は role+skill本文+構造化コンテキスト+出力契約のみで契約本文を載せていなかった。skill からの相対リンク参照は headless AI が読む保証がなく、4 ゲートが事実上効いていなかった。 | P11 と同根 = **binding ルールがリンク参照止まりで live コンテキストに届いていない**。「リンクで指す」≠「プロンプトに入る」。headless 実行は別プロセスの `claude -p` で、リンク先を自発的に読む保証がない。 | ユーザー指摘(responsibility-contract が効いてる気がしない) |

- 対処(本サイクルで根治): `prompt-composer.ts` に `contractLayer()` を追加し、正本 `kit/rules/responsibility-contract.md` を Fs 経由で読んで**全 live プロンプト(generator/evaluator/legacy/reconstruction)の先頭**(最上位=衝突時に勝つ位置・skill 本文より前)に注入。不在時は loud 可視マーカー(原則④)。複製でなく正本 1 ファイルの runtime 描画。実プロンプト合成で 4 ゲート全件含有を probe で確認・決定論 611 green。
- T10: **binding ルールは「リンクで指す」でなく「プロンプトに本文注入」で効かせる**。最上位契約・operating-model の対人契約など、全工程必達の規範は composer が正本を読んで全 live プロンプトに焼く(リンク参照は人間用の単一正本維持であって、headless AI への配送手段ではない)。新しい binding ルールを足したら「どの注入点で AI に届くか」を必ず確認する。

| # | 問題 | 根本原因 | 出典 |
|---|------|---------|------|
| P13 | **差し戻し(却下)理由が「恒久的に考慮」されていなかった**。context-resolver Section 9 は配線済みで却下理由を live AI に届けてはいたが、(a) **最新 1 件しか注入せず**過去の却下理由を捨てる、(b) **どの却下も現ステップ名でラベル**し S8 却下を S9 に誤帰属しうる、(c) **サイクル単位**(facts)で次サイクルへ carry されない、の 3 点で“恒久”でなかった。却下理由=苦労して得た制約なのに揮発していた。 | 「その場の再起動 1 回に効けばよい」という単発前提のままで、却下理由を D決定/ledger のような durable 記録に昇格していなかった。store が最新 1 件・サイクル scope だと教訓が構造的に脱落する([completeness-checks-anchor-on-spec] の教訓版)。 | ユーザー指摘(差し戻し理由が永続的に考慮されるべき) |

- 対処(本サイクルで根治): ① **app(context-resolver Section 9)**: 却下理由を `review.step` で正しく帰属し、**全件・現ステップ優先**で注入。誤帰属を解消(test 2 本追加)。② **ledger 昇格を注入テキストに同梱**: Section 9 が「これらの却下理由を ledger.yml に done/carried で台帳化せよ」を**プロンプト内で直接指示**(リンクでなく配送)。③ **`kit/rules/ledger.md`** に「差し戻し理由の台帳化」節(`BT-NN` エントリ・done=closed_in / carried=into)を新設。サイクル跨ぎは reconcile ゲートが強制。決定論 612 green。
- T11: **苦労して得た制約(却下理由・手戻り教訓)は単発でなく durable に持つ**。store が「最新 1 件 / サイクル scope」だと教訓は構造的に脱落する。app は全件を確実に注入し、跨サイクルは ledger 昇格 + reconcile ゲートで恒久化する。新しい「AI に効かせたい記録」を足したら〈全件か?・正しい帰属か?・サイクルを越えて残るか?〉を点検する。

### Problem 追補 — 運用モデルが headless に届かず / mock 突合が自己採点(2026-06-17)

| # | 問題 | 根本原因 | 出典 |
|---|------|---------|------|
| P14 | **固めた運用ゲートが AI に届いていなかった**。`aidlc-operating-model.md`(PhaseGroup / S3↔S7 境界 / Rule A・B / mock 突合の完全性ゲート / 視覚証拠ゲートの正本)が composer・context-resolver から **0 参照の孤児**で、headless worker の prompt に一切入っていなかった(IDE は SKILL.md のリンク頼りで運次第)。「運用として固めたのに AI に伝わらない」の物理的正体。 | 責務契約は composer が正本注入する doctrine([[T10]])が確立済なのに、operating-model だけ同 doctrine から漏れていた。リンクは headless に届かない。 | ユーザー指摘(運用として固めてるものが AI に伝わらない) |
| P15 | **mock 突合が自己採点で偽の一致が通る**。S8 手順5 はビルダー AI が自分の実機画面を自分で「一致」と表に書く自己申告で、実機がモックから大きく乖離していても「26/26 一致」が通っていた。唯一の比較器が人間の目になり、人間が乖離を一つずつ指摘する pixel-diff 機械をやらされていた。 | ビルド完了とモック一致を切り分けず、視覚 oracle(独立した比較器)を harness に持たせていなかった([[mock-match-before-human-review]] の自動化欠落)。capture は出来ていたが比較が未自動化。 | ユーザー指摘(画面モックから大きく乖離し細かく一つずつ指摘) |

- 対処(本サイクルで根治): ① **composer に `operatingModelLayer()` 追加** — 責務契約の直後に operating-model 全文を全 compose 経路へ注入(headless)+ **12 SKILL.md 冒頭に必読プリアンブル**(IDE 直接起動)で両 surface パリティ。注入を test 固定。② **独立 vision evaluator ハーネス `scripts/s8-visual-eval.ts`(`bun run verify:visual`)新設** — モック PNG と 実機 PNG をペアにし **ビルダーとは別 run** の vision モデルで 1 状態ずつ厳格判定 → 機械生成の突合表(`s8/visual-eval.json`)+ exit-code ゲート(parse 不能/未実装は fail-closed=乖離)。純粋ロジックは `src/app/services/visual-eval.ts`(11 test)。S8 SKILL手順5 + operating-model 視覚証拠ゲートを「自己採点禁止 / 独立 evaluator が握る」に改訂。決定論 627 green。
- T12: **「固めた = 効く」ではない。固めたルールは "どの注入点で AI に届くか" を必ず確認する**([[T10]] の operating-model 版)。新しい `kit/rules/*.md` を足したら headless(composer 注入)と IDE(skill 本文 or リンク)の両経路で実際に届くかを点検する。リンクは人間用の単一正本維持であって headless への配送手段ではない。
- T13: **AI に「自分の成果物を自分で採点」させない**。mock 突合・視覚判断のような oracle はビルダーとは別 run の evaluator が握り、人間は最後に OK を出すだけにする。自己採点は偽の合格を構造的に生む。capture(撮る)が出来ていても compare(比較)が自己申告なら品質ゲートは機能しない。

### Problem 追補 — サイクル版数が live プロンプトに届かず / カード見出しがパス露出(S10 実機 live F-9 検証中に発見 / 2026-06-17)

| # | 問題 | 根本原因 | 出典 |
|---|------|---------|------|
| P16 | **サイクルの version が live プロンプトに一切注入されていなかった**。cycle=v0.0.2 でも AI は成果物を `aidlc-docs/v0.0.1/s1/…` に書き、artifactGlob(=v0.0.2)と着地先が食い違い、このサイクルの成果物解決が空になる。前段文脈注入(US-01)も同じ版数前提なので波及しうる配線欠陥。**決定論テスト緑のまま実機でのみ露呈**(F-11)。 | 出力契約の例 `aidlc-docs/{version}/sN/…` も Section 8 の artifactGlob も **`{version}` 未解決プレースホルダのまま**で、解決済み版数を AI に渡す注入点が存在しなかった。AI は版数を知るすべが無く自分で v0.0.1 を創作。[[completeness-checks-anchor-on-spec]] の「プレースホルダは解決されて初めて契約」版。 | S10 実機 live(F-9 検証ついで)|
| P17 | **人間向けレビューカードの見出しが生のファイルパス**(`aidlc-docs/v0.0.1/s1/us-01-browse-menu.md` 等)。人間は web カードしか見ずファイルを開けないのに、サーバ内部のディレクトリ構造を露出 → **責務契約①違反**(F-10)。 | live ハーネスが成果物 .md を review block 化する際、block.title に相対パスをそのまま入れていた。契約①(人間向け出力にパス/内部構造を出さない)を「人間が読む文」として block.title まで適用していなかった。 | S10 実機 live(F-9 検証ついで)|

- 対処(本サイクルで根治): ① **structured context に常時 present の「成果物の書き込み先」節**を追加 — 解決済み版数 + 工程の正準ディレクトリを明示し「{version} のまま/別版数に書くな」と binding 指示。Section 8 の `{version}` も実版数へ解決、出力契約文も補強。live 実証で v0.0.3 cycle が `aidlc-docs/v0.0.3/s1/` に正着地を確認。② **block 見出しを成果物本文の H1(日本語事業語)から導く純関数 `artifactBlockTitle`** を新設しパス由来 title を廃止、同種サイトを全数棚卸し。決定論 634 + 回帰テスト green。③(横展開・追補 2026-06-17 目視確認時)F-10 修正後の live 目視で **成果物本文のメタに `入力参照: brief.md` が残存**と判明 → 根因は **全 12 SKILL.md テンプレの メタ `入力参照: [パス]` 規約**(AI がテンプレ通り写すと人間向け成果物にパスが載る系統欠陥)。対処: 責務契約①に「成果物の本文・メタ・見出しにもパス/リンク/.md/ディレクトリ名を出すな、前段参照は事業語で」を焼き込み(composer 注入の正本)+ **全 12 テンプレの `入力参照` を事業語へ一括置換**(パス形跡ゼロを grep 確認)。④(さらに追補)kit 同期後の live 再確認で **2系統の追加漏れ**を発見・対処: (a) **web の `ArtifactsSection`(「この工程で作られたもの」)が成果物の basename + フルパスをそのまま描画**していた(F-10 の兄弟・別要素)→ パスを事業ラベルへ変換(`index.md`→「一覧」等)。(b) **全 skill テンプレに `親: [sN/index.md]` ×5 / `視覚 source: [scr-NN.html]` / `視覚カタログ [tokens.html]` 等の可視パスリンク**が残存 → 全て事業語化。

| # | 問題 | 根本原因 | 出典 |
|---|------|---------|------|
| P18 | **dogfood 検証が古い kit で回っていた**。`verify:test` は seed 時のみ studio の `kit/` を sandbox へコピーし、composer は **sandbox 側 kit から skill/契約を読む**ため、studio kit を直しても live には反映されず「直したのに直っていない」を生んだ。加えて **視覚チェックヘルパ自身が見出しだけ走査してメタ `<li>` 漏れを見逃し誤 PASS** を出した。 | テスト基盤の前提(どの kit を読むか / 何を走査するか)を仕様起点で点検していなかった([[completeness-checks-anchor-on-spec]] の検証基盤版)。 | S10 目視確認(2026-06-17) |
| P19 | **AI が成果物の地の文(決定理由)に `index.md` 等のファイル名を書く**(契約① の残り火 / 例「理由: index.md D-03 と同一方針」)。テンプレ・web を直してもこれは AI 出力なので残る。 | プロンプト契約は強化したが AI の遵守は確率的。決定論的に消せない種類。 | S10 目視確認(2026-06-17) |

- 対処(続き): ④ web `ArtifactsSection` をラベル化 + テンプレ可視パスリンクを全て事業語化。⑤ **`verify:test` を毎起動で kit 再同期**に変更(stale-kit 根治)。⑥ **再利用可能な視覚検証 `scripts/ui-shot.ts`(`bun run verify:shot <path>`)新設** — 同梱 chromium で起動(Chrome MCP ブリッジ不要)し **全可視テキストを走査**してパス露出を exit-code でゲート(P18(b) の精度バグ修正済)。⑦ P19 は責務契約①に「成果物の本文・メタ・見出しにもパスを出すな / 前段参照は事業語で」を焼き込み(composer 注入)→ 確率は下がるが非決定論。**`verify:shot` ゲートが承認前に毎回検出**して担保。
- T16: **視覚検証は「全可視テキスト走査 + exit-code ゲート」にする**。見出しだけ・目視だけは漏れる。`verify:shot` を承認前ゲートに使う。
- T17: **dogfood テスト基盤は『どの正本を読むか』を毎回最新化する**。sandbox へコピーする方法論(kit)は起動毎に再同期。「直したのに反映されない」は基盤の stale が原因のことがある。
- T14: **テンプレートのプレースホルダ(`{version}` 等)は「解決して prompt に届く注入点」を必ず1つ持たせる**([[T10]]/[[T12]] のデータ値版)。契約文に placeholder を書いただけでは headless AI には未解決の文字列が届くだけ。cycle 固有の解決値(version/path/id)は structured context の always-present 節で渡す。
- T15: **契約①(パス/内部構造の非露出)は「人間が読む全フィールド」に適用する** — 本文だけでなく **カードの title/ラベル/見出し**まで。新しく人間向け文字列を生む箇所を足したら、そこにパス・内部 ID が混入しないか点検する。

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

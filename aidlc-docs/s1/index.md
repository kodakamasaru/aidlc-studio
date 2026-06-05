# S1 — ユーザーストーリー(一覧)

## メタ
- 工程: S1 (User Story)
- 役割: プロダクトマネージャー
- ステータス: 確定
- 入力参照: [brief.md](../brief.md)
- 作成日: 2026-06-05
- 更新日: 2026-06-05

> 進め方: **US インベントリ + 版割り**を視覚レビュー(承認/差し戻し)→ OK後に 1 US 1 ファイル(`us-NN-*.md`、3観点)へ展開する。
> 粒度方針(kit 準拠): **1 US = 1 つの独立してテスト可能な縦スライス。US 数は出力であって目標ではない**。
> アクター: 単一ユーザー(AI-DLC を回す開発者本人)。

## US インベントリ(版タグ = サイクル割り提案)

版凡例: `[v0.0.1]` = MVP(Human Inbox 縦ループ) / `[v0.0.x]` = 機能拡張

### A. Vision & Project
| ID | タイトル | 版 | 概要 |
|----|---------|----|------|
| US-26 | ビジョン(brief 相当)を作成・管理する | v0.0.x | 初回 PJ オープン時等に完成ビジョンを起こし更新する |
| US-25 | 複数リポジトリ(PJ)を切り替える | v0.0.x | Backlog の PJ のように対象アプリを切り替える |

### B. Backlog & Task
| ID | タイトル | 版 | 概要 |
|----|---------|----|------|
| US-01 | Backlog に Task(開発要求)を積む | v0.0.x | 要求を登録し溜める |
| US-02 | Task の優先順位を変える | v0.0.x | Backlog 内で並べ替え |
| US-03 | Task を Cycle に手動で割り当てる | v0.0.x | どの Task をこの Cycle で回すか |
| US-04 | AI に Task→Cycle の割り当てを提案させる | v0.0.x | AI が束ね方を提案、人間が判断 |
| US-23 | AI が Task を提案する(新規起案) | v0.0.x | ビジョン/状況から AI が次の要求を起案 |
| US-24 | AI が Task の妥当性を確認する | v0.0.x | 重複検知 / 起票後の状況変化(陳腐化)検知 |

### C. Cycle 実行
| ID | タイトル | 版 | 概要 |
|----|---------|----|------|
| US-05 | Cycle を作成する | **v0.0.1** | Task を束ねた実行単位を作る(最小は単一 Task でも可) |
| US-06 | Cycle を開始し Phase を起動する | **v0.0.1** | サイト操作で AI-DLC を headless 起動 |
| US-07 | ステップ専用 Agent が成果物を生成する | **v0.0.1** | orchestrator が kit/skills/aidlc-sN を load |
| US-08 | AI が止まったらサイトから retry する | **v0.0.1** | stall 検知 → 再実行 |
| US-09 | 複数 Cycle を並行実行する | v0.0.x | worktree 分離で同時進行 |
| US-29 | Cycle を一時停止・注視(監視)する | v0.0.x | 走行中 Cycle を止める / 進行を見守る |
| US-30 | Cycle を完了(クローズ)する | v0.0.x | S7 まで終えた Cycle を締め次へ渡す |

### D. Dashboard
| ID | タイトル | 版 | 概要 |
|----|---------|----|------|
| US-10 | 最小ダッシュボード(待ち2列) | v0.0.x | AI待ち / Human待ち |
| US-11 | プロダクトバックログ風のちゃんとした Dashboard | v0.0.x | 4象限(Backlog / Active Cycles / AI待ち / Human待ち)を見やすく |

### E. Human Inbox / 判断
| ID | タイトル | 版 | 概要 |
|----|---------|----|------|
| US-12 | AI の質問(Q)にサイトで回答し AI を再開させる | **v0.0.1** | Q カード → 回答 → resume |
| US-13 | ステップ最終出力を視覚レビューして承認/差し戻す | **v0.0.1** | md/Mermaid/screenshot を見て次へ or 手戻り |
| US-14 | AI 起点の手戻り提案を判断する(承認/却下) | v0.0.x | 例: S5→S1(AC不足) |
| US-15 | Human 起点で手戻りを要求する | v0.0.x | 例: S6→S2(UI認識違い) |
| US-16 | 実機確認の依頼を受けて結果を記録する | v0.0.x | 実端末動作の確認カード |
| US-17 | 自分の判断(Decision)履歴を追跡する | v0.0.x | なぜそう決めたかを辿る |
| US-28 | Cycle の AI 会話履歴を確認する | v0.0.x | Artifact とは別に対話ログを見る |
| US-31 | Human 待ち発生を通知で受け取る | v0.0.x | ポーリング不要にする |

### F. レビュー成果物
| ID | タイトル | 版 | 概要 |
|----|---------|----|------|
| US-18 | コードを見ずにリッチレビューする | v0.0.x | 変更説明 / AC / screenshot / 動作確認 / テスト / カバレッジ / リスク分析 / 差分サマリ |

### G. Artifact / Wiki / Ledger
| ID | タイトル | 版 | 概要 |
|----|---------|----|------|
| US-19 | 各ステップ成果物をサイトで閲覧する | v0.0.x | US/Mock/Flow/UoW/… の一覧と中身 |
| US-33 | AI が Wiki を自動で維持・更新する | v0.0.x | 成果物からユビキタス言語 / Decision / ledger を起こし常に最新化 |
| US-20 | AI 管理 Wiki を読む | v0.0.x | ユビキタス言語 / Decision / ledger |
| US-32 | Wiki を人間が編集する | v0.0.x | AI 生成 Wiki に人間が手を入れる |
| US-21 | サイクル間の確定持ち越し(ledger)漏れを確認する | v0.0.x | cross-cycle reconciliation の可視化 |

### H. 設定 / 方法論
| ID | タイトル | 版 | 概要 |
|----|---------|----|------|
| US-22 | 対象リポ・モデル等を環境変数で設定する | v0.0.x | セルフホスト対応(絶対パス埋め込み禁止) |
| US-27 | ステップ定義(パイプライン)をカスタマイズする | v0.0.x(優先度低) | S1〜S7 を固定とせず別の工程構成に変えられる |

## US 一覧(ファイル)
- A: [US-26](./us-26-vision-manage.md) / [US-25](./us-25-repo-switch.md)
- B: [US-01](./us-01-backlog-add-task.md) / [US-02](./us-02-task-reorder.md) / [US-03](./us-03-task-assign-cycle.md) / [US-04](./us-04-ai-suggest-assignment.md) / [US-23](./us-23-ai-propose-task.md) / [US-24](./us-24-ai-validate-task.md)
- C: [US-05](./us-05-cycle-create.md) / [US-06](./us-06-cycle-start-phase.md) / [US-07](./us-07-agent-generate-artifact.md) / [US-08](./us-08-retry-run.md) / [US-09](./us-09-parallel-cycles.md) / [US-29](./us-29-cycle-pause-watch.md) / [US-30](./us-30-cycle-complete.md)
- D: [US-10](./us-10-dashboard-minimal.md) / [US-11](./us-11-dashboard-full.md)
- E: [US-12](./us-12-answer-question.md) / [US-13](./us-13-visual-review-step.md) / [US-14](./us-14-backtrack-ai-initiated.md) / [US-15](./us-15-backtrack-human-initiated.md) / [US-16](./us-16-device-check.md) / [US-17](./us-17-decision-history.md) / [US-28](./us-28-conversation-history.md) / [US-31](./us-31-notification.md)
- F: [US-18](./us-18-rich-review.md)
- G: [US-19](./us-19-artifact-view.md) / [US-33](./us-33-ai-maintain-wiki.md) / [US-20](./us-20-wiki-read.md) / [US-32](./us-32-wiki-edit.md) / [US-21](./us-21-ledger-reconcile-view.md)
- H: [US-22](./us-22-env-config.md) / [US-27](./us-27-step-definition-custom.md)

## 全体方針(グルーピング・版割り)

- **グルーピング**: A. Vision&Project / B. Backlog&Task / C. Cycle実行 / D. Dashboard / E. Human Inbox・判断 / F. レビュー / G. Artifact・Wiki・Ledger / H. 設定・方法論。
- **MVP(v0.0.1)= 6 US(US-05,06,07,08,12,13)**: 「単一 Cycle 手動作成 → Phase 起動 → Agent が headless 生成 → Q をサイト回答 → ステップ出力を視覚レビュー承認 → 再開 → stall は retry」。**= 人間が IDE を触らず 1 フェーズ回る**を端まで通す縦スライス。
- **v0.0.x**: 上記以外すべて(Vision管理 / PJ切替 / Backlog一式 / AIタスク提案・妥当性確認 / 並行・一時停止・完了 / Dashboard / 手戻り / 会話履歴 / 通知 / リッチレビュー / Artifact / Wiki読み書き / ledger / env / ステップ定義カスタム)。
- 粒度はテスト可能な縦スライス基準。数(33)は結果であり目標ではない。

## 非機能・設計上の関心事(US ではない / S3・S5・アーキで詰める)

> ユーザー指摘の「コンテキスト精度劣化 / 圧縮回避」。**実は本プロダクトの中核設計がそのまま緩和策になっている**。

- **コンテキストが複雑化するほど AI 精度が落ちる** → 各ステップを **fresh-context の専用 Agent** で実行し、**最小コンテキストのみ引き継ぐ**(brief「コンテキストの質を保つ」/ PDF P.10)。長大な単一セッションに全部を載せない設計が前提。
- **コンテキスト圧縮を避ける** → サマリ圧縮に頼らず、必要情報を **構造化成果物(Artifact / Wiki / ledger)として外部化**し、各 Agent は **必要な成果物だけ read** する。圧縮ではなく「外部記憶 + 選択的ロード」で長期コンテキストを扱う。
- **含意**: Run / Agent の境界設計(どこで切り、何を渡すか)は S3(Unit of Work)・S5(集約)・orchestrator 設計の主要論点。ここで明文化して引き継ぐ。

## 全体 質疑応答ログ

### Q-01 — MVP(v0.0.1)の線引きはこの 6 US でよいか?
- **回答**(ユーザー記入):
  > 外して 6 本。
- **確定**(AI 記入):
  > US-10(最小ダッシュボード)を v0.0.x へ。**MVP = 6 US(US-05,06,07,08,12,13)**。

### Q-02 — US の抜けはないか?(完成ビジョンとの突き合わせ)
- **回答**(ユーザー記入):
  > AIタスク提案 / ちゃんとした Dashboard(プロダクトバックログ風)/ ステップ定義(優先度低)/ 会話履歴確認 / Cycle 一時停止・注視 / Cycle 完了 / 通知 / 人間が Wiki 編集 / AI によるタスク妥当性確認(重複・陳腐化)/ ビジョン作成・管理(brief 相当)/ 複数リポ切替。+ 非機能: コンテキスト精度劣化・圧縮回避。
- **確定**(AI 記入):
  > US-23〜US-33 を追加(計 33 US)。US-33「AI が Wiki を維持・更新する」を明示化(従来 US-20 の名前に埋もれていた振る舞いを独立 US 化)。US-11 を「プロダクトバックログ風のちゃんとした Dashboard」に格上げ。非機能の2点は「非機能・設計上の関心事」セクションに記録し S3/S5/アーキへ引き継ぎ。いずれも v0.0.x(MVP=6 は不変)。

### Q-03 — 追加 11 US 込み(計 33 US)でインベントリを確定し、1 US 1 ファイルへ展開してよいか?
- **回答**(ユーザー記入):
  > とりあえずこれでOK。
- **確定**(AI 記入):
  > 33 US で確定。1 US 1 ファイル(`us-NN-{slug}.md` / 3観点 / AC 冒頭に版タグ)へ展開する。

---

## 全体 AI が独自に決めたこと と 理由

> 注: Q-03(brief)により個別承認は求めない。気になる点はインベントリの視覚レビューで差し戻す。

### D-01 — US-10(最小 Dashboard)を MVP から外し v0.0.x へ(Q-01 確定)
- **理由**: 待ち状況の可視化が無くても 1 フェーズは端まで回る。MVP は縦ループの貫通に集中する。

### D-02 — 非機能(コンテキスト精度・圧縮回避)は US 化せず設計関心事として記録
- **理由**: これらは振る舞い(US)ではなく横断的な設計制約。fresh-context Agent + 成果物外部化という既存方針が緩和策。S3/S5/orchestrator で具体化する。

### D-03 — US-26(ビジョン管理)を v0.0.x に置く(MVP に上げない)
- **理由**: ビジョンは本会話で既に brief.md として存在。MVP は「1 フェーズ貫通」の証明に集中し、ビジョン作成 UI は後続。

### D-04 — US-27(ステップ定義カスタム)は優先度低
- **理由**: 当面 S1〜S7 固定で十分。パイプライン可変化はアーキに可変点だけ残し、UI 化は後回し(ユーザー指定の優先度低を踏襲)。

---

## 棄却した案

### R-01 — Task 単体で AI-DLC を開始できるようにする
- **棄却理由**: brief の中核概念で「Task は単独では開始しない / Cycle が実行単位」と確定。Cycle を必須にする。

## 次工程 (S2) への引き継ぎ
- **画面化が必須**: Backlog(US-01〜04,23,24)/ Dashboard(US-10,11)/ Human Inbox・Q回答・視覚レビュー(US-12,13,16)/ Cycle 作成・開始(US-05,06)/ Artifact 閲覧(US-19)/ Wiki(US-20,32)/ Decision 履歴(US-17)/ 会話履歴(US-28)/ Vision 管理(US-26)/ 設定(US-22)
- **フロー図で説明する方が早い**: Cycle のステップ遷移 + 手戻り(US-06,07,13,14,15,29,30)/ AI待ち→Human待ち→再開のループ(US-07,08,12,13)
- **Biz(=ユーザー本人)論点**: MVP の画面最小セットをどこまで作るか / 手戻りの UX(粒度)/ 通知手段(US-31)/「プロダクトバックログ風」Dashboard の具体像(US-11)
- **MVP(v0.0.1)で S2 が要る画面**: Cycle 作成・開始 / Q回答 / 視覚レビュー(US-05,06,12,13。retry/生成は画面要素少)

## 前サイクルからの引き継ぎ (手戻り時のみ追記)
- 何が漏れていたか:
- 暫定の解決方針:
- 棄却した案とその理由:

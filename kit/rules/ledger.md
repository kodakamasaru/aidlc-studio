# 引き継ぎ台帳(ledger)— サイクル間の確定漏れを構造的に防ぐ

## なぜ必要か

「次サイクルへの引き継ぎ」を散文だけで書くと **検証不能** で、前サイクルで固めた確定事項が次サイクルで silently に格下げ(勝手に「次 Phase 行き」へ)されても気づけない。確定事項に **state を強制**し、次サイクルが消し込みを**強制される**構造にすれば、未処理は機械的に検出できる。

## 置き場所

各バージョンに 1 ファイル: `aidlc-docs/{vX.Y.Z}/ledger.yml`

S1〜S7 のどの工程でも、`### D-NN` で確定した決定・「次サイクルに渡す」と判断した項目は、その確定と **同じターン**で ledger に 1 エントリ追加する。

## スキーマ

```yaml
- id: D-12                    # 出典の D 番号 or 一意 ID
  origin: v0.0.1/s5/index.md  # どの md で確定したか
  decision: "通知フックは送信処理を持たない(型レベルのみ契約)"
  state: carried              # carried | done | dropped のいずれか
  into: v0.0.2                # state=carried のとき必須(どのサイクルへ渡すか)
  reason:                     # state=dropped のとき必須(棄却理由)
  closed_in:                  # state=done のとき必須(消し込んだ md / コミット)
```

### state の定義

| state | 意味 | 必須フィールド |
|-------|------|----------------|
| `carried` | 次サイクルへ持ち越し(未実装/未決) | `into:`(渡し先バージョン) |
| `done` | このサイクル内で消化済 | `closed_in:`(実装した md / commit) |
| `dropped` | 意図的に落とす(BACKLOG 行き含む) | `reason:`(棄却理由 / BACKLOG カテゴリ) |

- `dropped` は [BACKLOG.md](BACKLOG.md) への追記と **同じターン**で行う(台帳化されない落としを禁止)。
- 日付が要る場合は `YYYY-MM-DD`。

## 差し戻し(却下)理由の台帳化(恒久ルール)

人間がレビューで**却下**した理由は「苦労して得た制約」であり、その場の再実行 1 回で消費して終わらせてはならない。**サイクル内では** app が全件をプロンプトに注入する(context-resolver Section 9 = 却下理由を該当ステップに帰属させ全件・現ステップ優先で injection)。**サイクルを跨いで恒久化する**には、却下理由を必ず ledger に 1 エントリ昇格させる:

```yaml
- id: BT-01                       # 差し戻し(backtrack)の通し番号
  origin: v0.0.4/s8 review        # どのステップのレビューで却下されたか
  decision: "却下理由: {人間の却下理由} → 対応: {どう直したか / 制約として何を守るか}"
  state: done                     # このサイクルで直しきった → closed_in 必須
  closed_in: v0.0.4/s8-integration.md
```

- このサイクルで修正完了 → `state: done` + `closed_in:`(反映先 md / commit)。
- 次サイクルへ持ち越し(本サイクルで直しきれない)→ `state: carried` + `into:`(渡し先バージョン)。次サイクル S1 の reconcile ゲートで必ず消し込まれる。
- 却下理由を `done`/`carried` どちらにも台帳化せず黙って閉じることを**禁止**(= 教訓の消失)。Section 9 の注入テキストもこの昇格を必須として指示する。

## reconciliation(次サイクル S1 の開始ゲート)

新サイクルの S1 着手時、AI は **前バージョンの `ledger.yml` を最初に読む**。

- `state: carried` で `into:` が当該サイクルを指すエントリは、**全件が新サイクルの US / D に反映されるまで S1 を `確定` にできない**。
- 反映できない(やはり落とす)場合は、前バージョン ledger の当該エントリを `dropped` + `reason:` に更新し、BACKLOG.md に転記する。**黙って消すことは禁止**。
- 未 reconcile(carried のまま放置)が 1 件でも残る S1 は未完了。

これにより「前サイクルで固めた内容が漏れなく次サイクルに行かず、勝手に次 Phase 行きに落とされる」事故が構造的に起きなくなる。

## 改善提案の deferral 防止(escalation / v0.0.4 S11 P37/P38 恒久ルール)

S11 改善提案は「doc で焼けるもの」と「インフラ実装」に二分されがちで、後者(構造改善)が毎サイクル `carried` に沈み続ける逆選択が起きる(v0.0.3 `S11-P04` 機械ゲートが v0.0.4 で「infra ゆえ後回し」と再 defer され、ゲート無しで走った結果 22 バグ)。**最も効く改善ほど実行されない**この構造を断つ:

- **構造/インフラ改善は backlog でなく次サイクルの first-class US として commit する**。`carried` で送るときも「次サイクルで US 化する」前提を `escalation:` フィールドに明記する。
- **同一趣旨の改善提案が 2 サイクル連続で `carried` なら自動 escalate**: 次サイクル S1 の reconcile ゲートは、その項目を「単なる carried」でなく **US 化必須**(未 US 化なら S1 を `確定` にできない)として扱う。
- **reconcile ゲートの拡張**: 新サイクル S1 は前 1 バージョンだけでなく、**過去全サイクルの S11 改善提案 vs 本サイクルの再発**を突合する(同じ Problem が再出していないか)。再出していれば「テキスト処方が効いていない」証拠として US 化へ escalate する。

関連: [[feedback-no-scope-cut-by-construction]] / [[feedback-backlog-outside-aidlc]] / [[feedback-aidlc-version-isolation]]

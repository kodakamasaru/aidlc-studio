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

## reconciliation(次サイクル S1 の開始ゲート)

新サイクルの S1 着手時、AI は **前バージョンの `ledger.yml` を最初に読む**。

- `state: carried` で `into:` が当該サイクルを指すエントリは、**全件が新サイクルの US / D に反映されるまで S1 を `確定` にできない**。
- 反映できない(やはり落とす)場合は、前バージョン ledger の当該エントリを `dropped` + `reason:` に更新し、BACKLOG.md に転記する。**黙って消すことは禁止**。
- 未 reconcile(carried のまま放置)が 1 件でも残る S1 は未完了。

これにより「前サイクルで固めた内容が漏れなく次サイクルに行かず、勝手に次 Phase 行きに落とされる」事故が構造的に起きなくなる。

関連: [[feedback-no-scope-cut-by-construction]] / [[feedback-backlog-outside-aidlc]] / [[feedback-aidlc-version-isolation]]

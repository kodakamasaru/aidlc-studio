# US-10: reconcile/ledger を project(repoPath)パラメータ化 + 跨サイクル seed fixture — 任意 PJ で動くプラットフォーム機能にする

## メタ
- 親: 要件一覧
- 対応 S2 画面 (確定後に追記): 未
- ステータス: 確定

## 3 視点

### なぜするか (Why)
跨サイクル機能(ルート台帳 / reconcile)が studio リポ固定の CLI になっていて、任意 project で動く「プラットフォーム機能」になっていない(`REPO_ROOT = この CLI の親ディレクトリ` 固定)。seed した sandbox リポには台帳も無く 1 project = 1 cycle なので、跨サイクルの block/pass を seed 上で即確認できない。これは「studio 前提がコア実行経路に漏れる」P-ARCH-02 の中核で、最初の外部 PJ 導入前に塞ぐ必要がある。

### UX へのインパクト
ユーザーが studio 以外の自分のリポを対象にしても、前サイクルの確定が次サイクルへ漏れなく渡る reconcile が同じように効く。studio 専用ツールではなく、どのアプリにも使えるプラットフォームになる。

### 受け入れ条件 (AC)
- reconcile / ルート台帳の処理を **repoPath パラメータ化**する(CLI の cwd 固定をやめ、対象 project の repoPath で動く / BACKLOG §K)。
- **跨サイクル seed fixture** を追加: 前サイクル done + 台帳に carried 項目 + 現サイクル S1 の多サイクル fixture。これで reconcile ゲートの **block(未 reconcile あり)/ pass(ゼロ)を seed 上で即確認**できる。
- seed materializer を複数 version / 台帳対応に拡張する(現状の 1 project=1 cycle・台帳なしを解消)。
- studio 自身の dogfood(cwd 固定経路)も従来どおり動く(後方互換)。

## この US 固有の 質疑応答ログ

### Q-01 — (未)
- **回答**(人間の回答を AI が記入):
  > 
- **確定**(AI 記入):
  > 

---

## この US 固有の AI が独自に決めたこと と 理由

### D-01 — US-04 の inbox 画面化・跨サイクル検証の前提として US-10 を core と並走可能に置く
- **理由**: 跨サイクル seed fixture が無いと、自走 core(US-01〜06)の跨サイクル挙動を seed 上で安く検証できない。本 US は core と独立に進められ、core の検証土台を厚くする。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この US 固有の 棄却した案

### R-01 — studio 専用のまま残し、外部 PJ 導入時に対応する
- **棄却理由**: P-ARCH-02 で「最初の外部 PJ 導入前に完了」が trigger。studio 前提がコア実行経路に漏れる構造的欠陥(別 PJ の gated step が stall した実例 = P-S9-03)を放置すると再発する。

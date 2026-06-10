# US-03: Completeness Gate + Descope 制御

## メタ
- 親: [s1/index.md](./index.md)
- 対応 scope: E(§7)
- 実装フェーズ: P3
- ステータス: 確定

## 3 視点

### なぜするか (Why)
品質ハーネス原則#2「漏れ無し」と#6「人間の判断なしに descope しない」を機械的に保証する。AI が requirements を見落としても黙ってスキップできなくなる。gap があれば evaluator が fail し、人間に descope Question が届く。人間が承認して初めて backlog Task に落とせる。

### UX へのインパクト
ユーザー(開発者)は **AI が勝手に要件を落として進んだことに後から気づく** という事故から解放される。gap があれば HumanTask としてカード化され、承認/差し戻しの選択肢が提示される。descope 承認は backlog に記録され、後から追跡可能。

### 受け入れ条件 (AC)
- [ ] CompletenessBlock が BriefOut に含まれる(requirements 一覧 + addressed 一覧)
- [ ] evaluator が requirements ↔ addressed を照合し gap を検出する
- [ ] gap 検出時、evaluator は fail し descope Question(HumanTask)が発火する
- [ ] descope Question には「gap 内容」と「提案する対処(落とす/後回し/追加実装)」が含まれる
- [ ] 人間が「落とす」を承認した場合、該当 requirement が backlog Task に自動化される
- [ ] 人間が「追加実装」を選択した場合、generator Run が再起動される
- [ ] 全 gap が解消されない限り、Step は done にならない
- [ ] E2E テストで completeness gate の検出→descope→承認→backlog 化フローが pass する

## この US 固有の 質疑応答ログ

### Q-01 — AIが要件を見落として進んだ場合、どうしてほしいか？
- **回答**(ユーザー記入):
  > 必ず止めて聞く。
- **確定**(AI 記入):
  > hard gate 確定。gap があれば必ず HumanTask を発火し、人間の承認なしに先に進まない。

---

## この US 固有の AI が独自に決めたこと と 理由

### D-01 — descope 承認を backlog Task に自動化する
- **理由**: 人間が「落とす」を選んだ場合、その requirement は忘れ去られるリスクがある。backlog Task に自動化すれば将来のサイクルで再検討可能。品質ハーネス原則#6(人間判断なしに descope しない)の記録としても機能。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

### D-02 — gap ゼロのみ Step done を許可する(hard gate)
- **理由**: 「gap があっても warnings 扱いで先に進む」という設計は、品質ハーネスの主軸(漏れ無し)に反する。gap = fail の hard gate にする。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

---

## この US 固有の 棄却した案

### R-01 — gap は warning にして soft gate にする
- **棄却理由**: 品質ハーネス原則#2(漏れ無し)に反する。warning は人間が見落とす。fail にして HumanTask を出すのが主軸。

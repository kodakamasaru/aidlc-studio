# モデル: Brief I/O と 完全性評価(Brief & Completeness)

## メタ
- 親: [s6/index.md](./index.md)
- 対応 US: [US-02](../s1/us-02-engine-pipeline.md)(BriefIn/Out), [US-03](../s1/us-03-completeness-gate.md)(gap 算出)
- 所属 Unit: [Unit-03](../s5/unit-03-engine-pipeline.md), [Unit-05](../s5/unit-05-completeness-descope.md)
- 既存集約: Review 域に新規 VO として追加(Run の型付き I/O)
- ステータス: 確定

## モデル定義(DDD 採用 / 純粋 VO + 純粋関数)

- **BriefIn**(値オブジェクト): Run の型付き入力 = `{ context, requirements }`。`requirements` = この Step が満たすべき要件の列。
- **BriefOut**(値オブジェクト): Run の型付き出力 = `{ artifacts, decisions, handoff, completeness }`。
  - `artifacts` = 成果物参照、`decisions` = AI が独自に決めたこと、`handoff` = 次工程への申し送り、`completeness` = 下記。
- **CompletenessBlock**(値オブジェクト): `{ requirements, addressed }`。
  - `requirements` = BriefIn から引き継いだ満たすべき要件。
  - `addressed` = evaluator(AI)が「対応済み」と**判断**して書き込んだ参照。
- **evaluateCompleteness(block)**(純粋関数): `gaps = requirements − addressed` を算出して返す。**判断はしない**(判断は AI が `addressed` に済ませている)。算出は決定的。

## 不変条件
- `addressed` への**判断の書き込みは AI(evaluator)**、`gaps` の**算出は決定的関数**(判断と処理の分離 / S4 D-04)。
- `evaluateCompleteness` は副作用なし・全域。`requirements` が空なら `gaps` も空。
- BriefOut は **生成後不変のスナップショット**(既存 Review の INV と同型)。
- Deterministic gate の「必須 block 存在」検査は、この CompletenessBlock と Profile([artifact-profile](./artifact-profile.md))を突き合わせる純粋判定(AI を呼ばない / S4 §4)。
- gap の**処理**(差し戻し / 見送り / done 許可)は [descope-policy](./descope-policy.md) が担う。本モデルは gap の**算出**まで。

## この集約固有の 質疑応答ログ

### Q-01 — `requirements` / `addressed` の同一性判定キーは何か(ID か、平易文の照合か)
- 提案: requirement は**安定した識別子**(Step 内で一意な要件 key)を持ち、`addressed` はその key を参照する。人間表示(平易な一文)は別フィールドに持つ([target-user-persona] に合わせ UI は平易文、照合は key)。これにより gap 算出が文字列揺れに左右されない。
- **回答**(ユーザー記入):
  > OK(推奨どおり / 2026-06-11)。
- **確定**(AI 記入):
  > 照合は安定 key、人間表示は別フィールドの平易文。gap 算出を文字列揺れに依存させない。

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — gap は「算出」だけをこのモデルに置き、「処理」は descope-policy に分ける
- **理由**: S4 D-04。requirement が満たされたかの判断は AI、差分の算出は決定的、差分の後始末(差し戻し/見送り/backlog)は policy。責務を 3 つに割ると、各々を独立にテストできる(原則「拡張保守優先」)。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

---

## この集約固有の 棄却した案

### R-01 — CompletenessBlock に「gap の処理結果」まで持たせる
- **棄却理由**: スナップショット(出力 VO)に可変の処理状態を混ぜると不変条件が崩れる。処理は policy(app 層)が別途扱う。

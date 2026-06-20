# Unit-01: 証拠ゲート(evidence-gate)

## メタ
- 親: 作業単位の一覧
- 所属 US: [US-01](../s1/us-01-live-evidence-gate.md)
- ステータス: 確定

## 責務 (1〜2 行)
step を done に遷移させる前に、当該 step の live 証拠 manifest が存在し必須エントリ(縦経路ログ + step 性質の視覚/動作証拠)が揃っているかを機械検証し、欠落なら done 遷移を拒否する。

## 外部依存
- Unit-04 が生成する `_evidence/{step}/manifest`(証拠の所在・形式)を消費する。

## I/F 定義 (この Unit が公開する契約)
| 操作 | 入力 | 出力 | エラー |
|------|------|------|--------|
| `checkEvidenceGate(version, step)` | version, step | `{ ok: true }` / `{ ok: false, missing: string[] }` | manifest 不在・必須形式欠落 → ok:false |
| done 遷移フック | step done 要求 | gate ok のときのみ遷移許可 | gate ng → 遷移拒否(現行は人手 retry) |

## この Unit 固有の 質疑応答ログ
(未解決 Q なし)

---

## この Unit 固有の AI が独自に決めたこと と 理由

### D-01 — gate は done 遷移の直前フックに 1 点配線(自己申告 status を権威にしない)
- **理由**: 責務契約③ / §7 規則2「done を観測事実で裏取り」。claude の status=done でも証拠不在なら done にしない。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この Unit 固有の 棄却した案
(なし)

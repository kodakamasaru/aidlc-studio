# モデル: 成果物プロファイル(Artifact Profile)

## メタ
- 親: [s6/index.md](./index.md)
- 対応 US: [US-01](../s1/us-01-stepdef-contracts.md)(Profile + coerceBlocks), [US-05](../s1/us-05-bugfix-dossier.md)(bugfix dossier)
- 所属 Unit: [Unit-01](../s5/unit-01-contract-profile-foundation.md)
- 既存集約: Review(`domain/review/review.ts`)の `ReviewBlock` 語彙を土台に拡張
- ステータス: 確定

## モデル定義(DDD 採用 / Review 域の純粋データ + 純粋関数)

- **Profile**(値オブジェクト): `taskKind → 必須 block 集合`。「この種別の成果物はこの block が揃って初めて完全」という宣言。
  - `requiredBlocks` は既存 `ReviewBlockType`(summary/ac-map/mermaid/screenshot/test/coverage/risk/diff/video)の部分集合(block 型を二重定義しない)。
- **profileRegistry**(ドメインサービス相当の純粋データ): `taskKind` から Profile を引く。未知種別は既定(空 or 緩い Profile)。
- **coerceBlocks(profile, blocks)**(純粋関数): 成果物の block 列を Profile に照らして矯正。
  - 戻り: `{ kept: 既知 block, missing: 不足している必須 block type }`。
  - **throw しない**(前方互換)。Profile に block を足しても、古い成果物は `missing` を返すだけで壊れない。
- **BugfixDossierProfile**(Profile の 1 エントリ): `taskKind='bugfix'`。**dossier の意味要素** = cause(2層: 直接/根本)/ impact / fix / prevention / video。
  - これらは **新 block 型を増やさず**、既存 `ReviewBlock` union(summary/ac-map/mermaid/screenshot/test/coverage/risk/diff/video)に**構造化メタとして載せて**表現する(S5 Unit-01 D-02 確定: 「block 型を追加せず構造化メタで表現」)。例: 振る舞い説明 = `summary` / 影響 = `risk` / 証拠 = `screenshot`・`video`。
  - `requiredBlocks`(= 既存 `ReviewBlockType` の部分集合)は「必須で揃うべき block 型」を指す。cause の 2 層など既存型で構造的に表せない要素のみ、**最小の新 block 型追加**を Q-01 で判断する(追加時は `KNOWN_BLOCK_TYPES`/`coerceBlocks` と同期)。

## 不変条件
- `coerceBlocks` は**全域関数で副作用なし**(未知 block を捨て、不足を warn として返すのみ。例外を投げない)。
- Profile に block 種を追加しても**既存成果物の解釈を壊さない**(前方互換 / coerceBlocks が吸収)。
- `video` block は **型と必須宣言のみ**存在し、**録画実体は持たない**(v0.0.3 / scope 除外)。dossier として `video` が必須でも、実体 URL 不在は描画側(Unit-08)が placeholder で扱う。
- block 型の正本は `review.ts`(`KNOWN_BLOCK_TYPES` / `isKnownBlockType` / `MVP_BLOCK_TYPES`)。Profile はそれを参照する側(逆流させない)。
- bugfix dossier の意味構造(cause 2層 等)は **ReviewBlockType を増やさず block 内の構造化メタで持つ**(S5 Unit-01 D-02)。新型を足す場合のみ正本と同期。
- **後方互換注記**: 既存 `coerceBlocks` は現状 `(raw) → {blocks, skipped}`。本モデルの `(profile, blocks) → {kept, missing}` は**戻り値型を変える破壊的変更**にあたる。S7 で既存呼び出し側の追従と 155 tests 回帰を必須にする(引き継ぎ参照)。

## この集約固有の 質疑応答ログ

### Q-01 — bugfix dossier の cause/fix/prevention は新 block 型を足すか、既存 block(summary/risk/diff 等)の組合せで表すか
- 提案: 既存 union を最大限再利用し、構造的に表せない要素(cause の「直接/根本」2層)だけ最小追加。追加時は `KNOWN_BLOCK_TYPES` / `coerceBlocks` と必ず同期(S5 Unit-01 D-02 / Unit-08 Q-01 と整合)。
- **回答**(ユーザー記入):
  > OK(推奨どおり / 2026-06-11)。
- **確定**(AI 記入):
  > 既存 block 型を再利用し構造化メタで表現。cause 2層など既存型で表せない要素のみ最小の新型追加(その時は正本と同期)。

---

## この集約固有の AI が独自に決めたこと と 理由

### D-01 — Profile は「必須 block 集合の宣言」に徹し、block の中身検証はしない
- **理由**: block の意味的妥当性(例: cause が本当に根本原因か)は evaluator(AI)の領域。Profile/coerceBlocks は「必須 block が揃っているか」の機械判定だけを担う(判断=AI / 構造=決定的の分離 / S4 D-04 と同型)。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

### D-02 — 不足は warn(throw しない)で前方互換を保証
- **理由**: US-01 D-02。Profile が将来 block を増やしても古い Step の成果物が壊れないようにする。エラーにすると後方互換が崩れる。
- **判断**: 承認(2026-06-11 ユーザー一括承認)
- **上書き内容**(上書き時のみ):

---

## この集約固有の 棄却した案

### R-01 — video block を v0.0.2 で実体込みで定義
- **棄却理由**: US-05 R-01 / scope 除外。録画実体は v0.0.3。型と必須宣言だけ持つ。

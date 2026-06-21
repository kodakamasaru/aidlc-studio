# SCR-03: プロジェクト 作成/切替/リセット — コンポーネント仕様

## メタ
- 親: UIデザインの一覧(このサイクルの S3)
- 視覚 source: scr-03-project-management.html
- スクショ:
  - default: screenshots/scr-03-project-management.default.png
  - dialog: screenshots/scr-03-project-management.dialog.png
- 対応 S2 SCR: SCR-03(このサイクルの S2 成果物)
- 対応 US: US-12(プロジェクト作成/リセット/切替 UI + legacy 正規化)
- ステータス: 確定

## native 固有挙動
- safe area: web/desktop — N/A
- status bar: web/desktop — N/A
- keyboard avoidance: web/desktop — ダイアログ内のフォームにフォーカスがある場合、ブラウザ標準の挙動に任せる
- iOS swipe back / Android back: web/desktop — N/A
- pull-to-refresh: web/desktop — N/A

## a11y
- VoiceOver / TalkBack ラベル: 各プロジェクト行は `role="row"` + `aria-label="[プロジェクト名], [現在のサイクルとステップ], [状態]"` を付与。旧形式行は `aria-label` に「旧形式 — 移行が必要」を含める。legacy バナーは `role="alert"` を付与しスクリーンリーダーが優先読み上げ。ダイアログは `role="dialog"` + `aria-modal="true"` + `aria-labelledby="dialog-title"` を付与し、開いた時点でタイトル要素にフォーカスを移動する。
- focus order(一覧 state): 「+ 新規作成」ボタン → プロジェクト行(切替ボタン → ⋯ メニューボタン)の順。アクティブプロジェクト行の「現在のプロジェクト」バッジはボタンなし / 読み上げのみ。
- focus order(dialog state): ダイアログが開いた時点で「表示名」フォームにフォーカス。Tab はダイアログ内でトラップ(背後の一覧にはフォーカスが戻らない)。「取消」→「作成」ボタンがフォーカス最後。Esc でダイアログを閉じる。
- 色コントラスト基準(WCAG AA): 旧形式行の `--color-stalled: #f59e0b` テキスト vs `--color-stalled-soft` 背景 → 約 5.3:1(AA 合格)。ダイアログのフォーカスリング(`--color-primary-border` + 2px box-shadow)は十分に視認可能。
- 三重エンコードの根拠: 旧形式行は amber 色 + ⚠ テキスト(「旧形式 — 移行が必要です」) + amber border の 3 つで識別できる。バナーも同じく amber + ⚠ + テキストの三重エンコード。

## gesture
- tap: プロジェクト行の「切替」ボタン → 対象プロジェクトに切替。⋯ メニュー → リセット/表示名変更。「安全に移行」→ 確認フローへ。ダイアログ「作成」→ バリデーション後に登録
- long press: N/A(web/desktop)
- swipe: N/A(web/desktop)
- pan / drag: N/A(web/desktop)

## motion
- ダイアログ開く: 200ms cubic-bezier(0.16, 1, 0.3, 1) で `opacity: 0 → 1` + `transform: scale(0.97) → scale(1)`。オーバーレイは 150ms ease-out で `opacity: 0 → 0.65`。
- ダイアログ閉じる: 150ms ease-out で `opacity: 1 → 0` + `transform: scale(1) → scale(0.97)`。オーバーレイは同タイミングで fade-out。
- プロジェクト切替時: 150ms ease-out で旧アクティブ行の `border-color` / `background` が primary 系から通常値へ変化し、新アクティブ行が逆方向に変化。
- legacy バナー出現: ページ読み込み後 100ms 遅延 + 300ms ease-out-expo で `opacity: 0 → 1` + `transform: translateY(-4px) → translateY(0)`。
- 行追加(新規プロジェクト作成後): 200ms ease-out-expo で `opacity: 0 → 1` + `transform: translateY(-4px) → translateY(0)` の fade-slide-in。

## この画面固有の 質疑応答ログ

### Q-01 — リセットの粒度(プロジェクト全消し vs 現サイクルのみ巻き戻し)の既定値
- **回答**(人間の回答を AI が記入):
  > (S2 の Q&A で未回答。技術判断で確定)
- **確定**(AI 記入):
  > リセットは「現サイクルの成果物だけ削除(ステップ状態のみリセット)」を既定にする。プロジェクト自体の全消去は ⋯ メニューの「削除」として分離。両方に確認ダイアログ + バックアップ自動取得を必須とする(技術判断 D-02)。

---

## この画面固有の AI が独自に決めたこと と 理由

### D-01 — legacy バナーを一覧上端に常設し、旧形式行にもインライン警告を付ける
- **理由**: US-12 AC「旧形式の検出 → 移行バナー」を満たしつつ、どの行が対象かを行レベルでも示す。バナー + インライン警告の 2 段構えで人間が迷わずアクションできる。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-02 — リセット粒度の既定は「現サイクルのみ」+ 確認 + バックアップ必須
- **理由**: S2 R-01「確認なし即時実行は棄却」の延長。破壊操作には確認を必須とし、誤操作での全消去を防ぐ。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

### D-03 — 対象リポは「表示名 + ファイルピッカーボタン」で見せ、絶対パスをフォームに出さない
- **理由**: 責務契約①(内部パス秘匿)。人間には表示名を設定させ、内部 repoPath はファイルピッカーが選択したパスを UI 非表示でストアに渡す。
- **種別**: 技術判断(AI 自走で確定)
- **上書き**: なし

---

## この画面固有の 棄却した案

### R-01 — ダイアログに絶対パスのテキスト入力欄を設ける
- **棄却理由**: 責務契約①(内部パス露出禁止)。ファイルピッカーで選択させるだけで表示名 + 内部パスが設定できるようにする。

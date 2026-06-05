# SCR-01: Cycle 一覧・作成 — コンポーネント仕様

## メタ
- 親: [s2.5/index.md](./index.md)
- 視覚 source: [scr-01-cycle-list-create.html](./scr-01-cycle-list-create.html)(人間レビュー用 / S6/S7 は Read 禁止)
- スクショ:
  - [list](./screenshots/scr-01-cycle-list-create.list.png)
  - [empty](./screenshots/scr-01-cycle-list-create.empty.png)
  - [create](./screenshots/scr-01-cycle-list-create.create.png)
- 対応 S2 SCR: [SCR-01](../s2/scr-01-cycle-list-create.md)
- 対応 US: [US-05](../s1/us-05-cycle-create.md)
- ステータス: レビュー待ち

## 状態網羅
- **list**: Cycle 行が並ぶ。各行 = 状態バッジ(running/stalled/done/idle・色 + dot)+ 名前 + meta(対象リポ / 現在ステップ / 更新相対時刻)+ 末尾に `Sn / 7` 進捗と chevron。更新日時降順。
- **empty**: Cycle 0 件。中央に glyph + 見出し + 「最初の Cycle を作る」CTA のみ(S2 既定)。
- **create**: 作成ダイアログ(modal)。名前 / 対象リポ(select)/ 初期 Task(任意)。Task 未指定で作成可 = 単一 Task 既定(S2 備考)。

## 挙動(web / レスポンシブ)
- **レイアウト**: sidebar 220px 固定 + content 可変。≥1024px を主対象。<1024px では sidebar をアイコン幅に畳む想定(v0.0.x で詳細化)。
- **作成 UI**: S2 は modal / inline どちらでも可 → S2.5 は **modal(scrim + dialog)** を採用(一覧の文脈を残したまま作成 → 作成後 SCR-02 へ遷移)。
- **行 hover**: 背景 surface-2 へ 150ms。行全体がクリック領域(→ SCR-02)。`Sn / 7` と chevron は補助表示。
- **空 → list**: 1 件目作成後は list へ。

## a11y(色だけに依存しない)
- 状態は **色 + dot + テキストラベル**の三重符号(`running` 等の語をバッジ内に必ず出す)。
- フォーカス順: topbar 新規ボタン → 各行(`role="button"`)→ (modal 内)名前 → リポ → Task → 作成。
- modal: フォーカストラップ / Esc で閉じる / 背景 `aria-hidden` / `aria-modal="true"`。
- コントラスト: 本文 text-hi on surface = WCAG AA 以上。バッジ文字は各状態色(soft 背景上)で AA を満たす値を選定。

## interaction(web pointer / keyboard)
- tap/click: 行 → SCR-02。新規ボタン → create modal。
- keyboard: 行は Enter/Space で起動。modal は Tab 循環、Enter で「作成して開く」。
- hover: 行・ボタン・nav-item に 150ms の background 遷移。

## motion(文字で / `transition` は参考にされない)
- modal 出現: scrim fade-in + dialog を 200ms cubic-bezier(0.16,1,0.3,1) で 4px slide-up。
- list 行 hover: background 150ms ease-out。
- running バッジの dot は pulse 1.6s ease-out infinite(生成中の生存感)。

## この画面固有の 質疑応答ログ
### Q-01 — 作成は modal か inline か
- **回答**(ユーザー記入):
  >
- **確定**(AI 記入):
  > (暫定)modal を採用。一覧文脈を保持しつつ作成 → SCR-02 へ。異論あれば inline panel に変更。

---

## この画面固有の AI が独自に決めたこと と 理由
### D-01 — 行末に `Sn / 7` の進捗 + 状態バッジを両方出す
- **理由**: 一覧段階で「どの Cycle がどこまで来て / いま動いているか」を 1 行で把握させるため(状態バッジ = 動的、`Sn/7` = 位置)。
- **判断**(ユーザー記入): 承認 | 上書き | 保留
- **上書き内容**(上書き時のみ):

---

## この画面固有の 棄却した案
### R-01 — 一覧をカードグリッド(bento)で出す
- **棄却理由**: Q-01 で minimal product UI を選択。行リストの方が密度・走査性が高い。

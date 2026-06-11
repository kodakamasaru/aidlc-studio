// ReviewBlocks (SCR-04 block-stream) — renders ReviewBlock[] as a card stream.
// MVP renders summary / ac-map / mermaid / screenshot; risk is rendered too (it
// is light). Unknown / heavy block types degrade gracefully to a labelled
// placeholder (forward-compat contract). Mermaid is shown as a labelled source
// panel (deterministic — no async diagram renderer).
import { useEffect, useState } from "react";
import type { ReviewBlock, CompletenessBlock } from "../../lib/api";

// Screenshot src is model-produced. Only allow safe, renderable schemes:
// https/http URLs, root-relative paths, blob: object URLs, and data:image/*.
// Anything else (javascript:, data:text/html, …) is treated as not-renderable.
const SAFE_IMG_SRC_RE = /^(https?:\/\/|\/|blob:|data:image\/)/i;

// 平易な日本語ラベル(S3 scr-04 用語方針: 内部語・英語を出さず、振る舞いで示す)。
const KIND_LABEL: Record<string, string> = {
  summary: "まとめ",
  "ac-map": "対応マップ",
  mermaid: "依存関係の図",
  screenshot: "実際に動いた証拠",
  risk: "変わったところ · 影響",
  test: "テスト結果",
  coverage: "カバレッジ",
  diff: "変更点",
  video: "操作の動画",
};

interface ReviewBlocksProps {
  readonly blocks: readonly ReviewBlock[];
}

export function ReviewBlocks({ blocks }: ReviewBlocksProps) {
  return (
    <div className="block-stream">
      {blocks.map((block, i) => (
        <BlockCard key={`${block.type}-${i}`} block={block} index={i} />
      ))}
    </div>
  );
}

function BlockCard({ block, index }: { block: ReviewBlock; index: number }) {
  const label = KIND_LABEL[block.type] ?? block.type.toUpperCase();
  return (
    <article
      className="block-card surface-card"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <p className="block-card__kind" aria-label={`ブロック種別: ${label}`}>
        {label}
      </p>
      <div className="block-card__body">
        <BlockBody block={block} />
      </div>
    </article>
  );
}

function BlockBody({ block }: { block: ReviewBlock }) {
  switch (block.type) {
    case "summary":
      return (
        <p className="block-summary">
          <strong>{readString(block, "title")}</strong>{" "}
          {readString(block, "body")}
        </p>
      );

    case "ac-map": {
      const items = readArray(block, "items");
      return (
        <ul className="ac-map">
          {items.map((item, i) => (
            <li key={i} className="ac-map__row">
              <span className="ac-map__ac mono">{readField(item, "ac")}</span>
              <span className="ac-map__status">{readField(item, "status")}</span>
            </li>
          ))}
        </ul>
      );
    }

    case "mermaid":
      return (
        <figure className="mermaid-panel">
          <pre className="mermaid-panel__src mono">{readString(block, "src")}</pre>
          <figcaption className="mermaid-panel__note">
            Mermaid ソース(MVP は静的表示)
          </figcaption>
        </figure>
      );

    case "screenshot":
      return (
        <ScreenshotFigure
          src={readString(block, "src")}
          caption={readString(block, "caption")}
        />
      );

    case "risk": {
      const level = readString(block, "level");
      // 重要度は日本語(S3 scr-04 D-02: HIGH/MEDIUM/LOW でなく 高/中/低)。
      const LEVEL_JA: Record<string, string> = { high: "高", med: "中", low: "低" };
      return (
        <p className="risk-row">
          <span className={`risk-badge risk-badge--${level}`}>
            重要度 {LEVEL_JA[level] ?? level}
          </span>
          <span>{readString(block, "note")}</span>
        </p>
      );
    }

    case "test": {
      const passed = readNumber(block, "passed");
      const total = readNumber(block, "total");
      const ok = total > 0 && passed >= total;
      return (
        <p className="test-row">
          <span className={`test-badge test-badge--${ok ? "pass" : "fail"}`}>
            {passed}/{total} pass
          </span>
          {readString(block, "detail") ? (
            <span className="test-row__detail">{readString(block, "detail")}</span>
          ) : null}
        </p>
      );
    }

    case "coverage": {
      const pct = readNumber(block, "pct");
      const byFile = readArray(block, "byFile");
      return (
        <div className="coverage-block">
          <div className="coverage-bar" aria-hidden="true">
            <span
              className="coverage-bar__fill"
              style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            />
          </div>
          <p className="coverage-block__pct">{pct}% カバレッジ</p>
          {byFile.length > 0 ? (
            <ul className="coverage-block__files">
              {byFile.map((f, i) => (
                <li key={i} className="coverage-block__file">
                  <span className="mono">{readField(f, "path")}</span>
                  <span>{readField(f, "pct")}%</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    }

    case "diff": {
      const files = readArray(block, "files");
      return (
        <div className="diff-block">
          <p className="diff-block__summary">{readString(block, "summary")}</p>
          <ul className="diff-block__files">
            {files.map((f, i) => (
              <li key={i} className="diff-block__file">
                <span className="mono diff-block__path">{readField(f, "path")}</span>
                <span className="diff-block__stat diff-block__stat--add">
                  +{readField(f, "add")}
                </span>
                <span className="diff-block__stat diff-block__stat--del">
                  −{readField(f, "del")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    case "video":
      // scope.md: video block は v0.0.2 では「型と描画枠のみ」(録画実体は v0.0.3)。
      return (
        <div className="video-block">
          <div className="video-block__frame" role="img" aria-label="操作録画(プレースホルダ)">
            <span className="video-block__icon" aria-hidden="true">►</span>
            <span>操作録画(v0.0.3 で録画実体を表示)</span>
          </div>
          {readString(block, "src") ? (
            <p className="field-hint mono">{readString(block, "src")}</p>
          ) : null}
        </div>
      );

    default:
      // Forward-compat: skip safely with a labelled placeholder + note.
      return (
        <p className="block-skip">
          このブロック種別(<code className="mono">{block.type}</code>
          )は MVP では未対応のためスキップしました。
        </p>
      );
  }
}

/**
 * CompletenessTable (scope K / 原則#3) — requirements ↔ addressed を ✓/未対応 の表で
 * 描画。人間がコードを読まず「要件が満たされたか」を一目で承認判断できる中核ビュー。
 */
export function CompletenessTable({ completeness }: { completeness: CompletenessBlock }) {
  const addressed = new Set(completeness.addressed);
  const total = completeness.requirements.length;
  const done = completeness.requirements.filter((r) => addressed.has(r.key)).length;
  return (
    <section className="completeness surface-card" aria-label="やりたかったことの 対応状況">
      <header className="completeness__head">
        <h2 className="completeness__title">やりたかったことの 対応状況</h2>
        <span className="completeness__count">
          {done}/{total} 反映済み
        </span>
      </header>
      <ul className="completeness__list">
        {completeness.requirements.map((r) => {
          const ok = addressed.has(r.key);
          return (
            <li key={r.key} className="completeness__row">
              <span
                className={`completeness__mark completeness__mark--${ok ? "ok" : "gap"}`}
                aria-hidden="true"
              >
                {ok ? "✓" : "✕"}
              </span>
              <span className="completeness__text">{r.text}</span>
              <span className="sr-only">{ok ? "対応済み" : "未対応"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Screenshot block: renders the captured image, degrading to a labelled
// placeholder frame when the source is empty or fails to load (verify-ui
// artifacts may not be present in every environment).
function ScreenshotFigure({ src, caption }: { src: string; caption: string }) {
  const safe = SAFE_IMG_SRC_RE.test(src.trim());
  // Reset to the source-derived state whenever `src` changes, so a `failed`
  // (onError) flag from a PRIOR review can't persist onto a different src that
  // happens to reuse this position in the stream.
  const [failed, setFailed] = useState(!safe);
  useEffect(() => {
    setFailed(!SAFE_IMG_SRC_RE.test(src.trim()));
  }, [src]);
  return (
    <figure className="screenshot-block">
      {failed ? (
        <div className="screenshot-block__placeholder" role="img" aria-label={caption}>
          <span className="screenshot-block__placeholder-icon" aria-hidden="true">
            ▦
          </span>
          <span>スクリーンショット未取得</span>
        </div>
      ) : (
        <img
          className="screenshot-block__img"
          src={src}
          alt={caption}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <figcaption className="screenshot-block__cap">{caption}</figcaption>
    </figure>
  );
}

// ── Defensive readers (payloads are typed but treated as untrusted here) ──
function readString(obj: object, key: string): string {
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}
function readField(obj: unknown, key: string): string {
  if (obj && typeof obj === "object") {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === "string" ? v : "";
  }
  return "";
}
function readArray(obj: object, key: string): unknown[] {
  const v = (obj as Record<string, unknown>)[key];
  return Array.isArray(v) ? v : [];
}
function readNumber(obj: object, key: string): number {
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

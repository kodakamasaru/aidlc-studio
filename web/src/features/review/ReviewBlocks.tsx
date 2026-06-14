// ReviewBlocks (SCR-03 block-stream) — renders ReviewBlock[] as a card stream.
// Consecutive screenshot blocks are grouped into a gallery grid (D-03).
// Single screenshot renders as a plain figure; 2+ render as a responsive grid
// with lightbox on click (‹ › prev/next, n/total counter, Esc to close).
// missing-context blocks render as a clean Japanese warning banner (role="alert").
// Unknown / heavy block types degrade gracefully to a labelled placeholder.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewBlock, CompletenessBlock } from "../../lib/api";
import { Markdown } from "../../components/ui/Markdown";

// Screenshot src is model-produced. Only allow safe, renderable schemes:
// https/http URLs, root-relative paths, blob: object URLs, and data:image/*.
// Anything else (javascript:, data:text/html, …) is treated as not-renderable.
const SAFE_IMG_SRC_RE = /^(https?:\/\/|\/|blob:|data:image\/)/i;

// 平易な日本語ラベル(S3 scr-03 用語方針: 内部語・英語を出さず、振る舞いで示す)。
const KIND_LABEL: Record<string, string> = {
  summary: "概要",
  "ac-map": "受け入れ条件",
  mermaid: "依存関係の図",
  screenshot: "画面の証拠",
  risk: "リスク",
  test: "テスト結果",
  coverage: "カバレッジ",
  diff: "変更点",
  video: "操作の動画",
};

// ── Lightbox ──────────────────────────────────────────────────────────────────
// Accessible lightbox: role="dialog" + aria-modal, focus trapped to close btn
// on open, Esc closes, ‹ › navigate, n/M counter announced via aria-live.
interface LightboxProps {
  readonly images: readonly { src: string; caption: string }[];
  readonly initialIndex: number;
  readonly onClose: () => void;
}

function Lightbox({ images, initialIndex, onClose }: LightboxProps) {
  const [idx, setIdx] = useState(initialIndex);
  const closeRef = useRef<HTMLButtonElement>(null);
  const current = images[idx];

  // Focus close button when opened.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Keyboard: Esc → close, ArrowLeft → prev, ArrowRight → next.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        setIdx((i) => (i > 0 ? i - 1 : images.length - 1));
      } else if (e.key === "ArrowRight") {
        setIdx((i) => (i < images.length - 1 ? i + 1 : 0));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [images.length, onClose]);

  const prev = useCallback(() => setIdx((i) => (i > 0 ? i - 1 : images.length - 1)), [images.length]);
  const next = useCallback(() => setIdx((i) => (i < images.length - 1 ? i + 1 : 0)), [images.length]);

  const isSafe = SAFE_IMG_SRC_RE.test((current?.src ?? "").trim());
  const counter = `${idx + 1} / ${images.length}`;

  return (
    // Backdrop: clicking outside the dialog closes the lightbox.
    <div
      className="lightbox-backdrop"
      onClick={onClose}
    >
      {/* Dialog (stop propagation so clicks inside don't close) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`画像を拡大表示: ${current?.caption ?? ""}`}
        className="lightbox"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          ref={closeRef}
          type="button"
          className="lightbox__close"
          aria-label="閉じる"
          onClick={onClose}
        >
          ×
        </button>

        {/* Image area */}
        <div className="lightbox__img-wrap">
          {isSafe ? (
            <img
              className="lightbox__img"
              src={current?.src}
              alt={current?.caption ?? ""}
            />
          ) : (
            <div className="lightbox__placeholder" role="img" aria-label={current?.caption ?? ""}>
              <span aria-hidden="true">▦</span>
              <span>画像を表示できません</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav bar (outside dialog, below backdrop center) */}
      <div className="lightbox__nav" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="lightbox__nav-btn"
          aria-label="前の画像"
          onClick={prev}
          disabled={images.length <= 1}
        >
          ‹
        </button>
        <span className="lightbox__nav-label">
          {current?.caption}
        </span>
        <button
          type="button"
          className="lightbox__nav-btn"
          aria-label="次の画像"
          onClick={next}
          disabled={images.length <= 1}
        >
          ›
        </button>
        <span className="lightbox__counter" aria-live="polite" aria-atomic="true">
          {counter}
        </span>
      </div>
    </div>
  );
}

// ── Screenshot grid ───────────────────────────────────────────────────────────
// Used when 2+ consecutive screenshot blocks are grouped.
interface ScreenshotGridProps {
  readonly images: readonly { src: string; caption: string }[];
  readonly blockLabel: string;
}

function ScreenshotGrid({ images, blockLabel }: ScreenshotGridProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const openLightbox = useCallback((i: number) => setLightboxIdx(i), []);
  const closeLightbox = useCallback(() => setLightboxIdx(null), []);

  return (
    <article className="block-card surface-card">
      <p className="block-card__kind" aria-label={`ブロック種別: ${blockLabel}`}>
        {blockLabel}
        <span className="block-card__count">{images.length} 枚</span>
      </p>
      <div
        className="screenshot-gallery"
        style={{ "--gallery-cols": Math.min(images.length, 4) } as React.CSSProperties}
      >
        {images.map((img, i) => (
          <ScreenshotThumb
            key={i}
            src={img.src}
            caption={img.caption}
            index={i}
            onOpen={openLightbox}
          />
        ))}
      </div>
      {lightboxIdx !== null && (
        <Lightbox
          images={images}
          initialIndex={lightboxIdx}
          onClose={closeLightbox}
        />
      )}
    </article>
  );
}

// Single thumbnail in the gallery grid.
interface ScreenshotThumbProps {
  readonly src: string;
  readonly caption: string;
  readonly index: number;
  readonly onOpen: (index: number) => void;
}

function ScreenshotThumb({ src, caption, index, onOpen }: ScreenshotThumbProps) {
  const safe = SAFE_IMG_SRC_RE.test(src.trim());
  const [failed, setFailed] = useState(!safe);
  useEffect(() => {
    setFailed(!SAFE_IMG_SRC_RE.test(src.trim()));
  }, [src]);

  const resolvedSrc = safe && !failed ? src : null;

  const handleClick = useCallback(() => onOpen(index), [index, onOpen]);
  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen(index);
      }
    },
    [index, onOpen],
  );

  return (
    <figure
      className="gallery-thumb"
      role="button"
      tabIndex={0}
      aria-label={`${caption} のスクリーンショット (クリックで拡大)`}
      onClick={handleClick}
      onKeyDown={handleKey}
    >
      <div className="gallery-thumb__img-wrap">
        {resolvedSrc ? (
          <img
            className="gallery-thumb__img"
            src={resolvedSrc}
            alt={`${caption} のスクリーンショット`}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <div
            className="gallery-thumb__placeholder"
            role="img"
            aria-label={`${caption} のスクリーンショット (未取得)`}
          >
            <span className="gallery-thumb__placeholder-icon" aria-hidden="true">▦</span>
            <span>実際に撮った画面</span>
          </div>
        )}
      </div>
      <figcaption className="gallery-thumb__cap">{caption}</figcaption>
    </figure>
  );
}

// ── ReviewBlocks ──────────────────────────────────────────────────────────────
interface ReviewBlocksProps {
  readonly blocks: readonly ReviewBlock[];
}

// Group consecutive screenshot blocks into runs, then render each run as
// either a single ScreenshotFigure (1 image) or a ScreenshotGrid (2+).
// Non-screenshot blocks are rendered individually as BlockCards.
export function ReviewBlocks({ blocks }: ReviewBlocksProps) {
  // Build a list of "segments": either a single non-screenshot block, or
  // a consecutive run of screenshot blocks.
  type Segment =
    | { kind: "block"; block: ReviewBlock; origIndex: number }
    | { kind: "shots"; images: readonly { src: string; caption: string }[] };

  const segments: Segment[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i]!;
    if (b.type === "screenshot") {
      // Collect consecutive screenshot blocks.
      const shots: { src: string; caption: string }[] = [];
      while (i < blocks.length) {
        const cur = blocks[i]!;
        if (cur.type !== "screenshot") break;
        const s = cur as { type: "screenshot"; src: string; caption: string };
        shots.push({ src: readString(s, "src"), caption: readString(s, "caption") });
        i++;
      }
      segments.push({ kind: "shots", images: shots });
    } else {
      segments.push({ kind: "block", block: b, origIndex: i });
      i++;
    }
  }

  return (
    <div className="block-stream">
      {segments.map((seg, si) => {
        if (seg.kind === "shots") {
          if (seg.images.length === 1) {
            // Single screenshot: render as plain block card.
            const img = seg.images[0]!;
            return (
              <article
                key={`shot-single-${si}`}
                className="block-card surface-card"
                style={{ animationDelay: `${Math.min(si, 8) * 60}ms` }}
              >
                <p className="block-card__kind" aria-label="ブロック種別: 画面の証拠">
                  画面の証拠
                </p>
                <div className="block-card__body">
                  <ScreenshotFigure src={img.src} caption={img.caption} />
                </div>
              </article>
            );
          }
          // Multiple screenshots: gallery grid.
          return (
            <ScreenshotGrid
              key={`shot-grid-${si}`}
              images={seg.images}
              blockLabel="画面の証拠"
            />
          );
        }
        // Non-screenshot block.
        return (
          <BlockCard
            key={`block-${seg.origIndex}`}
            block={seg.block}
            index={si}
          />
        );
      })}
    </div>
  );
}

function BlockCard({ block, index }: { block: ReviewBlock; index: number }) {
  // missing-context is a dedicated block type — render as warning banner.
  if (block.type === "missing-context") {
    const msg = readString(block, "message") ||
      "前サイクルの成果物が見つかりません — コンテキストが不完全な状態で実行されています。差し戻して再実行を検討してください。";
    return (
      <div
        className="missing-context-banner"
        role="alert"
        aria-live="assertive"
        style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
      >
        <span className="missing-context-banner__icon" aria-hidden="true">⚠</span>
        <span className="missing-context-banner__msg">
          {msg.replace(/^⚠\s*/, "")}
        </span>
      </div>
    );
  }

  const label = KIND_LABEL[block.type] ?? block.type;
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
    case "summary": {
      const title = readString(block, "title");
      const body = readString(block, "body");
      return (
        <div className="block-summary">
          {title ? (
            <p className="block-summary__title">
              <strong>{title}</strong>
            </p>
          ) : null}
          {/* D-01: md rendering is limited to summary block only.
              Markdown component uses react-markdown v9 (no raw HTML
              passthrough) + remark-gfm. Fallback to plain text when body
              is empty (never silently lose content). */}
          <Markdown className="block-summary__body">{body}</Markdown>
        </div>
      );
    }

    case "ac-map": {
      const items = readArray(block, "items");
      return (
        <ul className="ac-map">
          {items.map((item, i) => (
            <li key={i} className="ac-map__row">
              <span className="ac-map__check" aria-hidden="true">✓</span>
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
      // Standalone screenshot (not inside a grid — reached when a single
      // screenshot block is NOT grouped by ReviewBlocks above; kept as
      // forward-compat fallback).
      return (
        <ScreenshotFigure
          src={readString(block, "src")}
          caption={readString(block, "caption")}
        />
      );

    case "risk": {
      const level = readString(block, "level");
      // 重要度は日本語(S3 scr-03 D-02: HIGH/MEDIUM/LOW でなく 高/中/低)。
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

// ── Skeleton (loading state) ───────────────────────────────────────────────────
// Renders placeholder block cards matching the typical review shape
// (概要 with text lines / 画面の証拠 / リスク) before data arrives.
// Layout matches the real content height to prevent CLS after load.
export function ReviewBlocksSkeleton() {
  return (
    <div className="block-stream" aria-busy="true" aria-label="レビュー内容を読み込み中">
      {/* Block 1: 概要 skeleton */}
      <article className="block-card surface-card block-card--skel">
        <p className="block-card__kind block-card__kind--skel review-skel-label">概要</p>
        <div className="block-card__body">
          <div className="review-skel-lines">
            <span className="review-skel-line review-skel-line--full" />
            <span className="review-skel-line review-skel-line--full" />
            <span className="review-skel-line review-skel-line--med" />
          </div>
        </div>
      </article>
      {/* Block 2: 画面の証拠 skeleton */}
      <article className="block-card surface-card block-card--skel">
        <p className="block-card__kind review-skel-label">画面の証拠</p>
        <div className="block-card__body">
          <div className="review-skel-img-row">
            <span className="review-skel-img" />
            <span className="review-skel-img" />
          </div>
        </div>
      </article>
      {/* Block 3: リスク skeleton */}
      <article className="block-card surface-card block-card--skel">
        <p className="block-card__kind review-skel-label">リスク</p>
        <div className="block-card__body">
          <span className="review-skel-line review-skel-line--med" />
        </div>
      </article>
    </div>
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

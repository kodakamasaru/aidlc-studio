// ReviewBlocks (SCR-04 block-stream) — renders ReviewBlock[] as a card stream.
// MVP renders summary / ac-map / mermaid / screenshot; risk is rendered too (it
// is light). Unknown / heavy block types degrade gracefully to a labelled
// placeholder (forward-compat contract). Mermaid is shown as a labelled source
// panel (deterministic — no async diagram renderer).
import { useEffect, useState } from "react";
import type { ReviewBlock } from "../../lib/api";

// Screenshot src is model-produced. Only allow safe, renderable schemes:
// https/http URLs, root-relative paths, blob: object URLs, and data:image/*.
// Anything else (javascript:, data:text/html, …) is treated as not-renderable.
const SAFE_IMG_SRC_RE = /^(https?:\/\/|\/|blob:|data:image\/)/i;

const KIND_LABEL: Record<string, string> = {
  summary: "Summary",
  "ac-map": "AC-MAP · US → UNIT 対応",
  mermaid: "Mermaid · UNIT 依存",
  screenshot: "Screenshot",
  risk: "Risk",
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
      return (
        <p className="risk-row">
          <span className={`risk-badge risk-badge--${level}`}>
            {level.toUpperCase()}
          </span>
          <span>{readString(block, "note")}</span>
        </p>
      );
    }

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

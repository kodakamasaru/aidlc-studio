// Markdown — safe prose renderer for summary block bodies.
// Uses react-markdown (sanitizes by default: no dangerouslySetInnerHTML, no
// raw-HTML passthrough) + remark-gfm for tables / strikethrough / task lists.
// External CDN is NOT used (AC from US-02: offline / deterministic).
//
// Security posture: react-markdown v9 does not allow raw HTML by default
// (rehypeRaw is NOT loaded). All output is React-element trees, never
// innerHTML injection. Matches ScreenshotFigure's safe-src principle.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// Only allow safe link hrefs (same origin or https / relative).
// Prevents javascript: pseudo-protocol in rendered anchor hrefs.
const SAFE_HREF_RE = /^(https?:\/\/|\/|#|\?|\.)/i;

const components: Components = {
  // Headings: honour semantic hierarchy (SCR-03 a11y §md 描画の見出し階層).
  // h1 in prose md is unlikely but preserved.
  h1: ({ children }) => <h2 className="md-h1">{children}</h2>,
  h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
  h4: ({ children }) => <h4 className="md-h4">{children}</h4>,

  // Code fences: pre > code, monospace, overflow-scroll (SCR-03 a11y §コードフェンス).
  pre: ({ children }) => <pre className="md-pre">{children}</pre>,
  code: ({ className, children }) => (
    <code className={`md-code ${className ?? ""}`}>{children}</code>
  ),

  // Links: filter out non-safe hrefs (javascript:, data:text/html, …).
  // SCR-03 pointer §md内リンク: focusable, hover underline, focus ring.
  a: ({ href, children }) => {
    const safeSrc = href && SAFE_HREF_RE.test(href) ? href : undefined;
    if (!safeSrc) {
      // Degrade to plain span — never silently lose the text.
      return <span className="md-link md-link--unsafe">{children}</span>;
    }
    return (
      <a className="md-link" href={safeSrc}>
        {children}
      </a>
    );
  },

  // Paragraphs, lists, blockquote, table — pass through with BEM class for
  // light styling; no behaviour change.
  p: ({ children }) => <p className="md-p">{children}</p>,
  ul: ({ children }) => <ul className="md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="md-ol">{children}</ol>,
  li: ({ children }) => <li className="md-li">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="md-blockquote">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="md-table-wrap">
      <table className="md-table">{children}</table>
    </div>
  ),
  strong: ({ children }) => <strong className="md-strong">{children}</strong>,
  em: ({ children }) => <em className="md-em">{children}</em>,
  hr: () => <hr className="md-hr" />,
};

const REMARK_PLUGINS = [remarkGfm];

interface MarkdownProps {
  /** Raw Markdown string to render. Empty/falsy → plain-text fallback. */
  readonly children: string;
  /** Optional extra className on the wrapper div. */
  readonly className?: string;
}

/**
 * Safe, offline Markdown renderer.
 * - react-markdown v9: no raw HTML passthrough (rehypeRaw not loaded).
 * - remark-gfm: tables, strikethrough, task lists, auto-links.
 * - Fallback: if children is empty/invalid, renders children as plain text.
 */
export function Markdown({ children, className }: MarkdownProps) {
  const src = typeof children === "string" ? children.trim() : "";

  if (!src) {
    // Graceful fallback: render original (possibly empty) as plain text.
    return (
      <p className={`md-body md-body--fallback ${className ?? ""}`.trim()}>
        {children}
      </p>
    );
  }

  return (
    <div className={`md-body ${className ?? ""}`.trim()}>
      <ReactMarkdown components={components} remarkPlugins={REMARK_PLUGINS}>
        {src}
      </ReactMarkdown>
    </div>
  );
}

// createApp — assembles the Hono app from the Ports bundle: health check, the
// three route groups, and a single onError that renders every failure as
// {success:false, error}. ServiceError carries its own status; anything else is
// an unexpected throw → 500 "internal" (details stay server-side).
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { Ports } from "../../app/ports/composition";
import { isServiceError } from "../../app/services/errors";
import { logError } from "../log";
import { projectRoutes } from "./routes/projects";
import { cycleRoutes } from "./routes/cycles";
import { inboxRoutes } from "./routes/inbox";

export function createApp(ports: Ports): Hono {
  const app = new Hono();

  // Security headers for the built SPA (served same-origin from this app).
  // style-src allows 'unsafe-inline' because React renders inline style attrs
  // (e.g. the block-stream's animationDelay); img-src allows data:/blob: for
  // screenshot blocks. No inline/remote scripts → script-src stays 'self'.
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        // The SPA's API + polling calls are same-origin; lock fetch/XHR/SSE to self.
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
      xContentTypeOptions: "nosniff",
      xFrameOptions: "DENY",
      referrerPolicy: "strict-origin-when-cross-origin",
    }),
  );

  app.get("/api/health", (c) =>
    c.json({ success: true, data: { ok: true } }),
  );

  app.route("/", projectRoutes(ports));
  app.route("/", cycleRoutes(ports));
  app.route("/", inboxRoutes(ports));

  app.onError((err, c) => {
    if (isServiceError(err)) {
      return c.json({ success: false, error: err.code }, err.httpStatus);
    }
    // Unexpected (non-ServiceError) throw: log server-side, render an opaque 500.
    logError("unhandled request error", err);
    return c.json({ success: false, error: "internal" }, 500);
  });

  return app;
}

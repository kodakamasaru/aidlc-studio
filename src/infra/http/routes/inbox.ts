// Inbox routes — list open questions for a project, fetch one, and answer it.
// `verdict` is required; body/backtrackTo/reason are optional and forwarded only
// when present so the domain's exactOptional contract holds.
import { Hono } from "hono";
import type { Ports } from "../../../app/ports/composition";
import { InboxService } from "../../../app/services/inbox-service";
import type { AnswerInput } from "../../../app/services/inbox-service";
import type { Verdict } from "../../../domain/shared/vocab";
import { VERDICTS } from "../../../domain/shared/vocab";
import { fail } from "../../../app/services/errors";
import { ok, readJson, asString, asOptionalString } from "../envelope";

const isVerdict = (s: string): s is Verdict =>
  (VERDICTS as readonly string[]).includes(s);

export function inboxRoutes(ports: Ports): Hono {
  const app = new Hono();
  const service = new InboxService(ports);

  app.get("/api/projects/:projectId/inbox", (c) =>
    ok(c, service.listInbox(c.req.param("projectId"))),
  );

  // Cycle-scoped open questions — SCR-02 polls this to surface "waiting on human".
  app.get("/api/cycles/:cycleId/inbox", (c) =>
    ok(c, service.listCycleOpenQuestions(c.req.param("cycleId"))),
  );

  app.get("/api/questions/:questionId", (c) =>
    ok(c, service.getQuestion(c.req.param("questionId"))),
  );

  app.post("/api/questions/:questionId/answer", async (c) => {
    const body = await readJson(c);
    const verdict = asString(body, "verdict");
    if (!isVerdict(verdict)) throw fail(400, "InvalidVerdict");
    const answerBody = asOptionalString(body, "body");
    const backtrackTo = asOptionalString(body, "backtrackTo");
    const reason = asOptionalString(body, "reason");
    const input: AnswerInput = {
      verdict,
      ...(answerBody !== undefined ? { body: answerBody } : {}),
      ...(backtrackTo !== undefined ? { backtrackTo } : {}),
      ...(reason !== undefined ? { reason } : {}),
    };
    const result = await service.answerQuestion(
      c.req.param("questionId"),
      input,
    );
    return ok(c, result);
  });

  return app;
}

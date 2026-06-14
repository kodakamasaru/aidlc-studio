// App — route table. AppShell is the layout (sidebar + topbar slot + <Outlet/>).
// SCR-02: /cycles/:cycleId/thread — 会話スレッド(Unit-06 ConversationThread).
// SCR-04: /settings/steps — StepConfigReadback (replaces StepConfigPage form).
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell";
import { CycleListPage } from "./features/cycles/CycleListPage";
import { CycleDetailPage } from "./features/cycle-detail/CycleDetailPage";
import { CycleStepsPage } from "./features/cycle-detail/CycleStepsPage";
import { InboxPage } from "./features/inbox/InboxPage";
import { QuestionPage } from "./features/inbox/QuestionPage";
import {
  GlobalStepConfigPage,
  CycleStepConfigPage,
} from "./features/settings/StepConfigReadback";
import { StepSpecPage } from "./features/settings/StepSpecPage";
import { ConversationThreadPage } from "./features/thread/ConversationThread";
import { GlobalHearingPage } from "./features/settings/GlobalHearingPage";
import {
  CycleReconstructionPage,
  GlobalReconstructionPage,
} from "./features/thread/ReconstructionThread";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<CycleListPage />} />
        <Route path="cycles/:cycleId" element={<CycleDetailPage />} />
        <Route path="cycles/:cycleId/steps" element={<CycleStepsPage />} />
        {/* SCR-02: 会話スレッド(Unit-06) */}
        <Route path="cycles/:cycleId/thread" element={<ConversationThreadPage />} />
        {/* SCR-04: cycle-scoped step config readback */}
        <Route path="cycles/:cycleId/settings" element={<CycleStepConfigPage />} />
        <Route path="inbox" element={<InboxPage />} />
        {/* SCR-04: global default (StepConfigPage form retired) */}
        <Route path="settings/steps" element={<GlobalStepConfigPage />} />
        <Route path="settings/steps/:stepId" element={<StepSpecPage />} />
        {/* BU-3: global config-hearing placeholder (global scope has no cycle) */}
        <Route path="settings/hearing" element={<GlobalHearingPage />} />
        {/* US-08: サイクル工程の再構成 (AI 起点) */}
        <Route path="cycles/:cycleId/reconstruction" element={<CycleReconstructionPage />} />
        {/* US-08: グローバル既定の再構成 (人間起点 / SCR-04 global から起動) */}
        <Route path="settings/reconstruction" element={<GlobalReconstructionPage />} />
        <Route path="cycles/:cycleId/q/:questionId" element={<QuestionPage />} />
        <Route path="questions/:questionId" element={<QuestionPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

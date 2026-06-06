// App — route table. AppShell is the layout (sidebar + topbar slot + <Outlet/>);
// the 5 screens hang off it. /questions/:id dispatches to review vs answer.
import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell";
import { CycleListPage } from "./features/cycles/CycleListPage";
import { CycleDetailPage } from "./features/cycle-detail/CycleDetailPage";
import { InboxPage } from "./features/inbox/InboxPage";
import { QuestionPage } from "./features/inbox/QuestionPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<CycleListPage />} />
        <Route path="cycles/:cycleId" element={<CycleDetailPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="questions/:questionId" element={<QuestionPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

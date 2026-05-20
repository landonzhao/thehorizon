import { useState } from "react";
import "./style.css";
import { Nav } from "./components/Nav.jsx";
import { ReportPage } from "./pages/ReportPage.jsx";
import { SourcePage } from "./pages/SourcePage.jsx";
import { ArchivePage } from "./pages/ArchivePage.jsx";

export default function App() {
  const [page, setPage] = useState("report");

  return (
    <main className="page">
      <Nav page={page} setPage={setPage} />
      {page === "report" && <ReportPage />}
      {page === "daily" && <SourcePage period="daily" />}
      {page === "weekly" && <SourcePage period="weekly" />}
      {page === "monthly" && <SourcePage period="monthly" />}
      {page === "quarterly" && <SourcePage period="quarterly" />}
      {page === "archive" && <ArchivePage />}
    </main>
  );
}

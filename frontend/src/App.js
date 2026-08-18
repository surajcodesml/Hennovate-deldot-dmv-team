import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import Queue from "./pages/Queue";
import CaseDetail from "./pages/CaseDetail";
import ImportExport from "./pages/ImportExport";
import AuditLog from "./pages/AuditLog";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/case/:id" element={<CaseDetail />} />
            <Route path="/import-export" element={<ImportExport />} />
            <Route path="/audit" element={<AuditLog />} />
          </Routes>
        </Layout>
        <Toaster position="bottom-right" richColors closeButton />
      </BrowserRouter>
    </div>
  );
}

export default App;

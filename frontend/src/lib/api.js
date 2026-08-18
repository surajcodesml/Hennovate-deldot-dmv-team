import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  timeout: 30000,
});

export const fetchStats = async () => (await api.get("/stats")).data;

export const fetchCases = async (params = {}) =>
  (await api.get("/cases", { params })).data;

export const fetchCase = async (id) => (await api.get(`/cases/${id}`)).data;

export const updateCase = async (id, payload) =>
  (await api.patch(`/cases/${id}`, payload)).data;

export const fetchAudit = async () => (await api.get("/audit")).data;

export const importCsv = async (file, replace = false) => {
  const fd = new FormData();
  fd.append("file", file);
  return (
    await api.post(`/cases/import?replace=${replace}`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  ).data;
};

export const exportCsvUrl = () => `${API}/cases/export/csv`;

export const resetSeed = async () => (await api.post(`/cases/reset`)).data;

// Classification meta
export const CLASSIFICATIONS = {
  review_warranted: {
    label: "Review Warranted",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-300",
    dot: "#D97706",
  },
  review_not_warranted: {
    label: "Review Not Warranted",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-300",
    dot: "#059669",
  },
  insufficient_evidence: {
    label: "Insufficient Evidence",
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-300",
    dot: "#64748B",
  },
};

export const priorityBand = (p) => {
  if (p >= 0.7)
    return { label: "High", color: "#DC2626", bg: "bg-red-50", text: "text-red-700", border: "border-red-300" };
  if (p >= 0.4)
    return { label: "Moderate", color: "#D97706", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-300" };
  return { label: "Low", color: "#059669", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-300" };
};

export const REVIEWER_STATUS_META = {
  unreviewed: { label: "Unreviewed", color: "#64748B" },
  confirmed_warranted: { label: "Confirmed — Review Warranted", color: "#B45309" },
  confirmed_not_warranted: { label: "Confirmed — Not Warranted", color: "#047857" },
  flagged_insufficient: { label: "Flagged — Insufficient", color: "#475569" },
  dismissed: { label: "Dismissed", color: "#334155" },
};

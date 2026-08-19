import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, timeout: 30000 });

export const fetchStats = async () => (await api.get("/stats")).data;
export const fetchCases = async (p = {}) => (await api.get("/cases", { params: p })).data;
export const fetchCase = async (id) => (await api.get(`/cases/${id}`)).data;
export const updateCase = async (id, payload) => (await api.patch(`/cases/${id}`, payload)).data;
export const fetchAudit = async () => (await api.get("/audit")).data;
export const fetchAuditEntry = async (id) => (await api.get(`/audit/${id}`)).data;
export const fetchModelPerf = async () => (await api.get("/model/performance")).data;
export const importCsv = async (file, replace = false) => {
  const fd = new FormData(); fd.append("file", file);
  return (await api.post(`/cases/import?replace=${replace}`, fd,
    { headers: { "Content-Type": "multipart/form-data" }})).data;
};
export const exportCsvUrl = () => `${API}/cases/export/csv`;
export const resetSeed = async () => (await api.post(`/cases/reset`)).data;

export const CLASSIFICATIONS = {
  review_warranted: {
    label: "Review Warranted", short: "Warranted",
    color: "#EF4444", bg: "bg-red-500/10", text: "text-red-300", border: "border-red-500/30",
  },
  review_not_warranted: {
    label: "Review Not Warranted", short: "Not Warranted",
    color: "#10B981", bg: "bg-emerald-500/10", text: "text-emerald-300", border: "border-emerald-500/30",
  },
  insufficient_information: {
    label: "Insufficient Information", short: "Insufficient",
    color: "#F59E0B", bg: "bg-amber-500/10", text: "text-amber-300", border: "border-amber-500/30",
  },
};

export const priorityBand = (p) => {
  if (p >= 0.85) return { label: "Critical", color: "#EF4444", bg: "bg-red-500/10", text: "text-red-300", border: "border-red-500/30" };
  if (p >= 0.70) return { label: "High", color: "#F97316", bg: "bg-orange-500/10", text: "text-orange-300", border: "border-orange-500/30" };
  if (p >= 0.40) return { label: "Medium", color: "#F59E0B", bg: "bg-amber-500/10", text: "text-amber-300", border: "border-amber-500/30" };
  return { label: "Low", color: "#10B981", bg: "bg-emerald-500/10", text: "text-emerald-300", border: "border-emerald-500/30" };
};

export const REVIEWER_STATUS_META = {
  unreviewed: { label: "Unreviewed", color: "#6B7280" },
  marked_for_review: { label: "Marked for Review", color: "#F97316" },
  cleared: { label: "Cleared", color: "#10B981" },
  info_requested: { label: "Info Requested", color: "#F59E0B" },
  confirmed_warranted: { label: "Confirmed Warranted", color: "#EF4444" },
  confirmed_not_warranted: { label: "Confirmed Not Warranted", color: "#059669" },
};

export const EVIDENCE_META = {
  address: { label: "Address Records", color: "#3B82F6", icon: "MapPin" },
  credential: { label: "Credential Records", color: "#8B5CF6", icon: "IdCard" },
  vehicle_title: { label: "Vehicle Title Records", color: "#06B6D4", icon: "Car" },
  work: { label: "Work Records", color: "#F59E0B", icon: "Briefcase" },
  external: { label: "External Records", color: "#EC4899", icon: "Radio" },
};

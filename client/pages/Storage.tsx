import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Upload,
  Settings,
  Plus,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Info,
  CloudUpload,
  KeyRound,
  Clock,
  Download,
  LayoutGrid,
  Users,
  BarChart3,
  Server,
  Shield,
  Trash2,
  X,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getAdminHeaders,
  getAdminUserRole,
  loadAdminApiKey,
  saveAdminApiKey,
  saveAdminSessionToken,
} from "@/lib/adminApi";

/* ═══════════════════════════ Types ═══════════════════════════ */

interface FileEntry {
  id: string;
  name: string;
  size: number;
  ext: string;
}

interface UploadResult {
  storage_path: string;
  original_name: string;
  mime_type: string;
  size: number;
}

interface UploadResultState {
  transferId: string;
  transferCode: string;
  password: string;
  link: string;
  expiresAt: string;
  fileCount: number;
  totalSize: number;
}

type ActiveView = "upload" | "admin" | "password" | "download" | "login";
type ExpiryOption = "6h" | "24h" | "48h";

/* ═══════════════════════════ Constants ═══════════════════════════ */

const ADMIN_BASE = "/api/admin/storage";
const PUBLIC_BASE = "/api/storage";
const MAX_SIZE = 15e9; // 15 GB
const CONCURRENCY = 3;

/* ═══════════════════════════ Helpers ═══════════════════════════ */

function generatePassword(len = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} Go`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} Mo`;
  return `${Math.round(bytes / 1e3)} Ko`;
}

function getExt(name: string): string {
  return name.split(".").pop()?.substring(0, 4).toLowerCase() ?? "?";
}

function formatExpiry(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}min`;
  return `${minutes}min`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Actif";
    case "expired":
      return "Expiré";
    case "revoked":
      return "Révoqué";
    case "deleted":
      return "Supprimé";
    default:
      return status;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-600";
    case "expired":
      return "bg-gray-100 text-gray-400";
    case "revoked":
      return "bg-red-50 text-red-500";
    default:
      return "bg-gray-100 text-gray-400";
  }
}

/* ═══════════════════════════ SamLogo ═══════════════════════════ */

function SamLogo({ className }: { className?: string }) {
  return <img src="/logo_sam.svg" alt="SAM.ma" className={className} />;
}

/* ═══════════════════════════ API Layer ═══════════════════════════ */

async function uploadFile(
  file: File,
  onProgress?: (p: { loaded: number; total: number }) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    let serverTimer: ReturnType<typeof setInterval> | null = null;
    // Virtual total: first half = client→server, second half = server→cloud
    const virtualTotal = file.size * 2;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        // Report as first half of virtual total
        onProgress({ loaded: e.loaded, total: virtualTotal });
      }
    });

    // When all bytes are sent to the local server, simulate cloud upload progress
    xhr.upload.addEventListener("loadend", () => {
      if (!onProgress) return;
      let current = file.size; // Start at 50% of virtual total
      serverTimer = setInterval(() => {
        const remaining = virtualTotal - current;
        current += remaining * 0.06; // Ease-out curve
        if (current > virtualTotal * 0.95) current = virtualTotal * 0.95; // Cap at 95%
        onProgress({ loaded: current, total: virtualTotal });
      }, 200);
    });

    const cleanup = () => {
      if (serverTimer) { clearInterval(serverTimer); serverTimer = null; }
    };

    xhr.addEventListener("load", () => {
      cleanup();
      // Report 100% of virtual total
      if (onProgress) onProgress({ loaded: virtualTotal, total: virtualTotal });
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Réponse invalide du serveur"));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || `Erreur ${xhr.status}`));
        } catch {
          reject(new Error(`Erreur ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener("error", () => { cleanup(); reject(new Error("Erreur réseau")); });
    xhr.addEventListener("abort", () => { cleanup(); reject(new Error("Upload annulé")); });

    xhr.open("POST", `${ADMIN_BASE}/upload`);
    const headers = getAdminHeaders();
    // Don't set Content-Type for FormData — browser sets multipart/form-data with boundary automatically
    Object.entries(headers).forEach(([k, v]) => {
      if (k.toLowerCase() !== "content-type") xhr.setRequestHeader(k, v as string);
    });
    xhr.send(formData);
  });
}

async function createTransfer(data: {
  files: { storage_path: string; original_name: string; mime_type?: string; size: number }[];
  password?: string;
  expiry: ExpiryOption;
  recipient_email?: string;
  sender_email?: string;
  message?: string;
  name?: string;
}): Promise<any> {
  const res = await fetch(`${ADMIN_BASE}/transfers`, {
    method: "POST",
    headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

async function listAllTransfers(params: {
  page?: number;
  status?: string;
  per_page?: number;
}): Promise<{ transfers: any[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.status && params.status !== "all") qs.set("status", params.status);
  if (params.per_page) qs.set("per_page", String(params.per_page));
  const res = await fetch(`${ADMIN_BASE}/transfers/all?${qs}`, {
    headers: getAdminHeaders(),
  });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return res.json();
}

async function sendTransferEmail(
  transferId: string,
  data: { recipient_email: string; message?: string; password?: string },
): Promise<any> {
  const res = await fetch(`${ADMIN_BASE}/transfers/${transferId}/send-email`, {
    method: "POST",
    headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

async function revokeTransfer(transferId: string): Promise<any> {
  const res = await fetch(`${ADMIN_BASE}/transfers/${transferId}/revoke`, {
    method: "POST",
    headers: getAdminHeaders(),
  });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return res.json();
}

async function deleteTransferPermanently(transferId: string): Promise<any> {
  const res = await fetch(`${ADMIN_BASE}/transfers/${transferId}`, {
    method: "DELETE",
    headers: getAdminHeaders(),
  });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return res.json();
}

async function getStorageStats(): Promise<any> {
  const res = await fetch(`${ADMIN_BASE}/stats`, {
    headers: getAdminHeaders(),
  });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return res.json();
}

async function getTransferInfo(code: string): Promise<any> {
  const res = await fetch(`${PUBLIC_BASE}/t/${code}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

async function verifyTransferPassword(
  code: string,
  password: string,
): Promise<any> {
  const res = await fetch(`${PUBLIC_BASE}/t/${code}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

async function getDownloadUrls(
  code: string,
  token: string,
  fileId?: string,
): Promise<any> {
  const res = await fetch(`${PUBLIC_BASE}/t/${code}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ downloadToken: token, fileId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erreur ${res.status}`);
  }
  return res.json();
}

/* ═══════════════════════════ Component ═══════════════════════════ */

export default function StoragePage() {
  const [searchParams] = useSearchParams();
  const transferCode = searchParams.get("t");
  const adminRole = getAdminUserRole();
  const isAuthenticated = !!loadAdminApiKey() && !!adminRole;
  const isSuperadmin = adminRole === "superadmin";
  const canAccessDashboard = isSuperadmin || adminRole === "ops";
  const isGuestMode = !!transferCode;

  /* ---------- Initial view ---------- */
  function getInitialView(): ActiveView {
    if (transferCode) return "password";
    if (isAuthenticated) return "upload";
    return "login";
  }

  /* ---------- Upload state ---------- */
  const [activeView, setActiveView] = useState<ActiveView>(getInitialView);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [expiry, setExpiry] = useState<ExpiryOption>("24h");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<
    "uploading" | "processing" | "creating" | null
  >(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [customPassword, setCustomPassword] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResultState | null>(null);
  const [emailSentConfirm, setEmailSentConfirm] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  /* ---------- Guest state ---------- */
  const [guestTransfer, setGuestTransfer] = useState<any>(null);
  const [guestFiles, setGuestFiles] = useState<any[]>([]);
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [guestPassword, setGuestPassword] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  /* ---------- Login state ---------- */
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  /* ---------- Admin dashboard state ---------- */
  const [adminTransfers, setAdminTransfers] = useState<any[]>([]);
  const [adminTotal, setAdminTotal] = useState(0);
  const [adminPage, setAdminPage] = useState(1);
  const [adminStatusFilter, setAdminStatusFilter] = useState("all");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminDaily, setAdminDaily] = useState<any[]>([]);
  const [adminFileTypes, setAdminFileTypes] = useState<any[]>([]);
  const [adminActivity, setAdminActivity] = useState<any[]>([]);
  const [adminTab, setAdminTab] = useState<"transfers" | "users" | "stats" | "storage" | "security">("transfers");
  const adminLimit = 10;
  const adminTotalPages = Math.ceil(adminTotal / adminLimit);

  /* ─────────── Upload speed tracker ─────────── */
  const speedRef = useRef({ lastBytes: 0, lastTime: Date.now() });

  /* ─────────── Computed ─────────── */
  const totalSize = rawFiles.reduce((s, f) => s + f.size, 0);
  const usagePct = Math.min((totalSize / MAX_SIZE) * 100, 100);

  /* ─────────── Tabs ─────────── */
  const tabs = isAuthenticated && !isGuestMode
    ? [
        { key: "upload" as ActiveView, label: "Upload", icon: Upload },
        ...(canAccessDashboard
          ? [{ key: "admin" as ActiveView, label: "Tableau de bord", icon: Settings }]
          : []),
      ]
    : [];

  const safeSetView = useCallback((v: ActiveView) => {
    setActiveView(v);
  }, []);

  /* ─────────── Load guest transfer info ─────────── */
  useEffect(() => {
    if (transferCode && activeView === "password") {
      setGuestLoading(true);
      getTransferInfo(transferCode)
        .then((data) => {
          setGuestTransfer(data);
          setGuestLoading(false);
        })
        .catch((err) => {
          setGuestError(err.message);
          setGuestLoading(false);
        });
    }
  }, [transferCode, activeView]);

  /* ─────────── Load admin data ─────────── */
  const loadAdminData = useCallback(async () => {
    if (!canAccessDashboard) return;
    setAdminLoading(true);
    try {
      const [transferData, statsData] = await Promise.all([
        listAllTransfers({
          page: adminPage,
          status: adminStatusFilter,
          per_page: adminLimit,
        }),
        isSuperadmin ? getStorageStats() : Promise.resolve(null),
      ]);
      setAdminTransfers(transferData.transfers);
      setAdminTotal(transferData.total);
      if (statsData) {
        setAdminStats(statsData.stats);
        setAdminUsers(statsData.users ?? []);
        setAdminDaily(statsData.daily ?? []);
        setAdminFileTypes(statsData.fileTypes ?? []);
        setAdminActivity(statsData.recentActivity ?? []);
      }
    } catch {
      // Silently fail
    } finally {
      setAdminLoading(false);
    }
  }, [canAccessDashboard, adminPage, adminStatusFilter, isSuperadmin]);

  useEffect(() => {
    if (activeView === "admin") {
      loadAdminData();
    }
  }, [activeView, loadAdminData]);

  /* ─────────── File management ─────────── */
  const addFiles = useCallback(
    (fileList: FileList) => {
      const newFiles = Array.from(fileList);
      const total = rawFiles.reduce((s, f) => s + f.size, 0) + newFiles.reduce((s, f) => s + f.size, 0);
      if (total > MAX_SIZE) {
        setUploadError("La taille totale dépasse 15 Go");
        return;
      }
      setRawFiles((prev) => [...prev, ...newFiles]);
      setFiles((prev) => [
        ...prev,
        ...newFiles.map((f) => ({
          id: crypto.randomUUID(),
          name: f.name,
          size: f.size,
          ext: getExt(f.name),
        })),
      ]);
      setUploadError(null);
    },
    [rawFiles],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx === -1) return prev;
      setRawFiles((raw) => {
        const next = [...raw];
        next.splice(idx, 1);
        return next;
      });
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) addFiles(e.target.files);
      e.target.value = "";
    },
    [addFiles],
  );

  /* ─────────── Upload & Transfer ─────────── */
  const handleUpload = useCallback(async () => {
    if (rawFiles.length === 0) return;
    setUploading(true);
    setUploadError(null);
    setUploadPhase("uploading");
    setUploadProgress(0);

    const realTotalBytes = rawFiles.reduce((s, f) => s + f.size, 0);
    // Virtual total: upload reports file.size*2 (half for upload, half for cloud transfer)
    const totalBytes = realTotalBytes * 2;
    const fileProgress = new Map<number, number>();
    speedRef.current = { lastBytes: 0, lastTime: Date.now() };

    const results: UploadResult[] = [];
    const queue: [number, File][] = rawFiles.map((f, i) => [i, f]);

    const uploadNext = async (): Promise<void> => {
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry) break;
        const [idx, file] = entry;
        const result = await uploadFile(file, ({ loaded, total }) => {
          fileProgress.set(idx, loaded);
          const totalLoaded = Array.from(fileProgress.values()).reduce((a, b) => a + b, 0);
          setUploadProgress((totalLoaded / totalBytes) * 90);
          // Switch phase label when XHR upload is done but cloud transfer ongoing
          const fileRealSize = file.size;
          if (loaded > fileRealSize) {
            // We're in the simulated server→cloud phase
            setUploadPhase("processing");
          }
          const now = Date.now();
          const elapsed = (now - speedRef.current.lastTime) / 1000;
          if (elapsed >= 0.5) {
            const byteDiff = totalLoaded - speedRef.current.lastBytes;
            setUploadSpeed(byteDiff / elapsed);
            speedRef.current = { lastBytes: totalLoaded, lastTime: now };
          }
        });
        results.push(result);
      }
    };

    try {
      const workers = Array.from({ length: Math.min(CONCURRENCY, rawFiles.length) }, () => uploadNext());
      await Promise.all(workers);

      setUploadPhase("creating");
      setUploadProgress(92);

      const password = customPassword || generatePassword();
      const createRes = await createTransfer({
        files: results.map((r) => ({
          storage_path: r.storage_path,
          original_name: r.original_name,
          mime_type: r.mime_type,
          size: r.size,
        })),
        password: password || undefined,
        expiry,
        recipient_email: recipientEmail || undefined,
        sender_email: senderEmail || undefined,
        message: message || undefined,
      });

      const transfer = createRes.transfer;
      const link = `${window.location.origin}/storage?t=${transfer.code}`;

      setUploadResult({
        transferId: transfer.id,
        transferCode: transfer.code,
        password,
        link,
        expiresAt: transfer.expires_at,
        fileCount: rawFiles.length,
        totalSize: realTotalBytes,
      });

      setUploadProgress(100);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      setUploadPhase(null);
      setUploadProgress(null);
      setUploadSpeed(0);
    }
  }, [rawFiles, expiry, customPassword, recipientEmail, senderEmail, message]);

  /* ─────────── Guest password verify ─────────── */
  const handleGuestVerify = useCallback(async () => {
    if (!transferCode || !guestPassword) return;
    setGuestLoading(true);
    setGuestError(null);
    try {
      const data = await verifyTransferPassword(transferCode, guestPassword);
      setDownloadToken(data.downloadToken);
      setGuestFiles(data.files || []);
      setActiveView("download");
    } catch (err: any) {
      setGuestError(err.message);
    } finally {
      setGuestLoading(false);
    }
  }, [transferCode, guestPassword]);

  /* ─────────── Download ─────────── */
  const handleDownload = useCallback(
    async (fileId?: string) => {
      if (!transferCode || !downloadToken) return;
      setDownloadingFileId(fileId || "all");
      try {
        const data = await getDownloadUrls(transferCode, downloadToken, fileId);
        const urls: { url: string; filename: string }[] = data.urls || data.files || [];
        for (const item of urls) {
          const a = document.createElement("a");
          a.href = item.url;
          a.download = item.filename || "";
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          if (urls.length > 1) await new Promise((r) => setTimeout(r, 300));
        }
      } catch {
        // Download error silently handled
      } finally {
        setDownloadingFileId(null);
      }
    },
    [transferCode, downloadToken],
  );

  /* ─────────── Login ─────────── */
  const handleLogin = useCallback(async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: loginEmail.trim(),
          password: loginPassword.trim(),
        }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json.ok) {
        setLoginError(json.error || "Identifiants invalides");
        return;
      }
      if (json.session_token) {
        saveAdminApiKey(json.session_token);
        saveAdminSessionToken(json.session_token);
      }
      window.location.reload();
    } catch {
      setLoginError("Erreur de connexion au serveur");
    } finally {
      setLoginLoading(false);
    }
  }, [loginEmail, loginPassword]);

  /* ─────────── Copy helpers ─────────── */
  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }, []);

  const handleCopyLink = useCallback(
    (code: string) => {
      copyToClipboard(`${window.location.origin}/storage?t=${code}`, "link-" + code);
    },
    [copyToClipboard],
  );

  /* ─────────── Admin actions ─────────── */
  const handleRevoke = useCallback(
    async (id: string) => {
      try {
        await revokeTransfer(id);
        loadAdminData();
      } catch {
        // silently fail
      }
    },
    [loadAdminData],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteTransferPermanently(id);
        // Retirer immédiatement la ligne du tableau
        setAdminTransfers((prev) => prev.filter((t) => t.id !== id));
        setAdminTotal((prev) => Math.max(0, prev - 1));
      } catch {
        // silently fail
      }
    },
    [],
  );

  const handleSendEmail = useCallback(
    async (transferId: string) => {
      if (!recipientEmail) return;
      try {
        setSendingEmail(true);
        setEmailError(null);
        await sendTransferEmail(transferId, {
          recipient_email: recipientEmail,
          message: message || undefined,
          password: uploadResult?.password || undefined,
        });
        setEmailSentConfirm(true);
      } catch (err: any) {
        setEmailError(err?.message || "Échec de l'envoi de l'email");
      } finally {
        setSendingEmail(false);
      }
    },
    [recipientEmail, senderEmail, message, uploadResult?.password],
  );

  /* ─────────── Reset for new transfer ─────────── */
  const resetUpload = useCallback(() => {
    setFiles([]);
    setRawFiles([]);
    setUploadResult(null);
    setUploadError(null);
    setUploadProgress(null);
    setUploadPhase(null);
    setUploadSpeed(0);
    setRecipientEmail("");
    setSenderEmail("");
    setMessage("");
    setCustomPassword("");
    setExpiry("24h");
    setEmailSentConfirm(false);
    setSendingEmail(false);
    setEmailError(null);
    setCopiedField(null);
  }, []);

  /* ═══════════════════════════ RENDER ═══════════════════════════ */

  return (
    <div className="min-h-screen bg-white">
      {/* ── Navigation bar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 md:px-10 py-3 bg-white/95 backdrop-blur-sm border-b border-gray-200">
        <button
          type="button"
          onClick={() => safeSetView(isAuthenticated ? "upload" : isGuestMode ? "password" : "login")}
          className="flex items-center gap-3"
        >
          <SamLogo className="w-[100px] h-10" />
          <span className="text-[11px] font-semibold tracking-wider uppercase text-primary bg-primary/10 px-2 py-0.5 rounded">
            Storage
          </span>
        </button>

        {tabs.length > 0 && (
          <div className="flex gap-1 bg-gray-100 rounded-[10px] p-1">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => safeSetView(key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
                  activeView === key
                    ? "bg-white text-foreground shadow-sm"
                    : "text-gray-500 hover:bg-gray-200",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* ── Content ── */}
      <div className="pt-[72px]">

        {/* ════════════ LOGIN VIEW ════════════ */}
        {activeView === "login" && (
          <div className="flex items-center justify-center min-h-[calc(100vh-72px)]">
            <div className="w-full max-w-[400px] px-5">
              <div className="flex flex-col items-center mb-8 text-center">
                <div className="mb-3.5">
                  <SamLogo className="h-10 w-auto" />
                </div>
                <h2 className="font-['Poppins'] font-light text-2xl mb-1">SAM Storage</h2>
                <p className="text-sm text-gray-400">Outil interne — équipe SAM uniquement</p>
              </div>

              <div className="bg-white border-[1.5px] border-gray-200 rounded-2xl p-7">
                <div className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-600">
                      Identifiant
                    </label>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      placeholder="votre@email.ma"
                      className="px-3.5 py-3 border-[1.5px] border-gray-200 rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                      autoFocus
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-600">
                      Mot de passe
                    </label>
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      placeholder="Votre mot de passe"
                      className="px-3.5 py-3 border-[1.5px] border-gray-200 rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>

                  {loginError && (
                    <p className="text-xs text-red-500 text-center">{loginError}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleLogin}
                    disabled={loginLoading || !loginEmail.trim() || !loginPassword.trim()}
                    className="w-full py-3 bg-foreground text-white rounded-lg text-[15px] font-semibold hover:bg-gray-800 hover:-translate-y-px transition-all disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {loginLoading ? "Connexion\u2026" : "Se connecter"}
                  </button>
                </div>
              </div>

              <p className="mt-4 text-center text-xs text-gray-400">
                Accès réservé aux administrateurs SAM.
              </p>
            </div>
          </div>
        )}

        {/* ════════════ UPLOAD VIEW ════════════ */}
        {activeView === "upload" && !uploadResult && (
          <div>
            {/* Hero */}
            <div className="flex flex-col items-center px-6 pt-14 pb-8 text-center">
              <h1 className="font-['Poppins'] font-light text-[clamp(28px,4vw,48px)] leading-tight max-w-[600px]">
                Partagez vos fichiers<br />
                en toute <em className="italic text-primary">simplicité</em>
              </h1>
              <p className="mt-3 text-[15px] text-gray-500 max-w-[440px] leading-relaxed">
                Transférez jusqu&apos;à 15 Go en quelques secondes. Lien sécurisé, code d&apos;accès, expiration automatique.
              </p>

              {/* Step indicator */}
              <div className="flex items-center justify-center gap-0 mt-8 max-w-[480px] w-full">
                {[
                  { n: 1, label: "Sélection" },
                  { n: 2, label: "Paramètres" },
                  { n: 3, label: "Envoi" },
                ].map((step, i) => {
                  const uploadStep = rawFiles.length === 0 ? 1 : uploading ? 3 : 2;
                  return (
                    <div key={step.n} className="contents">
                      {i > 0 && <div className="flex-1 h-px bg-gray-200 mb-[18px]" />}
                      <div className="flex flex-col items-center gap-1.5 flex-1">
                        <div
                          className={cn(
                            "w-[30px] h-[30px] rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                            uploadStep >= step.n ? "bg-primary text-white" : "bg-gray-200 text-gray-500",
                          )}
                        >
                          {step.n}
                        </div>
                        <span
                          className={cn(
                            "text-[11px] font-medium tracking-wider uppercase",
                            uploadStep >= step.n ? "text-primary" : "text-gray-400",
                          )}
                        >
                          {step.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upload form */}
            <div className="max-w-[620px] w-full mx-auto px-5 pb-16">
              {/* Drop zone */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all bg-gray-50",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 hover:border-primary hover:bg-primary/5",
                )}
              >
                <div className="w-12 h-12 bg-white rounded-xl border border-gray-200 flex items-center justify-center mx-auto mb-3.5 shadow-sm">
                  <Upload className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-base font-medium mb-1.5">Déposez vos fichiers ici</h3>
                <p className="text-[13px] text-gray-400">
                  ou <span className="text-primary underline cursor-pointer">parcourez vos dossiers</span>
                </p>
              </div>

              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInput} />

              <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-gray-400">
                <Info className="w-3 h-3" />
                Maximum 15 Go · 100 000 fichiers
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="mt-4 flex flex-col gap-1.5">
                  {files.map((f) => (
                    <div key={f.id} className="flex items-center gap-2.5 p-2.5 bg-white border border-gray-200 rounded-[10px]">
                      <div className="w-[34px] h-[34px] rounded-lg bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary uppercase shrink-0">
                        {f.ext}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">{f.name}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{formatSize(f.size)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
                        className="w-[26px] h-[26px] rounded-md flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-primary transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center justify-between gap-2.5 p-2.5 bg-gray-50 rounded-lg text-xs text-gray-600">
                    <span className="font-semibold text-foreground">
                      {files.length} fichier{files.length > 1 ? "s" : ""}
                    </span>
                    <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${usagePct}%` }} />
                    </div>
                    <span>{formatSize(totalSize)} / <strong>15 Go</strong></span>
                  </div>
                </div>
              )}

              {/* Form fields */}
              <div className="mt-5 flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-600">
                      Votre email
                    </label>
                    <input
                      type="email"
                      placeholder="votre@email.ma"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      className="px-3 py-2.5 border-[1.5px] border-gray-200 rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                    />
                    <span className="text-[11px] text-gray-400">
                      Pour recevoir les notifications de téléchargement
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-600">
                      Destinataire
                    </label>
                    <input
                      type="email"
                      placeholder="partenaire@entreprise.ma"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="px-3 py-2.5 border-[1.5px] border-gray-200 rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-600">
                      Mot de passe
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={customPassword}
                        onChange={(e) => setCustomPassword(e.target.value)}
                        placeholder="Généré automatiquement"
                        className="flex-1 px-3 py-2.5 border-[1.5px] border-gray-200 rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setCustomPassword(generatePassword())}
                        className="px-3 py-2.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] font-medium text-primary hover:bg-primary/5 hover:border-primary transition-colors whitespace-nowrap"
                      >
                        Générer
                      </button>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      Laissez vide pour un mot de passe auto, ou choisissez le vôtre
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-600">
                      Expiration
                    </label>
                    <div className="flex gap-1.5 w-full">
                      {(["6h", "24h", "48h"] as ExpiryOption[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setExpiry(opt)}
                          className={cn(
                            "flex-1 py-2.5 rounded-full text-[13px] font-medium border-[1.5px] transition-all",
                            expiry === opt
                              ? "border-primary bg-primary text-white"
                              : "border-gray-200 bg-white text-gray-500 hover:border-primary hover:text-primary",
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px] text-gray-400">Max 48h — suppression automatique</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-600">
                    Message
                  </label>
                  <textarea
                    placeholder="Voici les fichiers demandés..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2.5 border-[1.5px] border-gray-200 rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-colors resize-none"
                  />
                </div>
              </div>

              {/* Submit button */}
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || rawFiles.length === 0}
                className="flex items-center justify-center gap-2 w-full py-3.5 mt-5 bg-primary text-white rounded-[10px] text-[15px] font-semibold hover:bg-sam-primary-hover hover:shadow-lg hover:-translate-y-px transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                <CloudUpload className="w-[17px] h-[17px]" />
                {uploading ? "Envoi en cours\u2026" : "Envoyer le transfert"}
              </button>

              {uploadError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {uploadError}
                </div>
              )}

              {/* Progress bar */}
              {uploadProgress !== null && !uploadResult && (
                <div className="mt-5 p-4 bg-gray-50 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">
                      {uploadProgress >= 100
                        ? "Transfert créé !"
                        : uploadPhase === "creating"
                          ? "Création du transfert\u2026"
                          : uploadPhase === "processing"
                            ? "Transfert vers le cloud\u2026"
                            : "Envoi des fichiers\u2026"}
                    </span>
                    <span className="text-[15px] text-primary font-bold tabular-nums">
                      {Math.round(uploadProgress)}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2.5">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        uploadPhase === "processing"
                          ? "bg-gradient-to-r from-primary via-sam-primary-light to-primary bg-[length:200%_100%] animate-shimmer"
                          : "bg-gradient-to-r from-primary to-sam-primary-light",
                      )}
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>
                      {files.length} fichier{files.length > 1 ? "s" : ""} · {(totalSize / (1024 * 1024)).toFixed(1)} Mo
                    </span>
                    {uploadSpeed > 0 && (uploadPhase === "uploading" || uploadPhase === "processing") && (
                      <span className="font-medium tabular-nums">
                        {uploadSpeed >= 1048576
                          ? `${(uploadSpeed / 1048576).toFixed(1)} Mo/s`
                          : `${Math.round(uploadSpeed / 1024)} Ko/s`}
                      </span>
                    )}
                    {uploadPhase === "processing" && uploadSpeed <= 0 && (
                      <span className="text-primary font-medium">{"Cloud en cours\u2026"}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════ UPLOAD SUCCESS VIEW ════════════ */}
        {activeView === "upload" && uploadResult && (
          <div className="max-w-[620px] w-full mx-auto px-5 py-14">
            <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs">
                  ✓
                </div>
                <span className="text-sm font-semibold text-emerald-700">
                  Transfert créé avec succès !
                </span>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-500 mb-1 block">
                    Lien de partage
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={uploadResult.link}
                      className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(uploadResult.link, "link")}
                      className={cn(
                        "px-3 py-2 border rounded-lg text-sm font-medium transition-all min-w-[72px]",
                        copiedField === "link"
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "bg-white border-gray-200 hover:bg-gray-50",
                      )}
                    >
                      {copiedField === "link" ? "Copié" : "Copier"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-500 mb-1 block">
                    Mot de passe
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={uploadResult.password}
                      className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-mono text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(uploadResult.password, "password")}
                      className={cn(
                        "px-3 py-2 border rounded-lg text-sm font-medium transition-all min-w-[72px]",
                        copiedField === "password"
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "bg-white border-gray-200 hover:bg-gray-50",
                      )}
                    >
                      {copiedField === "password" ? "Copié" : "Copier"}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Communiquez ce mot de passe à votre destinataire pour qu'il puisse télécharger les fichiers.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5 mt-4">
                {recipientEmail && !emailSentConfirm && (
                  <button
                    type="button"
                    onClick={() => handleSendEmail(uploadResult.transferId)}
                    disabled={sendingEmail}
                    className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {sendingEmail ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        {"Envoi en cours\u2026"}
                      </>
                    ) : (
                      "Envoyer par email"
                    )}
                  </button>
                )}

                {emailSentConfirm && (
                  <div className="flex-1 py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-semibold text-center flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Email envoyé !
                  </div>
                )}

                {emailError && (
                  <div className="flex-1 py-2.5 bg-red-500 text-white rounded-lg text-sm font-semibold text-center">
                    {emailError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={resetUpload}
                  className="flex-1 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-50"
                >
                  Nouveau transfert
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════ PASSWORD VIEW (Guest) ════════════ */}
        {activeView === "password" && (
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 min-h-[calc(100vh-72px)]">
            <div className="flex flex-col items-center px-5 py-14 max-w-[420px] mx-auto text-center">
              <div className="w-[84px] h-[84px] rounded-[20px] bg-white border border-gray-200 flex items-center justify-center mb-6 shadow-md">
                <KeyRound className="w-9 h-9 text-primary" />
              </div>

              {guestError && !guestTransfer ? (
                <>
                  <h2 className="font-['Poppins'] font-normal text-[28px] text-foreground mb-3">
                    Transfert introuvable
                  </h2>
                  <p className="text-sm text-gray-500">{guestError}</p>
                </>
              ) : guestTransfer ? (
                <>
                  <div className="text-xs text-gray-400 tracking-wider uppercase font-medium mb-2">
                    Envoyé par{" "}
                    <span className="text-primary font-semibold">
                      {guestTransfer.sender_name}
                    </span>
                  </div>

                  <h2 className="font-['Poppins'] font-normal text-[28px] text-foreground mb-2">
                    {guestTransfer.file_count} fichier{guestTransfer.file_count > 1 ? "s" : ""} protégé{guestTransfer.file_count > 1 ? "s" : ""}
                  </h2>

                  {guestTransfer.message && (
                    <div className="text-sm text-gray-600 leading-relaxed max-w-[360px] bg-white rounded-xl px-4 py-3 border border-gray-200 my-3 italic">
                      &ldquo;{guestTransfer.message}&rdquo;
                    </div>
                  )}

                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-300 rounded-full text-xs font-medium text-amber-600 mb-6">
                    <Clock className="w-3 h-3" />
                    Expire dans{" "}
                    <strong className="ml-0.5">{formatExpiry(guestTransfer.expires_in_seconds)}</strong>
                  </div>

                  <div className="w-full bg-white rounded-2xl border-[1.5px] border-gray-200 p-6">
                    <label className="text-[11px] font-semibold tracking-wider uppercase text-gray-600 mb-2 block text-left">
                      Mot de passe
                    </label>
                    <input
                      type="password"
                      value={guestPassword}
                      onChange={(e) => setGuestPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleGuestVerify()}
                      placeholder="Entrez le mot de passe"
                      className="w-full px-3.5 py-3 border-[1.5px] border-gray-200 rounded-lg text-sm text-foreground focus:outline-none focus:border-primary transition-colors mb-3"
                    />
                    {guestError && guestTransfer && (
                      <p className="text-xs text-red-500 mb-3">{guestError}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleGuestVerify}
                      disabled={guestLoading || !guestPassword.trim()}
                      className="w-full py-3 bg-primary text-white rounded-lg text-[15px] font-semibold hover:bg-sam-primary-hover transition-all disabled:opacity-50"
                    >
                      {guestLoading ? "Vérification\u2026" : "Accéder aux fichiers"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400">{"Chargement\u2026"}</p>
              )}
            </div>
          </div>
        )}

        {/* ════════════ DOWNLOAD VIEW ════════════ */}
        {activeView === "download" && (
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 min-h-[calc(100vh-72px)]">
            <div className="flex flex-col items-center px-5 py-14 max-w-[520px] mx-auto text-center">
              <div className="w-[84px] h-[84px] rounded-[20px] bg-white border border-gray-200 flex items-center justify-center mb-6 shadow-md">
                <Download className="w-9 h-9 text-primary" />
              </div>

              <div className="text-xs text-gray-400 tracking-wider uppercase font-medium mb-2">
                Envoyé par{" "}
                <span className="text-primary font-semibold">
                  {guestTransfer?.sender_name ?? "\u2026"}
                </span>
              </div>

              <h2 className="font-['Poppins'] font-normal text-[28px] text-foreground mb-2">
                {guestTransfer?.file_count ?? guestFiles.length} fichier{(guestTransfer?.file_count ?? guestFiles.length) > 1 ? "s" : ""} vous attendent
              </h2>

              {guestTransfer?.message && (
                <div className="text-sm text-gray-600 leading-relaxed max-w-[360px] bg-white rounded-xl px-4 py-3 border border-gray-200 my-3 italic">
                  &ldquo;{guestTransfer.message}&rdquo;
                </div>
              )}

              {guestTransfer && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-300 rounded-full text-xs font-medium text-amber-600 mb-4">
                  <Clock className="w-3 h-3" />
                  Expire dans{" "}
                  <strong className="ml-0.5">{formatExpiry(guestTransfer.expires_in_seconds)}</strong>
                </div>
              )}

              <div className="w-full bg-white rounded-xl border border-gray-200 overflow-hidden my-4 shadow-sm">
                <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    {guestFiles.length} fichier{guestFiles.length > 1 ? "s" : ""}
                  </span>
                  <strong className="text-xs text-foreground">
                    {formatSize(guestFiles.reduce((sum: number, f: any) => sum + f.size, 0))} au total
                  </strong>
                </div>

                {guestFiles.map((f: any) => (
                  <div key={f.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <div className="w-[30px] h-[30px] rounded-md bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary uppercase shrink-0">
                      {getExt(f.original_name)}
                    </div>
                    <span className="text-[13px] font-medium flex-1 text-left truncate">
                      {f.original_name}
                    </span>
                    <span className="text-[11px] text-gray-400 shrink-0">
                      {formatSize(f.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDownload(f.id)}
                      disabled={downloadingFileId === f.id}
                      className="text-[11px] text-primary font-medium hover:underline disabled:opacity-50"
                    >
                      {downloadingFileId === f.id ? "\u2026" : "Télécharger"}
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleDownload()}
                disabled={downloadingFileId === "all"}
                className="flex items-center justify-center gap-2.5 w-full py-4 rounded-xl text-base font-semibold transition-all bg-primary text-white hover:bg-sam-primary-hover hover:-translate-y-px hover:shadow-lg disabled:opacity-50"
              >
                <Download className="w-[18px] h-[18px]" />
                {downloadingFileId === "all"
                  ? "Téléchargement\u2026"
                  : `Télécharger tout (${formatSize(guestFiles.reduce((sum: number, f: any) => sum + f.size, 0))})`}
              </button>

              <p className="mt-3.5 text-xs text-gray-400 leading-relaxed">
                En téléchargeant, vous acceptez que ce lien est temporaire.<br />
                Les fichiers seront supprimés automatiquement à expiration.
              </p>
            </div>
          </div>
        )}

        {/* ════════════ ADMIN DASHBOARD VIEW ════════════ */}
        {activeView === "admin" && (
          <div className="bg-gray-50 min-h-[calc(100vh-72px)]">
            <div className="flex max-w-[1160px] mx-auto px-5 py-7 gap-5">

              {/* Sidebar */}
              <aside className="hidden md:flex flex-col gap-0.5 w-[210px] shrink-0 sticky top-24 self-start">
                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 px-2.5 pt-3 pb-1">
                  Navigation
                </div>
                {([
                  { icon: LayoutGrid, label: "Transferts", key: "transfers" as const, badge: String(adminTotal) },
                  { icon: Users, label: "Utilisateurs", key: "users" as const, badge: adminUsers.length > 0 ? String(adminUsers.length) : undefined },
                  { icon: BarChart3, label: "Statistiques", key: "stats" as const },
                ] as const).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setAdminTab(item.key)}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors text-left",
                      adminTab === item.key ? "bg-white text-foreground shadow-sm" : "text-gray-500 hover:bg-gray-200",
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                    {item.badge && (
                      <span className="ml-auto px-1.5 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}

                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 px-2.5 pt-3 pb-1">
                  Système
                </div>
                {([
                  { icon: Server, label: "Stockage", key: "storage" as const },
                  { icon: Shield, label: "Sécurité", key: "security" as const },
                ] as const).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setAdminTab(item.key)}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors text-left",
                      adminTab === item.key ? "bg-white text-foreground shadow-sm" : "text-gray-500 hover:bg-gray-200",
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </button>
                ))}
              </aside>

              {/* Main content */}
              <main className="flex-1 min-w-0">

                {/* ═══════ TAB: TRANSFERTS ═══════ */}
                {adminTab === "transfers" && (
                  <>
                    <div className="flex justify-between items-start mb-5 gap-4">
                      <div>
                        <h2 className="font-['Poppins'] font-normal text-2xl">Transferts actifs</h2>
                        <p className="text-[13px] text-gray-400 mt-0.5">
                          {adminTotal} transfert{adminTotal > 1 ? "s" : ""} au total
                        </p>
                      </div>
                      <button type="button" onClick={() => setActiveView("upload")}
                        className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-[13px] font-semibold hover:bg-sam-primary-hover transition-colors whitespace-nowrap">
                        <Plus className="w-3.5 h-3.5" /> Nouveau transfert
                      </button>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
                      {[
                        { label: "Transferts actifs", value: adminStats ? String(adminStats.active_transfers) : String(adminTransfers.filter((t) => t.status === "active").length) },
                        { label: "Stockage utilisé", value: adminStats ? formatSize(adminStats.total_size ?? 0) : formatSize(adminTransfers.reduce((s, t) => s + (t.total_size ?? 0), 0)) },
                        { label: "Téléchargements", value: adminStats ? String(adminStats.total_downloads) : "\u2014" },
                        { label: "Expirés", value: adminStats ? String(adminStats.expired_transfers) : String(adminTransfers.filter((t) => t.status === "expired").length) },
                      ].map((stat) => (
                        <div key={stat.label} className="bg-white rounded-xl p-4 border border-gray-200">
                          <div className="text-[11px] text-gray-400 font-medium mb-1.5">{stat.label}</div>
                          <div className="text-[22px] font-semibold">{stat.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 gap-3">
                        <span className="text-[13px] font-semibold">Liste des transferts</span>
                        <select value={adminStatusFilter}
                          onChange={(e) => { setAdminStatusFilter(e.target.value); setAdminPage(1); }}
                          className="px-2.5 py-1.5 border-[1.5px] border-gray-200 rounded-lg text-[13px] bg-white cursor-pointer">
                          <option value="all">Tous les statuts</option>
                          <option value="active">Actifs</option>
                          <option value="expired">Expirés</option>
                          <option value="revoked">Révoqués</option>
                        </select>
                      </div>
                      <div className="overflow-x-auto">
                        {adminLoading ? (
                          <div className="flex items-center justify-center py-12 text-sm text-gray-400">{"Chargement\u2026"}</div>
                        ) : adminTransfers.length === 0 ? (
                          <div className="flex items-center justify-center py-12 text-sm text-gray-400">Aucun transfert trouvé</div>
                        ) : (
                          <table className="w-full border-collapse">
                            <thead><tr>
                              {["Transfert", "Destinataire", "Taille", "Statut", "Créé le", "Téléchargements", ""].map((h) => (
                                <th key={h || "actions"} className="px-3.5 py-2 text-left text-[10px] font-semibold tracking-wider uppercase text-gray-400 bg-gray-50 border-b border-gray-200">{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {adminTransfers.map((t) => (
                                <tr key={t.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                                  <td className="px-3.5 py-3 text-[13px]">
                                    <div className="font-medium">{t.name || t.code}</div>
                                    <div className="text-[11px] text-gray-400 mt-0.5">{t.code} · {t.file_count} fichier{t.file_count > 1 ? "s" : ""}</div>
                                  </td>
                                  <td className="px-3.5 py-3 text-[13px]">{t.recipient_email || "\u2014"}</td>
                                  <td className="px-3.5 py-3 text-[13px]">{formatSize(t.total_size)}</td>
                                  <td className="px-3.5 py-3">
                                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold", getStatusColor(t.status))}>
                                      <span className="w-1.5 h-1.5 rounded-full bg-current" />{getStatusLabel(t.status)}
                                    </span>
                                  </td>
                                  <td className="px-3.5 py-3 text-[13px]">{formatDate(t.created_at)}</td>
                                  <td className="px-3.5 py-3 text-[13px]">{t.download_count ?? 0}</td>
                                  <td className="px-3.5 py-3">
                                    <div className="flex gap-0.5">
                                      {t.status === "active" ? (
                                        <button type="button" onClick={() => handleCopyLink(t.code)} title="Copier lien"
                                          className="w-[26px] h-[26px] rounded-md flex items-center justify-center transition-colors text-gray-400 hover:bg-gray-100 hover:text-foreground">
                                          <ExternalLink className="w-3.5 h-3.5" />
                                        </button>
                                      ) : t.status === "revoked" ? (
                                        <span title="Lien révoqué" className="w-[26px] h-[26px] rounded-md flex items-center justify-center text-red-400">
                                          <Unlink className="w-3.5 h-3.5" />
                                        </span>
                                      ) : (
                                        <span className="w-[26px] h-[26px] rounded-md flex items-center justify-center text-gray-300">
                                          <ExternalLink className="w-3.5 h-3.5" />
                                        </span>
                                      )}
                                      <button type="button" onClick={() => handleDelete(t.id)} title="Supprimer définitivement"
                                        className="w-[26px] h-[26px] rounded-md flex items-center justify-center transition-colors text-gray-400 hover:bg-red-50 hover:text-red-500">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                      {adminTotal > 0 && (
                        <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-gray-200 text-xs text-gray-400">
                          <span>Affichage de {(adminPage - 1) * adminLimit + 1}–{Math.min(adminPage * adminLimit, adminTotal)} sur {adminTotal} transfert{adminTotal > 1 ? "s" : ""}</span>
                          <div className="flex gap-0.5">
                            {adminPage > 1 && (
                              <button type="button" onClick={() => setAdminPage((p) => Math.max(1, p - 1))}
                                className="w-7 h-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors">
                                <ChevronLeft className="w-3 h-3" />
                              </button>
                            )}
                            {Array.from({ length: Math.min(adminTotalPages, 5) }, (_, i) => {
                              let pageNum: number;
                              if (adminTotalPages <= 5) pageNum = i + 1;
                              else if (adminPage <= 3) pageNum = i + 1;
                              else if (adminPage >= adminTotalPages - 2) pageNum = adminTotalPages - 4 + i;
                              else pageNum = adminPage - 2 + i;
                              return (
                                <button key={pageNum} type="button" onClick={() => setAdminPage(pageNum)}
                                  className={cn("w-7 h-7 rounded-md border flex items-center justify-center text-xs transition-colors",
                                    pageNum === adminPage ? "bg-primary text-white border-primary" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-100")}>
                                  {pageNum}
                                </button>
                              );
                            })}
                            {adminPage < adminTotalPages && (
                              <button type="button" onClick={() => setAdminPage((p) => Math.min(adminTotalPages, p + 1))}
                                className="w-7 h-7 rounded-md border border-gray-200 bg-white flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors">
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ═══════ TAB: UTILISATEURS ═══════ */}
                {adminTab === "users" && (
                  <>
                    <div className="mb-5">
                      <h2 className="font-['Poppins'] font-normal text-2xl">Utilisateurs</h2>
                      <p className="text-[13px] text-gray-400 mt-0.5">{adminUsers.length} utilisateur{adminUsers.length > 1 ? "s" : ""} ayant créé des transferts</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      {adminUsers.length === 0 ? (
                        <div className="flex items-center justify-center py-12 text-sm text-gray-400">Aucun utilisateur trouvé</div>
                      ) : (
                        <table className="w-full border-collapse">
                          <thead><tr>
                            {["Utilisateur", "Rôle", "Transferts", "Volume total", "Statut"].map((h) => (
                              <th key={h} className="px-3.5 py-2 text-left text-[10px] font-semibold tracking-wider uppercase text-gray-400 bg-gray-50 border-b border-gray-200">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {adminUsers.map((u) => (
                              <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                                <td className="px-3.5 py-3 text-[13px]">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                                      {(u.display_name || u.email || "?").charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                      <div className="font-medium">{u.display_name || "\u2014"}</div>
                                      <div className="text-[11px] text-gray-400">{u.email}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3.5 py-3">
                                  <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold",
                                    u.role_id === "superadmin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700")}>
                                    {u.role_id === "superadmin" ? "Super Admin" : "Admin"}
                                  </span>
                                </td>
                                <td className="px-3.5 py-3 text-[13px] font-medium">{u.transfer_count}</td>
                                <td className="px-3.5 py-3 text-[13px]">{formatSize(u.total_size)}</td>
                                <td className="px-3.5 py-3">
                                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
                                    u.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500")}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />{u.status === "active" ? "Actif" : "Inactif"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )}

                {/* ═══════ TAB: STATISTIQUES ═══════ */}
                {adminTab === "stats" && (
                  <>
                    <div className="mb-5">
                      <h2 className="font-['Poppins'] font-normal text-2xl">Statistiques</h2>
                      <p className="text-[13px] text-gray-400 mt-0.5">Activité des 30 derniers jours</p>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
                      {[
                        { label: "Total transferts", value: adminStats ? String(adminStats.total_transfers) : "\u2014" },
                        { label: "Total téléchargements", value: adminStats ? String(adminStats.total_downloads) : "\u2014" },
                        { label: "Volume total", value: adminStats ? formatSize(adminStats.all_total_size ?? 0) : "\u2014" },
                        { label: "Utilisateurs actifs", value: String(adminUsers.length) },
                      ].map((stat) => (
                        <div key={stat.label} className="bg-white rounded-xl p-4 border border-gray-200">
                          <div className="text-[11px] text-gray-400 font-medium mb-1.5">{stat.label}</div>
                          <div className="text-[22px] font-semibold">{stat.value}</div>
                        </div>
                      ))}
                    </div>
                    {/* Daily chart (bar chart via CSS) */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
                      <h3 className="text-[13px] font-semibold mb-4">Transferts par jour</h3>
                      {adminDaily.length === 0 ? (
                        <div className="text-sm text-gray-400 text-center py-8">Aucune donnée sur les 30 derniers jours</div>
                      ) : (
                        <div className="flex items-end gap-1 h-[140px]">
                          {(() => {
                            const maxCount = Math.max(...adminDaily.map((d: any) => d.count), 1);
                            return adminDaily.map((d: any) => (
                              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.date}: ${d.count} transfert${d.count > 1 ? "s" : ""} (${formatSize(d.size)})`}>
                                <span className="text-[10px] text-gray-500 font-medium">{d.count}</span>
                                <div className="w-full bg-primary/80 rounded-t-sm transition-all hover:bg-primary" style={{ height: `${Math.max((d.count / maxCount) * 100, 4)}%` }} />
                                <span className="text-[9px] text-gray-400 truncate w-full text-center">{d.date.substring(5)}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                    {/* Recent activity */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-200">
                        <span className="text-[13px] font-semibold">Activité récente</span>
                      </div>
                      {adminActivity.length === 0 ? (
                        <div className="text-sm text-gray-400 text-center py-8">Aucune activité récente</div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {adminActivity.slice(0, 15).map((a: any, i: number) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                                a.type === "transfer" ? "bg-primary/10 text-primary" : "bg-emerald-100 text-emerald-600")}>
                                {a.type === "transfer" ? <Upload className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px]">
                                  {a.type === "transfer" ? (
                                    <><span className="font-medium">{a.actor || "Admin"}</span> a créé le transfert <span className="font-mono text-[12px]">{a.code}</span></>
                                  ) : (
                                    <>Téléchargement de <span className="font-mono text-[12px]">{a.code}</span>{a.ip ? <span className="text-gray-400"> ({a.ip})</span> : null}</>
                                  )}
                                </div>
                              </div>
                              <div className="text-[11px] text-gray-400 shrink-0">{formatDate(a.date)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ═══════ TAB: STOCKAGE ═══════ */}
                {adminTab === "storage" && (
                  <>
                    <div className="mb-5">
                      <h2 className="font-['Poppins'] font-normal text-2xl">Stockage</h2>
                      <p className="text-[13px] text-gray-400 mt-0.5">Utilisation de l'espace de stockage</p>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 mb-5">
                      {[
                        { label: "Stockage actif", value: adminStats ? formatSize(adminStats.total_size ?? 0) : "\u2014", sub: "Fichiers actifs uniquement" },
                        { label: "Volume total historique", value: adminStats ? formatSize(adminStats.all_total_size ?? 0) : "\u2014", sub: "Tous les transferts (actifs + expirés)" },
                        { label: "Nombre de fichiers", value: adminFileTypes.reduce((s: number, f: any) => s + f.count, 0).toString(), sub: `${adminFileTypes.length} type${adminFileTypes.length > 1 ? "s" : ""} de fichiers` },
                      ].map((stat) => (
                        <div key={stat.label} className="bg-white rounded-xl p-5 border border-gray-200">
                          <div className="text-[11px] text-gray-400 font-medium mb-1.5">{stat.label}</div>
                          <div className="text-[26px] font-semibold mb-1">{stat.value}</div>
                          <div className="text-[11px] text-gray-400">{stat.sub}</div>
                        </div>
                      ))}
                    </div>
                    {/* File types breakdown */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-200">
                        <span className="text-[13px] font-semibold">Répartition par type de fichier</span>
                      </div>
                      {adminFileTypes.length === 0 ? (
                        <div className="text-sm text-gray-400 text-center py-8">Aucun fichier</div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {adminFileTypes.map((ft: any) => {
                            const totalFtSize = adminFileTypes.reduce((s: number, f: any) => s + f.size, 0) || 1;
                            const pct = Math.round((ft.size / totalFtSize) * 100);
                            return (
                              <div key={ft.type} className="flex items-center gap-3 px-4 py-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between mb-1">
                                    <span className="text-[13px] font-medium">{ft.type}</span>
                                    <span className="text-[12px] text-gray-500">{ft.count} fichier{ft.count > 1 ? "s" : ""} · {formatSize(ft.size)}</span>
                                  </div>
                                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                                <span className="text-[13px] font-semibold text-primary w-10 text-right">{pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ═══════ TAB: SÉCURITÉ ═══════ */}
                {adminTab === "security" && (
                  <>
                    <div className="mb-5">
                      <h2 className="font-['Poppins'] font-normal text-2xl">Sécurité</h2>
                      <p className="text-[13px] text-gray-400 mt-0.5">Journal d'accès et téléchargements</p>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
                      {[
                        { label: "Transferts actifs", value: adminStats ? String(adminStats.active_transfers) : "\u2014" },
                        { label: "Transferts révoqués", value: adminStats ? String(adminStats.revoked_transfers) : "\u2014" },
                        { label: "Transferts expirés", value: adminStats ? String(adminStats.expired_transfers) : "\u2014" },
                        { label: "Téléchargements", value: adminStats ? String(adminStats.total_downloads) : "\u2014" },
                      ].map((stat) => (
                        <div key={stat.label} className="bg-white rounded-xl p-4 border border-gray-200">
                          <div className="text-[11px] text-gray-400 font-medium mb-1.5">{stat.label}</div>
                          <div className="text-[22px] font-semibold">{stat.value}</div>
                        </div>
                      ))}
                    </div>
                    {/* Download log */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-200">
                        <span className="text-[13px] font-semibold">Derniers téléchargements</span>
                      </div>
                      {adminActivity.filter((a: any) => a.type === "download").length === 0 ? (
                        <div className="text-sm text-gray-400 text-center py-8">Aucun téléchargement enregistré</div>
                      ) : (
                        <table className="w-full border-collapse">
                          <thead><tr>
                            {["Transfert", "Destinataire", "IP", "Date"].map((h) => (
                              <th key={h} className="px-3.5 py-2 text-left text-[10px] font-semibold tracking-wider uppercase text-gray-400 bg-gray-50 border-b border-gray-200">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {adminActivity.filter((a: any) => a.type === "download").map((dl: any, i: number) => (
                              <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                                <td className="px-3.5 py-2.5 text-[13px] font-mono">{dl.code}</td>
                                <td className="px-3.5 py-2.5 text-[13px]">{dl.recipient || "\u2014"}</td>
                                <td className="px-3.5 py-2.5 text-[13px] font-mono text-gray-500">{dl.ip || "\u2014"}</td>
                                <td className="px-3.5 py-2.5 text-[13px]">{formatDate(dl.date)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    {/* Security info */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5 mt-5">
                      <h3 className="text-[13px] font-semibold mb-3">Politique de sécurité</h3>
                      <div className="space-y-2.5 text-[13px] text-gray-600">
                        <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-500 shrink-0" /> Tous les transferts sont protégés par mot de passe (bcrypt)</div>
                        <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-500 shrink-0" /> Les fichiers expirent automatiquement (max 48h)</div>
                        <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-500 shrink-0" /> URLs de téléchargement signées avec expiration de 5 minutes</div>
                        <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-500 shrink-0" /> Chiffrement TLS en transit, stockage Supabase sécurisé</div>
                        <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-500 shrink-0" /> Journal des téléchargements avec IP tracée</div>
                      </div>
                    </div>
                  </>
                )}

              </main>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

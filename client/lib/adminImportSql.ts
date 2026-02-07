import { loadAdminSessionToken } from "./adminApi";

const API_BASE = "/api/admin/import-sql";

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const sessionToken = loadAdminSessionToken();

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { "x-admin-session": sessionToken } : {}),
      ...options.headers,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

// ─── Types ──────────────────────────────────────────────────────────────

export type SqlTableInfo = {
  table: string;
  columns: string[];
  rowCount: number;
  sampleRow: Record<string, string | null> | null;
};

export type SqlParseResult = {
  tables: SqlTableInfo[];
  totalRows: number;
  rows: Record<string, string | null>[];
};

export type SqlPreviewItem = {
  index: number;
  name: string | null;
  city: string | null;
  completeness: number;
  filledFields: number;
  totalFields: number;
  rawData: Record<string, string | null>;
};

export type SqlDuplicateGroup = {
  name: string;
  city: string;
  sqlRows: SqlPreviewItem[];
  existingRows: Array<{
    id: string;
    name: string | null;
    city: string | null;
    status: string | null;
    created_at: string | null;
    completeness: number;
    filledFields: number;
    totalFields: number;
  }>;
};

export type SqlPreviewResult = {
  groups: SqlDuplicateGroup[];
  newOnly: SqlPreviewItem[];
  stats: {
    total: number;
    duplicates: number;
    new: number;
  };
};

export type SqlExecuteResult = {
  ok: boolean;
  importedCount: number;
  deletedCount: number;
  errorCount: number;
  errors: string[];
};

// ─── API functions ──────────────────────────────────────────────────────

export async function parseSqlFile(content: string): Promise<SqlParseResult> {
  return fetchApi<SqlParseResult>("/parse", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export async function previewSqlImport(
  rows: Record<string, string | null>[],
): Promise<SqlPreviewResult> {
  return fetchApi<SqlPreviewResult>("/preview", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
}

export async function executeSqlImport(
  imports: Record<string, string | null>[],
  deleteIds: string[],
): Promise<SqlExecuteResult> {
  return fetchApi<SqlExecuteResult>("/execute", {
    method: "POST",
    body: JSON.stringify({ imports, deleteIds }),
  });
}

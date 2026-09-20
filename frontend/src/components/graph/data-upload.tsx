"use client";

import { useRef, useState } from "react";
import { FolderOpen, Loader2, Upload, X } from "lucide-react";
import {
  ApiError,
  uploadData,
  validateUpload,
  type UploadFileInput,
  type UploadReport,
} from "@/lib/api";

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = ".csv,.parquet,.jsonl,.json,.eml,.zip";

type State =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "ready"; files: UploadFileInput[]; report: UploadReport }
  | { status: "uploading"; files: UploadFileInput[]; report: UploadReport }
  | { status: "done"; added: Record<string, number> }
  | { status: "error"; message: string; report?: UploadReport };

/** Recursively collect files from a dropped item, preserving relative paths. */
async function collectEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: UploadFileInput[],
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ file, path: prefix + file.name });
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns batches; loop until it comes back empty
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch)
        await collectEntry(child, `${prefix}${entry.name}/`, out);
    }
  }
}

async function collectDrop(dt: DataTransfer): Promise<UploadFileInput[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => e !== null);
  if (entries.length === 0) {
    return Array.from(dt.files).map((file) => ({
      file,
      path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    }));
  }
  const out: UploadFileInput[] = [];
  for (const entry of entries) await collectEntry(entry, "", out);
  return out;
}

function summaryLine(report: UploadReport): string {
  const parts = [`${report.files.length} files`];
  const labels: Record<string, string> = {
    bank: "bank rows",
    gl: "GL rows",
    invoices: "invoices",
    emails: "emails",
  };
  for (const [kind, label] of Object.entries(labels)) {
    const n = report.counts[kind];
    if (n) parts.push(`${n} ${label}`);
  }
  return parts.join(" · ");
}

function addedLine(added: Record<string, number>): string {
  const labels: Record<string, string> = {
    bank: "bank",
    gl: "GL",
    invoices: "invoices",
    emails: "emails",
  };
  const parts = Object.entries(labels)
    .filter(([k]) => added[k])
    .map(([k, label]) => `${added[k]} ${label}`);
  return `Added ${parts.join(", ") || "0 rows"} · graph re-seeded`;
}

const KIND_LABEL: Record<string, string> = {
  bank: "bank",
  gl: "gl",
  invoices: "invoices",
  emails: "emails",
  ignored: "ignored",
};

function ReportTable({ report }: { report: UploadReport }) {
  return (
    <div className="mt-2 max-h-48 overflow-auto border border-rule">
      <table className="w-full text-xs">
        <tbody>
          {report.files.map((f, i) => (
            <tr key={`${i}-${f.name}`} className="border-b border-rule-soft last:border-0">
              <td className="max-w-0 truncate px-2 py-1 font-mono text-2xs text-ink" title={f.name}>
                {f.name}
              </td>
              <td className="w-20 px-2 py-1">
                <span
                  className={`rounded-chip border px-1.5 py-0.5 font-mono text-2xs ${
                    f.kind === null
                      ? "border-rust text-rust"
                      : f.kind === "ignored"
                        ? "border-rule text-ink-soft"
                        : "border-rule text-ink"
                  }`}
                >
                  {f.kind === null ? "incompatible" : KIND_LABEL[f.kind]}
                </span>
              </td>
              <td className="w-12 px-2 py-1 text-right font-mono text-2xs text-ink-soft">
                {f.rows || ""}
              </td>
              <td className="px-2 py-1 text-2xs text-rust">{f.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Drop a zip, a folder, or loose files: validate against the finance schemas,
 * then upsert into the data lake and re-seed the memory graph. */
export function DataUpload({ onUploaded }: { onUploaded: () => void }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);

  async function handleFiles(files: UploadFileInput[]) {
    if (files.length === 0) return;
    if (files.reduce((n, f) => n + f.file.size, 0) > MAX_BYTES) {
      setState({ status: "error", message: "Selection exceeds the 50 MB upload limit." });
      return;
    }
    setState({ status: "validating" });
    try {
      const report = await validateUpload(files);
      setState({ status: "ready", files, report });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "validation failed",
      });
    }
  }

  async function handleUpload(files: UploadFileInput[]) {
    setState((s) =>
      s.status === "ready" ? { status: "uploading", files, report: s.report } : s,
    );
    try {
      const result = await uploadData(files);
      setState({ status: "done", added: result.added });
      onUploaded();
    } catch (err) {
      const report =
        err instanceof ApiError
          ? (err.body as { report?: UploadReport } | undefined)?.report
          : undefined;
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "upload failed",
        report,
      });
    }
  }

  function pickFromInput(input: HTMLInputElement | null) {
    if (!input?.files) return;
    const files = Array.from(input.files).map((file) => ({
      file,
      path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    }));
    input.value = "";
    void handleFiles(files);
  }

  const report =
    state.status === "ready" || state.status === "uploading"
      ? state.report
      : state.status === "error"
        ? state.report
        : undefined;
  const busy = state.status === "validating" || state.status === "uploading";

  return (
    <div className="flex h-full flex-col border border-rule bg-paper-raised px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-soft">
          Upload data
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-chip border border-rule px-2.5 py-1 text-xs text-ink transition-colors hover:border-ink-soft hover:bg-paper disabled:opacity-50"
          >
            <Upload size={12} aria-hidden /> Choose files
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => dirInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-chip border border-rule px-2.5 py-1 text-xs text-ink transition-colors hover:border-ink-soft hover:bg-paper disabled:opacity-50"
          >
            <FolderOpen size={12} aria-hidden /> Choose folder
          </button>
          {state.status !== "idle" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setState({ status: "idle" })}
              className="inline-flex items-center gap-1 rounded-chip border border-rule px-2 py-1 text-xs text-ink-soft transition-colors hover:border-ink-soft hover:bg-paper disabled:opacity-50"
            >
              <X size={12} aria-hidden /> Clear
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={() => pickFromInput(fileInput.current)}
      />
      <input
        ref={(el) => {
          dirInput.current = el;
          el?.setAttribute("webkitdirectory", "");
        }}
        type="file"
        multiple
        className="hidden"
        onChange={() => pickFromInput(dirInput.current)}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void collectDrop(e.dataTransfer).then(handleFiles);
        }}
        className={`mt-2 border border-dashed px-3 py-3 text-center text-2xs transition-colors ${
          dragOver ? "border-ink-soft bg-paper text-ink" : "border-rule text-ink-soft"
        }`}
      >
        {state.status === "validating"
          ? "Validating…"
          : "Drop a zip, folder, or files here"}
      </div>

      {state.status === "error" && !report && (
        <div className="mt-2 border-l-2 border-rust py-0.5 pl-3 text-xs text-rust">
          {state.message}
        </div>
      )}

      {report && (
        <>
          <ReportTable report={report} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-xs text-ink-soft">{summaryLine(report)}</span>
            {(state.status === "ready" || state.status === "uploading") && (
              <button
                type="button"
                disabled={!report.ok || state.status === "uploading"}
                onClick={() =>
                  state.status === "ready" && handleUpload(state.files)
                }
                className="ml-auto inline-flex items-center gap-1.5 rounded-chip border border-rule bg-paper px-2.5 py-1 text-xs text-ink transition-colors hover:border-ink-soft disabled:opacity-50"
              >
                {state.status === "uploading" && (
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                )}
                Upload {report.files.filter((f) => f.kind !== "ignored").length} files
              </button>
            )}
          </div>
          {!report.ok && (
            <div className="mt-2 border-l-2 border-rust py-0.5 pl-3 text-xs text-rust">
              Incompatible files can&apos;t be uploaded — remove them and try again.
            </div>
          )}
          {state.status === "error" && (
            <div className="mt-2 border-l-2 border-rust py-0.5 pl-3 text-xs text-rust">
              {state.message}
            </div>
          )}
        </>
      )}

      {state.status === "done" && (
        <div className="mt-2 border-l-2 border-green py-0.5 pl-3 text-xs text-ink-soft" role="status">
          {addedLine(state.added)}
        </div>
      )}
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { historyPage } from "../lib/history-api";
import {
  historyBounds,
  historyCsv,
  type HistoryColumn,
  type HistoryCursor,
  type HistoryKind,
  type HistoryRange,
  type HistoryRow,
} from "../lib/history";
import { Button } from "./ui/button";

export function HistoryRegister({
  title,
  kind,
  organizationId,
  branchId,
  branchName,
  online,
  disabled,
  revision,
  columns,
  children,
  emptyTitle = "No matching records",
}: {
  title: string;
  kind: HistoryKind;
  organizationId: string;
  branchId: string;
  branchName: string;
  online: boolean;
  disabled: boolean;
  revision: number;
  columns: HistoryColumn[];
  children: (rows: HistoryRow[]) => ReactNode;
  emptyTitle?: string;
}) {
  const heading = useId();
  const [range, setRange] = useState<HistoryRange>({ from: "", to: "" });
  const [draft, setDraft] = useState(range);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [next, setNext] = useState<HistoryCursor>();
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [dateError, setDateError] = useState("");
  const [retry, setRetry] = useState(0);
  const lifecycle = useRef({ request: 0, active: false }).current;
  const load = useCallback(
    async (before?: HistoryCursor) => {
      if (!online) {
        setLoading(false);
        return;
      }
      const token = ++lifecycle.request;
      lifecycle.active = true;
      setLoading(true);
      setError("");
      if (!before) {
        setRows([]);
        setNext(undefined);
        setLoaded(false);
      }
      try {
        const page = await historyPage({
          kind,
          organizationId,
          branchId,
          range,
          before,
        });
        if (token !== lifecycle.request) return;
        setRows((current) =>
          before
            ? [
                ...current,
                ...page.rows.filter(
                  (row) =>
                    !current.some((r) => String(r.id) === String(row.id)),
                ),
              ]
            : page.rows,
        );
        setNext(page.next);
        setLoaded(true);
      } catch (e) {
        if (token === lifecycle.request)
          setError(
            e instanceof Error
              ? e.message
              : "History could not load. Try again.",
          );
      } finally {
        if (token === lifecycle.request) {
          lifecycle.active = false;
          setLoading(false);
        }
      }
    },
    [online, kind, organizationId, branchId, range, lifecycle],
  );
  useEffect(() => {
    void load();
    return () => {
      lifecycle.request++;
      lifecycle.active = false;
    };
  }, [load, revision, retry, lifecycle]);
  return (
    <section
      className="panel history-register"
      aria-labelledby={heading}
      aria-busy={loading}
    >
      <h2 id={heading}>{title}</h2>
      <p className="muted">
        {branchName}
        {kind === "audit" ? " and business-level events" : ""} · Dates in
        Asia/Manila ·{" "}
        {kind === "transfers" ? "Dispatch dates" : "Recorded dates"}
      </p>
      <form
        className="history-filters"
        aria-label={`${title} date filters`}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            historyBounds(draft);
            setDateError("");
            setRows([]);
            setNext(undefined);
            setLoaded(false);
            setLoading(true);
            setRange({ ...draft });
          } catch (e) {
            setDateError(e instanceof Error ? e.message : "Check your dates.");
          }
        }}
      >
        <label className="field">
          <span>From date</span>
          <input
            type="date"
            value={draft.from}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            disabled={disabled || !online || loading}
          />
        </label>
        <label className="field">
          <span>Through date</span>
          <input
            type="date"
            value={draft.to}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            disabled={disabled || !online || loading}
          />
        </label>
        <Button
          type="submit"
          size="sm"
          disabled={disabled || !online || loading}
        >
          Apply dates
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || !online || loading}
          onClick={() => {
            setDraft({ from: "", to: "" });
            setDateError("");
            setRows([]);
            setNext(undefined);
            setLoaded(false);
            setLoading(true);
            setRange({ from: "", to: "" });
          }}
        >
          Clear dates
        </Button>
      </form>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {dateError && (
        <p role="alert" className="notice error">
          {dateError}
        </p>
      )}
      {!online && (
        <p role="status" className="notice">
          Reconnect to refresh or load older history. Previously loaded rows
          remain available.
        </p>
      )}
      {rows.length ? (
        children(rows)
      ) : !loading && loaded ? (
        <div className="history-empty">
          <h3>
            {range.from || range.to
              ? "No records match these dates."
              : emptyTitle}
          </h3>
          <p className="muted">
            Try another date range or clear dates to see this branch’s full
            history.
          </p>
        </div>
      ) : null}
      <div className="history-footer">
        <p role="status" className="muted">
          {loading
            ? "Loading history…"
            : loaded
              ? `${rows.length} loaded · ${range.from || "Beginning"} through ${range.to || "latest"} · ${next ? "Older records available." : "End of matching history."}`
              : "History has not loaded."}
        </p>
        <div className="history-actions">
          {next && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || !online || loading}
              onClick={() => {
                if (!lifecycle.active) void load(next);
              }}
            >
              Load older records
            </Button>
          )}
          {error && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || !online || loading}
              onClick={() => {
                if (next) void load(next);
                else setRetry((n) => n + 1);
              }}
            >
              Retry history
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || loading || !rows.length}
            onClick={() => {
              const csv = historyCsv(
                [
                  { label: "Branch scope", value: () => branchName },
                  ...columns,
                ],
                rows,
              );
              const url = URL.createObjectURL(
                new Blob([csv], { type: "text/csv;charset=utf-8" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = `agristore-${kind}-${branchId}-${range.from || "start"}-${range.to || "latest"}.csv`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export loaded rows (CSV)
          </Button>
        </div>
      </div>
      <small className="muted">
        CSV includes only the rows loaded here. Load older records before
        exporting more.
      </small>
    </section>
  );
}

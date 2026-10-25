"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./ui/button";

export function ApprovalForm({
  action,
  label,
  description,
  confirmLabel,
  disabled,
  onConfirm,
  children,
}: {
  action: string;
  label: string;
  description: string;
  confirmLabel: string;
  disabled: boolean;
  onConfirm: (reason: string, fields: FormData) => Promise<Error | undefined>;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const errorId = useId();
  const actionButton = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const reasonInput = useRef<HTMLInputElement>(null);
  const previouslyOpen = useRef(false);
  useEffect(() => {
    if (open) {
      form.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
      reasonInput.current?.focus({ preventScroll: true });
    }
    else if (previouslyOpen.current) actionButton.current?.focus();
    previouslyOpen.current = open;
  }, [open]);
  if (!open)
    return (
      <Button
        ref={actionButton}
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {action}
      </Button>
    );
  return (
    <form
      ref={form}
      className="approval-form"
      aria-label={action}
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending || disabled) return;
        if (reason.trim().length < 3) {
          setError("Enter a reason with at least 3 characters.");
          return;
        }
        setPending(true);
        setError("");
        try {
          const failure = await onConfirm(reason.trim(), new FormData(e.currentTarget));
          if (failure) setError(failure.message);
          else {
            setOpen(false);
            setReason("");
          }
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Could not confirm this action. Your reason has been kept.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <p>{description}</p>
      {children && <fieldset disabled={pending || disabled} className="approval-fields">{children}</fieldset>}
      <label className="field">
        <span>{label}</span>
        <input
          ref={reasonInput}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={3}
          maxLength={1000}
          disabled={pending}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      <div className="approval-actions">
        <Button type="submit" size="sm" disabled={disabled || pending}>
          {pending ? "Confirming…" : confirmLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError("");
          }}
        >
          Cancel
        </Button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="notice error">
          {error}
        </p>
      )}
    </form>
  );
}

"use client";

import { useEffect, useId, useRef } from "react";
import { Minus, Plus, X } from "lucide-react";
import Decimal from "decimal.js";
import {
  makeItem,
  money,
  type Product,
  type SaleItem,
} from "@agristore/domain";
import { draftLineTotal, useCart } from "../lib/cart";
import {
  enteredQuantity,
  estimateBudget,
  kiloUnit,
  pesoBudget,
  quantityFromDisplay,
} from "../lib/quantity-entry";
import { Button } from "./ui/button";

const confirmation = "Confirm the actual scale weight before checkout.";

export function SaleLineEditor({
  item,
  product,
  index,
  lineId,
  disabled,
}: {
  item: SaleItem;
  product: Product;
  index: number;
  lineId: string;
  disabled: boolean;
}) {
  const cart = useCart();
  const { draft, display, budgetMode, budget, budgetError, original, focus } =
    cart.drafts[lineId];
  const setDraft = (draft: string) => cart.edit(lineId, { draft });
  const setDisplay = (display: "kg" | "g") => cart.edit(lineId, { display });
  const setBudgetMode = (budgetMode: boolean) =>
    cart.edit(lineId, { budgetMode });
  const setBudget = (budget: string) => cart.edit(lineId, { budget });
  const setBudgetError = (budgetError: string) =>
    cart.edit(lineId, { budgetError });
  const field = useRef<HTMLInputElement>(null);
  const budgetField = useRef<HTMLInputElement>(null);
  const edit = cart.edit;
  useEffect(() => {
    if (!focus || disabled) return;
    (focus === "budget" ? budgetField : field).current?.focus();
    edit(lineId, { focus: null });
  }, [focus, disabled, edit, lineId]);
  const errorId = useId();
  const kilo = kiloUnit(product);
  const loose = !!kilo && item.unitId === kilo.id;
  const grams = loose && display === "g";
  const quantityLabel = `Quantity (${loose ? (grams ? "g" : "kg") : item.unitName})`;
  const error = cart.quantityErrors[lineId];
  const displayedAmount = draftLineTotal(item, { draft, display });
  const increment = loose ? (grams ? "250" : "0.25") : "1";

  function report(error: unknown) {
    cart.quantityError(
      lineId,
      error instanceof Error && !("issues" in error)
        ? error.message
        : "Check the quantity and selling unit before checkout.",
    );
  }
  function write(
    raw: string,
    unitId = item.unitId,
    batchId = item.batchId,
    inGrams = grams,
    needsConfirmation = budgetMode,
  ) {
    setDraft(raw);
    try {
      const quantity = quantityFromDisplay(raw, inGrams);
      cart.replace(index, makeItem(product, unitId, quantity, batchId));
      cart.quantityError(lineId, needsConfirmation ? confirmation : undefined);
      return true;
    } catch (error) {
      report(error);
      return false;
    }
  }
  function shortcut(quantity: string) {
    setDisplay("kg");
    write(quantity, kilo!.id, item.batchId, false);
  }
  function step(direction: 1 | -1) {
    try {
      const next = new Decimal(enteredQuantity(draft)).plus(
        new Decimal(increment).mul(direction),
      );
      if (next.gt(0)) write(next.toFixed());
    } catch (error) {
      report(error);
    }
  }
  let canDecrease = false;
  let overBudget = false;
  try {
    canDecrease = new Decimal(enteredQuantity(draft)).gt(increment);
  } catch {}
  try {
    overBudget = displayedAmount !== null && displayedAmount > pesoBudget(budget);
  } catch {}

  return (
    <div className="receipt-item">
      <div className="receipt-item-top">
        <strong>{item.name}</strong>
        <button
          disabled={disabled}
          aria-label={`Remove ${item.name}`}
          onClick={() => cart.remove(index)}
        >
          <X size={15} />
        </button>
      </div>
      <div className="receipt-item-config">
        <select
          aria-label={`Unit for ${item.name}`}
          value={item.unitId}
          disabled={disabled || budgetMode}
          onChange={(event) => {
            setDisplay("kg");
            write("1", event.target.value, item.batchId, false, false);
          }}
        >
          {product.units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
        {product.batches.length > 0 && (
          <select
            aria-label={`Batch for ${item.name}`}
            value={item.batchId ?? ""}
            disabled={disabled}
            onChange={(event) =>
              write(draft, item.unitId, event.target.value || null)
            }
          >
            {product.batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.lot} {batch.expiresOn ?? ""}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="line-rate">
        {money(item.unitPrice)} / {item.unitName}
        {loose ? " · loose weight" : ""}
      </p>
      <div className="receipt-item-bottom">
        <div className="quantity-entry">
          <label htmlFor={errorId + "-quantity"}>
            {quantityLabel}
          </label>
          <div className="quantity-entry-controls">
            <div className="quantity-control">
              <button
                disabled={disabled || !canDecrease}
                aria-label={`Decrease ${item.name}`}
                onClick={() => step(-1)}
              >
                <Minus size={13} />
              </button>
              <input
                ref={field}
                id={errorId + "-quantity"}
                aria-label={`${quantityLabel} for ${item.name}`}
                value={draft}
                inputMode="decimal"
                autoComplete="off"
                disabled={disabled}
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => write(event.target.value)}
                onBlur={() => {
                  try {
                    write(enteredQuantity(draft));
                  } catch (error) {
                    report(error);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    field.current?.blur();
                  }
                }}
              />
              <button
                disabled={disabled}
                aria-label={`Increase ${item.name}`}
                onClick={() => step(1)}
              >
                <Plus size={13} />
              </button>
            </div>
            {loose && (
              <select
                aria-label={`Weight entry for ${item.name}`}
                value={display}
                disabled={disabled}
                onChange={(event) => {
                  try {
                    const kg = quantityFromDisplay(draft, grams);
                    const inGrams = event.target.value === "g";
                    setDisplay(inGrams ? "g" : "kg");
                    write(
                      new Decimal(kg).mul(inGrams ? 1000 : 1).toFixed(),
                      item.unitId,
                      item.batchId,
                      inGrams,
                    );
                  } catch (error) {
                    report(error);
                  }
                }}
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
              </select>
            )}
          </div>
        </div>
        <strong>
          {displayedAmount === null
            ? loose ? "Enter weight" : "Enter quantity"
            : money(displayedAmount)}
        </strong>
      </div>
      {error && (
        <p className="quantity-error" id={errorId} role="alert">
          {error}
        </p>
      )}
      {loose && displayedAmount !== null && (
        <p className="line-measure">
          {item.quantity} kg = {new Decimal(item.quantity).mul(1000).toFixed()}{" "}
          g{budgetMode ? " · weight not confirmed" : ""}
        </p>
      )}
      {kilo && !budgetMode && (
        <div
          className="weight-shortcuts"
          role="group"
          aria-label={`Quick weight for ${item.name}`}
        >
          {[
            ["0.25", "¼ kg"],
            ["0.5", "½ kg"],
            ["0.75", "¾ kg"],
            ["1", "1 kg"],
          ].map(([quantity, label]) => (
            <button
              key={quantity}
              disabled={disabled}
              onClick={() => shortcut(quantity)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {kilo && !budgetMode && (
        <div
          className="line-selling-methods"
          role="group"
          aria-label={`Selling method for ${item.name}`}
        >
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            aria-pressed={loose}
            onClick={() => {
              if (loose) {
                field.current?.focus();
                return;
              }
              setDisplay("kg");
              write("", kilo.id, item.batchId, false, false);
              cart.edit(lineId, { focus: "quantity" });
            }}
          >
            By weight
          </button>
          <button
            className="text-button peso-entry-toggle"
            disabled={disabled}
            onClick={() => {
              cart.edit(lineId, { original: item, focus: "budget" });
              setBudgetMode(true);
              setDisplay("kg");
              write("1", kilo.id, item.batchId, false, true);
              setDraft("");
              cart.quantityError(
                lineId,
                "Enter the weighed quantity or cancel peso entry before checkout.",
              );
            }}
          >
            {budget ? "Change peso amount" : "By peso amount"}
          </button>
        </div>
      )}
      {budgetMode && (
        <div className="peso-entry">
          <label htmlFor={errorId + "-budget"}>Customer budget (₱)</label>
          <div className="peso-entry-controls">
            <input
              ref={budgetField}
              id={errorId + "-budget"}
              aria-label={`Customer budget (₱) for ${item.name}`}
              inputMode="decimal"
              aria-invalid={!!budgetError}
              aria-describedby={
                budgetError ? errorId + "-budget-error" : undefined
              }
              value={budget}
              disabled={disabled}
              onChange={(event) => {
                setBudget(event.target.value);
                setBudgetError("");
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                try {
                  const estimate = estimateBudget(budget, kilo!.price);
                  setDisplay("kg");
                  write(estimate.quantity, kilo!.id, item.batchId, false, true);
                  setBudgetError("");
                  field.current?.focus();
                } catch (error) {
                  setBudgetError(
                    error instanceof Error && !("issues" in error)
                      ? error.message
                      : "Check the budget and kilo price.",
                  );
                }
              }}
            >
              Estimate weight
            </Button>
          </div>
          {budgetError && (
            <p
              id={errorId + "-budget-error"}
              className="quantity-error"
              role="alert"
            >
              {budgetError}
            </p>
          )}
          <p>
            Estimate uses {money(kilo!.price)} / kg, rounded down to whole
            grams. Weigh the product and enter the actual scale weight above.
            The recorded weight sets the final price.
          </p>
          {overBudget && (
            <p className="quantity-error">
              The weighed amount costs {money(item.lineTotal)}, above the ₱
              {budget} budget. Reduce the weight or agree the final amount with
              the customer.
            </p>
          )}
          <div className="peso-entry-actions">
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => {
                try {
                  pesoBudget(budget);
                  if (write(draft, item.unitId, item.batchId, grams, false)) {
                    setBudgetMode(false);
                    setBudgetError("");
                  }
                } catch (error) {
                  setBudgetError(
                    error instanceof Error
                      ? error.message
                      : "Check the customer budget.",
                  );
                }
              }}
            >
              Confirm weighed amount
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Cancel peso entry"
              disabled={disabled}
              onClick={() => {
                if (!original) {
                  cart.remove(index);
                  return;
                }
                const previous = original;
                cart.replace(index, previous);
                setDraft(previous.quantity);
                setDisplay("kg");
                setBudgetMode(false);
                setBudget("");
                setBudgetError("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {budget && !budgetMode && (
        <p className="line-measure">
          Customer budget: ₱{budget}. Recorded amount: {money(item.lineTotal)}.
        </p>
      )}
    </div>
  );
}

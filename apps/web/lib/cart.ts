import { create } from "zustand";
import Decimal from "decimal.js";
import type { SaleItem } from "@agristore/domain";
import { quantityFromDisplay } from "./quantity-entry";
export interface LineDraft {
  draft: string;
  display: "kg" | "g" | "liter" | "ml";
  budgetMode: boolean;
  budget: string;
  budgetError: string;
  original: SaleItem | null;
  focus?: "quantity" | "budget" | null;
}
export type SaleEntry = "unit" | "weight" | "budget";

/** A cached valid item must not price a different or unfinished typed quantity.
 * Valid peso estimates still have an amount while awaiting weight confirmation. */
export function draftLineTotal(
  item: SaleItem,
  draft?: Pick<LineDraft, "draft" | "display">,
) {
  if (!draft) return null;
  try {
    const quantity = quantityFromDisplay(draft.draft, draft.display === "g" || draft.display === "ml");
    return new Decimal(quantity).eq(item.quantity) ? item.lineTotal : null;
  } catch {
    return null;
  }
}

interface Cart {
  items: SaleItem[];
  lineIds: string[];
  drafts: Record<string, LineDraft>;
  edit: (lineId: string, patch: Partial<LineDraft>) => void;
  quantityErrors: Record<string, string>;
  quantityError: (lineId: string, error?: string) => void;
  attemptId: string | null;
  add: (item: SaleItem, entry?: SaleEntry) => void;
  replace: (index: number, item: SaleItem) => void;
  remove: (index: number) => void;
  clear: () => void;
  attempt: () => string;
}
export const useCart = create<Cart>((set, get) => ({
  items: [],
  lineIds: [],
  drafts: {},
  edit: (lineId, patch) =>
    set((s) => ({
      drafts: { ...s.drafts, [lineId]: { ...s.drafts[lineId], ...patch } },
    })),
  quantityErrors: {},
  quantityError: (lineId, error) =>
    set((s) => {
      if (s.quantityErrors[lineId] === error) return s;
      const quantityErrors = { ...s.quantityErrors };
      if (error) quantityErrors[lineId] = error;
      else delete quantityErrors[lineId];
      return { quantityErrors };
    }),
  attemptId: null,
  add: (item, entry = "unit") =>
    set((s) => {
      const lineId = crypto.randomUUID();
      return {
        items: [...s.items, item],
        lineIds: [...s.lineIds, lineId],
        attemptId: null,
        quantityErrors:
          entry === "unit"
            ? s.quantityErrors
            : {
                ...s.quantityErrors,
                [lineId]:
                  entry === "weight"
                    ? "Enter the customer's weight in kg or grams."
                    : "Enter a peso budget and confirm the actual scale weight.",
              },
        drafts: {
          ...s.drafts,
          [lineId]: {
            draft: entry === "unit" ? item.quantity : "",
            display: "kg",
            budgetMode: entry === "budget",
            budget: "",
            budgetError: "",
            original: null,
            focus:
              entry === "weight"
                ? "quantity"
                : entry === "budget"
                  ? "budget"
                  : null,
          },
        },
      };
    }),
  replace: (index, item) =>
    set((s) => {
      const quantityErrors = { ...s.quantityErrors };
      delete quantityErrors[s.lineIds[index]];
      return {
        items: s.items.map((v, i) => (i === index ? item : v)),
        quantityErrors,
        attemptId: null,
      };
    }),
  remove: (index) =>
    set((s) => {
      const quantityErrors = { ...s.quantityErrors };
      delete quantityErrors[s.lineIds[index]];
      const drafts = { ...s.drafts };
      delete drafts[s.lineIds[index]];
      return {
        drafts,
        items: s.items.filter((_, i) => i !== index),
        lineIds: s.lineIds.filter((_, i) => i !== index),
        quantityErrors,
        attemptId: null,
      };
    }),
  clear: () =>
    set({
      items: [],
      lineIds: [],
      drafts: {},
      quantityErrors: {},
      attemptId: null,
    }),
  attempt: () => {
    const id = get().attemptId ?? crypto.randomUUID();
    set({ attemptId: id });
    return id;
  },
}));

"use client";

import { useId, useState, type ReactNode } from "react";
import Decimal from "decimal.js";
import { productSetup, type ProductSetup } from "../lib/product-setup";
import { Button } from "./ui/button";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ProductSetupForm({
  disabled,
  onSave,
}: {
  disabled: boolean;
  onSave: (product: ProductSetup) => Promise<Error | undefined>;
}) {
  const [mode, setMode] = useState("");
  const [base, setBase] = useState("kg");
  const [unit, setUnit] = useState("Sack");
  const [factor, setFactor] = useState("50");
  const [loose, setLoose] = useState(false);
  const [prices, setPrices] = useState({
    price: "",
    cost: "",
    basePrice: "",
    baseCost: "",
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const errorId = useId();
  const measurement =
    base === "kg" ? "kg" : base === "liter" ? "liter" : base === "meter" ? "meter" : "piece";
  const retail = base === "kg" ? "kilo" : base === "liter" ? "liter" : base === "meter" ? "meter" : "piece";
  let packed = false;
  try {
    packed = !new Decimal(factor).eq(1);
  } catch {}

  function choose(next: string) {
    setMode(next);
    setBase(next === "sealed" ? "piece" : next === "liquid" ? "liter" : next === "length" ? "meter" : "kg");
    setUnit(
      next === "sack"
        ? "Sack"
        : next === "weight"
          ? "Kilo"
          : next === "sealed"
            ? "Packet"
            : next === "liquid"
              ? "Liter"
              : next === "length" ? "Meter" : "",
    );
    setFactor(next === "sack" ? "50" : "1");
    setLoose(false);
    setPrices({ price: "", cost: "", basePrice: "", baseCost: "" });
    setError("");
  }
  function priceField(
    key: keyof typeof prices,
    label: string,
    positive = false,
  ) {
    return (
      <Field label={label}>
        <input
          name={key}
          type="number"
          min={positive ? "0.01" : "0"}
          step="0.01"
          required
          value={prices[key]}
          onChange={(e) => setPrices({ ...prices, [key]: e.target.value })}
        />
      </Field>
    );
  }
  return (
    <form
      className="product-setup"
      aria-label="Add a product"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        setSaved("");
        try {
          const product = productSetup(new FormData(form));
          setError("");
          const failure = await onSave(product);
          if (failure) throw failure;
          form.reset();
          choose(mode);
          setSaved(
            `${product.name} added with its configured selling units and prices.`,
          );
        } catch (failure) {
          const message =
            failure instanceof Error
              ? failure.message
              : "Check the selling units and prices.";
          setError(
            /duplicate key/i.test(message) && /sku/i.test(message)
              ? "This SKU already exists. Use a different SKU or update the existing product's price."
              : message,
          );
        }
      }}
    >
      <fieldset className="product-setup-fields form-grid" disabled={disabled}>
        <Field label="Product name">
          <input name="name" required />
        </Field>
        <Field label="SKU / barcode">
          <input name="sku" required />
        </Field>
        <Field label="Category">
          <select name="category">
            {[
              "Feeds",
              "Fertilizers",
              "Seeds",
              "Tools",
              "Soil care",
              "Animal care",
              "Other",
            ].map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </Field>
        <Field label="How customers buy this product">
          <select
            required
            value={mode}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">Choose a selling setup</option>
              <option value="sack">Sacks / bags</option>
            <option value="weight">Loose kilos only</option>
              <option value="sealed">Sealed items / pieces</option>
            <option value="liquid">Measured liters / milliliters</option>
            <option value="length">Rope / measured meters</option>
              <option value="custom">Other pack size</option>
          </select>
        </Field>
        {mode && (
          <>
            {mode === "custom" ? (
              <Field label="Stock measured in">
                <select
                  name="baseUnit"
                  value={base}
                  onChange={(e) => {
                    setBase(e.target.value);
                    setLoose(false);
                    setPrices({
                      price: "",
                      cost: "",
                      basePrice: "",
                      baseCost: "",
                    });
                  }}
                >
                  <option value="kg">Kilograms</option>
                  <option value="liter">Liters</option>
                  <option value="meter">Meters</option>
                  <option value="piece">Pieces</option>
                </select>
              </Field>
            ) : (
              <input type="hidden" name="baseUnit" value={base} />
            )}
            <Field label="Main selling unit name">
              <input
                name="unit"
                value={unit}
                required
                onChange={(e) => setUnit(e.target.value)}
              />
            </Field>
            {mode === "sack" || mode === "custom" ? (
              <Field
                label={`Number of ${measurement} in one ${unit || "selling unit"}`}
              >
                <input
                  name="factor"
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value={factor}
                  required
                  onChange={(e) => setFactor(e.target.value)}
                />
              </Field>
            ) : (
              <input type="hidden" name="factor" value="1" />
            )}
            {priceField(
              "price",
              `Price per ${unit || "selling unit"} (₱)`,
              true,
            )}
            {priceField("cost", `Cost per ${unit || "selling unit"} (₱)`)}
            {packed && (
              <label className="checkbox setup-wide">
                <input
                  type="checkbox"
                  name="loose"
                  checked={loose}
                  onChange={(e) => setLoose(e.target.checked)}
                />
                {base === "kg"
                  ? "Also sell loose kilos"
                  : base === "liter"
                    ? "Also sell measured liters"
                    : base === "meter" ? "Also sell cut lengths in meters" : "Also sell individual pieces"}
              </label>
            )}
            {packed && loose && (
              <>
                <p className="setup-wide setup-help">
                  Set a separate retail price. The POS will not divide the pack
                  price to calculate it.
                </p>
                {priceField("basePrice", `Price per ${retail} (₱)`, true)}
                {priceField("baseCost", `Cost per ${retail} (₱)`)}
              </>
            )}
            <p className="setup-wide setup-summary">
              Stock conversion: 1 {unit || "selling unit"} = {factor || "…"}{" "}
              {measurement}.
              {base === "piece" && !packed
                ? " Sell whole sealed items; fractions are not allowed."
                : packed && !loose
                  ? ` Only the configured ${unit || "pack"} price will be available.`
                  : base === "kg"
                    ? " Cashiers can enter kilos, grams or a peso budget."
                    : base === "liter" ? " For a one-liter selling unit, cashiers can switch between liters and milliliters. A 500 ml bottle is 0.5 liter; keep sealed bottles as pieces if they are never opened." : base === "meter" ? " Cashiers can enter cut lengths such as 0.5 or 1.25 meters. A roll needs its actual meter length and a separate cut-length price." : " Cashiers use the configured selling unit and quantity."}
            </p>
            <Field label={`Low-stock alert (${measurement})`}>
              <input
                name="minimum"
                type="number"
                min="0"
                step="0.000001"
                defaultValue="0"
              />
            </Field>
            <label className="checkbox">
              <input name="expiry" type="checkbox" />
              Track lots and expiration
            </label>
          </>
        )}
        {error && (
          <p className="quantity-error setup-wide" role="alert" id={errorId}>
            {error}
          </p>
        )}
        <Button className="setup-wide" disabled={!mode}>
          Add product
        </Button>
      </fieldset>
      {saved && (
        <p className="setup-feedback" role="status">
          {saved}
        </p>
      )}
    </form>
  );
}

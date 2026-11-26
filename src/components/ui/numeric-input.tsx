import { useState, type InputHTMLAttributes } from "react";
import { centsToInput, parseMoney, parsePercent, percentToInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Input } from "./input";

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Texto fijo a la izquierda (moneda) o derecha (%). */
  prefix?: string;
  suffix?: string;
};

type NumericInputProps = BaseProps & {
  parse: (text: string) => number | null;
  format: (value: number | null) => string;
};

/**
 * Input de texto libre que guarda un número parseado y se normaliza al salir del campo.
 * Si el valor cambia desde afuera (p. ej. al elegir un vehículo), se refleja.
 */
export function NumericInput({
  value,
  onChange,
  parse,
  format,
  prefix,
  suffix,
  onBlur,
  className,
  ...props
}: NumericInputProps) {
  const [text, setText] = useState(() => format(value));
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    if (value !== parse(text)) setText(format(value));
  }

  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-medium text-slate-400">
          {prefix}
        </span>
      )}
      <Input
        inputMode="decimal"
        className={cn("text-right", prefix && "pl-12", suffix && "pr-8", className)}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parse(e.target.value);
          setLastValue(parsed);
          onChange(parsed);
        }}
        onBlur={(e) => {
          setText(format(parse(text)));
          onBlur?.(e);
        }}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
          {suffix}
        </span>
      )}
    </div>
  );
}

/** Montos en centavos: se escribe "1.500.000,50". */
export function MoneyInput({
  currency,
  ...props
}: Omit<BaseProps, "prefix"> & { currency?: string }) {
  return <NumericInput parse={parseMoney} format={centsToInput} prefix={currency} {...props} />;
}

/** Porcentajes en puntos básicos: se escribe "20" o "12,5". */
export function PercentInput(props: Omit<BaseProps, "suffix">) {
  return (
    <NumericInput
      parse={parsePercent}
      format={(bp) => (bp == null ? "" : percentToInput(bp))}
      suffix="%"
      {...props}
    />
  );
}

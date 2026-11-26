import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import {
  Controller,
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
  type UseControllerReturn,
} from "react-hook-form";
import { ChoiceCards, type Choice } from "@/components/ui/choice-cards";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { MoneyInput, PercentInput } from "@/components/ui/numeric-input";
import { SelectOptions } from "@/components/ui/select-options";
import type { Option } from "@/lib/labels";

/**
 * Campos de formulario conectados a react-hook-form. Reciben `control` (tipado por el
 * formulario, así `name` se valida en compilación) y muestran label + error automáticamente.
 */
type FieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  className?: string;
};

function FormField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  className,
  render,
}: FieldProps<T> & { render: (ctrl: UseControllerReturn<T>) => ReactNode }) {
  const ctrl = useController({ control, name });
  return (
    <Field
      label={label}
      htmlFor={name}
      required={required}
      hint={hint}
      error={ctrl.fieldState.error?.message}
      className={className}
    >
      {render(ctrl)}
    </Field>
  );
}

type NativeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "name" | "value" | "onChange" | "onBlur" | "defaultValue"
>;

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  className,
  ...input
}: FieldProps<T> & NativeInputProps) {
  return (
    <FormField
      {...{ control, name, label, required, hint, className }}
      render={({ field, fieldState }) => (
        <Input
          id={name}
          aria-invalid={fieldState.invalid}
          {...input}
          {...field}
          value={field.value ?? ""}
        />
      )}
    />
  );
}

export function DateField<T extends FieldValues>(props: FieldProps<T> & NativeInputProps) {
  return <TextField type="date" {...props} />;
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  className,
  rows = 2,
}: FieldProps<T> & Pick<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows">) {
  return (
    <FormField
      {...{ control, name, label, required, hint, className }}
      render={({ field }) => (
        <Textarea id={name} rows={rows} {...field} value={field.value ?? ""} />
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  hint,
  className,
  options,
  empty,
  disabled,
}: FieldProps<T> & { options: Option[]; empty?: string; disabled?: boolean }) {
  return (
    <FormField
      {...{ control, name, label, required, hint, className }}
      render={({ field, fieldState }) => (
        <Select
          id={name}
          aria-invalid={fieldState.invalid}
          disabled={disabled}
          {...field}
          value={field.value ?? ""}
        >
          <SelectOptions options={options} empty={empty} />
        </Select>
      )}
    />
  );
}

export function MoneyField<T extends FieldValues>({
  currency,
  ...props
}: FieldProps<T> & { currency?: string }) {
  return (
    <FormField
      {...props}
      render={({ field, fieldState }) => (
        <MoneyInput
          id={props.name}
          currency={currency}
          aria-invalid={fieldState.invalid}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}

export function PercentField<T extends FieldValues>(props: FieldProps<T>) {
  return (
    <FormField
      {...props}
      render={({ field, fieldState }) => (
        <PercentInput
          id={props.name}
          aria-invalid={fieldState.invalid}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}

export function ChoiceCardsField<T extends FieldValues>({
  options,
  columnsClassName,
  ...props
}: FieldProps<T> & { options: Choice[]; columnsClassName?: string }) {
  return (
    <FormField
      {...props}
      render={({ field }) => (
        <ChoiceCards
          id={props.name}
          options={options}
          value={field.value}
          onChange={field.onChange}
          className={columnsClassName}
        />
      )}
    />
  );
}

export function CheckboxField<T extends FieldValues>({
  control,
  name,
  label,
}: Pick<FieldProps<T>, "control" | "name" | "label">) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="size-4 rounded border-slate-300 accent-brand-700"
            checked={Boolean(field.value)}
            onChange={(e) => field.onChange(e.target.checked)}
            onBlur={field.onBlur}
            ref={field.ref}
          />
          {label}
        </label>
      )}
    />
  );
}

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Client } from "@/bindings/Client";
import { SelectField, TextareaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { DOCUMENT_TYPES, listOptions } from "@/lib/labels";
import { useSaveClient } from "../hooks";
import { clientSchema, clientToForm, clientToInput, type ClientValues } from "../schema";

const documentOptions = listOptions(DOCUMENT_TYPES);

export function ClientFormDialog({
  open,
  client,
  onClose,
  onSaved,
}: {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSaved?: (client: Client) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={client ? "Editar cliente" : "Nuevo cliente"}
    >
      <ClientForm
        key={client?.id ?? "new"}
        client={client}
        onCancel={onClose}
        onSaved={(saved) => {
          onClose();
          onSaved?.(saved);
        }}
      />
    </Dialog>
  );
}

function ClientForm({
  client,
  onCancel,
  onSaved,
}: {
  client: Client | null;
  onCancel: () => void;
  onSaved: (client: Client) => void;
}) {
  const { control, handleSubmit } = useForm<ClientValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: clientToForm(client),
  });
  const save = useSaveClient(client?.id ?? null, onSaved);

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(clientToInput(v)))} noValidate>
      <div className="grid grid-cols-6 gap-4">
        <TextField
          control={control}
          name="firstName"
          label="Nombre"
          required
          autoFocus
          className="col-span-3"
        />
        <TextField
          control={control}
          name="lastName"
          label="Apellido"
          required
          className="col-span-3"
        />
        <SelectField
          control={control}
          name="documentType"
          label="Tipo doc."
          options={documentOptions}
        />
        <TextField
          control={control}
          name="documentNumber"
          label="Número"
          required
          inputMode="numeric"
          className="col-span-2"
        />
        <TextField
          control={control}
          name="phone"
          label="Teléfono"
          type="tel"
          className="col-span-3"
        />
        <TextField
          control={control}
          name="email"
          label="Email"
          type="email"
          className="col-span-3"
        />
        <TextField control={control} name="city" label="Localidad" className="col-span-3" />
        <TextField control={control} name="address" label="Domicilio" className="col-span-6" />
        <TextareaField control={control} name="notes" label="Notas" className="col-span-6" />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending}>
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

import { CloudDownload } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CloudBackupPanel } from "./CloudBackupCard";

export function CloudBackupRecovery() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <CloudDownload /> Recuperar desde la nube
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Recuperar desde Cloudflare R2"
        description="Podés recuperar la copia completa sin crear un usuario nuevo."
        size="lg"
        preventClose={busy}
      >
        {open && <CloudBackupPanel recoveryOnly onBusyChange={setBusy} />}
      </Dialog>
    </>
  );
}

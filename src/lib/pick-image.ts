import { open } from "@tauri-apps/plugin-dialog";
import { IMAGE_EXTENSIONS } from "./constants";

/** Abre el selector de archivos del sistema; devuelve la ruta elegida o `null`. */
export async function pickImage(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    title: "Elegir foto",
    filters: [{ name: "Imágenes", extensions: IMAGE_EXTENSIONS }],
  });
  return typeof selected === "string" ? selected : null;
}

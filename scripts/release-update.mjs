import { spawn } from "node:child_process";
import { join } from "node:path";
import { projectRoot, readReleaseConfig, validateUpdaterConfig } from "./updater-utils.mjs";

try {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.some((arg) => /^(--config(?:=|$)|-c|--no-bundle$)/.test(arg))) {
    throw new Error("El build de actualizaciones controla su configuración y debe generar instaladores.");
  }
  const { version, tauriConfig } = await readReleaseConfig();
  validateUpdaterConfig(tauriConfig);
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
    throw new Error("Falta TAURI_SIGNING_PRIVATE_KEY (ruta o contenido de la clave privada). No se generará una versión sin firma.");
  }
  console.log(`Compilando la versión ${version} con instaladores firmados para actualizaciones.`);
  const child = spawn(
    process.execPath,
    [
      join(projectRoot, "node_modules/@tauri-apps/cli/tauri.js"),
      "build",
      ...args,
      "--config",
      join(projectRoot, "src-tauri/tauri.updater.json"),
    ],
    { cwd: projectRoot, stdio: "inherit", env: process.env },
  );
  child.on("error", () => {
    console.error("No se pudo iniciar la compilación de Tauri.");
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { projectRoot, readReleaseConfig, requireHttpsUrl, verifyArtifactSignature } from "./updater-utils.mjs";

export async function createManifest(values, root = projectRoot) {
  if (!values.installer || !values.url) {
    throw new Error("Uso: node scripts/create-update-manifest.mjs --installer RUTA --url URL_HTTPS [--platform windows-x86_64] [--notes ARCHIVO] [--output RUTA]");
  }
  if (!/^(windows|darwin|linux)-(x86_64|aarch64|i686|armv7)$/.test(values.platform)) {
    throw new Error("La plataforma debe ser OS-ARCH, por ejemplo windows-x86_64.");
  }
  const installer = resolve(values.installer);
  const url = requireHttpsUrl(values.url);
  if (decodeURIComponent(new URL(url).pathname.split("/").at(-1)) !== basename(installer)) {
    throw new Error("La URL de descarga debe terminar con el nombre exacto del instalador.");
  }
  const info = await stat(installer);
  if (!info.isFile() || !info.size) throw new Error("El instalador no es un archivo válido.");
  const signature = (await readFile(`${installer}.sig`, "utf8")).trim();
  const { version, tauriConfig } = await readReleaseConfig(root);
  const pubkey = tauriConfig.plugins?.updater?.pubkey;
  if (!pubkey) {
    throw new Error("Falta la clave pública del updater en tauri.conf.json. Configurala antes de generar el manifiesto.");
  }
  await verifyArtifactSignature({ artifactPath: installer, signature, pubkey, version });
  const manifest = {
    version,
    notes: values.notes ? (await readFile(resolve(values.notes), "utf8")).trim() : "",
    pub_date: new Date().toISOString(),
    platforms: { [values.platform]: { signature, url } },
  };
  const output = values.output
    ? resolve(values.output)
    : join(root, "src-tauri/target/updates/latest.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Manifiesto generado: ${output}`);
  console.log("Publicá el instalador, su .sig y latest.json en el destino configurado.");
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        installer: { type: "string" },
        url: { type: "string" },
        platform: { type: "string", default: "windows-x86_64" },
        notes: { type: "string" },
        output: { type: "string" },
      },
    });
    await createManifest(values);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

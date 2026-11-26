import { readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { projectRoot, requireHttpsUrl, validatePublicKey } from "./updater-utils.mjs";

try {
  const { values } = parseArgs({
    options: { endpoint: { type: "string" }, "public-key": { type: "string" } },
  });
  if (!values.endpoint || !values["public-key"]) {
    throw new Error("Uso: node scripts/configure-updater.mjs --endpoint URL_HTTPS --public-key RUTA.key.pub");
  }
  const endpoint = requireHttpsUrl(values.endpoint);
  const pubkey = validatePublicKey(await readFile(resolve(values["public-key"]), "utf8"));
  const configPath = join(projectRoot, "src-tauri/tauri.conf.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const current = config.plugins?.updater;
  if (current?.pubkey && current.pubkey !== pubkey) {
    throw new Error("Ya hay otra clave pública configurada. Cambiarla requiere planificar la migración de los clientes instalados.");
  }
  config.plugins = {
    ...config.plugins,
    updater: {
      ...current,
      pubkey,
      endpoints: [endpoint],
      requireSignedVersion: true,
      windows: { ...current?.windows, installMode: "passive" },
    },
  };
  const temporary = `${configPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`);
  await rename(temporary, configPath);
  console.log("Servidor y clave pública configurados. El próximo instalador incluirá esta configuración.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

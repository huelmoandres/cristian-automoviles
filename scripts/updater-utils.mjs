import { createHash, createPublicKey, verify } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function decodeBase64(value, field) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value) ||
    value.length % 4 !== 0
  ) {
    throw new Error(`${field}: codificación base64 inválida.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error(`${field}: codificación base64 inválida.`);
  }
  return decoded;
}

function decodeLines(value, field) {
  return decodeBase64(value, field).toString("utf8").trimEnd().split(/\r?\n/);
}

export function requireHttpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) {
    throw new Error("La URL debe usar HTTPS, sin credenciales ni fragmentos.");
  }
  return url.href;
}

export function validatePublicKey(value) {
  const key = value.trim();
  const lines = decodeLines(key, "Clave pública");
  const data = lines.length === 2 ? decodeBase64(lines[1], "Clave pública") : Buffer.alloc(0);
  if (
    lines.length !== 2 ||
    !lines[0].startsWith("untrusted comment: minisign public key") ||
    data.length !== 42 ||
    !["Ed", "ED"].includes(data.subarray(0, 2).toString("ascii"))
  ) {
    throw new Error("El archivo no contiene una clave pública de Tauri (.key.pub). No uses la clave privada.");
  }
  return key;
}

export async function verifyArtifactSignature({ artifactPath, signature, pubkey, version }) {
  // Minisign layout and signed-comment verification follow the updater's verifier:
  // https://github.com/jedisct1/rust-minisign-verify/blob/master/src/lib.rs
  // Node performs Ed25519 verification; installers are hashed as a stream in ED mode.
  const keyText = validatePublicKey(pubkey);
  const keyData = decodeBase64(decodeLines(keyText, "Clave pública")[1], "Clave pública");
  const lines = decodeLines(signature.trim(), "Firma");
  if (
    lines.length !== 4 ||
    !lines[0].startsWith("untrusted comment: ") ||
    !lines[2].startsWith("trusted comment: ")
  ) {
    throw new Error("La firma Tauri no tiene la estructura Minisign esperada.");
  }
  const data = decodeBase64(lines[1], "Firma del archivo");
  const globalSignature = decodeBase64(lines[3], "Firma del comentario");
  const algorithm = data.subarray(0, 2).toString("ascii");
  if (data.length !== 74 || globalSignature.length !== 64 || algorithm !== "ED") {
    throw new Error("La firma debe tener el formato prehash de Tauri (ED). Recompilá con el script de release.");
  }
  if (!data.subarray(2, 10).equals(keyData.subarray(2, 10))) {
    throw new Error("La firma corresponde a una clave distinta de la configurada en la aplicación.");
  }
  const trustedComment = lines[2].slice("trusted comment: ".length);
  const versions = trustedComment.split("\t").filter((field) => field.startsWith("version:"));
  if (versions.length !== 1) {
    throw new Error("La firma no incluye una versión inequívoca. Recompilá con el script de release o firmá con --app-version.");
  }
  if (versions[0].slice("version:".length) !== version) {
    throw new Error("La versión firmada del instalador no coincide con package.json, Cargo.toml y tauri.conf.json.");
  }
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      keyData.subarray(10),
    ]),
    format: "der",
    type: "spki",
  });
  const fileSignature = data.subarray(10);
  if (!verify(null, Buffer.concat([fileSignature, Buffer.from(trustedComment)]), key, globalSignature)) {
    throw new Error("La firma del comentario no es válida; la versión firmada pudo haber sido alterada.");
  }
  const hash = createHash("blake2b512");
  for await (const chunk of createReadStream(artifactPath)) hash.update(chunk);
  if (!verify(null, hash.digest(), key, fileSignature)) {
    throw new Error("La firma no verifica el contenido del instalador. Usá el archivo y su .sig del mismo build.");
  }
}

export async function readReleaseConfig(root = projectRoot) {
  const [packageText, tauriText, cargoText] = await Promise.all([
    readFile(join(root, "package.json"), "utf8"),
    readFile(join(root, "src-tauri/tauri.conf.json"), "utf8"),
    readFile(join(root, "src-tauri/Cargo.toml"), "utf8"),
  ]);
  const packageConfig = JSON.parse(packageText);
  const tauriConfig = JSON.parse(tauriText);
  const cargoPackage = cargoText.match(/\[package\]([\s\S]*?)(?:\n\[|$)/)?.[1];
  const cargoVersion = cargoPackage?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const version = packageConfig.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("La versión de publicación debe tener el formato X.Y.Z, sin sufijos.");
  }
  if (version !== tauriConfig.version || version !== cargoVersion) {
    throw new Error("Las versiones de package.json, Cargo.toml y tauri.conf.json deben coincidir.");
  }
  return { version, tauriConfig };
}

export function validateUpdaterConfig(config) {
  const updater = config.plugins?.updater;
  if (!Array.isArray(updater?.endpoints) || !updater.endpoints.length) {
    throw new Error("Falta configurar el servidor de actualizaciones.");
  }
  validatePublicKey(updater?.pubkey ?? "");
  for (const endpoint of updater.endpoints) requireHttpsUrl(endpoint);
}

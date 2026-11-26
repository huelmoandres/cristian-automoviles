import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createManifest } from "./create-update-manifest.mjs";
import { readReleaseConfig, requireHttpsUrl, validatePublicKey, validateUpdaterConfig, verifyArtifactSignature } from "./updater-utils.mjs";

// Public test vector from Tauri's updater offline_tests, signed for payload "test":
// https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/src/updater.rs
const PUBLIC_KEY_TEXT = "untrusted comment: minisign public key: A49EF4746FA6E6D7\nRWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe";
const SIGNATURE_TEXT = "untrusted comment: signature from tauri secret key\nRUTX5qZvdPSepPF2zsjvP/L/TQtBLRnWRvaq+4omK1UEugtQp/USrGiI1v762sDy3id3aor7bRC9ETyeot6lMHHrWoZ5hjUM1Qc=\ntrusted comment: timestamp:1791649051\tfile:payload\tversion:2.0.0\nDDq2CLOEl5cQmC2eJRHlnZPVViOZsu1CjpPKQoei4A/XBfkDqGO0B+QMrcrHgEQ5qV3mne75tdFWhJpqUXh9AA==";
const PUBLIC_KEY = Buffer.from(PUBLIC_KEY_TEXT).toString("base64");
const SIGNATURE = Buffer.from(SIGNATURE_TEXT).toString("base64");

function publicKeyFixture() {
  return PUBLIC_KEY;
}

test("requires HTTPS without embedded credentials", () => {
  assert.equal(requireHttpsUrl("https://releases.example.com/latest.json"), "https://releases.example.com/latest.json");
  assert.throws(() => requireHttpsUrl("http://releases.example.com/latest.json"));
  assert.throws(() => requireHttpsUrl("https://user:secret@releases.example.com/latest.json"));
  assert.throws(() => requireHttpsUrl("https://releases.example.com/latest.json#fragment"));
});

test("accepts a Tauri public key and rejects a private key or arbitrary text", () => {
  const key = publicKeyFixture();
  assert.equal(validatePublicKey(` ${key}\n`), key);
  assert.throws(() => validatePublicKey(Buffer.from("untrusted comment: encrypted secret key\nPRIVATE").toString("base64")));
  assert.throws(() => validatePublicKey("not-a-public-key"));
});

test("requires both a public key and an update endpoint", () => {
  const pubkey = publicKeyFixture();
  assert.throws(() => validateUpdaterConfig({}));
  assert.throws(() => validateUpdaterConfig({ plugins: { updater: { pubkey, endpoints: [] } } }));
  assert.throws(() => validateUpdaterConfig({ plugins: { updater: { pubkey, endpoints: ["http://example.com/latest.json"] } } }));
  validateUpdaterConfig({ plugins: { updater: { pubkey, endpoints: ["https://example.com/latest.json"] } } });
});

test("release versions must match in all three manifests", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristian-release-test-"));
  try {
    await mkdir(join(root, "src-tauri"));
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "0.2.0" }));
    await writeFile(join(root, "src-tauri/tauri.conf.json"), JSON.stringify({ version: "0.2.0" }));
    await writeFile(join(root, "src-tauri/Cargo.toml"), '[package]\nname = "example"\nversion = "0.2.0"\n\n[dependencies]\n');
    assert.equal((await readReleaseConfig(root)).version, "0.2.0");
    await writeFile(join(root, "src-tauri/Cargo.toml"), '[package]\nversion = "0.1.0"\n');
    await assert.rejects(readReleaseConfig(root), /deben coincidir/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verifies a real Tauri signature and rejects altered content or signed versions", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristian-signature-test-"));
  try {
    const artifactPath = join(root, "payload");
    await writeFile(artifactPath, "test");
    const input = { artifactPath, pubkey: PUBLIC_KEY, signature: SIGNATURE, version: "2.0.0" };
    await verifyArtifactSignature(input);
    await assert.rejects(verifyArtifactSignature({ ...input, version: "2.0.1" }), /versión firmada/);
    await assert.rejects(verifyArtifactSignature({ ...input, signature: Buffer.from(SIGNATURE_TEXT.replace("version:2.0.0", "version:2.0.1")).toString("base64"), version: "2.0.1" }), /firma del comentario/);
    await assert.rejects(verifyArtifactSignature({ ...input, signature: Buffer.from(SIGNATURE_TEXT.replace("\tversion:2.0.0", "")).toString("base64") }), /no incluye una versión/);
    await assert.rejects(verifyArtifactSignature({ ...input, signature: Buffer.from("untrusted comment: signature from tauri secret key\nTEST").toString("base64") }), /estructura Minisign/);
    await writeFile(artifactPath, "tampered");
    await assert.rejects(verifyArtifactSignature(input), /contenido del instalador/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("manifest requires a valid signature for this build and its configured public key", async () => {
  const root = await mkdtemp(join(tmpdir(), "cristian-manifest-test-"));
  try {
    await mkdir(join(root, "src-tauri"));
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "2.0.0" }));
    await writeFile(join(root, "src-tauri/tauri.conf.json"), JSON.stringify({ version: "2.0.0", plugins: { updater: { pubkey: PUBLIC_KEY } } }));
    await writeFile(join(root, "src-tauri/Cargo.toml"), '[package]\nversion = "2.0.0"\n');
    const installer = join(root, "Cristian Automoviles_2.0.0_x64-setup.exe");
    const output = join(root, "latest.json");
    const url = "https://example.com/Cristian%20Automoviles_2.0.0_x64-setup.exe";
    const values = { installer, url, output, platform: "windows-x86_64" };
    await writeFile(installer, "test");
    await writeFile(`${installer}.sig`, SIGNATURE);
    await createManifest(values, root);
    const manifest = JSON.parse(await readFile(output, "utf8"));
    assert.equal(manifest.version, "2.0.0");
    assert.deepEqual(manifest.platforms["windows-x86_64"], { url, signature: SIGNATURE });
    await assert.rejects(createManifest({ ...values, url: "https://example.com/other.exe" }, root), /nombre exacto/);
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "2.0.1" }));
    await writeFile(join(root, "src-tauri/tauri.conf.json"), JSON.stringify({ version: "2.0.1", plugins: { updater: { pubkey: PUBLIC_KEY } } }));
    await writeFile(join(root, "src-tauri/Cargo.toml"), '[package]\nversion = "2.0.1"\n');
    await assert.rejects(createManifest(values, root), /versión firmada/);
    assert.equal(JSON.parse(await readFile(output, "utf8")).version, "2.0.0");
    await rm(`${installer}.sig`);
    await assert.rejects(createManifest(values, root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

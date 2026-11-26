import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  checkDestination,
  createDraft,
  prepareArtifacts,
  releaseContext,
} from "./prepare-github-release.mjs";

// Public Tauri updater test vector for payload "test", signed for version 2.0.0.
const publicKey = Buffer.from(
  "untrusted comment: minisign public key: A49EF4746FA6E6D7\nRWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe",
).toString("base64");
const signature = Buffer.from(
  "untrusted comment: signature from tauri secret key\nRUTX5qZvdPSepPF2zsjvP/L/TQtBLRnWRvaq+4omK1UEugtQp/USrGiI1v762sDy3id3aor7bRC9ETyeot6lMHHrWoZ5hjUM1Qc=\ntrusted comment: timestamp:1791649051\tfile:payload\tversion:2.0.0\nDDq2CLOEl5cQmC2eJRHlnZPVViOZsu1CjpPKQoei4A/XBfkDqGO0B+QMrcrHgEQ5qV3mne75tdFWhJpqUXh9AA==",
).toString("base64");
const context = { repository: "owner/releases", version: "2.0.0", tag: "v2.0.0" };
const publicRepository = {
  private: false,
  visibility: "public",
  archived: false,
  default_branch: "main",
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "cristian-github-release-"));
  await mkdir(join(root, "src-tauri"));
  await writeFile(join(root, "package.json"), JSON.stringify({ version: context.version }));
  await writeFile(
    join(root, "src-tauri/Cargo.toml"),
    `[package]\nversion = "${context.version}"\n`,
  );
  await writeFile(
    join(root, "src-tauri/tauri.conf.json"),
    JSON.stringify({
      version: context.version,
      plugins: {
        updater: {
          pubkey: publicKey,
          requireSignedVersion: true,
          endpoints: [
            `https://github.com/${context.repository}/releases/latest/download/latest.json`,
          ],
        },
      },
    }),
  );
  return root;
}

test("GitHub destination must match the embedded endpoint and selected version tag", async () => {
  const root = await fixture();
  try {
    assert.deepEqual(
      await releaseContext(root, { GITHUB_REPOSITORY: context.repository }),
      context,
    );
    await assert.rejects(releaseContext(root, { GITHUB_REPOSITORY: "owner/other" }), /endpoint/);
    await assert.rejects(
      releaseContext(root, { GITHUB_REPOSITORY: "bad/repo/path" }),
      /propietario\/nombre/,
    );
    await assert.rejects(
      releaseContext(root, {
        GITHUB_REPOSITORY: context.repository,
        GITHUB_REF_TYPE: "tag",
        GITHUB_REF_NAME: "v1.0.0",
      }),
      /etiqueta/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("private destinations and published versions stop before any upload", async () => {
  await assert.rejects(
    checkDestination(context, async () => JSON.stringify({ ...publicRepository, private: true })),
    /público/,
  );
  await assert.rejects(
    checkDestination(context, async (args) =>
      JSON.stringify(
        args[1].includes("/releases?")
          ? [[{ tag_name: context.tag, draft: false }]]
          : publicRepository,
      ),
    ),
    /ya está publicada/,
  );
  await assert.rejects(
    checkDestination(context, async (args) => {
      if (args[1].includes("/releases?"))
        throw Object.assign(new Error("Offline"), { stderr: "connection refused" });
      return JSON.stringify(publicRepository);
    }),
    /Offline/,
  );
});

test("packages an ASCII installer and a cryptographically verified GitHub manifest", async () => {
  const root = await fixture();
  try {
    const directory = join(root, "src-tauri/target/release/bundle/nsis");
    await mkdir(directory, { recursive: true });
    const installer = join(directory, "Cristian Automóviles_2.0.0_x64-setup.exe");
    await writeFile(installer, "test");
    await writeFile(`${installer}.sig`, signature);
    const files = await prepareArtifacts(context, root);
    assert.equal(files.length, 3);
    assert.equal(await readFile(files[0], "utf8"), "test");
    const manifest = JSON.parse(await readFile(files[2], "utf8"));
    assert.equal(
      manifest.platforms["windows-x86_64"].url,
      "https://github.com/owner/releases/releases/download/v2.0.0/cristian-automoviles_2.0.0_x64-setup.exe",
    );
    await writeFile(installer, "modified");
    await assert.rejects(prepareArtifacts(context, root), /contenido del instalador/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("creates a draft from the source commit and allows rerunning its uploads", async () => {
  const calls = [];
  let exists = false;
  const release = { id: 42, tag_name: context.tag, draft: true };
  const run = async (args) => {
    calls.push(args);
    if (args[0] === "api") {
      if (args.includes("POST")) {
        exists = true;
        return JSON.stringify(release);
      }
      if (args[1].includes("/releases?")) return JSON.stringify([exists ? [release] : []]);
      if (args[1].endsWith("/releases/42")) return JSON.stringify(release);
      return JSON.stringify(publicRepository);
    }
    return "";
  };
  const files = ["installer.exe", "installer.exe.sig", "latest.json"];
  const env = { GITHUB_REPOSITORY: context.repository, GITHUB_SHA: "a".repeat(40) };
  await createDraft(context, files, env, run);
  await createDraft(context, files, env, run);
  const creates = calls.filter((args) => args[0] === "api" && args.includes("POST"));
  assert.equal(creates.length, 1);
  assert.ok(creates[0].includes("draft=true"));
  assert.ok(creates[0].includes(`target_commitish=${env.GITHUB_SHA}`));
  assert.equal(
    calls.filter((args) => args[1] === "upload" && args.includes("--clobber")).length,
    2,
  );
});

test("new drafts are rechecked by the returned ID while the release list remains stale", async () => {
  const calls = [];
  const release = { id: 123, tag_name: context.tag, draft: true };
  await createDraft(
    context,
    ["installer.exe"],
    {
      GITHUB_REPOSITORY: context.repository,
      GITHUB_SHA: "a".repeat(40),
    },
    async (args) => {
      calls.push(args);
      if (args[0] !== "api") return "";
      if (args.includes("POST")) return JSON.stringify(release);
      if (args[1].includes("/releases?")) return JSON.stringify([[]]);
      if (args[1].endsWith("/releases/123")) return JSON.stringify(release);
      return JSON.stringify(publicRepository);
    },
  );
  assert.equal(calls.filter((args) => args[1]?.includes("/releases?")).length, 1);
  assert.equal(calls.filter((args) => args[1]?.endsWith("/releases/123")).length, 1);
  assert.equal(calls.filter((args) => args[1] === "upload").length, 1);
});

test("a draft published during preparation is never overwritten", async () => {
  const writes = [];
  await assert.rejects(
    createDraft(context, ["installer.exe"], {}, async (args) => {
      if (args[0] !== "api") {
        writes.push(args);
        return "";
      }
      if (args[1].includes("/releases?"))
        return JSON.stringify([[{ id: 42, tag_name: context.tag, draft: true }]]);
      if (args[1].endsWith("/releases/42"))
        return JSON.stringify({ id: 42, tag_name: context.tag, draft: false });
      return JSON.stringify(publicRepository);
    }),
    /ya no es un borrador/,
  );
  assert.equal(writes.length, 0);
});

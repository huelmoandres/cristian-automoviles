import { execFile } from "node:child_process";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createManifest } from "./create-update-manifest.mjs";
import { projectRoot, readReleaseConfig, validateUpdaterConfig } from "./updater-utils.mjs";

const execute = promisify(execFile);

async function github(args) {
  return (await execute("gh", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })).stdout;
}

export async function releaseContext(root = projectRoot, env = process.env) {
  const { version, tauriConfig } = await readReleaseConfig(root);
  validateUpdaterConfig(tauriConfig);
  const repository = env.RELEASES_REPOSITORY || env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) {
    throw new Error(
      "Configurá RELEASES_REPOSITORY con el repositorio real en formato propietario/nombre.",
    );
  }
  const endpoint = `https://github.com/${repository}/releases/latest/download/latest.json`;
  const updater = tauriConfig.plugins.updater;
  if (
    updater.endpoints.length !== 1 ||
    updater.endpoints[0] !== endpoint ||
    updater.requireSignedVersion !== true
  ) {
    throw new Error(
      "Configurá la clave pública y el endpoint de este repositorio con configure-updater antes de generar el primer instalador.",
    );
  }
  const tag = `v${version}`;
  if (env.GITHUB_REF_TYPE === "tag" && env.GITHUB_REF_NAME !== tag) {
    throw new Error("La etiqueta seleccionada no coincide con la versión de la aplicación.");
  }
  return { repository, version, tag };
}

async function existingRelease(context, run) {
  // The tag endpoint only guarantees published releases; listing includes accessible drafts.
  const pages = JSON.parse(
    await run([
      "api",
      `repos/${context.repository}/releases?per_page=100`,
      "--header",
      "Cache-Control: no-cache",
      "--paginate",
      "--slurp",
    ]),
  );
  const matches = pages.flat().filter((release) => release.tag_name === context.tag);
  if (matches.length > 1) {
    throw new Error(
      "Hay varias releases con esta etiqueta. Revisá los borradores antes de continuar.",
    );
  }
  return matches[0] ?? null;
}

export async function checkDestination(context, run = github) {
  const repository = JSON.parse(await run(["api", `repos/${context.repository}`]));
  if (repository.private || repository.visibility !== "public" || repository.archived) {
    throw new Error("El destino de actualizaciones debe ser un repositorio público y activo.");
  }
  const release = await existingRelease(context, run);
  if (release && !release.draft) {
    throw new Error(
      "Esta versión ya está publicada. Aumentá la versión; no se sobrescribirá una publicación existente.",
    );
  }
  return { repository, release };
}

export async function prepareArtifacts(context, root = projectRoot) {
  const directory = join(root, "src-tauri/target/release/bundle/nsis");
  const suffix = `_${context.version}_x64-setup.exe`;
  const installers = (await readdir(directory)).filter((name) => name.endsWith(suffix));
  if (installers.length !== 1) {
    throw new Error("Debe existir un único instalador NSIS x64 de la versión actual.");
  }
  const output = join(root, "src-tauri/target/updates/github");
  await mkdir(output, { recursive: true });
  const installer = join(output, `cristian-automoviles_${context.version}_x64-setup.exe`);
  const signature = `${installer}.sig`;
  await copyFile(join(directory, installers[0]), installer);
  await copyFile(join(directory, `${installers[0]}.sig`), signature);
  const manifest = join(output, "latest.json");
  await createManifest(
    {
      installer,
      url: `https://github.com/${context.repository}/releases/download/${context.tag}/${installer.split(/[\\/]/).at(-1)}`,
      platform: "windows-x86_64",
      output: manifest,
    },
    root,
  );
  return [installer, signature, manifest];
}

export async function createDraft(context, files, env = process.env, run = github) {
  const destination = await checkDestination(context, run);
  let release = destination.release;
  if (!release) {
    const sourceRepository = env.GITHUB_REPOSITORY;
    const target =
      sourceRepository?.toLowerCase() === context.repository.toLowerCase()
        ? env.GITHUB_SHA
        : destination.repository.default_branch;
    if (
      !target ||
      (sourceRepository?.toLowerCase() === context.repository.toLowerCase() &&
        !/^[a-f0-9]{40,64}$/i.test(target))
    ) {
      throw new Error("No se pudo determinar el commit o la rama de destino de la release.");
    }
    release = JSON.parse(
      await run([
        "api",
        "--method",
        "POST",
        `repos/${context.repository}/releases`,
        "--raw-field",
        `tag_name=${context.tag}`,
        "--raw-field",
        `target_commitish=${target}`,
        "--raw-field",
        `name=Cristian Automóviles ${context.tag}`,
        "--raw-field",
        "body=Windows x64 installer with signed in-app updates.",
        "--field",
        "draft=true",
      ]),
    );
  }
  if (!Number.isSafeInteger(release?.id) || release.id <= 0 || release.tag_name !== context.tag) {
    throw new Error("GitHub no devolvió una release válida para esta versión.");
  }
  // Read the authoritative ID, not the eventually consistent release listing, after creation.
  const current = JSON.parse(
    await run([
      "api",
      `repos/${context.repository}/releases/${release.id}`,
      "--header",
      "Cache-Control: no-cache",
    ]),
  );
  if (current.id !== release.id || current.tag_name !== context.tag || !current.draft)
    throw new Error("La release ya no es un borrador. No se reemplazarán sus archivos.");
  await run([
    "release",
    "upload",
    context.tag,
    "--repo",
    context.repository,
    ...files,
    "--clobber",
  ]);
  console.log(`Borrador preparado: https://github.com/${context.repository}/releases`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const command = process.argv[2];
    if (!["check", "prepare", "draft"].includes(command))
      throw new Error("Uso: node scripts/prepare-github-release.mjs check|prepare|draft");
    const context = await releaseContext();
    if (command === "check") {
      if (!process.env.TAURI_SIGNING_PRIVATE_KEY?.trim())
        throw new Error("Falta configurar el secreto TAURI_SIGNING_PRIVATE_KEY en GitHub Actions.");
      await checkDestination(context);
      console.log(`Destino y versión verificados: ${context.repository} ${context.tag}`);
    } else if (command === "prepare") {
      await prepareArtifacts(context);
    } else {
      await checkDestination(context);
      await createDraft(context, await prepareArtifacts(context));
    }
  } catch (error) {
    console.error(error.stderr?.trim() || error.message);
    process.exitCode = 1;
  }
}

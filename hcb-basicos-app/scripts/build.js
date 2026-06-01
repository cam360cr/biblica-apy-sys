const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "..");
const outputDir = path.join(projectRoot, "build");

const entriesToCopy = [
  "server.js",
  "README.md",
  ".env.example",
  "public",
  "src"
];

function removeDirIfExists(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function copyFile(sourcePath, destinationPath) {
  ensureDir(path.dirname(destinationPath));
  fs.copyFileSync(sourcePath, destinationPath);
}

function copyDirectory(sourcePath, destinationPath) {
  ensureDir(destinationPath);

  const children = fs.readdirSync(sourcePath, { withFileTypes: true });
  for (const child of children) {
    const sourceChildPath = path.join(sourcePath, child.name);
    const destinationChildPath = path.join(destinationPath, child.name);

    if (child.isDirectory()) {
      copyDirectory(sourceChildPath, destinationChildPath);
      continue;
    }

    if (child.isFile()) {
      copyFile(sourceChildPath, destinationChildPath);
    }
  }
}

function copyEntry(relativeEntryPath) {
  const sourcePath = path.join(projectRoot, relativeEntryPath);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`No se encontro el archivo o carpeta requerido: ${relativeEntryPath}`);
  }

  const destinationPath = path.join(outputDir, relativeEntryPath);
  const stat = fs.statSync(sourcePath);

  if (stat.isDirectory()) {
    copyDirectory(sourcePath, destinationPath);
    return;
  }

  copyFile(sourcePath, destinationPath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeBuildPackageJson() {
  const rootPackagePath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(rootPackagePath)) {
    throw new Error("No se encontro package.json en la raiz del repositorio.");
  }

  const rootPackage = readJson(rootPackagePath);
  const buildPackage = {
    name: rootPackage.name || "hcb-basicos-app",
    version: rootPackage.version || "1.0.0",
    description:
      rootPackage.description ||
      "Sistema web para registrar consumos de basicos con la API de Clinica Biblica",
    main: "server.js",
    type: "commonjs",
    scripts: {
      start: "node server.js",
      dev: "node server.js"
    },
    engines: rootPackage.engines || { node: ">=18" },
    dependencies: rootPackage.dependencies || {}
  };

  const destination = path.join(outputDir, "package.json");
  fs.writeFileSync(destination, `${JSON.stringify(buildPackage, null, 2)}\n`, "utf8");
}

function copyRootPackageLockIfExists() {
  const rootLockPath = path.join(repoRoot, "package-lock.json");
  if (!fs.existsSync(rootLockPath)) {
    return;
  }

  copyFile(rootLockPath, path.join(outputDir, "package-lock.json"));
}

function build() {
  removeDirIfExists(outputDir);
  ensureDir(outputDir);

  for (const entry of entriesToCopy) {
    copyEntry(entry);
  }

  writeBuildPackageJson();
  copyRootPackageLockIfExists();

  console.log("Build generado correctamente en:", outputDir);
}

build();

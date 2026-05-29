const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "build");

const entriesToCopy = [
  "server.js",
  "package.json",
  "package-lock.json",
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

function build() {
  removeDirIfExists(outputDir);
  ensureDir(outputDir);

  for (const entry of entriesToCopy) {
    copyEntry(entry);
  }

  console.log("Build generado correctamente en:", outputDir);
}

build();

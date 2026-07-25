import { cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const deployablePaths = ['index.html', 'favicon.svg', 'styles.css', 'src', 'generated/content'];

export async function buildStaticSite({ rootDirectory, outputDirectory }) {
  await rm(outputDirectory, { force: true, recursive: true });

  for (const relativePath of deployablePaths) {
    await cp(join(rootDirectory, relativePath), join(outputDirectory, relativePath), {
      recursive: true
    });
  }
}

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildStaticSite({
    rootDirectory,
    outputDirectory: join(rootDirectory, 'dist')
  });
}

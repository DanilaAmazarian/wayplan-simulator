import { existsSync, lstatSync, mkdirSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const link = resolve(root, 'public/assets/taiga-ui/icons');
const target = resolve(root, '../node_modules/@taiga-ui/icons/src');

mkdirSync(dirname(link), { recursive: true });
if (existsSync(link)) {
  const stat = lstatSync(link);
  if (stat.isSymbolicLink() || stat.isDirectory()) process.exit(0);
}
symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');

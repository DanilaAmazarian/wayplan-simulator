import { writeFileSync } from 'node:fs';

const apiUrl = process.env['API_URL'] ?? 'http://localhost:4000';
writeFileSync(
  'src/environments/environment.production.ts',
  `export const environment = { apiUrl: ${JSON.stringify(apiUrl)} };\n`,
);

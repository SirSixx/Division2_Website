// One-off: pull the hard-coded datasets out of the ORIGINAL pages into JSON.
// Usage: node scripts/extract.mjs <folder-with-original-html> <output-folder>
import fs from 'node:fs';
import path from 'node:path';

const [srcDir = 'website', outDir = 'website/snapshot'] = process.argv.slice(2);

const SOURCES = [
  ['gear',           'division2-gear.html',          'DATA',       'array'],
  ['gear-logo-map',  'division2-gear.html',          'LOGO_NAME',  'object'],
  ['talents',        'division2-talent-lookup.html', 'DATA',       'array'],
  ['weapon-classes', 'division2-weapons.html',       'CLASS_DATA', 'array'],
  ['builds',         'division2-builds.html',        'BUILDS',     'array'],
];

function grab(file, name, kind) {
  const src = fs.readFileSync(file, 'utf8');
  const open = kind === 'array' ? '[' : '{';
  const start = src.indexOf(`const ${name} = ${open}`);
  if (start < 0) throw new Error(`${name} not found in ${file}`);
  const from = start + `const ${name} = `.length;
  const end = kind === 'array' ? src.indexOf('\n];', from) + 2 : src.indexOf('};', from) + 1;
  // Talents and Builds use unquoted keys, so evaluate rather than JSON.parse
  return (0, eval)('(' + src.slice(from, end) + ')');
}

fs.mkdirSync(outDir, { recursive: true });
for (const [key, file, name, kind] of SOURCES) {
  const data = grab(path.join(srcDir, file), name, kind);
  fs.writeFileSync(path.join(outDir, `${key}.json`), JSON.stringify(data, null, 2) + '\n');
  console.log(key.padEnd(15), Array.isArray(data) ? data.length + ' items' : Object.keys(data).length + ' keys');
}

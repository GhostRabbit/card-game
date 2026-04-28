import fs from 'fs';
import path from 'path';

const cardsFile = fs.readFileSync(path.join(__dirname, 'server/src/data/cards.ts'), 'utf8');
const cardsFile2 = fs.readFileSync(path.join(__dirname, 'server/src/data/mainUnit2Generated.ts'), 'utf8');

// regex to find all effect types
const typeRegex = /type:\s*['"]([^'"]+)['"]/g;
const effectTypes = new Set<string>();

let match;
while ((match = typeRegex.exec(cardsFile)) !== null) {
  effectTypes.add(match[1]);
}
while ((match = typeRegex.exec(cardsFile2)) !== null) {
  effectTypes.add(match[1]);
}

const cardEffectsFile = fs.readFileSync(path.join(__dirname, 'server/src/game/CardEffects.ts'), 'utf8');
const handlersDir = path.join(__dirname, 'server/src/game/effect-handlers');
const handlerFiles = fs.readdirSync(handlersDir).filter(f => f.endsWith('.ts'));

const implementedTypes = new Set<string>();

// from CardEffects.ts
const caseRegex = /case\s+['"]([^'"]+)['"]/g;
while ((match = caseRegex.exec(cardEffectsFile)) !== null) {
  implementedTypes.add(match[1]);
}

// from registerHandler calls
for (const file of handlerFiles) {
  const content = fs.readFileSync(path.join(handlersDir, file), 'utf8');
  const registerRegex = /registerHandler\(\s*['"]([^'"]+)['"]/g;
  while ((match = registerRegex.exec(content)) !== null) {
    implementedTypes.add(match[1]);
  }
}

const unhandled = [...effectTypes].filter(t => !implementedTypes.has(t));
const unused = [...implementedTypes].filter(t => !effectTypes.has(t));

console.log("Found effect types in data:", effectTypes.size);
console.log("Found handled effect types:", implementedTypes.size);
console.log("\nUnhandled effect types:");
for (const u of unhandled) console.log("- " + u);

console.log("\nUnused handlers:");
for (const u of unused) console.log("- " + u);

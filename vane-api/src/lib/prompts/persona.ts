import fs from 'node:fs';
import path from 'node:path';

const PERSONA_DIR = path.join(process.cwd(), 'data', 'persona');

/** Read persona markdown by name; returns empty string if missing (graceful fallback). */
export function loadPersona(name: string): string {
  try {
    const p = path.join(PERSONA_DIR, `${name}.md`);
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

export const SHIYE_PERSONA_NAME = 'shiye';

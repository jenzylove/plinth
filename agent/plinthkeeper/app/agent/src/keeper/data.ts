// Copied from packages/keeper/src/data.ts by scripts/sync-agent.sh. Edit the original.
import { pathToFileURL } from 'node:url';

/** Folder holding stocks.json, gaps-*.json and macro-2026.json. PLINTH_DATA_DIR overrides it when bundled. */
export const DATA = process.env.PLINTH_DATA_DIR
  ? pathToFileURL(process.env.PLINTH_DATA_DIR.replace(/\/?$/, '/'))
  : new URL('../../data/', import.meta.url);

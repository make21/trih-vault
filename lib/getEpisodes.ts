import * as fs from 'fs';
import * as path from 'path';
import type { Episode } from './types';

export interface EpisodeResult {
  episodes: Episode[];
  isValid: boolean;
}

export async function loadEpisodes(): Promise<EpisodeResult> {
  const filePath = path.join(process.cwd(), 'public', 'episodes.json');

  if (!fs.existsSync(filePath)) {
    console.warn('episodes.json not found, attempting to build dataset...');
    try {
      const { execSync } = await import('child_process');
      execSync('npm run build:data', { stdio: 'inherit' });
    } catch (error) {
      console.error('Failed to build episodes dataset:', error);
      return { episodes: [], isValid: false };
    }
  }

  try {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(fileContents);

    if (!Array.isArray(parsed)) {
      console.warn('episodes.json did not contain an array.');
      return { episodes: [], isValid: false };
    }

    return { episodes: parsed as Episode[], isValid: true };
  } catch (error) {
    console.error('Failed to parse episodes.json:', error);
    return { episodes: [], isValid: false };
  }
}

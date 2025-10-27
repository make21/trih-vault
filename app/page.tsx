import * as fs from 'fs';
import * as path from 'path';
import type { Episode } from '@/lib/types';
import EpisodeList from '@/components/EpisodeList';

export const revalidate = 43200;

interface EpisodeResult {
  episodes: Episode[];
  isValid: boolean;
}

async function getEpisodes(): Promise<EpisodeResult> {
  const filePath = path.join(process.cwd(), 'public', 'episodes.json');

  if (!fs.existsSync(filePath)) {
    console.warn('episodes.json not found, building now...');
    const { execSync } = require('child_process');
    execSync('npm run build:data', { stdio: 'inherit' });
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

export default async function HomePage() {
  const { episodes, isValid } = await getEpisodes();
  const hasEpisodes = isValid && episodes.length > 0;

  return (
    <div className="min-h-screen">
      <header className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-4xl font-bold mb-2">
            The Rest Is History Timeline
          </h1>
          <p className="text-blue-100 text-lg">
            Data: public RSS + fan-curated CSV
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {hasEpisodes ? (
          <EpisodeList episodes={episodes} />
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-12 text-center">
            <h2 className="text-2xl font-semibold text-slate-700 dark:text-slate-200 mb-3">
              No dataset available
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              The episodes dataset could not be loaded. Please rebuild it by
              running{' '}
              <code className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-sm">
                npm run build:data
              </code>{' '}
              and see the{' '}
              <a
                href="https://github.com/trih-browser/trih-browser/blob/main/README.md"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                README guide
              </a>{' '}
              for more details.
            </p>
          </div>
        )}
      </main>

      <footer className="bg-slate-100 dark:bg-slate-900 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-slate-600 dark:text-slate-400">
            Built with Next.js | Data from{' '}
            <a
              href="https://feeds.megaphone.fm/GLT4787413333"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              RSS Feed
            </a>{' '}
            and fan-curated CSV
          </p>
        </div>
      </footer>
    </div>
  );
}

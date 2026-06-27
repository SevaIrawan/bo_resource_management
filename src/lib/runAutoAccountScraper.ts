import {
  runAccountScraper,
  type RunAccountScraperInput,
  type ScrapeRunCounts,
} from '@/lib/runAccountScraper';

export type RunAutoAccountScraperInput = Omit<RunAccountScraperInput, 'lane'>;
export type AutoScrapeRunCounts = ScrapeRunCounts;

/** Auto scrape harian — lane terpisah (`scraper:run-auto`), tanpa execute slot user. */
export async function runAutoAccountScraper(
  input: RunAutoAccountScraperInput,
): Promise<AutoScrapeRunCounts> {
  return runAccountScraper({ ...input, lane: 'auto' });
}

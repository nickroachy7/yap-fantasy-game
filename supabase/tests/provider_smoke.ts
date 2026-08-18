/**
 * Live smoke test for the balldontlie adapter (build plan task 11).
 * Run: deno run --allow-net --allow-env --allow-read supabase/tests/provider_smoke.ts
 * Reads BALLDONTLIE_API_KEY from the environment or .env.local.
 */
import { BalldontlieProvider } from '../functions/_shared/balldontlie.ts';

async function loadKey(): Promise<string> {
  const fromEnv = Deno.env.get('BALLDONTLIE_API_KEY');
  if (fromEnv) return fromEnv;
  const text = await Deno.readTextFile(new URL('../../.env.local', import.meta.url));
  const line = text.split('\n').find((l) => l.startsWith('BALLDONTLIE_API_KEY='));
  if (!line) throw new Error('BALLDONTLIE_API_KEY not found');
  return line.slice('BALLDONTLIE_API_KEY='.length).trim();
}

const provider = new BalldontlieProvider(await loadKey());
const SEASON = 2026;

console.log('teams…');
const teams = await provider.listTeams();
console.log(`  ${teams.length} teams; sample:`, teams[0]);

console.log('active players…');
const players = await provider.listActivePlayers();
const withPos = players.filter((p) => p.positionAbbreviation);
console.log(`  ${players.length} players, ${withPos.length} with a position abbreviation`);
const byPos = new Map<string, number>();
for (const p of players) {
  const k = p.positionAbbreviation ?? '(none)';
  byPos.set(k, (byPos.get(k) ?? 0) + 1);
}
console.log('  fantasy positions:', ['QB', 'RB', 'WR', 'TE', 'K'].map((p) => `${p}=${byPos.get(p) ?? 0}`).join(' '));
console.log('  sample:', players[0]);

console.log('preseason games…');
const games = await provider.listGames({ season: SEASON, seasonType: 1 });
const finals = games.filter((g) => g.statusState === 'final');
console.log(`  ${games.length} games, ${finals.length} final`);

console.log('stat lines for 2 final games…');
const ids = finals.slice(0, 2).map((g) => g.externalId);
const lines = await provider.listStatLines(ids, 1);
console.log(`  ${lines.length} stat lines from games ${ids.join(', ')}`);
const scorer = lines.find((l) => Number(l.raw.passing_yards) > 0);
if (scorer) {
  console.log('  sample passer:', {
    player: scorer.playerExternalId,
    week: scorer.week,
    passing_yards: scorer.raw.passing_yards,
    passing_touchdowns: scorer.raw.passing_touchdowns,
    rawKeys: Object.keys(scorer.raw).length,
  });
}
console.log('  raw contains nested entities?',
  lines.some((l) => 'player' in l.raw || 'game' in l.raw || 'team' in l.raw));

console.log('injuries…');
const injuries = await provider.listInjuries();
console.log(`  ${injuries.length} injuries; sample:`, injuries[0]);

console.log('DFS salaries (preseason wk 2)…');
const pre = await provider.listSalaries({ season: SEASON, seasonType: 1, week: 2 });
console.log(`  ${pre.length} preseason salaries`);

console.log('DFS salaries (regular wk 1)…');
const reg = await provider.listSalaries({ season: SEASON, seasonType: 2, week: 1 });
console.log(`  ${reg.length} regular-season wk1 salaries; sample:`, reg[0]);
if (reg.length) {
  const sorted = [...reg].sort((a, b) => b.salary - a.salary);
  console.log('  salary range:', sorted[sorted.length - 1].salary, '→', sorted[0].salary);
}

console.log('\nOK');

/**
 * Nightly reference sync (build plan task 12): teams, active players, injuries.
 *
 * Talks only to StatsProvider — it never sees a balldontlie type. Alerts by
 * returning a non-2xx when a sweep produces zero rows, because the failure mode
 * that matters here is silent: an API shape change that yields empty pages
 * would otherwise look identical to a quiet night.
 */
import { createClient } from '@supabase/supabase-js';
import { BalldontlieProvider } from '../_shared/balldontlie.ts';
import type { StatsProvider } from '../_shared/stats-provider.ts';

const CHUNK = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // A valid anon JWT is not authorisation to run a full sweep — that key ships
    // in the app bundle. The shared secret lives in Vault and is compared
    // in-database, so no copy of it exists in env vars, source, or logs.
    const { data: authorised, error: authErr } = await supabase.rpc('verify_sync_secret', {
      candidate: req.headers.get('x-sync-secret') ?? '',
    });
    if (authErr) throw authErr;
    if (authorised !== true) {
      return json({ error: 'forbidden' }, 403);
    }

    const provider: StatsProvider = new BalldontlieProvider(
      Deno.env.get('BALLDONTLIE_API_KEY')!,
    );

    // ---- teams -------------------------------------------------------------
    const teams = await provider.listTeams();
    if (teams.length === 0) {
      return json({ error: 'zero teams returned — provider shape may have drifted' }, 502);
    }

    const { error: teamErr } = await supabase.from('teams').upsert(
      teams.map((t) => ({
        external_id: t.externalId,
        abbreviation: t.abbreviation,
        location: t.location,
        name: t.name,
        full_name: t.fullName,
        conference: t.conference,
        division: t.division,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'external_id' },
    );
    if (teamErr) throw teamErr;

    // Map provider team ids -> our uuids for the player rows.
    const { data: teamRows, error: teamReadErr } = await supabase
      .from('teams')
      .select('id, external_id');
    if (teamReadErr) throw teamReadErr;
    const teamIdByExternal = new Map<number, string>(
      (teamRows ?? []).map((t) => [t.external_id, t.id]),
    );

    // ---- players -----------------------------------------------------------
    const players = await provider.listActivePlayers();
    if (players.length === 0) {
      return json({ error: 'zero players returned — provider shape may have drifted' }, 502);
    }

    let playersWritten = 0;
    for (const batch of chunk(players, CHUNK)) {
      const { error } = await supabase.from('players').upsert(
        batch.map((p) => ({
          external_id: p.externalId,
          team_id: p.teamExternalId ? teamIdByExternal.get(p.teamExternalId) ?? null : null,
          first_name: p.firstName,
          last_name: p.lastName,
          position: p.position,
          position_abbreviation: p.positionAbbreviation,
          jersey_number: p.jerseyNumber,
          height: p.height,
          weight: p.weight,
          college: p.college,
          experience: p.experience,
          age: p.age,
          is_active: true,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'external_id' },
      );
      if (error) throw error;
      playersWritten += batch.length;
    }

    // ---- injuries ----------------------------------------------------------
    // Cheap win: the endpoint is already in our tier and the lineup screen
    // wants it (task 25). Applied set-based so player names are never touched,
    // and so recovered players get their status cleared in the same pass.
    const injuries = await provider.listInjuries();
    const { data: injuriesWritten, error: injuryErr } = await supabase.rpc('apply_injuries', {
      payload: injuries.map((i) => ({
        external_id: i.playerExternalId,
        status: i.status,
        comment: i.comment,
        reported_at: i.date,
      })),
    });
    if (injuryErr) throw injuryErr;

    return json({
      ok: true,
      teams: teams.length,
      players: playersWritten,
      injuries_reported: injuries.length,
      injuries_applied: injuriesWritten,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('sync-reference failed', err);
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

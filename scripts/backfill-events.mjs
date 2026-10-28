// Reconstruct admin-inbox events (src/lib/events.ts) from timestamps that
// already exist, for the retention window before live logging started.
//
//   node scripts/backfill-events.mjs           dry run: counts per type
//   node scripts/backfill-events.mjs --apply   replace backfilled rows
//
// Only covers what the tables still record (signups, links, picks, reports,
// bans…); past edits and deletions are gone. Rows are flagged `backfilled`
// and stop where live logging began, so nothing is logged twice. Re-running
// replaces the previous backfill. Writes to DATABASE_URL (.env.development.local).
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.development.local", quiet: true });
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (.env.development.local).");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const sql = neon(process.env.DATABASE_URL);

// Keep in step with EVENT_RETENTION_DAYS in src/lib/events.ts.
const RETENTION_DAYS = 60;

// Each source yields (type, actor_id, subject_user_id, season_id, data, at).
const SOURCES = `
  select 'user.registered' as type, u.id as actor_id, null as subject_user_id,
         null as season_id, '{}'::jsonb as data, u.created_at as at
    from users u
  union all
  select 'signup.created', s.user_id, null, s.season_id,
         jsonb_build_object('kind', s.kind), s.created_at
    from season_signups s
  union all
  select 'riot.linked', l.user_id, null, null,
         jsonb_build_object('riotId', l.external_handle), l.linked_at
    from account_links l where l.provider = 'riot'
  union all
  select 'cs2.linked', l.user_id, null, null,
         jsonb_build_object('steamId', l.external_id), l.linked_at
    from account_links l where l.provider = 'steam'
  union all
  select 'season.created', s.created_by, null, s.id, '{}'::jsonb, s.created_at
    from seasons s
  union all
  select 'draft.pick', p.captain_user_id, p.picked_user_id, d.season_id,
         jsonb_build_object('pickNumber', p.pick_number), p.picked_at
    from draft_picks p join drafts d on d.id = p.draft_id
  union all
  select 'match.reported', m.reported_by, null, m.season_id,
         jsonb_build_object(
           'matchId', m.id,
           'matchLabel', h.name || ' vs ' || a.name,
           'score', case when m.home_score is not null and m.away_score is not null
                         then m.home_score || '–' || m.away_score end),
         m.reported_at
    from matches m
    join teams h on h.id = m.home_team_id
    join teams a on a.id = m.away_team_id
   where m.reported_at is not null
  union all
  select 'sub.requested', ms.requested_by, ms.sub_user_id, m.season_id,
         jsonb_build_object('matchId', m.id, 'matchLabel', h.name || ' vs ' || a.name,
                            'reason', ms.reason),
         ms.created_at
    from match_substitutions ms
    join matches m on m.id = ms.match_id
    join teams h on h.id = m.home_team_id
    join teams a on a.id = m.away_team_id
  union all
  select 'user.banned', u.banned_by, u.id, null,
         jsonb_build_object('reason', u.ban_reason, 'expiresAt', u.ban_expires_at),
         u.banned_at
    from users u where u.banned_at is not null
  union all
  select 'tenman.started', t.created_by, null, null,
         jsonb_build_object('tenManId', t.id), t.created_at
    from ten_mans t
  union all
  select 'tenman.joined', s.user_id, null, null,
         jsonb_build_object('tenManId', s.ten_man_id), s.created_at
    from ten_man_signups s
  union all
  select 'tenman.pick', p.captain_user_id, p.picked_user_id, null,
         jsonb_build_object('tenManId', p.ten_man_id, 'pickNumber', p.pick_number), p.picked_at
    from ten_man_picks p
`;

// From the retention cutoff up to the first live event (or now).
const WINDOW = `
  at > now() - interval '${RETENTION_DAYS} days'
  and at < coalesce((select min(created_at) from events where not backfilled), now())
`;

const counts = await sql.query(
  `select type, count(*)::int as n from (${SOURCES}) src where ${WINDOW} group by type order by type`,
);
for (const { type, n } of counts) console.log(`${type.padEnd(18)} ${n}`);
const total = counts.reduce((sum, r) => sum + r.n, 0);

if (!apply) {
  console.log(`\n${total} events would be backfilled. Re-run with --apply to write them.`);
  process.exit(0);
}

const [removed, inserted] = await sql.transaction([
  sql.query(`delete from events where backfilled returning id`),
  sql.query(
    `insert into events (id, type, actor_id, subject_user_id, season_id, data, backfilled, created_at)
     select gen_random_uuid()::text, type, actor_id, subject_user_id, season_id, data, true, at
       from (${SOURCES}) src where ${WINDOW}
     returning id`,
  ),
]);
console.log(`\nReplaced ${removed.length} old backfilled events with ${inserted.length}.`);

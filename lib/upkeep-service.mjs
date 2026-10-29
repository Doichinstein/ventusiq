// Shared orchestration only. Watch and delivery services retain their own leases.
export class UpkeepService {
  constructor(weather, {watches, push, webhooks} = {}) {
    this.weather = weather;
    this.tasks = {watches, push, webhooks};
  }

  async status() {
    const row = await this.weather.statement('SELECT * FROM upkeep_status WHERE id=1').first();
    const now = this.weather.clock();
    let state = 'never';
    if (row?.lease_token) state = row.lease_until > now ? 'running' : 'interrupted';
    else if (row?.completed_at != null) state = now - row.completed_at > 4500 ? 'overdue' : row.outcome;
    // No account counts, destinations, error strings, or lease tokens are public.
    return {
      state,
      started_at: row?.started_at ?? null,
      completed_at: row?.completed_at ?? null,
      last_outcome: row?.outcome ?? null,
      phases: row?.phases ? JSON.parse(row.phases) : null,
      age_seconds: row?.completed_at != null ? Math.max(0, now - row.completed_at) : null,
    };
  }

  async run(alerts) {
    const now = this.weather.clock(), token = crypto.randomUUID();
    await this.weather.statement('INSERT INTO upkeep_status(id) VALUES(1) ON CONFLICT(id) DO NOTHING').run();
    const claimed = await this.weather.statement('UPDATE upkeep_status SET lease_token=?,lease_until=?,started_at=? WHERE id=1 AND lease_until<=? AND next_run<=? RETURNING id', token, now + 90, now, now, now).first();
    if (!claimed) return {claimed:false};
    const phases = {};
    const perform = async (name, task) => {
      try { await task(); phases[name] = 'finished'; }
      catch { phases[name] = 'failed'; }
    };
    await perform('watches', () => this.tasks.watches(alerts));
    // A failed watch pass must not prevent already queued deliveries being tried.
    await Promise.all(['push', 'webhooks'].map(name => perform(name, () => this.tasks[name]())));
    const completed = this.weather.clock();
    const outcome = Object.values(phases).includes('failed') ? 'partial' : 'finished';
    const saved = await this.weather.statement('UPDATE upkeep_status SET completed_at=?,outcome=?,phases=?,next_run=?,lease_token=NULL,lease_until=0 WHERE id=1 AND lease_token=? RETURNING id', completed, outcome, JSON.stringify(phases), completed + 60, token).first();
    return {claimed:true, recorded:!!saved};
  }
}

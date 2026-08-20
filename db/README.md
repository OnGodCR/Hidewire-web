# The waitlist table

**The SQL lives in the app repo**, at `supabase/migrations/0012_waitlist.sql`,
because that is where this database's migration history is. It was applied to
the live project on 2026-08-02 and `supabase migration list --linked` shows it.

One table, three columns:

```
waitlist_signups   id uuid, email text, created_at timestamptz
```

A unique index on `lower(email)` is what makes a second signup a conflict
rather than a second row, which is what lets the site say "already on the
list". Row-level security is on with **no policies**, so anon and authenticated
can do nothing at all: the only writer is the service role key held by
`functions/api/waitlist.js`, and the only reader is a human with the dashboard.

Counting signups:

```sql
select count(*) from waitlist_signups;
```

To change the table, add a migration in the app repo and push it. Do not run
DDL against the project by hand: the migration list is the record of what the
database is.

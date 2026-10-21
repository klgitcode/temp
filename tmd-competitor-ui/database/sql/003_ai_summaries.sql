create table if not exists ai_summaries (
    id uuid primary key default gen_random_uuid(),
    snapshot_date date not null,
    summary_type text not null default 'daily_market_summary',
    tmd_type text not null default 'New Fund',
    currency text not null default 'HKD',
    model_provider text not null default 'vertex_ai',
    model_name text not null,
    prompt_version text not null default 'v1',
    status text not null default 'generated',
    content_markdown text not null,
    input_payload jsonb not null default '{}'::jsonb,
    output_payload jsonb not null default '{}'::jsonb,
    generated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (snapshot_date, summary_type, tmd_type, currency)
);

alter table ai_summaries
    add column if not exists tmd_type text not null default 'New Fund';

alter table ai_summaries
    add column if not exists currency text not null default 'HKD';

alter table ai_summaries
    drop constraint if exists ai_summaries_snapshot_date_summary_type_key;

create unique index if not exists idx_ai_summaries_unique_classification
    on ai_summaries (snapshot_date, summary_type, tmd_type, currency);

create index if not exists idx_ai_summaries_snapshot_date
    on ai_summaries (snapshot_date desc);

create index if not exists idx_ai_summaries_classification_snapshot
    on ai_summaries (summary_type, tmd_type, currency, snapshot_date desc);

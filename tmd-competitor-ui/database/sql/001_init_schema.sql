create extension if not exists pgcrypto;

create table if not exists banks (
    id uuid primary key default gen_random_uuid(),
    bank_code text not null unique,
    bank_name_en text not null,
    official_domain text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists scrape_runs (
    id uuid primary key default gen_random_uuid(),
    run_date date not null,
    source_file_name text not null,
    source_file_path text,
    source_registry_path text,
    snapshot_date date not null,
    import_status text not null,
    record_count integer not null default 0,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    notes text,
    unique (snapshot_date, source_file_name)
);

create table if not exists rate_snapshots (
    id uuid primary key default gen_random_uuid(),
    scrape_run_id uuid not null references scrape_runs(id) on delete cascade,
    snapshot_date date not null,
    bank_id uuid not null references banks(id),
    bank_code text not null,
    bank_name_en text not null,
    tmd_type text not null,
    customer_segment text not null,
    currency text not null,
    tenor text not null,
    tenor_bucket text not null default '',
    min_amount numeric(18,2),
    interest_rate numeric(8,4) not null,
    channel text not null default '',
    special_qualifiers text not null default '',
    review_date date,
    notes text not null default '',
    deposit_page_url text not null default '',
    source_type text not null default '',
    parser_strategy text not null default '',
    status text not null default '',
    raw_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (
        snapshot_date,
        bank_code,
        tmd_type,
        customer_segment,
        currency,
        tenor,
        min_amount,
        interest_rate,
        channel,
        special_qualifiers
    )
);

create index if not exists idx_rate_snapshots_snapshot_date
    on rate_snapshots (snapshot_date desc);

create index if not exists idx_rate_snapshots_bank_snapshot
    on rate_snapshots (bank_code, snapshot_date desc);

create index if not exists idx_rate_snapshots_currency_tenor_snapshot
    on rate_snapshots (currency, tenor, snapshot_date desc);

create index if not exists idx_rate_snapshots_currency_tenor_bucket_snapshot
    on rate_snapshots (currency, tenor_bucket, snapshot_date desc);

create index if not exists idx_rate_snapshots_tmd_type_snapshot
    on rate_snapshots (tmd_type, snapshot_date desc);

create or replace view latest_snapshot_date as
select max(snapshot_date) as snapshot_date
from rate_snapshots;

create or replace view v_latest_rates as
select rs.*
from rate_snapshots rs
where rs.snapshot_date = (select snapshot_date from latest_snapshot_date);

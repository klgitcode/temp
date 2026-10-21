create table if not exists bid_rate_hkd (
    id uuid primary key default gen_random_uuid(),
    rate_date date not null,
    tenor text not null,
    bid_rate numeric(8,5) not null,
    source_url text not null default '',
    raw_payload jsonb not null default '{}'::jsonb,
    retrieved_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (rate_date, tenor)
);

create index if not exists idx_bid_rate_hkd_rate_date
    on bid_rate_hkd (rate_date desc);

alter table bid_rate_hkd
    drop column if exists published_time_hkt;

update bid_rate_hkd
set tenor = case tenor
    when '1 Week' then '1w'
    when '2 Weeks' then '2w'
    when '1 Month' then '1m'
    when '2 Months' then '2m'
    when '3 Months' then '3m'
    when '4 Months' then '4m'
    when '5 Months' then '5m'
    when '6 Months' then '6m'
    when '7 Months' then '7m'
    when '8 Months' then '8m'
    when '9 Months' then '9m'
    when '10 Months' then '10m'
    when '11 Months' then '11m'
    when '12 Months' then '12m'
    else tenor
end
where tenor in (
    '1 Week',
    '2 Weeks',
    '1 Month',
    '2 Months',
    '3 Months',
    '4 Months',
    '5 Months',
    '6 Months',
    '7 Months',
    '8 Months',
    '9 Months',
    '10 Months',
    '11 Months',
    '12 Months'
);

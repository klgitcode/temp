alter table rate_snapshots
    add column if not exists tenor_bucket text;

update rate_snapshots
set tenor_bucket = case
    when lower(tenor) ~ '^[0-9]+m$' then lower(tenor)
    when lower(tenor) ~ '^[0-9]+d$' and substring(lower(tenor) from '^[0-9]+')::numeric / 30 >= 1
        then greatest(1, floor(substring(lower(tenor) from '^[0-9]+')::numeric / 30 + 0.5)::integer)::text || 'm'
    when lower(tenor) ~ '^[0-9]+w$' and substring(lower(tenor) from '^[0-9]+')::numeric * 7 / 30 >= 1
        then greatest(1, floor(substring(lower(tenor) from '^[0-9]+')::numeric * 7 / 30 + 0.5)::integer)::text || 'm'
    else tenor
end
where tenor_bucket is null or tenor_bucket = '';

alter table rate_snapshots
    alter column tenor_bucket set default '';

alter table rate_snapshots
    alter column tenor_bucket set not null;

create index if not exists idx_rate_snapshots_currency_tenor_bucket_snapshot
    on rate_snapshots (currency, tenor_bucket, snapshot_date desc);

create materialized view if not exists mv_newfund_hkd as
with max_rates as (
    select
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code,
        max(interest_rate) as interest_rate
    from rate_snapshots
    -- cross join latest_snapshot_date l
    where tmd_type = 'New Fund'
      and currency = 'HKD'
      and tenor_bucket in ('3m', '6m', '12m')
      -- and snapshot_date between l.snapshot_date - interval '90 days' and l.snapshot_date
    group by
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code
),
best_rate_rows as (
    select
        rs.snapshot_date,
        rs.tmd_type,
        rs.currency,
        rs.tenor,
        rs.tenor_bucket,
        rs.bank_code,
        rs.bank_name_en,
        rs.interest_rate,
        rs.min_amount
    from rate_snapshots rs
    join max_rates mr
      on mr.snapshot_date = rs.snapshot_date
     and mr.tmd_type = rs.tmd_type
     and mr.currency = rs.currency
     and mr.tenor_bucket = rs.tenor_bucket
     and mr.bank_code = rs.bank_code
     and mr.interest_rate = rs.interest_rate
)
select
    snapshot_date,
    tmd_type,
    currency,
    (array_agg(tenor order by min_amount asc nulls last, tenor asc))[1] as tenor,
    tenor_bucket,
    bank_code,
    max(bank_name_en) as bank_name_en,
    interest_rate,
    min(min_amount) as min_amount,
    count(*) as source_record_count
from best_rate_rows
group by
    snapshot_date,
    tmd_type,
    currency,
    tenor_bucket,
    bank_code,
    interest_rate
with data;

create unique index if not exists idx_mv_newfund_hkd_unique
    on mv_newfund_hkd (
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code
    );

create index if not exists idx_mv_newfund_hkd_lookup
    on mv_newfund_hkd (
        tenor_bucket,
        snapshot_date desc
    );

create materialized view if not exists mv_newfund_usd as
with max_rates as (
    select
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code,
        max(interest_rate) as interest_rate
    from rate_snapshots
    -- cross join latest_snapshot_date l
    where tmd_type = 'New Fund'
      and currency = 'USD'
      and tenor_bucket in ('3m', '6m', '12m')
      -- and snapshot_date between l.snapshot_date - interval '90 days' and l.snapshot_date
    group by
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code
),
best_rate_rows as (
    select
        rs.snapshot_date,
        rs.tmd_type,
        rs.currency,
        rs.tenor,
        rs.tenor_bucket,
        rs.bank_code,
        rs.bank_name_en,
        rs.interest_rate,
        rs.min_amount
    from rate_snapshots rs
    join max_rates mr
      on mr.snapshot_date = rs.snapshot_date
     and mr.tmd_type = rs.tmd_type
     and mr.currency = rs.currency
     and mr.tenor_bucket = rs.tenor_bucket
     and mr.bank_code = rs.bank_code
     and mr.interest_rate = rs.interest_rate
)
select
    snapshot_date,
    tmd_type,
    currency,
    (array_agg(tenor order by min_amount asc nulls last, tenor asc))[1] as tenor,
    tenor_bucket,
    bank_code,
    max(bank_name_en) as bank_name_en,
    interest_rate,
    min(min_amount) as min_amount,
    count(*) as source_record_count
from best_rate_rows
group by
    snapshot_date,
    tmd_type,
    currency,
    tenor_bucket,
    bank_code,
    interest_rate
with data;

create unique index if not exists idx_mv_newfund_usd_unique
    on mv_newfund_usd (
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code
    );

create index if not exists idx_mv_newfund_usd_lookup
    on mv_newfund_usd (
        currency,
        tenor_bucket,
        snapshot_date desc
    );

create materialized view if not exists mv_newfund_cny as
with max_rates as (
    select
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code,
        max(interest_rate) as interest_rate
    from rate_snapshots
    -- cross join latest_snapshot_date l
    where tmd_type = 'New Fund'
      and currency = 'RMB'
      and tenor_bucket in ('3m', '6m', '12m')
      -- and snapshot_date between l.snapshot_date - interval '90 days' and l.snapshot_date
    group by
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code
),
best_rate_rows as (
    select
        rs.snapshot_date,
        rs.tmd_type,
        rs.currency,
        rs.tenor,
        rs.tenor_bucket,
        rs.bank_code,
        rs.bank_name_en,
        rs.interest_rate,
        rs.min_amount
    from rate_snapshots rs
    join max_rates mr
      on mr.snapshot_date = rs.snapshot_date
     and mr.tmd_type = rs.tmd_type
     and mr.currency = rs.currency
     and mr.tenor_bucket = rs.tenor_bucket
     and mr.bank_code = rs.bank_code
     and mr.interest_rate = rs.interest_rate
)
select
    snapshot_date,
    tmd_type,
    currency,
    (array_agg(tenor order by min_amount asc nulls last, tenor asc))[1] as tenor,
    tenor_bucket,
    bank_code,
    max(bank_name_en) as bank_name_en,
    interest_rate,
    min(min_amount) as min_amount,
    count(*) as source_record_count
from best_rate_rows
group by
    snapshot_date,
    tmd_type,
    currency,
    tenor_bucket,
    bank_code,
    interest_rate
with data;

create unique index if not exists idx_mv_newfund_cny_unique
    on mv_newfund_cny (
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code
    );

create index if not exists idx_mv_newfund_cny_lookup
    on mv_newfund_cny (
        currency,
        tenor_bucket,
        snapshot_date desc
    );

create materialized view if not exists mv_newfund_aud as
with max_rates as (
    select
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code,
        max(interest_rate) as interest_rate
    from rate_snapshots
    -- cross join latest_snapshot_date l
    where tmd_type = 'New Fund'
      and currency = 'AUD'
      and tenor_bucket in ('3m', '6m', '12m')
      -- and snapshot_date between l.snapshot_date - interval '90 days' and l.snapshot_date
    group by
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code
),
best_rate_rows as (
    select
        rs.snapshot_date,
        rs.tmd_type,
        rs.currency,
        rs.tenor,
        rs.tenor_bucket,
        rs.bank_code,
        rs.bank_name_en,
        rs.interest_rate,
        rs.min_amount
    from rate_snapshots rs
    join max_rates mr
      on mr.snapshot_date = rs.snapshot_date
     and mr.tmd_type = rs.tmd_type
     and mr.currency = rs.currency
     and mr.tenor_bucket = rs.tenor_bucket
     and mr.bank_code = rs.bank_code
     and mr.interest_rate = rs.interest_rate
)
select
    snapshot_date,
    tmd_type,
    currency,
    (array_agg(tenor order by min_amount asc nulls last, tenor asc))[1] as tenor,
    tenor_bucket,
    bank_code,
    max(bank_name_en) as bank_name_en,
    interest_rate,
    min(min_amount) as min_amount,
    count(*) as source_record_count
from best_rate_rows
group by
    snapshot_date,
    tmd_type,
    currency,
    tenor_bucket,
    bank_code,
    interest_rate
with data;

create unique index if not exists idx_mv_newfund_aud_unique
    on mv_newfund_aud (
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code
    );

create index if not exists idx_mv_newfund_aud_lookup
    on mv_newfund_aud (
        currency,
        tenor_bucket,
        snapshot_date desc
    );

create materialized view if not exists mv_fxtmd as
with max_rates as (
    select
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code,
        max(interest_rate) as interest_rate
    from rate_snapshots
    -- cross join latest_snapshot_date l
    where tmd_type = 'FX TMD'
      -- and snapshot_date between l.snapshot_date - interval '90 days' and l.snapshot_date
    group by
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code
),
best_rate_rows as (
    select
        rs.snapshot_date,
        rs.tmd_type,
        rs.currency,
        rs.tenor,
        rs.tenor_bucket,
        rs.bank_code,
        rs.bank_name_en,
        rs.interest_rate,
        rs.min_amount
    from rate_snapshots rs
    join max_rates mr
      on mr.snapshot_date = rs.snapshot_date
     and mr.tmd_type = rs.tmd_type
     and mr.currency = rs.currency
     and mr.tenor_bucket = rs.tenor_bucket
     and mr.bank_code = rs.bank_code
     and mr.interest_rate = rs.interest_rate
)
select
    snapshot_date,
    tmd_type,
    currency,
    (array_agg(tenor order by min_amount asc nulls last, tenor asc))[1] as tenor,
    tenor_bucket,
    bank_code,
    max(bank_name_en) as bank_name_en,
    interest_rate,
    min(min_amount) as min_amount,
    count(*) as source_record_count
from best_rate_rows
group by
    snapshot_date,
    tmd_type,
    currency,
    tenor_bucket,
    bank_code,
    interest_rate
with data;

create unique index if not exists idx_mv_fxtmd_unique
    on mv_fxtmd (
        snapshot_date,
        tmd_type,
        currency,
        tenor_bucket,
        bank_code
    );

create index if not exists idx_mv_fxtmd_lookup
    on mv_fxtmd (
        currency,
        tenor_bucket,
        snapshot_date desc
    );

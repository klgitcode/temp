alter table rate_snapshots
    drop constraint if exists rate_snapshots_snapshot_date_bank_code_tmd_type_customer_se_key;

alter table rate_snapshots
    drop constraint if exists rate_snapshots_business_key;

alter table rate_snapshots
    add constraint rate_snapshots_business_key
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
    );

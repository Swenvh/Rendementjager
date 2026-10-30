# Snapchat Ads: Targeting Lookups

## Phase 6: Targeting Lookups

`snapchat_ads_search_targeting(path=...)` — `path` is appended to `/targeting/`:

| What | `path` | Notes |
| --- | --- | --- |
| Countries | `geo/country` | |
| Regions / metros | `geo/{country_code}/region`, `geo/{country_code}/metro` | nested |
| Age / gender / languages | `demographics/age_group`, `demographics/gender`, `demographics/languages` | |
| Interests (Snap Lifestyle Categories) | `interests/scls` | **requires** `extra={"country_code": "us"}` |
| Interests (other taxonomies) | `interests/dlxs`, `interests/nln` | |
| Devices | `device/os_type`, `device/carrier`, `device/marketing_name` | |

```python
snapchat_ads_search_targeting(path="interests/scls", extra={"country_code": "us"})
```

## Audience segments (customer lists + lookalikes)

Segments are reusable audiences targeted via the ad squad's targeting spec. Build order: create the segment → add hashed members → (optionally) derive a lookalike → reference the segment id in `targeting`.

```python
# 1. Customer list (FIRST_PARTY)
snapchat_ads_create_segment(
    ad_account_id="<AD_ACCOUNT_ID>",
    name="Newsletter subscribers",
    retention_in_days=180,
)

# 2. Add members — ids must be ALREADY normalized + SHA-256 hashed.
#    Emails: trim + lowercase before hashing. One schema per call, ≤ 100k ids.
snapchat_ads_add_segment_users(
    segment_id="<SEGMENT_ID>",
    schema="EMAIL_SHA256",
    ids=["c3a75685...", "5b5fbfe6..."],
)

# 3. Lookalike from the seed list (retention ≤ 180 days)
snapchat_ads_create_segment(
    ad_account_id="<AD_ACCOUNT_ID>",
    name="Subscribers LAL — US",
    seed_segment_id="<SEGMENT_ID>",
    countries=["US"],
    lookalike_type="BALANCE",    # BALANCE (default) | SIMILARITY (closest) | REACH (broadest)
)

# 4. Target it in an ad squad
targeting = {
    "geos": [{"country_code": "us"}],
    "segments": [{"segment_id": ["<SEGMENT_ID>"]}],
}
```

Matching is **asynchronous** — the segment's `approximate_number_users` fills in after processing (`snapchat_ads_get_segment`). Remove members with `snapchat_ads_remove_segment_users` (same hashed format, or `all_users=true` to clear the list); `snapchat_ads_delete_segment` permanently removes the segment and its data.

## Audience insights

`snapchat_ads_get_audience_insights` compares a target audience against a reference baseline — size ranges plus demographic / interest / device breakdowns with `target_index_to_reference` metrics (e.g. "this audience over-indexes 2.3× on sports"):

```python
snapchat_ads_get_audience_insights(
    ad_account_id="<AD_ACCOUNT_ID>",
    targeting_spec={"interests": [{"category_id": ["SLC_37"]}], "geos": [{"country_code": "us"}]},
    base_spec={"geos": [{"country_code": "us"}]},     # reference: everyone in the US
)
```

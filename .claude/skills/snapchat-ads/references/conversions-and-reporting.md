# Snapchat Ads: Conversion Tracking, Reporting & Updates

## Phase 5: Conversion Tracking

For `PIXEL_*` / `APP_*` goals, discover the pixel and its custom conversions, then use the conversion id as a stats metric:

```python
snapchat_ads_list_pixels(ad_account_id="<AD_ACCOUNT_ID>")
snapchat_ads_list_custom_conversions(pixel_id="<PIXEL_ID>")     # or mobile_app_id="<APP_ID>"
```

Each custom conversion `id` is prefixed `conversion_` and can be passed in the `fields` of a stats call (e.g. `conversion_0029904941`).

## Phase 7: Reporting

### Synchronous stats

```python
# Account level — SPEND ONLY
snapchat_ads_get_stats(
    entity_type="adaccounts", entity_id="<AD_ACCOUNT_ID>",
    fields="spend", granularity="DAY",
    start_time="2026-06-01T00:00:00-07:00", end_time="2026-06-30T00:00:00-07:00",
)

# Campaign / ad squad / ad — full metrics
snapchat_ads_get_stats(
    entity_type="campaigns", entity_id="<CAMPAIGN_ID>",
    fields="impressions,swipes,spend,video_views,conversion_purchases",
    granularity="DAY",
    start_time="2026-06-01", end_time="2026-06-30",
    ad_account_id="<AD_ACCOUNT_ID>",   # lets the tool align DAY/HOUR to the account timezone
    breakdown="adsquad",
)
```

- **`spend` is micro-currency** — divide by 1,000,000 for dollars.
- `granularity`: `TOTAL`, `DAY`, `HOUR`, `LIFETIME`. For **DAY/HOUR**, pass `ad_account_id` (or `account_timezone`) and the tool auto-aligns `start_time`/`end_time` to the account-timezone midnight / hour boundaries Snapchat requires — no manual UTC math. At the adaccounts level the timezone is resolved automatically.
- `breakdown`: `campaign`/`adsquad`/`ad`. `report_dimension`: `country`, `region`, `dma`, `age`, `gender`, `os`, `make`, `lifestyle_category`.
- Stats finalize ~48h after the day ends in the account timezone — recent numbers can be partial.

### Asynchronous reports (large pulls / CSV export / reach overlap)

```python
snapchat_ads_create_stats_report(
    entity_type="campaigns", entity_id="<CAMPAIGN_ID>",
    fields="impressions,spend", granularity="DAY",
    start_time="2026-01-01T00:00:00-08:00", end_time="2026-06-30T00:00:00-07:00",
    async_format="csv",
)
# poll until report_run_status == COMPLETED, then read .result (signed download URL)
snapchat_ads_get_stats_report(
    entity_type="campaigns", entity_id="<CAMPAIGN_ID>", report_run_id="<REPORT_RUN_ID>",
)
```

For reach & frequency overlap (same ad account only): `overlap=True`, `overlap_type="campaign"`, `ids="<id1>,<id2>"`.

## Update & Delete

Updates are partial (JSON Patch) — send only what changes, with the correct parent id:

```python
snapchat_ads_update_campaign(ad_account_id="<AD_ACCOUNT_ID>", campaign_id="<ID>", status="ACTIVE")
snapchat_ads_update_ad_squad(campaign_id="<CAMPAIGN_ID>", ad_squad_id="<ID>", daily_budget_micro=30000000)
snapchat_ads_update_ad(ad_squad_id="<AD_SQUAD_ID>", ad_id="<ID>", status="PAUSED")
```

Deletes are permanent: `snapchat_ads_delete_campaign`, `snapchat_ads_delete_ad_squad`, `snapchat_ads_delete_ad`.

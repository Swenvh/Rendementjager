# Reddit Ads: Conversion Tracking, Reporting & Updates

## Phase 6: Conversion Tracking (Pixel + Conversions API)

For `CONVERSIONS` goals, discover the pixel and (optionally) send server-side events:

```python
reddit_ads_list_pixels(ad_account_id="<AD_ACCOUNT_ID>")     # get conversion_pixel_id
reddit_ads_get_pixel_last_fired_at(pixel_id="<PIXEL_ID>")   # verify tracking is live

# Conversions API — send server-side events
reddit_ads_post_conversion_events(
    pixel_id="<PIXEL_ID>",
    events=[{ ... }],          # event objects per Reddit's CAPI schema (type, timestamp, hashed user data)
    test_id="<TEST_ID>",       # optional: validate without counting
)
```

**App-install signal (app-promotion campaigns).** For `APP_INSTALLS` campaigns, verify the MMP conversion signal the way you'd check a pixel: `reddit_ads_get_app_last_fired_at_report(app_id="<APP_ID>")` returns when each App Install event type (install, purchase, sign-up, …) last fired. A `null` means that event has never fired — a red flag before or after launch. Discover apps with `reddit_ads_list_apps(ad_account_id="<AD_ACCOUNT_ID>")`.

## Phase 8: Reporting

```python
reddit_ads_get_report(
    ad_account_id="<AD_ACCOUNT_ID>",
    fields=["spend", "impressions", "clicks", "conversions"],
    starts_at="2026-06-01",
    ends_at="2026-06-30",
    breakdowns=["campaign_id"],          # e.g. campaign_id / ad_group_id / date
    time_zone_id="America/Los_Angeles",  # optional
)
```

- **`spend` is micro-currency** — divide by 1,000,000 for dollars.
- `fields`, `starts_at`, and `ends_at` are required; `breakdowns` group the rows.
- Pass additional report request fields via `input_data`.

## Update & Delete

Updates are partial — send only the fields that change:

```python
reddit_ads_update_campaign(campaign_id="<ID>", configured_status="ACTIVE")
reddit_ads_update_ad_group(ad_group_id="<ID>", goal_value=30000000)
reddit_ads_update_ad(ad_id="<ID>", configured_status="PAUSED")
```

Posts are the exception — they're **immutable** except for comments. `reddit_ads_update_post(post_id="<ID>", allow_comments=False)` toggles comments only (pass `is_structured_post=True` for a structured post); to change creative, create a new structured post.

Delete honors Reddit's archive-then-delete rule — `reddit_ads_delete_campaign` / `_delete_ad_group` / `_delete_ad` archive the entity if it isn't yet hard-deletable (ARCHIVED for 3+ hours), and permanently delete once eligible. Inspect the returned `configured_status` to see which happened, and tell the user when a hard delete will be possible.

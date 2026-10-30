# OpenAI Ads: Insights, Status Flow, Cache & Health

## Insights

Insights endpoints are server-aggregated. Use current API query names:

- `time_granularity`: `"hourly"`, `"daily"`, `"monthly"`, `"none"`.
- `aggregation_level`: `"ad_account" | "campaign" | "ad_group" | "ad"`.
- `time_ranges`: JSON objects such as `{"type":"date_range","since":"2026-05-01","until":"2026-05-07"}`. The toolkit also accepts legacy `"YYYY-MM-DD..YYYY-MM-DD"` strings and converts them.
- `fields`: dot-style fields, e.g. `["metadata.readable_time", "campaign.id", "campaign.name", "campaign.spend"]`.
- `filters`: JSON objects such as `{"field":"campaign.id","operator":"IN","value":["cmp_xxx"]}`.
- `sort`: JSON objects such as `{"field":"campaign.spend","direction":"desc"}`.
- `segments`: optional `product`, `country`, or `device`.
- `includes`: optional `zero_impression_items` or `zero_impression_products`.

```text
openai_ads_account_insights_get(
    time_granularity="daily",
    aggregation_level="campaign",
    time_ranges=[
        {"type": "date_range", "since": "2026-05-01", "until": "2026-05-07"}
    ],
    fields=[
        "metadata.readable_time",
        "campaign.id",
        "campaign.name",
        "campaign.clicks",
        "campaign.impressions",
        "campaign.spend",
    ],
    sort=[{"field": "campaign.spend", "direction": "desc"}],
)
```

For a single campaign use `openai_ads_campaign_insights_get(campaign_id=...)`;
similar for ad groups and ads.

For conversion totals:

```text
openai_ads_get_conversion_insights(
    aggregation_level="campaign",
    time_ranges=[
        {"type": "date_range", "since": "2026-05-01", "until": "2026-05-07"}
    ],
    entity_ids=["cmp_123"],
)
```

## Status Flow

`paused` <-> `active` -> `archived` (irreversible) at campaign, ad group,
ad, and custom audience level. Account-level tools support activate and pause.
Use the dedicated tools for status changes.

Ads also have:

- `review_status="in_review"`: not delivering yet.
- `review_status="approved"`: eligible to deliver.
- `review_status="rejected"`: needs a new creative.

## Cache Snapshot

The connect-time context builder writes a snapshot of the account into
`integration.toolkit_settings["openai_ads_cache"]`. Use:

- `openai_ads_caches_get()` for cheap read-only access.
- `openai_ads_caches_refresh()` to refresh account, campaigns, ad groups, ads, and insights.

Refresh sparingly: once per session is plenty unless something feels stale.

## Pagination

All list endpoints use cursor pagination:

- `limit` (default 20, max 500).
- `after` / `before`: pass the previous response's `last_id` / `first_id`.
- `order`: `"asc"` | `"desc"`.

Responses include `has_more`. Keep paging only when true and only when you
actually need everything.

## Health Check

After connecting, run `openai_ads_health_check()`.

If `connected=false`, the API key is missing, invalid, or expired. Tell the
user to regenerate it from the Ads Manager Settings API area.

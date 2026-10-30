# Performance Max campaigns (granular build)

> **CRITICAL**: Present the full plan and get explicit user approval before the first mutate ([discovery.md](../discovery.md) must be complete and the summary approved). PMax campaigns MUST be created **PAUSED** — they need at least one asset group before they can serve, and the create tool enforces this.

## Build order

1. **Budget** — `google_ads_campaign_budgets_create(customer_id, body={"name": "...", "amount_micros": 50000000})`. PMax budgets must not be shared.
2. **Campaign** — `google_ads_campaigns_create(customer_id, body={...})`:

```json
{
  "name": "PMax Campaign",
  "advertising_channel_type": "PERFORMANCE_MAX",
  "status": "PAUSED",
  "campaign_budget": "customers/1234567890/campaignBudgets/111",
  "maximize_conversions": {}
}
```

   Do NOT set `network_settings` or manual bidding — PMax serves across all networks automatically and only accepts `maximize_conversions` / `maximize_conversion_value` (optionally with `target_cpa` / `target_roas` inside the scheme). The validator rejects anything else.
3. **Locations** — `google_ads_locations_search` → `google_ads_location_targets_add`.
4. **Image assets** — `google_ads_image_assets_upload` (prefer `file_id` from the workspace file manager). Required ratios: landscape 1.91:1, square 1:1, logo 1:1 (or 4:1).
5. **Asset group** — `google_ads_asset_groups_create` (atomic: creates the asset group, its text assets, and all links in ONE API call, which the API requires):

   Required: `customer_id`, `campaign_id`, `final_urls`, `headlines` (3–15, ≤30 chars), `long_headlines` (1+, ≤90), `descriptions` (2+, ≤90), `business_name`, and all three image asset ID lists (`marketing_image_asset_ids`, `square_marketing_image_asset_ids`, `logo_asset_ids`).
6. **Optional video** — register a YouTube video with `google_ads_video_assets_link(customer_id, youtube_video_id)`, then link it to the asset group with `google_ads_asset_group_assets_link(field_type="YOUTUBE_VIDEO")`. Without one, Google auto-generates video from your assets.

## Standalone PMax asset group (existing campaign)

`google_ads_asset_groups_create` also adds asset groups to existing PMax campaigns — same required fields as step 5.

## Campaign dates (API v24)

Optional `start_date` / `end_date` use `YYYY-MM-DD`. The backend encodes them to v24 wire fields `startDateTime` / `endDateTime`. Omit both to let Google set schedule defaults.

## Verify, then activate

Confirm by GAQL (campaign + asset_group + asset_group_asset), present to the user, and only set `status: "ENABLED"` via `google_ads_campaigns_update` after explicit approval.

Re-check [constraints.md](../constraints.md) at each creation step.

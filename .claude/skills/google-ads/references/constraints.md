# Constraints and rules

Re-check this file at each creation step.

## Blueprint Features

| Feature | Details |
| --- | --- |
| **Smart defaults** | Budget name, start date, network settings, ad group type auto-filled. |
| **Location resolution** | Pass `location_names` (human-readable) instead of IDs. |
| **Client-side validation** | Char limits, match types, image ratios checked before any API call. |
| **Batch operations** | Keywords, extensions, ad schedules batched for efficiency. |
| **Cleanup on failure** | Entire campaign removed if any step fails after campaign creation. |
| **Ad extensions** | Sitelinks, callouts, structured snippets — created and linked automatically. |
| **Ad scheduling** | Day-parting at campaign level via `ad_schedules`. |
| **Audiences** | Target or exclude audiences per ad group. |
| **Conversion actions** | Link specific conversion actions via `conversion_action_ids`. |

## Bidding Strategies

| Strategy | Fields | Notes |
| --- | --- | --- |
| `MANUAL_CPC` | — | Manual cost-per-click. |
| `MAXIMIZE_CLICKS` | — | Default, good starting point. |
| `MAXIMIZE_CONVERSIONS` | `target_cpa_micros` (optional) | Requires conversion tracking. |
| `MAXIMIZE_CONVERSION_VALUE` | `target_roas` (optional) | Requires conversion values. |
| `TARGET_CPA` | `target_cpa_micros` (required) | Sets a target cost per acquisition. |
| `TARGET_ROAS` | `target_roas` (required) | Sets a target return on ad spend. |

> For PMax: `TARGET_CPA` and `TARGET_ROAS` are translated to constraints within `MAXIMIZE_CONVERSIONS` / `MAXIMIZE_CONVERSION_VALUE`.

## Technical Rules

- Budget in micros: $50 → 50,000,000.
- Create PAUSED; activate only after approval.
- Location resolution: `google_ads_locations_search` to resolve names, then `google_ads_location_targets_add`.
- RSA limits: headlines ≤30 chars (min 3), descriptions ≤90 chars (min 2).
- Creative source: only from the actual site; no generic claims.
- Image assets must already exist in the account (use `google_ads_assets_list` to find them).

## Critical Safety Rules

**Never:**
- Assume URL/budget/location IDs.
- Skip research.
- Invent keywords/copy.
- Apply rigid "best practices" without context.
- Build without buy-in.
- Skip the preview step before creation.
- Join `ad_group_criterion` with `search_term_view` in GAQL.
- Query more than 5 accounts in a single batch.

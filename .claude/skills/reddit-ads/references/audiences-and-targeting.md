# Reddit Ads: Audiences & Targeting Lookups

## Phase 5: Audiences

- **Custom audiences** — customer lists, retargeting, lookalikes.
- **Saved audiences** — reusable targeting definitions.

```python
# Customer list: create, then upload hashed members
reddit_ads_create_custom_audience(ad_account_id="<AD_ACCOUNT_ID>", name="CRM list", type="CUSTOMER_LIST")
reddit_ads_update_custom_audience_users(
    audience_id="<AUDIENCE_ID>",
    action_type="ADD",                 # ADD or REMOVE
    column_order=["EMAIL"],
    user_data=[["<sha256_hashed_email>"], ...],   # hash values as Reddit requires
)

# Saved audience from a targeting block
reddit_ads_create_saved_audience(
    ad_account_id="<AD_ACCOUNT_ID>", name="Fitness US", type="<TYPE>",
    targeting={"communities": ["<COMMUNITY_ID>"]},
)
```

Reference a saved/custom audience in an ad group's `targeting` (e.g. via `saved_audience_id` or the audience facet in `input_data`).

## Phase 7: Targeting Lookups

`reddit_ads_search_targeting(dimension=...)` — pass only the params relevant to the dimension:

| What | `dimension` | Params |
| --- | --- | --- |
| Search subreddits | `communities/search` | `query` |
| Subreddits by name | `communities` | `names` |
| Subreddit suggestions | `communities/suggestions` | `names` or `website_url` |
| Interests | `interests` | — |
| Geolocations | `geolocations` | `country` / `cities_search` / `postal_code` |
| Devices / languages / carriers | `devices` / `languages` / `carriers` | — |
| 3rd-party audiences | `third_party_audiences` | — |
| Time zones / industries | `time_zones` / `industries` | — |

```python
reddit_ads_search_targeting(dimension="communities/search", query="fitness")
reddit_ads_search_targeting(dimension="geolocations", country="US")
```

Validate before building: `reddit_ads_suggest_keywords(seed_keywords=[...])`, `reddit_ads_validate_keywords(keywords=[...])`, `reddit_ads_validate_geolocations(geolocation_ids=[...])`.

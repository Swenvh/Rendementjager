# Reddit Ads: Discovery & Account Assessment

## Phase 1: Business & Account Discovery

Reddit nests ad accounts under businesses. Start here:

```python
reddit_ads_get_me()
reddit_ads_list_businesses()
```

- For each business, list its ad accounts: `reddit_ads_list_ad_accounts(business_id="<BUSINESS_ID>")`.
- If multiple businesses / accounts: ask the user to select one.
- If single: inform the user and proceed.
- Note the `ad_account_id` (often prefixed `t2_` or `a2_`) — it's required for most calls.

## Phase 2: Account Assessment

Run in parallel to understand the account state:

```python
reddit_ads_list_campaigns(ad_account_id="<AD_ACCOUNT_ID>")
reddit_ads_list_ad_groups(ad_account_id="<AD_ACCOUNT_ID>")
reddit_ads_list_ads(ad_account_id="<AD_ACCOUNT_ID>")
reddit_ads_list_funding_instruments(ad_account_id="<AD_ACCOUNT_ID>")
reddit_ads_list_pixels(ad_account_id="<AD_ACCOUNT_ID>")
reddit_ads_list_profiles(ad_account_id="<AD_ACCOUNT_ID>")
```

Then confirm: objective, daily/lifetime budget (convert dollars → micros), targeting (communities/interests/geo/devices), the post to promote, and — for conversion goals — that a pixel exists. Optionally call `reddit_ads_get_feature_access(ad_account_id=...)` to confirm which capabilities (e.g. CBO) the account supports.

**Optional: who changed what.** `reddit_ads_get_account_history(ad_account_id="<AD_ACCOUNT_ID>")` returns the account changelog (status, budget, bid, targeting, and entity edits — including changes made outside Hyper), each entry pairing who made the change with what changed. Filter with `start_time` / `end_time` (ISO 8601), `member_ids`, `change_types` (`STATUS`, `BUDGET`, `BID`, `TARGETING`, `CAMPAIGN`, `AD_GROUP`, `AD`, `AUDIENCE`, `AD_ACCOUNT`), or `entity_id_filters`.

## Optional: reach forecast before launch

`reddit_ads_get_reach_forecast` returns a 10-point curve of estimated human reach at increasing impression volumes for a demographic target — useful to size an audience before building anything. `duration_days` is `7` or `28`; `geolocation` is `US`, `CA`, or `GB`; optional `min_age` (default 18), `max_age` (default 99), `gender` (`MALE`/`FEMALE`/`ALL`).

```python
reddit_ads_get_reach_forecast(duration_days=7, geolocation="US", min_age=25, max_age=54)
```

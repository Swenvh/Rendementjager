# Snapchat Ads: Discovery & Account Assessment

## Phase 1: Org & Account Discovery

Snapchat nests ad accounts under organizations. Start here:

```python
snapchat_ads_list_organizations(with_ad_accounts=True)
```

- If multiple organizations / accounts: ask the user to select one.
- If single: inform the user and proceed.
- Note the `ad_account_id` (and `organization_id`) — `ad_account_id` is required for most calls.

List accounts for a specific org explicitly with `snapchat_ads_list_ad_accounts(organization_id="<ORG_ID>")`.

## Phase 2: Account Assessment

Run in parallel to understand the account state:

```python
snapchat_ads_list_campaigns(ad_account_id="<AD_ACCOUNT_ID>")
snapchat_ads_list_ad_squads(ad_account_id="<AD_ACCOUNT_ID>")
snapchat_ads_list_ads(ad_account_id="<AD_ACCOUNT_ID>")
snapchat_ads_list_media(ad_account_id="<AD_ACCOUNT_ID>")
snapchat_ads_list_pixels(ad_account_id="<AD_ACCOUNT_ID>")
```

Then confirm: objective, daily/lifetime budget (convert dollars → micros), audience (geo/age/gender/interests/devices), creative assets + destination URL, and — for conversion goals — that a pixel/custom conversion exists.

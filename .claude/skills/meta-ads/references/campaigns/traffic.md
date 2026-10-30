# Traffic Campaign Workflow (OUTCOME_TRAFFIC)

## When to use

Use for campaigns that send users to a website, landing page, or specific content destination. No conversion tracking required. Good for top-of-funnel content promotion, event pages, or when a pixel is not yet installed.

## Before starting

Re-read [../constraints.md](../constraints.md). Most relevant:
- Budget in cents (×100)
- `targeting_automation` inside `targeting`
- Budget at campaign level for Advantage+
- `meta_ads_adset_create` takes `ad_account_id` (numeric, no `act_` prefix) + a `body` dict — all ad set fields inside `body`
- `meta_ads_ad_create` takes `ad_account_id` + a `body` dict — no separate top-level args
- Use `meta_ads_campaigns_activate()`, not `update_campaign(status="ACTIVE")`

`promoted_object` is **not required** for OUTCOME_TRAFFIC. No pixel needed.

---

## Required inputs

| Input | How to get it |
|---|---|
| Ad account ID | Discovery step 1 |
| Facebook Page ID | Discovery step 2 (`meta_ads_owned_pages_list`) |
| Destination URL | Ask the user |
| Budget amount + currency | Ask the user |
| Daily or lifetime | Ask; lifetime needs start + end dates |
| CTA type | Choose from table below |
| Ad creative (image_hash) | Upload via `meta_ads_ad_images_upload` |

---

## CTA selection

| Destination | Recommended CTA |
|---|---|
| Blog post / article | `LEARN_MORE` |
| Product or collection page | `SHOP_NOW` |
| Event or sign-up page | `SIGN_UP` |
| Resource / download | `DOWNLOAD` |
| Booking / appointment page | `BOOK_NOW` |
| Promotional offer | `GET_OFFER` |
| Contact page | `CONTACT_US` |

---

## Step-by-step creation (default)

### Pre-build checklist

- [ ] Budget confirmed and converted to cents
- [ ] Page ID captured explicitly from discovery
- [ ] Destination URL confirmed
- [ ] CTA selected
- [ ] Creative assets ready or will generate from site

### 1. Create campaign

```python
meta_ads_campaign_create(
    ad_account_id="123456789",
    body={
        "name": "Traffic - [Business] - [Date]",
        "objective": "OUTCOME_TRAFFIC",
        "status": "PAUSED",
        "daily_budget": 2000    # $20/day in cents — Advantage+ only; omit for manual
    }
)
```

→ Capture `campaign_id` from the response.

### 2. Create ad set

> `meta_ads_adset_create` takes `ad_account_id` (numeric, no `act_` prefix) plus a `body` dict. Every ad set field goes inside `body`.

**Advantage+ (default):**

```json
{
  "ad_account_id": "123456789",
  "body": {
    "name": "US Broad - Website Traffic",
    "campaign_id": "<campaign_id>",
    "optimization_goal": "LINK_CLICKS",
    "billing_event": "IMPRESSIONS",
    "targeting": {
      "geo_locations": {
        "countries": [
          "US"
        ]
      },
      "targeting_automation": {
        "advantage_audience": 1
      }
    }
  }
}
```

> No `promoted_object` needed for OUTCOME_TRAFFIC.

**Manual (only when user explicitly requests):**

```json
{
  "ad_account_id": "123456789",
  "body": {
    "name": "US Adults 25-44",
    "campaign_id": "<campaign_id>",
    "optimization_goal": "LINK_CLICKS",
    "billing_event": "IMPRESSIONS",
    "daily_budget": 2000,
    "targeting": {
      "geo_locations": {
        "countries": [
          "US"
        ]
      },
      "age_min": 25,
      "age_max": 44
    }
  }
}
```

> **Bid cap requested?** Pass `bid_strategy` and `bid_amount` (cents) inside `body` — the toolkit validates the pairing up front. See [../constraints.md](../constraints.md) section 16.

> **Targeting regions / cities / DMAs (not whole countries)?** Resolve the numeric geo keys with `meta_ads_targeting_search` first — never hand-write them. See [../constraints.md](../constraints.md) section 17.

→ Capture `adset_id` from the response.

### 3. Upload image

```python
meta_ads_ad_images_upload(
    account_id="act_123456789",
    image_url="<public_image_url>"
)
```

→ Capture `image_hash` from the response.

### 4. Create ad

> **CRITICAL**: `meta_ads_ad_create` takes `ad_account_id` plus a single `body` dict. No separate top-level args.

```json
{
  "ad_account_id": "123456789",
  "body": {
    "name": "Traffic Ad - [Page Name]",
    "adset_id": "<adset_id>",
    "creative": {
      "object_story_spec": {
        "page_id": "<page_id>",
        "link_data": {
          "link": "https://example.com/page",
          "image_hash": "<image_hash>",
          "call_to_action": {
            "type": "LEARN_MORE"
          },
          "message": "<primary_text>",
          "name": "<headline>",
          "description": "<description>"
        }
      }
    }
  }
}
```

> Omit `status` — ads default to PAUSED.

→ Capture `ad_id` from the response.

### 5. Preview and activate

```python
# creative_id is in the ad creation response: response.creative.id
meta_ads_ad_previews_get(creative_ids=["<creative_id>"])
# Summarize formats to user — never render iframe inline

meta_ads_campaigns_activate(campaign_id="<campaign_id>")
# Only when user explicitly approves
```

---

## Common failure points

| Symptom | Cause | Fix |
|---|---|---|
| Budget rejected | Passed dollars not cents | Multiply by 100 |
| Ad set error: unexpected argument | Fields outside `body` | All fields must be inside the `body` dict |
| Campaign ACTIVE but no traffic | Used `update_campaign(status="ACTIVE")` | Use `meta_ads_campaigns_activate()` |
| `targeting_automation` error | Placed at top level of ad set | Move inside `targeting` object |

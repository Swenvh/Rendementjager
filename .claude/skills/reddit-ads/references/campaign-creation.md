# Reddit Ads: Campaign Structure & Creation

Read [discovery.md](discovery.md) first — account selection and assessment must be complete.

## Phase 3: Campaign Structure

### Hierarchy

```
Business
└── Ad Account ── Funding Instruments ── Pixels ── Profiles (── Posts, Creative Assets)
    └── Campaign (objective, funding, optional CBO budget)
        └── Ad Group (targeting, bid, budget, optimization, conversion_pixel_id)
            └── Ad (promotes a Post via post_id)
```

### Build order

1. **Resolve targeting IDs** with `reddit_ads_search_targeting` (subreddits, interests, geo, etc.)
2. **Campaign** (`configured_status="PAUSED"`, objective, `funding_instrument_id`)
3. **Ad group** under the campaign (targeting, bid, budget; `conversion_pixel_id` for conversion goals)
4. **Post**: find one via `reddit_ads_list_posts`, or create one with `reddit_ads_create_post`
5. **Ad** under the ad group, linking the `post_id`

### Campaign objectives

| `objective` | Use case |
| --- | --- |
| `CLICKS` | Traffic to a destination URL |
| `CONVERSIONS` | Purchases / signups / leads (requires a pixel) |
| `IMPRESSIONS` | Reach / awareness |
| `VIDEO_VIEWABLE_IMPRESSIONS` | Video views |
| `APP_INSTALLS` | App installs (requires an app) |
| `CATALOG_SALES` | Dynamic product ads (requires a catalog) |
| `LEAD_GENERATION` | On-Reddit lead forms (build the form in Ads Manager) |

## Phase 4: Campaign Creation

### 1. Create campaign

```python
reddit_ads_create_campaign(
    ad_account_id="<AD_ACCOUNT_ID>",
    name="Spring Launch 2026",
    objective="CLICKS",
    configured_status="PAUSED",
    funding_instrument_id="<FUNDING_INSTRUMENT_ID>",
    # NOTE: do NOT pass start_time here on a non-CBO campaign — it's rejected.
    # Set start_time on the ad group instead (it's CBO-only at the campaign level).
)
```

**Campaign Budget Optimization (CBO):** set `is_campaign_budget_optimization=True` with `goal_type` (`DAILY_SPEND` or `LIFETIME_SPEND`) and `goal_value` (micro-currency). With CBO, the budget lives on the campaign; without it, set the budget on each ad group.

```python
reddit_ads_create_campaign(
    ad_account_id="<AD_ACCOUNT_ID>", name="CBO Test", objective="CONVERSIONS",
    configured_status="PAUSED", funding_instrument_id="<FUNDING_INSTRUMENT_ID>",
    is_campaign_budget_optimization=True, goal_type="DAILY_SPEND", goal_value=50000000,  # $50/day
    conversion_pixel_id="<PIXEL_ID>",
)
```

### 2. Create ad group

Resolve targeting IDs first, then pass the `targeting` block. `bid_type` is `CPC`/`CPM`/`CPV`/`CPV6`; `bid_strategy` is `BIDLESS`/`MANUAL_BIDDING`/`MAXIMIZE_VOLUME`/`TARGET_CPX`. For non-CBO campaigns, set `goal_type` + `goal_value` (the ad group's budget).

```python
reddit_ads_create_ad_group(
    ad_account_id="<AD_ACCOUNT_ID>",
    campaign_id="<CAMPAIGN_ID>",
    name="US — marketing/SaaS subreddits",
    configured_status="PAUSED",
    bid_type="CPC",
    bid_strategy="MANUAL_BIDDING",
    bid_value=600000,                    # $0.60 CPC — REQUIRED for CPC/CPM/CPV/CPV6 (even with MAXIMIZE_VOLUME)
    goal_type="DAILY_SPEND",
    goal_value=20000000,                 # $20/day (omit if the campaign uses CBO)
    start_time="2026-07-01T00:00:00Z",   # REQUIRED on ad groups (ISO 8601)
    conversion_pixel_id="<PIXEL_ID>",    # required for CONVERSIONS / from 2026-07-13
    targeting={
        "geolocations": ["US"],                                # country codes; validate with validate_geolocations
        "communities": ["marketing", "SaaS", "Entrepreneur"],  # subreddit NAMES, NOT the t5_ IDs from search
        "interests": ["<INTEREST_ID>"],                        # interest IDs from search_targeting dimension=interests
    },
)
```

> Pass anything not exposed as a named parameter (extra targeting facets, schedule, etc.) via `input_data` — it's merged into the request body. `start_time` *is* a named param here, but it's easy to miss that it's **required**.

> **For a CONVERSIONS campaign**, the ad group also needs `optimization_goal="CLICKS"` (the only value accepted for non-CBO CONVERSIONS — see the critical rule above) and a `conversion_pixel_id`. Everything else is the same.

#### Optional: bid suggestion before launch

```python
reddit_ads_generate_bid_suggestion(
    ad_account_id="<AD_ACCOUNT_ID>",
    campaign_objective="CLICKS",
    bid_type="CPC",
    # duration is an ISO 8601 start/end range — NOT {"days": N}
    duration={"start_time": "2026-07-01T00:00:00Z", "end_time": "2026-07-08T00:00:00Z"},
    targeting={"geolocations": ["US"]},
)
```

### 3. Find or create a post to promote

`reddit_ads_list_profiles(ad_account_id=...)` finds the profiles whose posts you can promote. Reuse an existing post when possible:

```python
reddit_ads_list_posts(profile_id="<PROFILE_ID>")
reddit_ads_list_structured_posts(profile_id="<PROFILE_ID>")   # posts made via the structured-post API
```

**Post types:** `IMAGE`, `VIDEO`, `CAROUSEL`, `TEXT` (NOT `LINK`). For an ad with a destination — and for **any CONVERSIONS campaign** — you must use `IMAGE`/`VIDEO`/`CAROUSEL`; **`TEXT` posts are free-form and rejected in CONVERSIONS ads**.

#### Recommended: create a post from media by URL (`reddit_ads_create_structured_post`)

Use `reddit_ads_create_structured_post` when you have a fresh image/video (e.g. from `ad-creative-generation`) and **no pre-uploaded Reddit asset**. You pass the media as a URL and **Reddit downloads and re-hosts it** — no separate upload step. Creation is an **async job**: the tool submits it, polls up to `wait_seconds` (default 45), and returns the job. On `status="SUCCESS"` the job carries the new **`post_id`** — use it on the ad. If it's still `QUEUED`/`PROCESSING`, poll `reddit_ads_get_structured_post_job(post_creation_job_id=...)`; on `CLIENT_ERROR`/`SERVER_ERROR` read `error_message`.

```python
# IMAGE — needs media_url + destination_url
job = reddit_ads_create_structured_post(
    profile_id="<PROFILE_ID>",
    type="IMAGE",
    headline="Stop juggling 30 marketing tools — Hyper AI does it all.",
    media_url="https://cdn.example.com/creative.png",   # Reddit fetches + re-hosts this
    destination_url="https://example.com/spring",
    display_url="example.com",                            # must match the destination domain
    call_to_action="Sign Up",                            # display label, NOT "SIGN_UP"
)
# job.status == "SUCCESS" -> job.post_id is the ad's post_id

# VIDEO — also needs thumbnail_url (an image URL)
reddit_ads_create_structured_post(
    profile_id="<PROFILE_ID>", type="VIDEO", headline="See Hyper in 30 seconds",
    media_url="https://cdn.example.com/promo.mp4",
    thumbnail_url="https://cdn.example.com/promo-thumb.png",
    destination_url="https://example.com", call_to_action="Watch Now",
)

# CAROUSEL — 1–6 cards, each with its own destination + CTA
reddit_ads_create_structured_post(
    profile_id="<PROFILE_ID>", type="CAROUSEL", headline="Three ways Hyper helps",
    carousel=[
        {"image_url": "https://cdn.example.com/1.png", "destination_url": "https://example.com/a",
         "caption": "Automate ads", "call_to_action": "Learn More"},
        {"image_url": "https://cdn.example.com/2.png", "destination_url": "https://example.com/b",
         "caption": "One dashboard", "call_to_action": "Sign Up"},
    ],
)

# PROMOTED_POST — promote an existing SFW community post by id
reddit_ads_create_structured_post(
    profile_id="<PROFILE_ID>", type="PROMOTED_POST", headline="Community pick",
    promoted_post_id="t3_abc123",
)
```

> `call_to_action` is a **display label** (`"Sign Up"`, `"Learn More"`, `"Shop Now"`, `"Install"`, `"Watch Now"`, …), never an enum constant. For a fully custom creative, pass an API-shaped dict via `creative=` (it overrides the built one), and any extra top-level fields via `input_data`.

#### Alternative: legacy `reddit_ads_create_post` (pre-uploaded assets only)

`reddit_ads_create_post` cannot fetch media by URL — its `content[].media_url` must reference an **already-uploaded Reddit asset**. Use it only when reusing an existing asset; otherwise prefer the structured-post tool above.

```python
reddit_ads_list_creative_assets(profile_id="<PROFILE_ID>")   # grab an existing asset URL

reddit_ads_create_post(
    profile_id="<PROFILE_ID>",
    type="IMAGE",
    headline="Stop juggling 30 marketing tools — Hyper AI does it all.",
    input_data={
        "content": [{
            "media_url": "https://i.redd.it/<asset>.jpeg",  # MUST already exist on Reddit
            "destination_url": "https://example.com",
            "display_url": "example.com",
            "call_to_action": "Sign Up",                     # display label, NOT "SIGN_UP"
        }],
    },
)
```

> A **TEXT** post takes only `type` + `headline` (+ `body` on the structured tool), with an **empty** `content[]` on the legacy tool — and again, can't back a CONVERSIONS ad. Use it only for awareness/engagement-style campaigns.
>
> Posts are otherwise **immutable** — to change the headline, media, or destination, create a new (structured) post. Only comments can be toggled after creation: `reddit_ads_update_post(post_id=..., allow_comments=False, is_structured_post=True)`.

### 4. Create ad

```python
reddit_ads_create_ad(
    ad_account_id="<AD_ACCOUNT_ID>",
    ad_group_id="<AD_GROUP_ID>",
    name="Spring Hero Ad",
    configured_status="PAUSED",
    post_id="<POST_ID>",
    click_url="https://example.com/spring",
)
```

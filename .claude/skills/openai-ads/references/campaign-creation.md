# OpenAI Ads: Campaign Creation (Chat Card & Product Feed)

## Geo Targeting

Use `targeting_country_codes` for country-level targeting. For regions and
DMAs, search locations first and pass the returned IDs:

```text
openai_ads_search_geo_locations(q="San Francisco", limit=5)

openai_ads_campaigns_create(
    name="Hyper - West Coast Test",
    status="paused",
    daily_spend_limit_micros=50_000_000,
    targeting_location_ids=["2000043", "3000194"],
    bidding_type="clicks",
)
```

Do not pass geo exclusions. The current API supports included locations and
custom audience exclusions, but not location exclusions.

## Standard Chat Card Flow

```text
openai_ads_campaigns_create(
    name="Hyper - US Test",
    status="paused",
    daily_spend_limit_micros=50_000_000,
    targeting_country_codes=["US"],
    description="Initial pilot",
    idempotency_key="hyper-us-test-2026-06-25",
)
```

```text
openai_ads_ad_groups_create(
    campaign_id="CAMPAIGN_ID",
    name="US - Marketing Operators",
    status="paused",
    max_bid_micros=2_000_000,
    context_hints=[
        "user is asking about ad automation",
        "user wants to scale paid acquisition",
    ],
    idempotency_key="hyper-us-test-adgroup-2026-06-25",
)
```

```text
openai_ads_images_upload(image_url="https://cdn.example.com/asset.png")
```

```text
openai_ads_create(
    ad_group_id="AD_GROUP_ID",
    name="US - Marketing - Variant A",
    title="Run ads on autopilot",
    body="Hyper builds, ships, and optimizes ads for you.",
    target_url="https://example.com?utm_source=openai_ads",
    file_id=FILE_ID_FROM_UPLOAD,
    status="paused",
    creative_type="chat_card",
    idempotency_key="hyper-us-test-ad-a-2026-06-25",
)
```

Surface the returned `review_status`.

## Product Feed Flow

For product-feed ads:

- Create the campaign with `mode="product_feed"`.
- Create an ad group with `product_feed_id` and optional `product_set_filters`.
- Create one `product_ad_template` ad in that ad group.

```text
openai_ads_campaigns_create(
    name="Catalog retargeting",
    status="paused",
    daily_spend_limit_micros=100_000_000,
    mode="product_feed",
    bidding_type="clicks",
)
```

```text
openai_ads_ad_groups_create(
    campaign_id="CAMPAIGN_ID",
    name="High intent catalog",
    status="paused",
    max_bid_micros=3_000_000,
    product_feed_id="feed_123",
    product_set_filters=[
        {"field": "availability", "operator": "in", "values": ["in_stock"]},
    ],
)
```

```text
openai_ads_create(
    ad_group_id="AD_GROUP_ID",
    name="Catalog template",
    title="{{product.title}}",
    body="Shop {{product.brand}} today.",
    price="{{product.price}}",
    status="paused",
    creative_type="product_ad_template",
)
```

## Activation

After the user reviews the paused tree:

```text
openai_ads_campaigns_activate(campaign_id=CID)
openai_ads_ad_groups_activate(ad_group_id=AGID)
openai_ads_activate(ad_id=AID)
```

Activation only takes effect at the ad level once `review_status="approved"`.
Poll `openai_ads_get(ad_id=...)` if you need to confirm review state.

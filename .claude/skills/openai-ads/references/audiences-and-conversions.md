# OpenAI Ads: Custom Audiences & Conversion Tracking

## Custom Audiences

Use custom audiences for inclusion, exclusion, and bid multipliers.

```text
openai_ads_create_custom_audience(
    name="Newsletter leads",
    members=[
        {"identifier_type": "email_sha256", "value": "HASHED_EMAIL"},
    ],
)
```

Then attach audience IDs to a campaign:

```text
openai_ads_campaigns_create(
    name="Lead retargeting",
    status="paused",
    daily_spend_limit_micros=25_000_000,
    custom_audience_ids=["aud_123"],
    excluded_custom_audience_ids=["aud_456"],
)
```

Use `custom_audience_bid_multipliers` on ad groups when the user explicitly
wants audience-level bid adjustments.

## Conversions

Set up conversion measurement before attaching conversion settings to a
campaign:

```text
openai_ads_create_conversion_pixel(name="Website pixel")

openai_ads_create_conversion_event_setting(
    name="Signup",
    event_type="custom",
    custom_event_name="signup",
    attribution_window_days=30,
    source_ids=["src_123"],
)
```

Attach conversion event setting IDs on campaign create/update:

```text
openai_ads_campaigns_update(
    campaign_id="CAMPAIGN_ID",
    conversion_event_setting_ids=["ces_123"],
)
```

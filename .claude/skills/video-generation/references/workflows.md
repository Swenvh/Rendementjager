# Video Generation: End-to-End Production Workflows

## UGC / TikTok Production Workflow

Complete workflow for producing UGC-style content:

1. **Script:** plan scenes, dialogue, and visual style
2. **Generate:** create each scene with `videos_generate`
3. **Review:** use `videos_analyze` to check each scene for quality
4. **Chain:** extract last frames with `videos_frames_capture`, generate next scenes
5. **Stitch:** combine all scenes with `videos_stitch`
6. **Narrate:** generate voiceover with `audio_speech_generate` + `videos_audio_add`
7. **Caption:** add TikTok-style captions with `videos_captions_burn_highlighted`
8. **Overlay:** add titles / CTAs with `videos_text_overlays_add`
9. **Final review:** use `videos_analyze` on the final video for quality check

### Example: Narrated UGC Video

```python
videos_generate(prompt="...", model="veo-3.1-generate-preview")

audio = audio_speech_generate(text="Your narration script here...", voice="nova")

videos_audio_add(video_file_id="generated_video_id", audio_file_id=audio.file_id)

videos_captions_burn_highlighted(video_file_id="narrated_video_id", style="tiktok")
```

### Example: Podcast to Short-Form Clips

```python
transcript = videos_transcribe(file_id="podcast_video_id")

analysis = videos_analyze(
    file_id="podcast_video_id",
    question="Identify the 3 most memorable / quotable moments with timestamps",
    analysis_type="scene_breakdown",
)

videos_clips_extract(video_file_id="podcast_video_id", start_time=120.0, end_time=150.0)
videos_clips_extract(video_file_id="podcast_video_id", start_time=340.0, end_time=365.0)

videos_stitch(video_file_ids=["clip1_id", "clip2_id"])

videos_captions_burn_highlighted(video_file_id="stitched_id", style="tiktok")
```

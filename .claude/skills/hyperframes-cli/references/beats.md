# Generate a project beat grid

Use `hyperframes beats` when an existing HyperFrames project needs the Studio-compatible beat file for its music track. This is a CLI utility, not a complete video workflow.

```bash
npx hyperframes@0.8.188 beats
npx hyperframes@0.8.188 beats ./my-video
npx hyperframes@0.8.188 beats ./my-video --json
```

The project must contain a local music `<audio>` source. Mark it with `data-timeline-role="music"`; an id containing `music`, `bgm`, or `soundtrack` is also recognized. The command decodes that file with ffmpeg, tracks its beats, and writes `beats/<audio-relative-path>.json`.

If the track has no steady beat, the command fails and writes nothing. If ffmpeg is missing, run `npx hyperframes@0.8.188 doctor`.

For a whole video cut to a music track, see `/hyperframes` → `references/film.md`.

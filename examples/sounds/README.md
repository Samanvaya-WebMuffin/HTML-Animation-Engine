# Sound samples

Recorded one-shots used by the sound kit (`examples/sounds.ts`). All four are
**CC0 (public domain)** on Freesound: free for any use, including commercial,
with no attribution required. Credit is given here anyway.

| File             | Source                                                                                             | What it is                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `snap-1.wav`     | ["Single Finger Snap" by vckhaze](https://freesound.org/people/vckhaze/sounds/332604/) (#332604)   | One dry snap, Shure SM57; the main take                           |
| `snap-2.wav`     | ["Finger Snap" by greenlinker](https://freesound.org/people/greenlinker/sounds/484994/) (#484994)  | A second dry snap, alternated with the first so repeats vary      |
| `clap.wav`       | ["clap.wav" by florian_reinke](https://freesound.org/people/florian_reinke/sounds/63530/) (#63530) | One hand clap, very clean (≈94 dB SNR)                            |
| `clap-group.wav` | ["claps.wav" by synthnisse](https://freesound.org/people/synthnisse/sounds/509526/) (#509526)      | Three people clapping, wide stereo; layered under the single clap |

## How they were chosen

Seventeen CC0 snaps and claps, found by Freesound rating and downloads, were measured:

- peak level and clipping;
- noise floor and SNR;
- attack and decay;
- spectral centroid and bandwidth;
- low-frequency content;
- stereo correlation.

Their waveforms and spectrograms were then compared. The four above have:

- a single clean transient (no flam or gating);
- no clipping;
- a low noise floor;
- full bandwidth;
- little room sound, so the kit's reverb can place them.

## Processing

Every file was converted from Freesound's high-quality preview in the same way:

1. Resampled to 48 kHz.
2. High-passed at 60 Hz (removes rumble and hum).
3. Trimmed to 1 ms before the transient, with a raised-cosine fade-in over that 1 ms.
4. Faded out where the tail falls below −60 dB.
5. Peak-normalised to −1 dBFS.
6. Saved as 24-bit PCM WAV.

`SAMPLES` in `examples/sounds.ts` lists where each transient sits in its file, measured at 30 % of peak. The kit starts each sample that much early, so the hit lands exactly on its cue.

The original uploads are lossless WAVs, which need a Freesound login to download. To use them instead, process them the same way and keep the file names; then re-measure the onsets.

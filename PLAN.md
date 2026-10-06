# DJ-Mixer: plan

A tool that runs on your laptop next to rekordbox. It reads your whole library and tells you which songs will mix well together. It can also build full sets and send them back into rekordbox as playlists.

## Can it be "guaranteed"?

Partly. A good mix depends on two kinds of things:

| Factor | Can a computer check it? | How |
|---|---|---|
| Tempo (BPM) | **Yes**, reliably | Keep within about ±6% so it doesn't sound stretched. Half or double time also works (70 ↔ 140). |
| Key | **Yes**, mostly | Camelot wheel: same number, ±1, or A↔B (e.g. 8A → 8A / 7A / 9A / 8B) |
| Energy and loudness | **Yes** | Energy measured from the audio, no big jumps |
| Vibe/genre | **Approximately** | An AI audio model gives each song an "embedding" (a sound fingerprint), and we compare how close two are |
| Clean intro/outro to mix over | **Approximately** | Measure how many beats play before the vocals start |
| Vocals clashing | **Approximately** | A vocal detector finds which parts of each song have singing |
| Phrasing, the crowd, the moment | **No** | That part is still your job |

So it can **guarantee** that every suggestion is in tempo and in key. It can rank suggestions so the top ones are very likely to sound good. It **can't** promise every pairing is great, because two songs can match on BPM and key and still sound wrong together (drill into Taylor Swift, say). That's why the plan also scores vibe and mixability, not just BPM and key.

**One catch with a Spotify library:** most of it is radio edits of pop songs, where vocals start straight away and the songs fade out. Those are harder to mix than club/extended versions, whatever tool you use. The tool will flag the "easy to mix" tracks so you know which ones to use for long blends and which ones need a quick cut or an echo-out.

## Try first (free, today)

1. rekordbox → Preferences → View → set key display to **Alphanumeric (Camelot)**.
2. Analyse the whole library (BPM + key) with **Dynamic** BPM analysis for songs with live drums.
3. Use rekordbox's built-in **Related Tracks** panel, set to match BPM ±6% and compatible key.
4. Use the FLX4's **Smart Fader** for transitions where the BPMs are far apart.

This shows how far BPM + key gets you. The tool below adds vibe matching, mixability, vocal checks and automatic set building.

## What we build

```
rekordbox ──export XML──▶ [1 Import] ──▶ [2 Audio analysis] ──▶ SQLite cache
                                                 │
                         [3 Compatibility scorer] ◀┘
                                   │
          ┌────────────────────────┼─────────────────────────┐
   [4a "What's next?"]     [4b Set builder]        [4c Export playlists]
   live suggestions         start → end path        back into rekordbox
```

### 1. Import from rekordbox
- In rekordbox: File → Export Collection in xml format.
- Parse it to get each track's file path, BPM, key, beatgrid, genre, artist and length.
- We use **rekordbox's** BPM/key on purpose. That's what your decks sync to, so suggestions match what you see on screen.

### 2. Audio analysis (one-time, cached)
Python + [Essentia](https://essentia.upf.edu/) pretrained models, run once per song and saved in SQLite. New downloads only need analysing once.
- **Vibe embedding**: Discogs-EffNet model. Songs that sound similar end up close together.
- **Energy / danceability / mood**: also Essentia models.
- **Vocal map**: where in the song the vocals are. From it we get "beats of intro before vocals" and "beats of outro after vocals".
- **Loudness** (LUFS), and a **tempo-stability** flag for songs whose BPM drifts (live drums), since the beatgrid can't be trusted for those.
- **File quality check**: flag low-bitrate files. A 128 kbps file sounds noticeably worse on a big speaker system.

For a few thousand songs this is a one-off job of roughly an hour or two on a laptop.

### 3. Compatibility score (0–100 for any song A → song B)
- **Hard filters** (these are the "guarantee"): BPM within ±6% (or half/double time) and key compatible on the Camelot wheel. You can turn either off.
- **Weighted score:** vibe similarity + energy change + mixability (A's outro / B's intro length) + vocal overlap penalty + small bonus for the same genre/era.
- With numpy, scoring every pair in a 5,000-song library takes seconds.

### 4. Outputs
- **4a "What's next?"**: pick the song that's playing and get the top 10 next songs, each with a reason (e.g. "8A→9A, 124→126 BPM, similar vibe, 32-beat clean intro").
- **4b Set builder**: choose a start song, a length (say 20 songs or 1 hour) and an energy shape (warm-up → peak → cool-down). It searches for a chain where every transition scores well, and doesn't repeat artists.
- **4c Back into rekordbox**: write the sets as a rekordbox XML playlist. Import it from the "rekordbox xml" entry in the sidebar and the set shows up in rekordbox, ready to load on the FLX4. Optionally also write "good next tracks" into the comment field so you can see them while browsing.
- **Interface**: a simple local web page (search box, suggestions, set builder). It runs on the laptop and doesn't need internet.

### 5. Learn from your feedback
After a session, mark transitions 👍/👎. The tool adjusts its scoring weights to your taste over time. Your own judgement on which mixes actually worked is what makes it better than Related Tracks.

## Build order (milestones)
1. **XML import + BPM/key "what's next" in the terminal.** Useful from day one.
2. Essentia analysis + caching, adding vibe and energy to the score.
3. Vocal map + mixability score.
4. Set builder + export back to rekordbox.
5. Web interface.
6. Feedback loop.

## Tech
Python 3.11, `essentia-tensorflow` (or `librosa` as a fallback on Windows), `numpy`, `lxml`, SQLite, and FastAPI with a small HTML page for the interface. Everything runs locally on the laptop.

## Open questions
1. Is the laptop Windows or Mac? (Essentia's ML models install easily on Mac/Linux. On Windows we'd use WSL or a librosa-based fallback.)
2. Roughly how many songs, and what format/bitrate are the files (e.g. spotDL MP3s)?
3. Which genres are mostly in there, and what kind of gigs/parties do you play?
4. rekordbox 6 or 7?

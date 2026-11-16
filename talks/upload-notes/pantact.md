# PanTact upload correction

Recorded November 16, 2026 from the user's pasted YouTube Studio details and
screenshots. The user suspects the wrong recording was uploaded.

## File selection and website status

- Intended recording:
  `/media/eba/PortableSSD/CoRL_2026_Student_Talks_Project/FINAL_VIDEOS/01_Xiaomeng_Xu_PanTact_CLEAN.mp4`.
- Screenshot filename: `01_Xiaomeng_Xu_PanTact_FINAL.m...`, indicating the FINAL
  edit was selected rather than the requested CLEAN edit.
- Draft video link shown in the screenshot: `https://youtu.be/JAHIUfQoWaE`.
  Treat this as the suspected wrong upload, not the approved website recording.
- Do not put this draft ID into `talks/media.json`.
- Replacement link supplied by the user: `https://youtu.be/11n7crTa2Qg`.
  PanTact's YouTube ID in `talks/media.json` is now `11n7crTa2Qg`. The original
  draft remains disconnected.
- Verified replacement metadata: it belongs to the selected workshop channel
  `UChq5cuy0w7oJ7VXAuyWV0Nw`, is Unlisted, and has an uploaded English caption
  track as well as an automatically generated English track. YouTube reports a
  rounded duration of 357 seconds, consistent with the 356.477-second CLEAN
  original. The original filename is not exposed by the public player.
- Verified published title: `PanTact: Teaching Whole-Body Dexterity with a Wearable Contact Interface | Xiaomeng Xu | CoRL 2026`.
- Local browser checks passed against the actual replacement: playback,
  chapter seeking, transcript seeking, timed reference highlights, and turning
  English captions off/on with visible caption text. YouTube's current embed
  used a newer control layout; checks use accessible button labels rather than
  depending on an older desktop CSS class. Production deployment is pending.
- Upload the exact CLEAN file without trimming. Use `captions/pantact.srt` for
  the timed English subtitles. The website's chapters also refer to CLEAN.
- A new YouTube upload receives a new URL. The replacement is connected in the
  local website source. No remote video was deleted or modified as part of
  saving these notes or updating the website configuration.

## Details to reuse

The exact pasted text, including the full description and tag list, is preserved
in [pantact-original-upload.txt](pantact-original-upload.txt).

- Title: `PanTact:  Xiaomeng Xu | CoRL 2026 Student Talk` (two spaces after the
  colon in the pasted title field).
- Playlist shown: `Student spotlight at the CoRL 2026 workshop`.
- Audience: Not Made for Kids (the pasted text explicitly identifies this as
  the selected setting).
- Age restriction: the prior recommendation was no 18+ restriction; the pasted
  text does not expose the selected radio button.
- Video language: English. Caption certification: None.
- Recording date: November 12, 2026. No recording location is shown as selected.
- Licence: Standard YouTube licence.
- Embedding: enabled in the user's earlier screenshot; preserve this on the
  replacement video.
- Category: Education. Type: Lecture.
- Problems: blank. Academic system: None. Level: None. No exam/course/standard
  is shown as selected.
- Comments: On. Moderation: Basic. Who can comment: Anyone. Sort by: Top.
- Show how many viewers like this video: checked in the screenshot.

Pasted UI text lists both choices for paid promotion and AI use, as well as
multiple remixing options. It does not reliably identify their selected state.
Do not infer those choices from the text alone. The replacement video's
Unlisted visibility and uploaded English caption track were subsequently
confirmed from its player metadata.

Official YouTube reference:
[Replacing a video requires a new upload and URL](https://support.google.com/youtube/answer/55770).

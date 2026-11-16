# Student talk recordings

The student talks live on the home page at `index.html#student-talks`.
`talks/index.html` redirects older talk links there, preserving `?talk=…&t=…`
parameters. This is a buildless addition to the existing static website;
original MP4 files remain outside the repository.

PanTact is connected to the user's replacement YouTube upload,
<https://youtu.be/11n7crTa2Qg>. Its actual embed, English captions, chapter jumps,
and transcript seeking were verified locally. Workhorse is connected to
<https://youtu.be/9gILYJyRjQ8>, OCLO to <https://youtu.be/8TS2EnUN2os>, and
HULK to <https://youtu.be/LbAEbz5iQik>. The website changes have not been deployed.

## Local website preview

From the repository root:

```bash
python3 -m http.server 8800 --bind 127.0.0.1
```

Open <http://127.0.0.1:8800/index.html#student-talks>. The home page uses the
YouTube IDs in `media.json`, with playback controls, optional sentence captions
below the video, and a scrolling timeline of chapters and cited work. Video
loads only after a visitor requests playback.

## Publish using YouTube

Selected channel: [Contact Rich Loco-Manipulation](https://www.youtube.com/channel/UChq5cuy0w7oJ7VXAuyWV0Nw)
(`@Contact-Rich-Loco-Manipulation`). The channel ID identifies the workshop
channel; the website player still needs a separate video ID for each talk.
Copy-ready titles and descriptions are in `youtube-upload.md`.

1. Upload the four exact `file` names in `talks.json` to your workshop channel.
   Avoid `FINAL`, prototype, and `- Copy` versions. Upload the full 1080p originals
   and wait for HD processing. Preserve the intro card: all chapter and subtitle
   times refer to the untrimmed CLEAN version.
2. Choose **Public** if the talks should appear in search and on the channel, or
   **Unlisted** for people with the link and website visitors. Enable embedding.
3. In YouTube Studio, select each video, set the language to English, and upload
   the corresponding `captions/<id>.srt` with timing. These are the supplied
   subtitles. Review them before publication: supplied transcriptions contain
   some apparent recognition errors (for example, HULK is sometimes transcribed
   as “HOLD”). The original subtitles have been preserved.
4. Set the matching `youtube` property in `media.json` to the **video ID**, such as
   the ID after `v=` in a watch URL. Leave `hls` and `mp4` null. Example shape:

   ```json
   {
     "pantact": { "youtube": "VIDEO_ID_HERE", "hls": null, "mp4": null }
   }
   ```

   This example is a shape only; do not publish placeholder IDs. Keep the other
   three entries when editing the file. These public playback IDs are not API
   credentials. No API key or backend is needed for the embedded player.
5. Optionally paste the generated `youtube-chapters.txt` entries into each video
   description. Website chapter navigation works independently of YouTube's
   own chapter eligibility rules.
6. Deploy the updated static files through the website's existing GitHub
   publishing workflow. Do not publish with all-null media entries unless the
   “Recording coming soon” state is intentional.

The home page uses YouTube's privacy-enhanced embed domain. Its controls and
chapter timeline call the YouTube player API, and the supplied VTT captions
drive the optional sentence captions below the player. The English subtitle
upload in YouTube Studio also makes captions available when someone watches
the recording on YouTube itself. YouTube may serve ads even on channels that
have not monetized the videos.

Official references:

- [YouTube player API](https://developers.google.com/youtube/iframe_api_reference)
- [Upload subtitle files](https://support.google.com/youtube/answer/2734796)
- [Video chapters](https://support.google.com/youtube/answer/9884579)
- [Ads on videos you have not monetized](https://support.google.com/youtube/answer/2475463)

## Alternative streaming hosts

The older standalone player code in `talks.js` also accepts an HTTPS HLS manifest in `hls` (for example, a Mux or
Cloudflare Stream playback URL), and/or a public MP4 in `mp4`. The priority is
YouTube, HLS, then MP4. HLS uses native browser support when available and loads
pinned hls.js 1.7.4 on demand elsewhere. HLS has an Auto/manual quality selector
where hls.js exposes multiple renditions. That code is retained as a reference;
the current home-page player uses YouTube only. Native-HLS browsers expose their own
quality behavior. MP4 quality is fixed by the supplied file.

The streaming host must allow cross-origin access to manifests and segments.
Enable byte-range requests for MP4 hosting. Use public playback URLs here,
never provider API secrets. Captions remain local and switchable on these
players. Stream loading is deferred until play or a chapter/transcript click;
posters and text can load without downloading video. Production startup speed
and quality still need verification after the actual hosting URLs are supplied.

- [Mux plans](https://www.mux.com/pricing): currently up to 10 stored videos and
  100,000 monthly delivery minutes on Free. The free Mux Player has a Mux badge.
  Follow the provider's current branding requirements when selecting a player.
- [Cloudflare Stream pricing](https://developers.cloudflare.com/stream/pricing/):
  currently $5/month per 1,000 minutes of storage capacity, plus $1 per 1,000
  viewing minutes. This is not a permanent free plan.

## Edit content

`talks.json` holds titles, chapter times in seconds, and verified research links.
Chapter boundaries were drafted from the supplied timed captions and should be
reviewed editorially. A resource's `start` and `end` determine when it is
highlighted; it stays available at every other time. Avoid inferring citations
that the speaker did not mention. Links here were checked against the authors'
project pages and arXiv entries; HULK's project site blocked automated fetching.

`captions/` contains the provided VTT and SRT files. `transcripts/` contains the
provided plain-text transcripts. The home-page sentence captions are parsed
from VTT. `posters/` contains frames from the four CLEAN videos. Timestamp
links use `index.html?talk=oclo&t=49#student-talks`.

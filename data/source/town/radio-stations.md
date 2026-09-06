# Webster town radio sources

Catalog: `src/lib/town/radio-stations.ts`.

Checked September 6, 2026 UTC (September 5 in Massachusetts). This is a curated
directory of 23 local and regional dial entries, with 16 playable entries backed
by 13 distinct public HTTPS audio streams. Simulcasts intentionally appear at
both frequencies. Six nearby services are suggested as starting points.

## What the directory means

- The dial itself covers all channels, including frequencies absent from this
  directory. An uncatalogued channel is simulated static, not a factual claim
  that no licensed broadcast exists there.
- `recommended` means a nearby station with a checked internet audio endpoint.
  It is not a field measurement, coverage prediction, or guarantee that an
  actual car radio in Webster receives that station.
- `reception: local` means a service associated with Webster, Dudley,
  Southbridge, Worcester, or nearby northeastern Connecticut. `regional` marks
  the supplemental Greater Boston services. These labels are geographical
  groupings, not estimated signal strength.
- The `city` field describes the station's community or service area, not its
  legal city of license or transmitter position. In particular, WQVR's current
  website explicitly serves Webster, Southbridge, and Worcester; no assumption
  about its current AM transmitter or licensed city is needed here.
- Playback comes directly from station-selected internet streaming providers.
  Streams can contain preroll advertisements, buffering delays, substituted
  sports programming, geographic restrictions, or future outages. These
  internet effects do not establish whether an over-the-air station is silent.
- A missing `streamUrl` means a directly playable URL was not verified for this
  implementation. Preserve the dial entry and official listening link. Do not
  label such a station defunct or off-air.

## Primary station references

All editorial identity and format choices below are grounded in the broadcaster
or its own selected player. Older generic directories were used for discovery
only; several still call 940 AM WGFP and describe WESO as country, which are
not the current branding found on station websites.

| Dial | Station | Official source and evidence |
| --- | --- | --- |
| FM 88.1 | WCHC | [Holy Cross radio](https://college.holycross.edu/wchc/) identifies the station and college; its [listening page](https://college.holycross.edu/wchc/Listen_Live.html) links directly to `s2.radio.co/sc161fe4c9/listen`. |
| FM 89.7 | WGBH | [GBH's listening help](https://www.wgbh.org/help/how-to-access-live-radio-streams) publishes its frequency and exact direct stream URL. |
| FM 90.1 | WYQQ | [The Q's listening page](https://www.theq901.com/listen-online) and [listening information](https://www.theq901.com/ways-to-listen) identify Q90.1, WYQQ, its Christian programming, and Charlton contact location. No direct URL was verified. |
| FM 90.5 | WICN | [WICN](https://wicn.org/) identifies 90.5, Worcester, and jazz programming. Its HTML player configuration sets `data-playtrack` and `data-mp3_stream_url` to the included `live-aac` source. |
| FM 90.9 | WBUR | [WBUR's listening information](https://www.wbur.org/ways-to-listen) identifies 90.9 FM Boston and its live web player. No direct URL was verified in this pass. |
| FM 91.3 | WCUW | [WCUW's listening page](https://wcuw.org/listen/) identifies 91.3 and Worcester and embeds a StreamGuys player. The player's [public configuration](https://player.streamguys.com/wcuw/sgplayer3-2-6/config.json) publishes the exact included MP3 source. |
| FM 94.9 / AM 580 | WTAG | [WTAG](https://wtag.iheart.com/) explicitly identifies 580/94.9 and Worcester news, traffic, and weather service. No direct URL was verified in this pass. |
| FM 95.1 | WXRB | [WXRB](https://wxrbfm.org/) identifies Golden 95.1 and links to its [LightningStream player](https://www.lightningstream.com/Player.aspx?call=WXRB-FM). Its published direct source returned HTTP 401, so the source is not embedded here. |
| FM 96.1 | WSRS | [96-1 SRS](https://961srs.iheart.com/) identifies its frequency, Worcester service, and contemporary music format. No direct URL was verified in this pass. |
| FM 97.1 / AM 1350 | WINY | [WINY](https://www.winyradio.com/) and its branding identify Putnam and the two frequencies; the [station listening page](https://www.winyradio.com/streaming/) links to [Triton player 58391](https://player.listenlive.co/58391/en), whose public configuration identifies the `WINYAM` mount. The AAC endpoint worked; the MP3 endpoint returned 404. |
| FM 97.5 | WNRC-LP | [Nichols College radio](https://wnrc.nichols.edu/) identifies the station and links to its [LightningStream player](https://lightningstream.com/player.aspx?call=WNRC-LP). Its published direct source returned HTTP 401, so the source is not embedded here. |
| FM 98.9 | WORC-FM | [98.9 Nash Icon](https://www.nashicon989.com/) supplies current country branding and Webster-area events. Its [official player](https://www.nashicon989.com/player/?playerID=3325) explicitly sets `PlayerData.tritonStationID` to `WORCFM`. |
| FM 99.3 / AM 940 | WQVR | [WQVR](https://wqvrradio.com/) identifies its two frequencies, classic hits, and Webster/Southbridge/Worcester service. Its embedded [StationPlaylist player](https://stationplaylist.com/playstream.asp?mount=listen.aac&port=7172&autoplay=1&title=WQVR) publishes the exact AAC URL used here. |
| FM 99.5 | WCRB | [GBH's listening help](https://www.wgbh.org/help/how-to-access-live-radio-streams) identifies CRB Classical 99.5 and publishes the exact direct stream URL. |
| FM 100.1 | WWFX | [The Pike](https://www.pikefm.com/) supplies current classic rock branding and Worcester/Southbridge-area service. The station's brand is “100 FM”; the dial frequency is 100.1. Its [official player](https://www.pikefm.com/player/?playerID=3379) explicitly sets `PlayerData.tritonStationID` to `WWFXFM`; its linked [FCC public file](https://publicfiles.fcc.gov/fm-profile/WWFX) provides the station record. |
| FM 104.5 | WXLO | [WXLO](https://www.wxlo.com/) identifies its frequency, music branding, and Worcester service; [Triton player 26711](https://player.listenlive.co/26711/en) publishes the `WXLOFM` mount. |
| AM 830 | WCRN | [WCRN](https://wcrnradio.com/) identifies local talk and AM 830. It links to [its official player](https://us7.maindigitalstream.com/2506/); the player's [public channel configuration](https://us7.maindigitalstream.com/2506/?c=all&t=default) supplies `https://us2.maindigitalstream.com/ssl/WCRN`. |
| AM 970 | WESO | [The network's Southbridge station page](https://thestationofthecross.com/stations/southbridge-ma/) identifies WESO 970. Its HTML publishes the Central New England feed shared with WNEB. The published HTTP hostname/path also supports HTTPS, which was checked and is used here. |
| AM 1060 | WQOM | [The network's Boston station page](https://thestationofthecross.com/stations/boston-ma/) identifies 1060. The network HTML publishes the WQOM HTTPS feed used here. |
| AM 1230 | WNEB | [The network's Worcester station page](https://thestationofthecross.com/stations/worcester-ma/) identifies WNEB 1230. The [local programming page](https://thestationofthecross.com/programs/local-programming/) also confirms Southbridge/Worcester call signs and shared local programming. |

## Bounded endpoint checks

Each included URL returned HTTP 200, an audio content type, and at least 2,048
audio bytes. Checks used short requests with an 8–12 second socket timeout and
stopped after a 2,048–4,096 byte sample. This confirms transport and an apparent
MP3/AAC payload; it does not certify continuous uptime or actual acoustic
content. No audio samples are stored in the repository. The native browser
audio player must handle actual playback errors at runtime.

| Station/feed | Included endpoint | Response content type |
| --- | --- | --- |
| WCHC | `https://s2.radio.co/sc161fe4c9/listen` | `audio/mpeg` |
| WGBH | `https://wgbh-live.streamguys1.com/wgbh` | `audio/aac` |
| WICN | `https://wicn-ice.streamguys1.com/live-aac` | `audio/aacp` |
| WCUW | `https://peridot.streamguys1.com:5495/live` | `audio/mpeg` |
| WINY | `https://playerservices.streamtheworld.com/api/livestream-redirect/WINYAMAAC.aac` | `audio/aacp` |
| WORC-FM | `https://playerservices.streamtheworld.com/api/livestream-redirect/WORCFM.mp3` | `audio/mpeg` |
| WQVR | `https://stationplaylist.com:7172/listen.aac` | `audio/aacp` |
| WCRB | `https://wgbh-live.streamguys1.com/classical-hi/` | `audio/aac` |
| WWFX | `https://playerservices.streamtheworld.com/api/livestream-redirect/WWFXFM.mp3` | `audio/mpeg` |
| WXLO | `https://playerservices.streamtheworld.com/api/livestream-redirect/WXLOFM.mp3` | `audio/mpeg` |
| WCRN | `https://us2.maindigitalstream.com/ssl/WCRN` | `audio/mpeg` |
| WESO / WNEB | `https://hfc.streamguys1.com/Central-New-England` | `audio/aacp` |
| WQOM | `https://hfc.streamguys1.com/wqom` | `audio/aacp` |

Triton URLs are durable provider redirect endpoints rather than a transient
numbered streaming server. The three MP3 mounts were confirmed in official
station-player configuration; WINY's AAC variant was selected because it
returned audio and its MP3 variant did not. These URLs are direct audio
responses, not M3U/PLS playlists or HLS manifests.

The WXRB source `https://stream.surfernetwork.com/ezmhqpvpkiotv` and WNRC source
`https://stream.surfernetwork.com/dfn0bl3chwxvv` both returned HTTP 401. No access
controls were worked around. Their own players may still work, which is why
the directory keeps their official website links and describes this as a
streaming limitation rather than claiming the stations are off-air.

## Maintenance

Recheck the official station page and its selected player before replacing a
URL. Keep sources and formats separate from assumptions about reception.
Retest with bounded requests, preserve nonworking stations on the dial, and
advance `RADIO_CATALOG_CHECKED_AT` only after recording fresh evidence. Avoid
substituting an unrelated station merely because it shares a frequency or
because a generic directory offers an apparently working stream.

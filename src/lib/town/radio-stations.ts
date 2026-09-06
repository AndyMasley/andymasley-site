/** Station-owned listening sources; evidence and limitations: data/source/town/radio-stations.md. */
export type RadioBand = 'fm' | 'am';

export type RadioStation = {
  id: string;
  band: RadioBand;
  /** MHz on FM; kHz on AM. */
  frequency: number;
  callSign: string;
  name: string;
  format: string;
  /** Station's community/service area, not a claimed transmitter location. */
  city: string;
  /** Omitted when a browser-compatible public stream was not verified. */
  streamUrl?: string;
  website: string;
  /** A nearby service with checked online audio; never measured RF reception. */
  recommended: boolean;
  reception: 'local' | 'regional';
  note?: string;
};

export const RADIO_CATALOG_CHECKED_AT = '2026-09-06';

const WQVR_STREAM = 'https://stationplaylist.com:7172/listen.aac';
const WINY_STREAM = 'https://playerservices.streamtheworld.com/api/livestream-redirect/WINYAMAAC.aac';
const CENTRAL_NEW_ENGLAND_STREAM = 'https://hfc.streamguys1.com/Central-New-England';

/** Curated local/regional services. The dial includes every channel, beyond these entries. */
export const RADIO_STATIONS: readonly RadioStation[] = [
  {
    id: 'wchc-fm', band: 'fm', frequency: 88.1, callSign: 'WCHC',
    name: 'Holy Cross Radio', format: 'College / variety', city: 'Worcester, MA',
    streamUrl: 'https://s2.radio.co/sc161fe4c9/listen',
    website: 'https://college.holycross.edu/wchc/', recommended: false, reception: 'local',
    note: 'Student radio from Holy Cross. Online audio does not establish reception in Webster.',
  },
  {
    id: 'wgbh-fm', band: 'fm', frequency: 89.7, callSign: 'WGBH',
    name: 'GBH 89.7', format: 'Public radio / news', city: 'Boston, MA',
    streamUrl: 'https://wgbh-live.streamguys1.com/wgbh',
    website: 'https://www.wgbh.org/help/how-to-access-live-radio-streams',
    recommended: false, reception: 'regional', note: 'Regional station; reception in Webster varies.',
  },
  {
    id: 'wyqq-fm', band: 'fm', frequency: 90.1, callSign: 'WYQQ',
    name: 'The Q90.1', format: 'Contemporary Christian', city: 'Charlton, MA',
    website: 'https://www.theq901.com/listen-online', recommended: false, reception: 'local',
    note: 'A direct stream has not been verified here. The station offers its own web player.',
  },
  {
    id: 'wicn-fm', band: 'fm', frequency: 90.5, callSign: 'WICN',
    name: 'WICN Jazz+', format: 'Jazz / soul / folk', city: 'Worcester, MA',
    streamUrl: 'https://wicn-ice.streamguys1.com/live-aac',
    website: 'https://wicn.org/', recommended: true, reception: 'local',
  },
  {
    id: 'wbur-fm', band: 'fm', frequency: 90.9, callSign: 'WBUR',
    name: 'WBUR', format: 'Public radio / news', city: 'Boston, MA',
    website: 'https://www.wbur.org/ways-to-listen', recommended: false, reception: 'regional',
    note: 'A direct stream has not been verified here. The station offers its own web player.',
  },
  {
    id: 'wcuw-fm', band: 'fm', frequency: 91.3, callSign: 'WCUW',
    name: 'WCUW Community Radio', format: 'Community / eclectic', city: 'Worcester, MA',
    streamUrl: 'https://peridot.streamguys1.com:5495/live',
    website: 'https://wcuw.org/listen/', recommended: true, reception: 'local',
  },
  {
    id: 'wtag-fm', band: 'fm', frequency: 94.9, callSign: 'WTAG',
    name: 'News Radio WTAG', format: 'News / talk', city: 'Worcester, MA',
    website: 'https://wtag.iheart.com/', recommended: false, reception: 'local',
    note: 'FM relay of 580 AM. A direct stream has not been verified; use the station player.',
  },
  {
    id: 'wxrb-fm', band: 'fm', frequency: 95.1, callSign: 'WXRB',
    name: 'The Golden 95.1', format: 'Oldies', city: 'Dudley / Webster, MA',
    website: 'https://wxrbfm.org/', recommended: false, reception: 'local',
    note: 'The published direct stream refused playback during checking. Try the station player.',
  },
  {
    id: 'wsrs-fm', band: 'fm', frequency: 96.1, callSign: 'WSRS',
    name: '96-1 SRS', format: 'Adult contemporary', city: 'Worcester, MA',
    website: 'https://961srs.iheart.com/', recommended: false, reception: 'local',
    note: 'A direct stream has not been verified here. The station offers its own web player.',
  },
  {
    id: 'winy-fm', band: 'fm', frequency: 97.1, callSign: 'WINY',
    name: 'WINY', format: 'Local news / music', city: 'Putnam, CT',
    streamUrl: WINY_STREAM, website: 'https://www.winyradio.com/streaming/',
    recommended: false, reception: 'local', note: 'FM relay of 1350 AM. Some sports may differ online.',
  },
  {
    id: 'wnrc-fm', band: 'fm', frequency: 97.5, callSign: 'WNRC-LP',
    name: 'Nichols College Radio', format: 'College / variety', city: 'Dudley, MA',
    website: 'https://wnrc.nichols.edu/', recommended: false, reception: 'local',
    note: 'The published direct stream refused playback during checking. Try the station player.',
  },
  {
    id: 'worc-fm', band: 'fm', frequency: 98.9, callSign: 'WORC-FM',
    name: '98.9 Nash Icon', format: 'Country', city: 'Webster / Worcester, MA',
    streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/WORCFM.mp3',
    website: 'https://www.nashicon989.com/', recommended: true, reception: 'local',
    note: 'The stream may begin with an advertisement; some sports may differ online.',
  },
  {
    id: 'wqvr-fm', band: 'fm', frequency: 99.3, callSign: 'WQVR',
    name: 'Quinebaug Valley Radio', format: 'Classic hits / local news', city: 'Webster / Southbridge, MA',
    streamUrl: WQVR_STREAM, website: 'https://wqvrradio.com/',
    recommended: true, reception: 'local', note: 'FM relay of 940 AM; formerly known as The Lake.',
  },
  {
    id: 'wcrb-fm', band: 'fm', frequency: 99.5, callSign: 'WCRB',
    name: 'CRB Classical', format: 'Classical', city: 'Greater Boston, MA',
    streamUrl: 'https://wgbh-live.streamguys1.com/classical-hi/',
    website: 'https://www.wgbh.org/help/how-to-access-live-radio-streams',
    recommended: false, reception: 'regional', note: 'Regional station; reception in Webster varies.',
  },
  {
    id: 'wwfx-fm', band: 'fm', frequency: 100.1, callSign: 'WWFX',
    name: '100 FM The Pike', format: 'Classic rock', city: 'Southbridge / Worcester, MA',
    streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/WWFXFM.mp3',
    website: 'https://www.pikefm.com/', recommended: true, reception: 'local',
    note: 'The station brands itself as 100 FM; its dial frequency is 100.1.',
  },
  {
    id: 'wxlo-fm', band: 'fm', frequency: 104.5, callSign: 'WXLO',
    name: '104.5 XLO', format: 'Pop / adult contemporary', city: 'Fitchburg / Worcester, MA',
    streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/WXLOFM.mp3',
    website: 'https://www.wxlo.com/', recommended: false, reception: 'local',
    note: 'The stream may begin with an advertisement.',
  },
  {
    id: 'wtag-am', band: 'am', frequency: 580, callSign: 'WTAG',
    name: 'News Radio WTAG', format: 'News / talk', city: 'Worcester, MA',
    website: 'https://wtag.iheart.com/', recommended: false, reception: 'local',
    note: 'Also on 94.9 FM. A direct stream has not been verified; use the station player.',
  },
  {
    id: 'wcrn-am', band: 'am', frequency: 830, callSign: 'WCRN',
    name: 'Radio Central', format: 'Local news / talk', city: 'Worcester, MA',
    streamUrl: 'https://us2.maindigitalstream.com/ssl/WCRN',
    website: 'https://wcrnradio.com/', recommended: true, reception: 'local',
  },
  {
    id: 'wqvr-am', band: 'am', frequency: 940, callSign: 'WQVR',
    name: 'Quinebaug Valley Radio', format: 'Classic hits / local news', city: 'Webster / Southbridge, MA',
    streamUrl: WQVR_STREAM, website: 'https://wqvrradio.com/',
    recommended: false, reception: 'local', note: 'Also on 99.3 FM. Former call sign WGFP.',
  },
  {
    id: 'weso-am', band: 'am', frequency: 970, callSign: 'WESO',
    name: 'The Station of the Cross', format: 'Catholic talk', city: 'Southbridge, MA',
    streamUrl: CENTRAL_NEW_ENGLAND_STREAM,
    website: 'https://thestationofthecross.com/stations/southbridge-ma/',
    recommended: false, reception: 'local', note: 'Central New England feed shared with 1230 AM WNEB.',
  },
  {
    id: 'wqom-am', band: 'am', frequency: 1060, callSign: 'WQOM',
    name: 'The Station of the Cross', format: 'Catholic talk', city: 'Natick / Boston, MA',
    streamUrl: 'https://hfc.streamguys1.com/wqom',
    website: 'https://thestationofthecross.com/stations/boston-ma/',
    recommended: false, reception: 'regional', note: 'Regional station; reception in Webster varies.',
  },
  {
    id: 'wneb-am', band: 'am', frequency: 1230, callSign: 'WNEB',
    name: 'The Station of the Cross', format: 'Catholic talk', city: 'Worcester, MA',
    streamUrl: CENTRAL_NEW_ENGLAND_STREAM,
    website: 'https://thestationofthecross.com/stations/worcester-ma/',
    recommended: false, reception: 'local', note: 'Central New England feed shared with 970 AM WESO.',
  },
  {
    id: 'winy-am', band: 'am', frequency: 1350, callSign: 'WINY',
    name: 'WINY', format: 'Local news / music', city: 'Putnam, CT',
    streamUrl: WINY_STREAM, website: 'https://www.winyradio.com/streaming/',
    recommended: false, reception: 'local', note: 'Also on 97.1 FM. Some sports may differ online.',
  },
];

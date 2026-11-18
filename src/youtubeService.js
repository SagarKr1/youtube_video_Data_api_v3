const API_BASE = 'https://www.googleapis.com/youtube/v3';

export class YouTubeError extends Error {
  constructor(message, kind = 'api') { super(message); this.name = 'YouTubeError'; this.kind = kind; }
}

function friendlyError(payload, status) {
  const reason = payload?.error?.errors?.[0]?.reason;
  if (status === 403 && ['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].includes(reason)) {
    return new YouTubeError('YouTube API quota has been exceeded. Try again after the quota resets.', 'quota');
  }
  if (reason === 'keyInvalid' || status === 400 && payload?.error?.message?.toLowerCase().includes('key')) {
    return new YouTubeError('The YouTube API key is invalid. Check VITE_YOUTUBE_API_KEY in your .env file.', 'key');
  }
  if (status === 403 && (reason === 'accessNotConfigured' || payload?.error?.message?.includes('has not been used'))) {
    return new YouTubeError('YouTube Data API v3 is not enabled for this Google Cloud project.', 'configuration');
  }
  if (status === 403) return new YouTubeError(payload?.error?.message || 'YouTube denied this request. Check the API key restrictions.', 'permission');
  if (status === 404) return new YouTubeError('The requested YouTube resource could not be found.', 'not-found');
  return new YouTubeError(payload?.error?.message || `YouTube API request failed (${status}).`, 'api');
}

async function request(resource, params, signal) {
  const key = import.meta.env.VITE_YOUTUBE_API_KEY;
  if (!key) throw new YouTubeError('Add VITE_YOUTUBE_API_KEY to a .env file, then restart the dev server.', 'missing-key');
  const query = new URLSearchParams({ ...params, key });
  let response;
  try { response = await fetch(`${API_BASE}/${resource}?${query}`, { signal }); }
  catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new YouTubeError('Network request failed. Check your connection and try again.', 'network');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw friendlyError(payload, response.status);
  return payload;
}

function parseChannelInput(input) {
  const value = input.trim();
  const urlMatch = value.match(/youtube\.com\/(?:channel\/([\w-]+)|@([\w.-]+)|(?:c|user)\/([^/?#]+))/i);
  if (urlMatch?.[1]) return { id: urlMatch[1] };
  const handle = value.startsWith('@') ? value : urlMatch?.[2] ? `@${urlMatch[2]}` : null;
  if (handle) return { handle };
  if (urlMatch?.[3]) return { query: decodeURIComponent(urlMatch[3]) };
  return { query: value };
}

export async function searchChannels(input, signal) {
  const parsed = parseChannelInput(input);
  if (parsed.id) {
    const data = await request('channels', { part: 'snippet,statistics,contentDetails', id: parsed.id, maxResults: '1' }, signal);
    return data.items || [];
  }
  if (parsed.handle) {
    const data = await request('channels', { part: 'snippet,statistics,contentDetails', forHandle: parsed.handle, maxResults: '1' }, signal);
    if (data.items?.length) return data.items;
    // Older handles may need regular channel search as a fallback.
  }
  const data = await request('search', { part: 'snippet', type: 'channel', q: parsed.query || parsed.handle, maxResults: '10' }, signal);
  return (data.items || []).map((item) => ({
    id: item.id.channelId,
    snippet: item.snippet,
  }));
}

export async function getChannel(channelId, signal) {
  const data = await request('channels', { part: 'snippet,statistics,contentDetails', id: channelId, maxResults: '1' }, signal);
  if (!data.items?.length) throw new YouTubeError('This channel was not found or is not publicly available.', 'not-found');
  return data.items[0];
}

export async function fetchAllVideos(channel, onProgress, signal) {
  const playlistId = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) throw new YouTubeError('This channel does not expose a public uploads playlist.', 'unavailable');
  const ids = new Set();
  const videos = [];
  let pageToken;
  let pages = 0;
  do {
    const params = { part: 'snippet,contentDetails', playlistId, maxResults: '50' };
    if (pageToken) params.pageToken = pageToken;
    const data = await request('playlistItems', params, signal);
    const pageIds = [];
    for (const item of data.items || []) {
      const id = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      if (id && !ids.has(id)) { ids.add(id); pageIds.push(id); }
    }
    pageToken = data.nextPageToken;
    pages++;
    onProgress({ phase: 'playlist', fetched: ids.size, page: pages });
    // Resolve each playlist page as it arrives so useful results survive a later
    // playlist or details request failure. videos.list still receives <= 50 IDs.
    for (let index = 0; index < pageIds.length; index += 50) {
      const batch = pageIds.slice(index, index + 50);
      const details = await request('videos', {
        part: 'snippet,contentDetails,statistics', id: batch.join(','),
      }, signal);
      videos.push(...(details.items || []));
      videos.sort((a, b) => new Date(b.snippet?.publishedAt || 0) - new Date(a.snippet?.publishedAt || 0));
      onProgress({ phase: 'details', fetched: videos.length, total: ids.size, page: pages, videos: [...videos] });
    }
  } while (pageToken);
  return videos.sort((a, b) => new Date(b.snippet?.publishedAt || 0) - new Date(a.snippet?.publishedAt || 0));
}

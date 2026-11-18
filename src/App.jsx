import { useMemo, useRef, useState } from 'react';
import { fetchAllVideos, getChannel, searchChannels, YouTubeError } from './youtubeService.js';

function formatCount(value) {
  if (value == null) return 'Hidden';
  return Number(value).toLocaleString();
}

function formatDuration(value = 'PT0S') {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const parts = [Number(match?.[1] || 0), Number(match?.[2] || 0), Number(match?.[3] || 0)];
  return parts[0]
    ? `${parts[0]}:${String(parts[1]).padStart(2, '0')}:${String(parts[2]).padStart(2, '0')}`
    : `${parts[1]}:${String(parts[2]).padStart(2, '0')}`;
}

function prettyDate(value) {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function ChannelChooser({ channels, onSelect }) {
  return <section className="chooser panel" aria-label="Choose a channel">
    <div className="section-heading"><div><span className="eyebrow">SEARCH RESULTS</span><h2>Choose the right channel</h2></div><span className="result-count">{channels.length} matches</span></div>
    <div className="channel-options">{channels.map((channel) => <button className="channel-option" key={channel.id} onClick={() => onSelect(channel)}>
      <img src={channel.snippet?.thumbnails?.default?.url || ''} alt="" />
      <span className="option-copy"><strong>{channel.snippet?.title || 'YouTube channel'}</strong><small>{channel.snippet?.customUrl || channel.id}</small></span>
      <span className="arrow">↗</span>
    </button>)}</div>
  </section>;
}

function VideoCard({ video }) {
  const snippet = video.snippet || {};
  const stats = video.statistics || {};
  const thumb = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url;
  return <article className="video-card">
    <a className="thumbnail" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer" aria-label={`Watch ${snippet.title || 'video'} on YouTube`}>
      {thumb ? <img src={thumb} alt="" loading="lazy" /> : <div className="thumb-placeholder">▶</div>}
      <span className="duration">{formatDuration(video.contentDetails?.duration)}</span>
      <span className="play-icon">▶</span>
    </a>
    <div className="video-copy"><div className="video-date">{prettyDate(snippet.publishedAt)}</div><h3 title={snippet.title}>{snippet.title || 'Untitled video'}</h3>
      <div className="video-stats"><span>◉ {formatCount(stats.viewCount)} views</span>{stats.likeCount != null && <span>♡ {formatCount(stats.likeCount)}</span>}</div>
      <a className="watch-link" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer">Watch on YouTube <span>↗</span></a>
    </div>
  </article>;
}

export default function App() {
  const [input, setInput] = useState('');
  const [channels, setChannels] = useState([]);
  const [channel, setChannel] = useState(null);
  const [videos, setVideos] = useState([]);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [visible, setVisible] = useState(24);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [partial, setPartial] = useState(false);
  const [searching, setSearching] = useState(false);
  const [fetching, setFetching] = useState(false);
  const controller = useRef(null);

  async function search(event) {
    event?.preventDefault();
    if (!input.trim() || busy) return;
    controller.current?.abort();
    controller.current = new AbortController();
    setBusy(true); setSearching(true); setError(''); setPartial(false); setChannels([]); setChannel(null); setVideos([]); setProgress(null);
    try {
      const results = await searchChannels(input, controller.current.signal);
      if (!results.length) throw new YouTubeError('No matching channel found. Check the name or handle and try again.', 'not-found');
      setChannels(results);
      if (results.length === 1) await chooseChannel(results[0]);
    } catch (e) { if (e.name !== 'AbortError') setError(e.message || 'Could not search YouTube.'); }
    finally { setSearching(false); setBusy(false); }
  }

  async function chooseChannel(result) {
    if (busy && !searching) return;
    setBusy(true); setFetching(true); setError(''); setChannels([]); setVideos([]); setPartial(false); setProgress({ phase: 'channel', fetched: 0 });
    controller.current?.abort(); controller.current = new AbortController();
    try {
      const full = await getChannel(result.id, controller.current.signal);
      setChannel(full);
      const complete = await fetchAllVideos(full, (nextProgress) => {
        setProgress(nextProgress);
        if (nextProgress.videos) setVideos(nextProgress.videos);
      }, controller.current.signal);
      setVideos(complete); setPartial(false);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message || 'Could not fetch channel videos.');
        if (e.kind === 'network' || e.kind === 'quota' || e.kind === 'api') setPartial(true);
      }
    } finally { setFetching(false); setBusy(false); }
  }

  const shown = useMemo(() => {
    const filtered = videos.filter((video) => video.snippet?.title?.toLowerCase().includes(query.toLowerCase()));
    return filtered.sort((a, b) => {
      if (sort === 'oldest') return new Date(a.snippet?.publishedAt || 0) - new Date(b.snippet?.publishedAt || 0);
      if (sort === 'mostViewed') return Number(b.statistics?.viewCount || 0) - Number(a.statistics?.viewCount || 0);
      if (sort === 'leastViewed') return Number(a.statistics?.viewCount || 0) - Number(b.statistics?.viewCount || 0);
      return new Date(b.snippet?.publishedAt || 0) - new Date(a.snippet?.publishedAt || 0);
    });
  }, [videos, query, sort]);

  const progressLabel = progress?.phase === 'playlist'
    ? `Reading uploads · ${progress.fetched.toLocaleString()} found`
    : progress?.phase === 'details'
      ? `Loading video details · ${progress.fetched.toLocaleString()} of ${progress.total.toLocaleString()}`
      : 'Loading channel…';

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">▶</span><span>Channel<span className="brand-muted">scope</span></span></a><span className="topbar-note">YOUTUBE DATA EXPLORER</span></header>
    <div className="content" id="top">
      <section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="live-dot" /> CREATOR LIBRARY</span><h1>YouTube Channel<br /><span>Video Fetcher</span></h1><p>Explore every public upload from a channel, all in one place.</p>
        <form className="search-form" onSubmit={search}><span className="search-icon">⌕</span><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Channel name, @handle, or URL" aria-label="YouTube channel name, handle, or URL" /><button disabled={busy || !input.trim()}>{searching ? <><span className="spinner small" /> Searching</> : <>Find channel <span>→</span></>}</button></form>
        <div className="form-hint">Search by channel name, @handle, or youtube.com/channel URL</div>
      </div><div className="hero-art" aria-hidden="true"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-orb"><span>▶</span></div><div className="art-card art-card-one"><i>↗</i><b>Every upload</b><small>in one library</small></div><div className="art-card art-card-two"><span className="equalizer"><i/><i/><i/><i/><i/></span><b>50+</b><small>per page</small></div><div className="spark spark-a">✳</div><div className="spark spark-b">✦</div></div></section>

      {error && <div className={`alert ${partial ? 'alert-partial' : ''}`} role="alert"><span className="alert-icon">!</span><div><strong>{partial ? 'Fetch interrupted' : 'Something went wrong'}</strong><p>{error}{partial && videos.length > 0 ? ` ${videos.length.toLocaleString()} videos were fetched before the error.` : ''}</p></div>{channel && <button className="retry-button" disabled={busy} onClick={() => chooseChannel(channel)}>Retry</button>}</div>}
      {channels.length > 1 && <ChannelChooser channels={channels} onSelect={chooseChannel} />}
      {busy && <div className="loading panel"><span className="spinner"/><div><strong>{progressLabel || 'Searching YouTube…'}</strong><small>{fetching ? 'Large channels can take a little while. Keep this page open.' : 'Finding matching channels'}</small></div></div>}

      {channel && <>
        <section className="channel-panel panel"><div className="channel-avatar">{channel.snippet?.thumbnails?.medium?.url ? <img src={channel.snippet.thumbnails.medium.url} alt={`${channel.snippet.title} profile`} /> : <span>{channel.snippet?.title?.[0] || 'Y'}</span>}</div><div className="channel-main"><span className="eyebrow">CHANNEL OVERVIEW</span><h2>{channel.snippet?.title}</h2><p>{channel.snippet?.description || 'This channel has no public description.'}</p><div className="channel-stats"><span><strong>{formatCount(channel.statistics?.subscriberCount)}</strong><small>Subscribers</small></span><i/><span><strong>{formatCount(channel.statistics?.videoCount)}</strong><small>Channel videos</small></span><i/><span><strong>{videos.length.toLocaleString()}</strong><small>Fetched here</small></span></div></div><div className="verified-mark" title="Public channel">✓</div></section>
        <section className="videos-section"><div className="section-heading videos-heading"><div><span className="eyebrow">THE LIBRARY</span><h2>Uploaded videos <span className="count-pill">{videos.length.toLocaleString()}</span></h2></div><span className="completion-label">{fetching ? <><span className="live-dot"/> FETCHING</> : partial ? 'PARTIAL RESULTS' : videos.length ? 'ALL AVAILABLE UPLOADS' : 'READY'}</span></div>
          {videos.length > 0 && <div className="toolbar"><label className="filter-input"><span>⌕</span><input value={query} onChange={(e) => { setQuery(e.target.value); setVisible(24); }} placeholder="Filter videos by title…" /></label><label className="sort-select"><span>Sort by</span><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="mostViewed">Most viewed</option><option value="leastViewed">Least viewed</option></select></label></div>}
          {videos.length > 0 ? <><div className="video-grid">{shown.slice(0, visible).map((video) => <VideoCard key={video.id} video={video} />)}</div>{shown.length > visible && <button className="load-more" onClick={() => setVisible((n) => n + 24)}>Show more videos <span>↓</span><small>{(shown.length - visible).toLocaleString()} remaining</small></button>}{shown.length === 0 && <div className="empty-state">No videos match “{query}”.</div>}</> : !fetching && !error && <div className="empty-state">This channel has no publicly available uploads.</div>}
        </section>
      </>}

      {!channel && channels.length === 0 && !busy && !error && <section className="empty-intro"><div className="empty-icon">▤</div><div><strong>Your next deep dive starts here</strong><p>Search for a channel to see its profile and full upload library.</p></div><span className="empty-arrow">↗</span></section>}
      <footer><span>CHANNELSCOPE</span><span>Powered by YouTube Data API v3</span><span>Public channel data only</span></footer>
    </div>
  </main>;
}

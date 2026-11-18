import { useEffect, useState } from 'react';
import { getVideo } from './youtubeService.js';

function readableDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function durationLabel(value = '') {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';
  const [hours, minutes, seconds] = [Number(match[1] || 0), Number(match[2] || 0), Number(match[3] || 0)];
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function WatchPage() {
  const videoId = decodeURIComponent(window.location.pathname.split('/').filter(Boolean).at(-1) || '');
  const [video, setVideo] = useState(null);
  const [error, setError] = useState('');
  const [suggestions] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('channelscope-suggestions') || '[]');
      return Array.isArray(saved) ? saved.filter((item) => item?.id && item.id !== videoId).slice(0, 12) : [];
    } catch { return []; }
  });

  useEffect(() => {
    if (!/^[\w-]{11}$/.test(videoId)) {
      setError('This video link is not valid.');
      return undefined;
    }
    const controller = new AbortController();
    getVideo(videoId, controller.signal)
      .then((result) => {
        if (result) setVideo(result);
        else setError('This video is unavailable or not public.');
      })
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message || 'Could not load video details.');
      });
    return () => controller.abort();
  }, [videoId]);

  return <main className="watch-shell">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">▶</span><span>Channel<span className="brand-muted">scope</span></span></a><a className="back-link" href="/">← Back to channel search</a></header>
    <div className="watch-content watch-layout">
      <div className="watch-main">
        <div className="player-frame"><iframe
        src={`https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`}
        title={video?.snippet?.title || 'YouTube video player'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        /></div>
        {error && <div className="watch-error" role="status">{error} The player may also be unavailable if the uploader has disabled embedding.</div>}
        <section className="watch-details">
          <span className="eyebrow">NOW PLAYING</span>
          <h1>{video?.snippet?.title || 'Loading video…'}</h1>
          {video && <div className="watch-meta"><strong>{video.snippet?.channelTitle}</strong>{video.snippet?.publishedAt && <><i />{readableDate(video.snippet.publishedAt)}</>}{video.statistics?.viewCount != null && <><i />{Number(video.statistics.viewCount).toLocaleString()} views</>}</div>}
          {video?.snippet?.description && <p className="watch-description">{video.snippet.description}</p>}
        </section>
      </div>
      <aside className="suggestions-panel">
        <div className="suggestions-heading"><span className="eyebrow">KEEP WATCHING</span><h2>Suggested videos</h2><p>More from this channel</p></div>
        {suggestions.length ? <div className="suggestion-list">{suggestions.map((item) => <a className="suggestion-card" href={`/watch/${item.id}`} key={item.id}>
          <span className="suggestion-thumb">{item.thumbnail && <img src={item.thumbnail} alt="" loading="lazy"/>}<span>{durationLabel(item.duration) || '▶'}</span></span>
          <span className="suggestion-copy"><strong>{item.title}</strong><small>{item.views ? `${Number(item.views).toLocaleString()} views` : ''}</small></span>
        </a>)}</div> : <div className="suggestions-empty">Open a video from the channel library to see more uploads here.</div>}
      </aside>
      <footer><span>CHANNELSCOPE</span><span>Playback by YouTube</span><span>Public video data</span></footer>
    </div>
  </main>;
}

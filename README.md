# YouTube Channel Video Fetcher

Frontend-only React + Vite app for finding a YouTube channel and browsing its publicly available uploads with video statistics.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `VITE_YOUTUBE_API_KEY` to a YouTube Data API v3 key.
3. Start the app with `npm run dev`.

The app uses `search.list` for channel-name discovery, `channels.list` for channel metadata and uploads playlist, `playlistItems.list` for paginated uploads, and `videos.list` in batches of up to 50 for details.

Select a video thumbnail or “Play in new page” to open the app’s `/watch/:videoId` page in a new tab. Playback uses YouTube’s embedded player; a video can only play there when its owner allows embedding.

## API key restrictions

Vite exposes `VITE_` variables in the browser bundle and YouTube requests. This key is visible to users; an environment variable does not make a frontend API key secret. In Google Cloud, restrict the key to YouTube Data API v3 and set HTTP referrer restrictions for your development and production domains. Never commit a real `.env` file.

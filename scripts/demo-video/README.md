# Demo video pipeline

Regenerates the narrated product walkthrough served at /demo (`/clips/flycheap-demo.mp4`).

1. `npm i playwright-core` (uses system Chrome, no browser download)
2. Mint a 1-day session for user 1 on the server and save it to `session-token.txt`:
   `INSERT INTO sessions (token,user_id,expires_at) VALUES ('demo_<rand>',1,datetime('now','+1 day'));`
3. `bash narration.sh` — edge-tts voiceover (en-US-AndrewNeural), 8 segments into `audio/`
4. `node record.js` — records 8 scenes of the live site into `scenes/` (timed to each audio segment)
5. `bash assemble.sh` — trims each scene to its narration, muxes audio, concats to `flycheap-demo.mp4` + poster
6. Upload both files to `/opt/egyptair-tracker/public/clips/` and update chapter timestamps in `src/app/demo/page.tsx` if narration changed (cumulative audio durations).
7. Delete the demo session row.

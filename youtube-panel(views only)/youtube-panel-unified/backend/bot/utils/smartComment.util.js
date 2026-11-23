/**
 * Smart video-aware comment generator.
 * 1) Fetches YouTube title (oEmbed – no API key)
 * 2) Detects theme: gaming, emotional, tutorial, music, funny, sports, tech, general
 * 3) Returns unique comments matching that theme
 * 4) Optional AI: set GROQ_API_KEY or OPENAI_API_KEY for higher quality
 */

'use strict';

const https = require('https');
const http = require('http');

const THEME_KEYWORDS = {
  gaming: [
    'game', 'gaming', 'gameplay', 'gamer', 'fortnite', 'minecraft', 'valorant',
    'pubg', 'bgmi', 'gta', 'roblox', 'stream', 'esports', 'rank', 'clutch',
    'noob', 'pro player', 'boss fight', 'walkthrough', 'let\'s play', 'speedrun',
  ],
  emotional: [
    'sad', 'cry', 'emotional', 'tears', 'heartbreaking', 'love story', 'miss you',
    'tribute', 'memorial', 'broke up', 'depression', 'motivation', 'inspire',
    'never give up', 'life lesson', 'true story', 'feelings', 'heart touching',
    'ससुराल', 'कहानी', 'बेहन', 'बहन', 'रोमांस', 'दर्द', 'आंसू', 'मोहब्बत',
    'प्रेम', 'दुख', 'part-', 'saas', 'bahu', 'serial', 'drama',
  ],
  tutorial: [
    'how to', 'tutorial', 'guide', 'learn', 'tips', 'tricks', 'explained',
    'step by step', 'beginner', 'course', 'lesson', 'hack', 'fix', 'setup',
    'install', 'coding', 'programming', 'photoshop', 'excel',
  ],
  music: [
    'song', 'music', 'lyrics', 'album', 'concert', 'singer', 'rap', 'beat',
    'cover', 'remix', 'melody', 'guitar', 'piano', 'official video', 'mv',
  ],
  funny: [
    'funny', 'comedy', 'joke', 'meme', 'lol', 'roast', 'prank', 'fail',
    'try not to laugh', 'hilarious', 'standup', 'sketch',
  ],
  sports: [
    'football', 'cricket', 'match', 'goal', 'highlights', 'nba', 'fifa',
    'tennis', 'wrestling', 'ufc', 'ipl', 'world cup', 'championship',
  ],
  tech: [
    'iphone', 'android', 'review', 'unboxing', 'gadget', 'ai', 'chatgpt',
    'software', 'app', 'laptop', 'camera', 'drone', 'tech',
  ],
};

const COMMENT_BANKS = {
  gaming: [
    'That clutch was insane 🔥',
    'Gameplay looks so clean, respect!',
    'This is pure skill, not luck 👏',
    'Need more videos like this from you!',
    'Rank push vibes only 💪',
    'Bro the aim is crazy in this one',
    'Best gameplay I\'ve seen today',
    'That ending though... legendary',
    'Teach me those moves 😅',
    'This game hits different with you',
  ],
  emotional: [
    'This really hit me hard ❤️',
    'Got tears in my eyes watching this',
    'So beautiful and emotional, thank you',
    'Needed this today, pure feelings',
    'Heart touching content 💔',
    'Can\'t stop thinking about this video',
    'You put real emotion into this',
    'This story stays with you',
    'Sending love to everyone watching 🤍',
    'Truly moving, well done',
  ],
  tutorial: [
    'Super clear explanation, thanks!',
    'Finally understood this, great tutorial',
    'Step by step and easy to follow 👍',
    'Saved me so much time, appreciate it',
    'Best guide on this topic honestly',
    'Bookmarked for later, very helpful',
    'You make learning look easy',
    'Exactly what I was looking for',
    'Clear, short and useful – perfect',
    'More tutorials like this please!',
  ],
  music: [
    'This song is on loop now 🎵',
    'Vocals are pure magic',
    'Beat hits different, love it',
    'Added to my playlist instantly',
    'Chills every time I listen',
    'Underrated track, more people need this',
    'Production quality is top tier',
    'This melody stays in your head',
    'Fire track 🔥🔥',
    'Who else is vibing with this?',
  ],
  funny: [
    'I can\'t stop laughing 😂',
    'This made my day, pure comedy',
    'Bro went too far with this one 🤣',
    'Try not to laugh challenge: failed',
    'Comedy gold right here',
    'My stomach hurts from laughing',
    'Who else replayed this 5 times?',
    'This is too funny to ignore',
    'Best humor content today',
    'You\'re actually hilarious',
  ],
  sports: [
    'What a match, highlights are crazy!',
    'That moment was pure class ⚽',
    'Best play of the game hands down',
    'Energy in this video is unmatched',
    'Sports content done right',
    'Got goosebumps watching this',
    'Legend performance, respect',
    'This is why we love the game',
    'Clutch when it mattered most',
    'Unreal skill on display',
  ],
  tech: [
    'Really useful review, thanks!',
    'Helped me decide what to buy',
    'Clear pros and cons, well done',
    'Tech content I actually trust',
    'Detailed and honest, appreciate it',
    'Exactly the comparison I needed',
    'Great breakdown of the features',
    'Subscribed for more tech videos',
    'Clean editing and solid info',
    'This saved me from a bad purchase',
  ],
  general: [
    'Nice video! Really enjoyed it 🔥',
    'Great content, keep it up!',
    'Quality is always on point with you',
    'This was worth the watch',
    'Solid video, thanks for sharing',
    'You never disappoint with content',
    'Loved every minute of this',
    'More videos like this please!',
    'Instantly liked and shared',
    'Respect for the effort put in 👏',
  ],
};

function httpGetJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

/**
 * Fetch YouTube video title (and author) via oEmbed – no API key needed.
 */
async function fetchVideoMeta(videoUrl) {
  const encoded = encodeURIComponent(videoUrl);
  const endpoints = [
    `https://www.youtube.com/oembed?url=${encoded}&format=json`,
    `https://noembed.com/embed?url=${encoded}`,
  ];
  for (const ep of endpoints) {
    try {
      const data = await httpGetJson(ep, 8000);
      if (data && (data.title || data.author_name)) {
        return {
          title: String(data.title || '').trim(),
          author: String(data.author_name || data.author || '').trim(),
        };
      }
    } catch (_) {
      /* try next */
    }
  }
  return { title: '', author: '' };
}

function detectTheme(text) {
  const lower = (text || '').toLowerCase();
  let best = 'general';
  let bestScore = 0;
  for (const [theme, words] of Object.entries(THEME_KEYWORDS)) {
    let score = 0;
    for (const w of words) {
      if (lower.includes(w)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = theme;
    }
  }
  return best;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Optional AI generation via Groq (free tier) or OpenAI.
 * Env: GROQ_API_KEY or OPENAI_API_KEY
 * Default Groq model (2026 free tier): openai/gpt-oss-20b
 */
async function generateWithAI(title, author, count) {
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  const openKey = (process.env.OPENAI_API_KEY || '').trim();

  if (!groqKey && !openKey) {
    console.log('[SmartComment] No GROQ_API_KEY / OPENAI_API_KEY in env – using theme bank');
    return null;
  }

  if (groqKey) {
    console.log(
      `[SmartComment] GROQ key loaded (…${groqKey.slice(-4)}), model=${process.env.GROQ_MODEL || 'qwen/qwen3.8-27b'}`
    );
  }

  const prompt = `You write short YouTube comments. Video title: "${title}". Channel: "${author || 'unknown'}".
Write ${count} different natural comments a real viewer might post. Match the mood of the video (funny, emotional, gaming, tutorial, drama, kids toys, etc.).

STRICT rules:
- EVERY comment MUST include 1 to 3 relevant emojis (🔥 😍 😂 ❤️ 👏 🎮 🥹 💯 🚀 etc.)
- max 12 words each, casual like a real YouTube viewer
- vary style: some short emoji-heavy, some short sentence + emoji
- no hashtags, no links, do not copy the full title
- language: mainly English, but 1-2 can be simple Hindi if title is Hindi

Return ONLY a JSON array of strings, nothing else. Example:
["That gameplay was insane 🔥🎮","Kids will love this 🚌😍","Bro cooked 💯🔥"]`;

  // Try models in order (first works on current Groq free tier)
  const groqModels = [
    process.env.GROQ_MODEL,
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'allam-2-7b',
  ].filter(Boolean);

  try {
    if (groqKey) {
      let lastErr = null;
      for (const model of groqModels) {
        try {
          const body = JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.9,
            max_tokens: 600,
          });
          const data = await postJson(
            'https://api.groq.com/openai/v1/chat/completions',
            body,
            { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' }
          );
          if (data.error) {
            lastErr = data.error.message || JSON.stringify(data.error);
            console.warn(`[SmartComment] Groq model "${model}" error: ${lastErr}`);
            continue;
          }
          const msg = data?.choices?.[0]?.message || {};
          let text = msg.content || msg.reasoning || msg.raw || '';
          if (Array.isArray(text)) {
            text = text.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('\n');
          }
          text = String(text || '').trim();
          if (!text) {
            // dump keys for debug
            const keys = msg && typeof msg === 'object' ? Object.keys(msg).join(',') : '';
            lastErr = `empty content (message keys: ${keys})`;
            console.warn(`[SmartComment] Groq model "${model}" ${lastErr}`);
            console.warn('[SmartComment] raw choice sample:', JSON.stringify(data?.choices?.[0] || data).slice(0, 300));
            continue;
          }
          const parsed = parseCommentsReply(text, count);
          if (parsed && parsed.length) {
            console.log(`[SmartComment] AI OK via Groq model=${model} count=${parsed.length}`);
            return parsed;
          }
          lastErr = 'unparseable reply: ' + text.slice(0, 160);
          console.warn(`[SmartComment] Groq model "${model}" bad reply: ${lastErr}`);
        } catch (e) {
          lastErr = e.message;
          console.warn(`[SmartComment] Groq model "${model}" request failed: ${e.message}`);
        }
      }
      console.warn('[SmartComment] All Groq models failed:', lastErr);
      return null;
    }

    if (openKey) {
      const body = JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_tokens: 600,
      });
      const data = await postJson(
        'https://api.openai.com/v1/chat/completions',
        body,
        { Authorization: `Bearer ${openKey}`, 'Content-Type': 'application/json' }
      );
      if (data.error) {
        console.warn('[SmartComment] OpenAI error:', data.error.message || data.error);
        return null;
      }
      const text = data?.choices?.[0]?.message?.content || '';
      return parseJsonArray(text);
    }
  } catch (e) {
    console.warn('[SmartComment] AI generate failed:', e.message);
  }
  return null;
}

function postJson(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        timeout: 25000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data || '{}');
            // Attach status for debugging (non-enumerable-ish via field)
            if (res.statusCode && res.statusCode >= 400 && !json.error) {
              json.error = {
                message: `HTTP ${res.statusCode}: ${String(data).slice(0, 200)}`,
              };
            }
            resolve(json);
          } catch (e) {
            reject(new Error(`Invalid JSON (HTTP ${res.statusCode}): ${String(data).slice(0, 150)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.write(body);
    req.end();
  });
}

function parseJsonArray(text) {
  if (!text) return null;
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < 0) return null;
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    return arr
      .map((x) => String(x || '').trim())
      .filter((x) => x.length > 2 && x.length < 200);
  } catch (_) {
    return null;
  }
}

/** Accept JSON array OR plain numbered/bulleted lines */
function parseCommentsReply(text, need = 5) {
  const fromJson = parseJsonArray(text);
  if (fromJson && fromJson.length) return fromJson;

  const lines = String(text)
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^\s*[-*•]\s*/, '')
        .replace(/^\s*\d+[.)]\s*/, '')
        .replace(/^\s*"|"\s*$/g, '')
        .replace(/^\s*'|'\s*$/g, '')
        .trim()
    )
    .filter((l) => l.length > 2 && l.length < 200 && !/^here (are|is)/i.test(l) && !/^comments?:?$/i.test(l));

  if (lines.length) return lines.slice(0, Math.max(need, lines.length));
  return null;
}

/**
 * Main API: generate `count` unique comments for a video URL.
 * @returns {Promise<{ comments: string[], theme: string, title: string }>}
 */
async function generateCommentsForVideo(videoUrl, count = 5) {
  const n = Math.max(1, Math.min(50, parseInt(count, 10) || 5));
  const meta = await fetchVideoMeta(videoUrl);
  const blob = `${meta.title} ${meta.author}`;
  const theme = detectTheme(blob);

  console.log(
    `[SmartComment] title="${meta.title.slice(0, 60)}" theme=${theme} need=${n}`
  );

  // Prefer AI when key is present
  let ai = null;
  try {
    ai = await generateWithAI(meta.title, meta.author, n);
  } catch (e) {
    console.warn('[SmartComment] generateWithAI threw:', e.message);
    ai = null;
  }

  if (Array.isArray(ai) && ai.length >= Math.min(3, n)) {
    const unique = [];
    const seen = new Set();
    for (const c of ai) {
      const s = String(c || '').trim();
      if (s.length < 3 || seen.has(s)) continue;
      seen.add(s);
      unique.push(s);
      if (unique.length >= n) break;
    }
    const bank = COMMENT_BANKS[theme] || COMMENT_BANKS.general || COMMENT_BANKS.general;
    let i = 0;
    while (unique.length < n && bank.length) {
      const c = bank[i % bank.length];
      i++;
      if (!seen.has(c)) {
        seen.add(c);
        unique.push(c);
      }
      if (i > bank.length * 2) break;
    }
    console.log(`[SmartComment] Using AI comments: ${unique.length}`);
    return { comments: unique.slice(0, n), theme, title: meta.title, source: 'ai' };
  }

  // Theme bank fallback
  const bank = Array.isArray(COMMENT_BANKS[theme]) ? COMMENT_BANKS[theme] : COMMENT_BANKS.general;
  const general = COMMENT_BANKS.general;
  const mixed = shuffle([...(bank || []), ...(general || [])]);
  const out = [];
  const used = new Set();
  for (const c of mixed) {
    if (used.has(c)) continue;
    used.add(c);
    out.push(c);
    if (out.length >= n) break;
  }
  let i = 1;
  while (out.length < n) {
    out.push((bank && bank[0]) || 'Great video! 🔥');
    i++;
    if (i > 50) break;
  }

  return { comments: out.slice(0, n), theme, title: meta.title, source: 'theme' };
}

module.exports = {
  generateCommentsForVideo,
  fetchVideoMeta,
  detectTheme,
};

'use strict';
const cron = require('node-cron');
const https = require('https');
const http = require('http');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID  = process.env.TELEGRAM_GROUP_1_ID; // Indonesian
const GROUP_EN  = process.env.TELEGRAM_GROUP_2_ID; // English
const PORT      = process.env.PORT || 3000;
const SELF_URL  = 'https://tg-signal-bot-ehr4.onrender.com';

// ─── Health check server ──────────────────────────────────────────────────────
http.createServer(function (req, res) {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT, function () {
  console.log('[BOT] Health server on port ' + PORT);
});

// ─── Self-ping every 14 min to prevent service sleeping ──────────────────────
setInterval(function () {
  https.get(SELF_URL, function (res) {
    console.log('[PING] Self-ping OK: ' + res.statusCode);
  }).on('error', function (err) {
    console.error('[PING] Self-ping error: ' + err.message);
  });
}, 14 * 60 * 1000);

// ─── Telegram API ────────────────────────────────────────────────────────────
function telegramRequest(method, payload, callback) {
  var body = JSON.stringify(payload);
  var options = {
    hostname: 'api.telegram.org',
    path: '/bot' + BOT_TOKEN + '/' + method,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  };
  var req = https.request(options, function (res) {
    var data = '';
    res.on('data', function (c) { data += c; });
    res.on('end', function () {
      try {
        var parsed = JSON.parse(data);
        if (parsed.ok) { if (callback) callback(null, parsed.result); }
        else { if (callback) callback(new Error(parsed.description)); }
      } catch (e) { if (callback) callback(e); }
    });
  });
  req.on('error', function (e) { if (callback) callback(e); });
  req.write(body);
  req.end();
}

function sendTo(groupId, text) {
  telegramRequest('sendMessage', { chat_id: groupId, text: text, parse_mode: 'HTML' }, function (err, result) {
    if (err) console.error('[SEND ERROR] to ' + groupId + ': ' + err.message);
    else console.log('[SENT] to ' + groupId + ' | msg_id=' + result.message_id);
  });
}

function lockGroup(groupId) {
  telegramRequest('setChatPermissions', {
    chat_id: groupId,
    permissions: {
      can_send_messages: false, can_send_audios: false, can_send_documents: false,
      can_send_photos: false, can_send_videos: false, can_send_video_notes: false,
      can_send_voice_notes: false, can_send_polls: false,
      can_send_other_messages: false, can_add_web_page_previews: false
    }
  }, function (err) {
    if (err) console.error('[LOCK ERROR] ' + groupId + ': ' + err.message);
    else console.log('[LOCKED] ' + groupId);
  });
}

function unlockGroup(groupId) {
  telegramRequest('setChatPermissions', {
    chat_id: groupId,
    permissions: {
      can_send_messages: true, can_send_audios: true, can_send_documents: true,
      can_send_photos: true, can_send_videos: true, can_send_video_notes: true,
      can_send_voice_notes: true, can_send_polls: true,
      can_send_other_messages: true, can_add_web_page_previews: true
    }
  }, function (err) {
    if (err) console.error('[UNLOCK ERROR] ' + groupId + ': ' + err.message);
    else console.log('[UNLOCKED] ' + groupId);
  });
}

function deleteMsg(chatId, messageId) {
  telegramRequest('deleteMessage', { chat_id: chatId, message_id: messageId }, function (err) {
    if (err) console.error('[DELETE ERROR] ' + err.message);
    else console.log('[DELETED] msg ' + messageId + ' in ' + chatId);
  });
}

// ─── Admin cache (refreshed every 10 min) ────────────────────────────────────
var adminCache = {};

function refreshAdmins(chatId) {
  telegramRequest('getChatAdministrators', { chat_id: chatId }, function (err, result) {
    if (err) { console.error('[ADMIN] Fetch error for ' + chatId + ': ' + err.message); return; }
    adminCache[chatId] = {};
    result.forEach(function (m) { adminCache[chatId][m.user.id] = true; });
    console.log('[ADMIN] Refreshed ' + chatId + ': ' + result.length + ' admins');
  });
}

function isAdmin(chatId, userId) {
  return adminCache[chatId] && adminCache[chatId][userId] === true;
}

function refreshAllAdmins() { refreshAdmins(GROUP_ID); refreshAdmins(GROUP_EN); }
refreshAllAdmins();
setInterval(refreshAllAdmins, 10 * 60 * 1000);

// ─── Banned content filter ────────────────────────────────────────────────────
var BANNED = [
  // English curses
  'fuck','fucking','fucker','shit','bullshit','bitch','bastard','asshole',
  'ass','dick','cock','pussy','cunt','whore','slut','nigger','faggot',
  'motherfucker','damn','crap','piss','retard','idiot','moron','loser','stupid',
  // Scam / fraud
  'scam','scammer','fraud','fraudster','hack','hacker','phishing','ponzi',
  'fake','cheat','cheater','steal','stolen','blackmail','sextortion',
  'giveaway','doubling','free money','send me','dm me','dm for',
  'investment opportunity','guaranteed profit','get rich',
  // Indonesian curses
  'anjing','bangsat','babi','kontol','memek','jancok','jancuk','asu',
  'goblok','tolol','bodoh','brengsek','kampret','bajingan','keparat',
  'tai','pantek','setan','iblis','celaka','sialan','bedebah',
  // Harassment
  'kill yourself','kys','go die','shut up','stfu'
];

var LINK_PATTERN = /https?:\/\/|www\.|\.com\/|\.net\/|\.org\/|t\.me\/|bit\.ly|tinyurl/i;

function isBanned(text) {
  if (!text) return false;
  var lower = text.toLowerCase();
  if (LINK_PATTERN.test(text)) return true;
  for (var i = 0; i < BANNED.length; i++) {
    var word = BANNED[i];
    var idx = lower.indexOf(word);
    if (idx !== -1) {
      var before = idx === 0 || /\W/.test(lower[idx - 1]);
      var after  = idx + word.length >= lower.length || /\W/.test(lower[idx + word.length]);
      if (before && after) return true;
    }
  }
  return false;
}

// ─── Long polling (reads all messages — requires Privacy Mode OFF in BotFather) ─
var offset = 0;

function poll() {
  telegramRequest('getUpdates', { offset: offset, timeout: 30, allowed_updates: ['message'] }, function (err, updates) {
    if (err) {
      console.error('[POLL ERROR] ' + err.message);
      setTimeout(poll, 5000);
      return;
    }
    if (updates && updates.length > 0) {
      updates.forEach(function (update) {
        offset = update.update_id + 1;
        handleUpdate(update);
      });
    }
    setImmediate(poll);
  });
}

function handleUpdate(update) {
  var msg = update.message;
  if (!msg) return;
  var chatId = String(msg.chat.id);
  var userId  = msg.from && msg.from.id;
  var text    = msg.text || msg.caption || '';

  if (chatId !== String(GROUP_ID) && chatId !== String(GROUP_EN)) return;
  if (isAdmin(chatId, userId)) return;

  var shouldDelete = isBanned(text);

  if (!shouldDelete && msg.entities) {
    msg.entities.forEach(function (e) {
      if (e.type === 'url' || e.type === 'text_link') shouldDelete = true;
    });
  }

  if (shouldDelete) {
    console.log('[MODERATION] Deleting from user ' + userId + ': ' + text.substring(0, 60));
    deleteMsg(chatId, msg.message_id);
  }
}

poll();
console.log('[BOT] Polling started.');

// ─── Day helpers (WAT = UTC+1) ────────────────────────────────────────────────
var DAYS_ID = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
var DAYS_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function watDay() {
  return new Date(Date.now() + 60 * 60 * 1000).getDay();
}

// ─── Schedule (cron = UTC = WAT - 1 hr) ──────────────────────────────────────

// 5:00 AM WAT = 4:00 AM UTC — Unlock + Good morning
cron.schedule('0 4 * * *', function () {
  console.log('[CRON] 5AM WAT — Morning unlock + greeting');
  var d = watDay();
  unlockGroup(GROUP_ID);
  unlockGroup(GROUP_EN);
  sendTo(GROUP_ID, '<b>Selamat pagi semua, selamat hari ' + DAYS_ID[d] + '! 🌅\nSemoga hari ini penuh berkah dan profit untuk kita semua.</b>');
  sendTo(GROUP_EN, '<b>Good morning everyone, happy ' + DAYS_EN[d] + '! 🌅\nWishing everyone a blessed and profitable day.</b>');
}, { timezone: 'UTC' });

// 6:40 AM WAT = 5:40 AM UTC — Lock
cron.schedule('40 5 * * *', function () {
  console.log('[CRON] 6:40AM WAT — Lock');
  lockGroup(GROUP_ID); lockGroup(GROUP_EN);
}, { timezone: 'UTC' });

// 6:55 AM WAT = 5:55 AM UTC — Signal 1 warning
cron.schedule('55 5 * * *', function () {
  console.log('[CRON] 6:55AM WAT — Signal 1 warning');
  sendTo(GROUP_ID, '<b>Sinyal trading masuk 🚨🚨\nSinyal trading pertama hari ini akan segera dirilis, harap bersiap dan jangan sampai melewatkan sesi trading karena tidak ada kompensasi untuk sinyal yang terlewat</b>');
  sendTo(GROUP_EN, '<b>Incoming trading signal 🚨🚨\nThe first trading signal of the day is about to be released, please be prepared and never miss out on the trade sessions because there\'s no compensation for missed signals</b>');
}, { timezone: 'UTC' });

// 7:00 AM WAT = 6:00 AM UTC — Signal 1 release
cron.schedule('0 6 * * *', function () {
  console.log('[CRON] 7:00AM WAT — Signal 1 released');
  sendTo(GROUP_ID, '<b>Sinyal Pertama dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>');
  sendTo(GROUP_EN, '<b>First Signal released\nFollow Order\nExecute each trade accordingly and wait for the 2% profit</b>');
}, { timezone: 'UTC' });

// 7:05 AM WAT = 6:05 AM UTC — Unlock
cron.schedule('5 6 * * *', function () {
  console.log('[CRON] 7:05AM WAT — Unlock');
  unlockGroup(GROUP_ID); unlockGroup(GROUP_EN);
}, { timezone: 'UTC' });

// 9:40 AM WAT = 8:40 AM UTC — Lock
cron.schedule('40 8 * * *', function () {
  console.log('[CRON] 9:40AM WAT — Lock');
  lockGroup(GROUP_ID); lockGroup(GROUP_EN);
}, { timezone: 'UTC' });

// 9:55 AM WAT = 8:55 AM UTC — Signal 2 warning
cron.schedule('55 8 * * *', function () {
  console.log('[CRON] 9:55AM WAT — Signal 2 warning');
  sendTo(GROUP_ID, '<b>Sinyal trading masuk 🚨🚨🚨\nSinyal trading kedua hari ini akan segera dirilis, harap bersiap dan jangan sampai melewatkan sesi trading karena tidak ada kompensasi untuk sinyal yang terlewat</b>');
  sendTo(GROUP_EN, '<b>Incoming trading signal 🚨🚨🚨\nSecond signal of the day is about to be released, please be prepared and never miss out on the trade sessions because there\'s no compensation for missed signals</b>');
}, { timezone: 'UTC' });

// 10:00 AM WAT = 9:00 AM UTC — Signal 2 release
cron.schedule('0 9 * * *', function () {
  console.log('[CRON] 10:00AM WAT — Signal 2 released');
  sendTo(GROUP_ID, '<b>Sinyal Kedua dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>');
  sendTo(GROUP_EN, '<b>Second Signal released\nFollow Order\nExecute each trade accordingly and wait for the 2% profit</b>');
}, { timezone: 'UTC' });

// 10:05 AM WAT = 9:05 AM UTC — Unlock
cron.schedule('5 9 * * *', function () {
  console.log('[CRON] 10:05AM WAT — Unlock');
  unlockGroup(GROUP_ID); unlockGroup(GROUP_EN);
}, { timezone: 'UTC' });

// 12:40 PM WAT = 11:40 AM UTC — Lock
cron.schedule('40 11 * * *', function () {
  console.log('[CRON] 12:40PM WAT — Lock');
  lockGroup(GROUP_ID); lockGroup(GROUP_EN);
}, { timezone: 'UTC' });

// 12:55 PM WAT = 11:55 AM UTC — VIP warning
cron.schedule('55 11 * * *', function () {
  console.log('[CRON] 12:55PM WAT — VIP warning');
  sendTo(GROUP_ID, '<b>Sinyal VIP akan segera hadir 🚨🚨🚨\nSinyal VIP akan dirilis dalam 5 menit ke depan. Harap bersiap dan jangan lewatkan sesi trading apapun, karena tidak ada sinyal yang terlewat</b>');
  sendTo(GROUP_EN, '<b>VIP Signals are coming soon 🚨🚨🚨\nVIP signals will be released in the next 5 minutes. Please be prepared and don\'t miss any trading sessions, as no signals are missed</b>');
}, { timezone: 'UTC' });

// 1:00 PM WAT = 12:00 PM UTC — VIP release
cron.schedule('0 12 * * *', function () {
  console.log('[CRON] 1:00PM WAT — VIP Signal released');
  sendTo(GROUP_ID, '<b>Sinyal VIP dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>');
  sendTo(GROUP_EN, '<b>VIP Signal released\nFollow Order\nExecute each trade accordingly and wait for the 2% profit</b>');
}, { timezone: 'UTC' });

// 1:05 PM WAT = 12:05 PM UTC — Unlock
cron.schedule('5 12 * * *', function () {
  console.log('[CRON] 1:05PM WAT — Unlock');
  unlockGroup(GROUP_ID); unlockGroup(GROUP_EN);
}, { timezone: 'UTC' });

// 5:00 PM WAT = 4:00 PM UTC — Lock + Good night
cron.schedule('0 16 * * *', function () {
  console.log('[CRON] 5:00PM WAT — Night lock + goodnight');
  lockGroup(GROUP_ID); lockGroup(GROUP_EN);
  sendTo(GROUP_ID, '<b>Selamat malam semua anggota! 🌙\nIstirahat yang baik, tidur nyenyak, dan semoga bermimpi indah. Sampai jumpa besok dengan sinyal-sinyal menguntungkan!</b>');
  sendTo(GROUP_EN, '<b>Good night to all members! 🌙\nRest well, sleep tight, and have a wonderful dream. See you tomorrow with more profitable signals!</b>');
}, { timezone: 'UTC' });

console.log('[BOT] Fully started — scheduler + auto-moderation + self-ping active.');

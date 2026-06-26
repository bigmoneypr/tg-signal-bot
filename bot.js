'use strict';
const cron  = require('node-cron');
const https = require('https');
const http  = require('http');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || '';
const GROUP_ID  = process.env.TELEGRAM_GROUP_1_ID; // Indonesian — CZ Group II
const GROUP_EN  = process.env.TELEGRAM_GROUP_2_ID; // English   — CZ Group 01
const GROUP_3   = '-1004464428901';                 // English   — CZ Group IV
const GROUP_4   = '-1004291796500';                 // English   — CZ Group V22
const PORT      = process.env.PORT || 3000;
const SELF_URL  = 'https://tg-signal-bot-ehr4.onrender.com';

// All groups (for admin cache + moderation)
var ALL_GROUPS = [GROUP_ID, GROUP_EN, GROUP_3, GROUP_4];
// All English groups
var EN_GROUPS  = [GROUP_EN, GROUP_3, GROUP_4];

// ─── Health server ────────────────────────────────────────────────────────────
http.createServer(function (req, res) {
  res.writeHead(200); res.end('OK');
}).listen(PORT, function () { console.log('[BOT] Health server on port ' + PORT); });

// ─── Self-ping every 14 min (keeps Render awake) ─────────────────────────────
setInterval(function () {
  var req = https.get(SELF_URL, function (res) {
    res.resume();
    console.log('[PING] OK: ' + res.statusCode);
  });
  req.on('error', function (err) { console.error('[PING] Error: ' + err.message); });
}, 14 * 60 * 1000);

// ─── Telegram API ─────────────────────────────────────────────────────────────
function telegramRequest(method, payload, callback) {
  var body    = JSON.stringify(payload);
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
        else           { if (callback) callback(new Error(parsed.description)); }
      } catch (e) { if (callback) callback(e); }
    });
  });
  req.on('error', function (e) { if (callback) callback(e); });
  req.write(body);
  req.end();
}

function sendTo(groupId, text) {
  telegramRequest('sendMessage', { chat_id: groupId, text: text, parse_mode: 'HTML' }, function (err, r) {
    if (err) console.error('[SEND ERROR] to ' + groupId + ': ' + err.message);
    else     console.log('[SENT] to ' + groupId + ' msg_id=' + r.message_id);
  });
}

// Send Indonesian to GROUP_ID, English to all EN_GROUPS
function broadcast(idText, enText) {
  sendTo(GROUP_ID, idText);
  EN_GROUPS.forEach(function (g) { sendTo(g, enText); });
}

function deleteMsg(chatId, messageId) {
  telegramRequest('deleteMessage', { chat_id: chatId, message_id: messageId }, function (err) {
    if (err) console.error('[DELETE ERROR] ' + err.message);
    else     console.log('[DELETED] msg ' + messageId + ' in ' + chatId);
  });
}

// ─── Admin cache (refreshed every 10 min) ─────────────────────────────────────
var adminCache = {};

function refreshAdmins(chatId) {
  telegramRequest('getChatAdministrators', { chat_id: chatId }, function (err, result) {
    if (err) { console.error('[ADMIN] Error for ' + chatId + ': ' + err.message); return; }
    adminCache[chatId] = {};
    result.forEach(function (m) { adminCache[chatId][m.user.id] = true; });
    console.log('[ADMIN] Refreshed ' + chatId + ': ' + result.length + ' admins');
  });
}

function isAdmin(chatId, userId) {
  return adminCache[chatId] && adminCache[chatId][userId] === true;
}

function refreshAllAdmins() {
  ALL_GROUPS.forEach(function (g) { refreshAdmins(g); });
}
refreshAllAdmins();
setInterval(refreshAllAdmins, 10 * 60 * 1000);

// ─── Silent lock windows (WAT = UTC+1) ───────────────────────────────────────
// Non-admin messages during these windows are silently deleted.
// No setChatPermissions used — zero Telegram announcements.
//
// Locked (WAT):  overnight 5PM–5AM | 6:40–7:05 | 9:40–10:05 | 12:40–13:05

function isLockedNow() {
  var wat = new Date(Date.now() + 60 * 60 * 1000);
  var t   = wat.getUTCHours() * 60 + wat.getUTCMinutes();
  if (t < 300 || t >= 1020)         return true; // overnight 5PM–5AM
  if (t >= 400  && t < 425)         return true; // 6:40–7:05 AM
  if (t >= 580  && t < 605)         return true; // 9:40–10:05 AM
  if (t >= 760  && t < 785)         return true; // 12:40–1:05 PM
  return false;
}

// ─── Banned content filter ────────────────────────────────────────────────────
var BANNED = [
  'fuck','fucking','fucker','shit','bullshit','bitch','bastard','asshole',
  'ass','dick','cock','pussy','cunt','whore','slut','nigger','faggot',
  'motherfucker','crap','piss','retard','idiot','moron','loser','stupid',
  'scam','scammer','fraud','fraudster','hack','hacker','phishing','ponzi',
  'fake','cheat','cheater','steal','stolen','blackmail','sextortion',
  'giveaway','doubling','free money','send me','dm me','dm for',
  'investment opportunity','guaranteed profit','get rich',
  'anjing','bangsat','babi','kontol','memek','jancok','jancuk','asu',
  'goblok','tolol','bodoh','brengsek','kampret','bajingan','keparat',
  'tai','pantek','setan','iblis','celaka','sialan','bedebah',
  'kill yourself','kys','go die','shut up','stfu'
];
var LINK_RE = /https?:\/\/|www\.|\.com\/|\.net\/|\.org\/|t\.me\/|bit\.ly|tinyurl/i;

function isBanned(text) {
  if (!text) return false;
  var lower = text.toLowerCase();
  if (LINK_RE.test(text)) return true;
  for (var i = 0; i < BANNED.length; i++) {
    var w = BANNED[i], idx = lower.indexOf(w);
    if (idx !== -1) {
      var pre  = idx === 0 || /\W/.test(lower[idx - 1]);
      var post = idx + w.length >= lower.length || /\W/.test(lower[idx + w.length]);
      if (pre && post) return true;
    }
  }
  return false;
}

// ─── Long polling ─────────────────────────────────────────────────────────────
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
  var msg    = update.message;
  if (!msg) return;
  var chatId = String(msg.chat.id);
  var userId = msg.from && msg.from.id;
  var text   = msg.text || msg.caption || '';

  // /status command
  if (text === '/status' || text === '/status@' + BOT_USERNAME) {
    var inGroup = ALL_GROUPS.indexOf(chatId) !== -1;
    if (!inGroup || isAdmin(chatId, userId)) { handleStatus(chatId); return; }
  }

  // /sendnow command
  if (text.startsWith('/sendnow') || text.startsWith('/sendnow@' + BOT_USERNAME)) {
    var inGroup2 = ALL_GROUPS.indexOf(chatId) !== -1;
    if (!inGroup2 || isAdmin(chatId, userId)) {
      var parts = text.split(' ');
      handleSendNow(chatId, parts[1]);
      return;
    }
  }

  // Only watch our four groups
  if (ALL_GROUPS.indexOf(chatId) === -1) return;
  // Admins are always exempt
  if (isAdmin(chatId, userId)) return;

  // Silent lock: instantly delete non-admin messages during locked windows
  if (isLockedNow()) {
    console.log('[LOCK] Silent delete from user ' + userId + ' in ' + chatId);
    deleteMsg(chatId, msg.message_id);
    return;
  }

  // Auto-moderation: delete banned words / links anytime
  var del = isBanned(text);
  if (!del && msg.entities) {
    msg.entities.forEach(function (e) {
      if (e.type === 'url' || e.type === 'text_link') del = true;
    });
  }
  if (del) {
    console.log('[MOD] Delete banned from user ' + userId + ': ' + text.substring(0, 60));
    deleteMsg(chatId, msg.message_id);
  }
}



// ─── /sendnow command ─────────────────────────────────────────────────────────
function handleSendNow(chatId, type) {
  var d = watDay();
  var messages = {
    morning: {
      id: '<b>Selamat pagi semua, selamat hari ' + ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][d] + '! \uD83C\uDF05\nSemoga hari ini penuh berkah dan profit untuk kita semua.</b>',
      en: '<b>Good morning everyone, happy ' + ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d] + '! \uD83C\uDF05\nWishing everyone a blessed and profitable day.</b>'
    },
    signal1: {
      id: '<b>Sinyal Pertama dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>',
      en: '<b>First Signal released\nFollow Order\nExecute each trade accordingly and wait for the 2% profit</b>'
    },
    signal2: {
      id: '<b>Sinyal Kedua dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>',
      en: '<b>Second Signal released\nFollow Order\nExecute each trade accordingly and wait for the 2% profit</b>'
    },
    vip: {
      id: '<b>Sinyal VIP dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>',
      en: '<b>VIP Signal released\nFollow Order\nExecute each trade accordingly and wait for the 2% profit</b>'
    },
    goodnight: {
      id: '<b>Selamat malam semua anggota! \uD83C\uDF19\nIstirahat yang baik, tidur nyenyak, dan semoga bermimpi indah. Sampai jumpa besok dengan sinyal-sinyal menguntungkan!</b>',
      en: '<b>Good night to all members! \uD83C\uDF19\nRest well, sleep tight, and have a wonderful dream. See you tomorrow with more profitable signals!</b>'
    }
  };

  var t = type ? type.toLowerCase().trim() : '';
  if (!messages[t]) {
    sendTo(chatId,
      '<b>Usage: /sendnow [type]</b>\n\nAvailable types:\n' +
      '  /sendnow morning\n' +
      '  /sendnow signal1\n' +
      '  /sendnow signal2\n' +
      '  /sendnow vip\n' +
      '  /sendnow goodnight'
    );
    return;
  }

  broadcast(messages[t].id, messages[t].en);
  sendTo(chatId, 'Sent! <b>' + t + '</b> message broadcast to all 4 groups.');
}

// ─── /status command ─────────────────────────────────────────────────────────
function handleStatus(chatId) {
  var wat = new Date(Date.now() + 60 * 60 * 1000);
  var hh  = String(wat.getUTCHours()).padStart(2, '0');
  var mm  = String(wat.getUTCMinutes()).padStart(2, '0');
  var locked = isLockedNow() ? 'Yes' : 'No';
  var groups = [
    { id: GROUP_ID, name: 'CZ Group II (Indonesian)' },
    { id: GROUP_EN, name: 'CZ Group 01 (English)' },
    { id: GROUP_3,  name: 'CZ Group IV (English)' },
    { id: GROUP_4,  name: 'CZ Group V22 (English)' }
  ];
  var groupLines = groups.map(function(g) {
    return '  * ' + g.name + ': ' + (adminCache[g.id] ? 'connected' : 'not loaded');
  }).join('\n');
  sendTo(chatId,
    '<b>Bot Status</b>\n' +
    'Online: Yes\n' +
    'Time (WAT): ' + hh + ':' + mm + '\n' +
    'Silent lock: ' + locked + '\n\n' +
    '<b>Groups:</b>\n' + groupLines + '\n\n' +
    '<b>Daily Schedule (WAT):</b>\n' +
    '05:00 AM - Morning greeting\n' +
    '06:55 AM - Signal 1 warning\n' +
    '07:00 AM - Signal 1 release\n' +
    '09:55 AM - Signal 2 warning\n' +
    '10:00 AM - Signal 2 release\n' +
    '12:55 PM - VIP warning\n' +
    '01:00 PM - VIP release\n' +
    '05:00 PM - Good night'
  );
}

telegramRequest('deleteWebhook', { drop_pending_updates: true }, function() {
  poll();
  console.log('[BOT] Polling started.');
});

// ─── Day name helpers (WAT = UTC+1) ──────────────────────────────────────────
var DAYS_ID = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
var DAYS_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function watDay() {
  return new Date(Date.now() + 60 * 60 * 1000).getUTCDay();
}

// ─── Cron schedule ────────────────────────────────────────────────────────────
// Render runs in UTC. WAT = UTC+1, so cron times = WAT minus 1 hour.
// No {timezone} option — uses server local time (UTC) directly.

// 5:00 AM WAT = 04:00 UTC — Morning greeting
cron.schedule('0 4 * * *', function () {
  console.log('[CRON] 5:00 AM WAT — Morning greeting');
  var d = watDay();
  broadcast(
    '<b>Selamat pagi semua, selamat hari ' + DAYS_ID[d] + '! \uD83C\uDF05\nSemoga hari ini penuh berkah dan profit untuk kita semua.</b>',
    '<b>Good morning everyone, happy ' + DAYS_EN[d] + '! \uD83C\uDF05\nWishing everyone a blessed and profitable day.</b>'
  );
});

// 6:55 AM WAT = 05:55 UTC — Signal 1 warning
cron.schedule('55 5 * * *', function () {
  console.log('[CRON] 6:55 AM WAT — Signal 1 warning');
  broadcast(
    '<b>Sinyal trading masuk \uD83D\uDEA8\uD83D\uDEA8\nSinyal trading pertama hari ini akan segera dirilis, harap bersiap dan jangan sampai melewatkan sesi trading karena tidak ada kompensasi untuk sinyal yang terlewat</b>',
    '<b>Incoming trading signal \uD83D\uDEA8\uD83D\uDEA8\nThe first trading signal of the day is about to be released, please be prepared and never miss out on the trade sessions because there\'s no compensation for missed signals</b>'
  );
});

// 7:00 AM WAT = 06:00 UTC — Signal 1 release
cron.schedule('0 6 * * *', function () {
  console.log('[CRON] 7:00 AM WAT — Signal 1 released');
  broadcast(
    '<b>Sinyal Pertama dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>',
    '<b>First Signal released\nFollow Order\nExecute each trade accordingly and wait for the 2% profit</b>'
  );
});

// 9:55 AM WAT = 08:55 UTC — Signal 2 warning
cron.schedule('55 8 * * *', function () {
  console.log('[CRON] 9:55 AM WAT — Signal 2 warning');
  broadcast(
    '<b>Sinyal trading masuk \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nSinyal trading kedua hari ini akan segera dirilis, harap bersiap dan jangan sampai melewatkan sesi trading karena tidak ada kompensasi untuk sinyal yang terlewat</b>',
    '<b>Incoming trading signal \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nSecond signal of the day is about to be released, please be prepared and never miss out on the trade sessions because there\'s no compensation for missed signals</b>'
  );
});

// 10:00 AM WAT = 09:00 UTC — Signal 2 release
cron.schedule('0 9 * * *', function () {
  console.log('[CRON] 10:00 AM WAT — Signal 2 released');
  broadcast(
    '<b>Sinyal Kedua dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>',
    '<b>Second Signal released\nFollow Order\nExecute each trade accordingly and wait for the 2% profit</b>'
  );
});

// 12:55 PM WAT = 11:55 UTC — VIP warning
cron.schedule('55 11 * * *', function () {
  console.log('[CRON] 12:55 PM WAT — VIP warning');
  broadcast(
    '<b>Sinyal VIP akan segera hadir \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nSinyal VIP akan dirilis dalam 5 menit ke depan. Harap bersiap dan jangan lewatkan sesi trading apapun, karena tidak ada sinyal yang terlewat</b>',
    '<b>VIP Signals are coming soon \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nVIP signals will be released in the next 5 minutes. Please be prepared and don\'t miss any trading sessions, as no signals are missed</b>'
  );
});

// 1:00 PM WAT = 12:00 UTC — VIP release
cron.schedule('0 12 * * *', function () {
  console.log('[CRON] 1:00 PM WAT — VIP released');
  broadcast(
    '<b>Sinyal VIP dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>',
    '<b>VIP Signal released\nFollow Order\nExecute each trade accordingly and wait for the 2% profit</b>'
  );
});

// 5:00 PM WAT = 16:00 UTC — Good night
cron.schedule('0 16 * * *', function () {
  console.log('[CRON] 5:00 PM WAT — Good night');
  broadcast(
    '<b>Selamat malam semua anggota! \uD83C\uDF19\nIstirahat yang baik, tidur nyenyak, dan semoga bermimpi indah. Sampai jumpa besok dengan sinyal-sinyal menguntungkan!</b>',
    '<b>Good night to all members! \uD83C\uDF19\nRest well, sleep tight, and have a wonderful dream. See you tomorrow with more profitable signals!</b>'
  );
});

console.log('[BOT] All systems active — 4 groups | 8 cron jobs | silent lock | auto-moderation | self-ping.');

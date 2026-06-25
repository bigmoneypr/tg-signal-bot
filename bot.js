'use strict';
const cron = require('node-cron');
const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID = process.env.TELEGRAM_GROUP_1_ID; // Indonesian
const GROUP_EN = process.env.TELEGRAM_GROUP_2_ID; // English
const PORT = process.env.PORT || 3000;

require('http').createServer(function (req, res) {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT, function () {
  console.log('Health server on port ' + PORT);
});

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
        if (parsed.ok) callback(null, parsed.result);
        else callback(new Error(parsed.description));
      } catch (e) { callback(e); }
    });
  });
  req.on('error', callback);
  req.write(body);
  req.end();
}

function sendTo(groupId, text) {
  telegramRequest('sendMessage', { chat_id: groupId, text: text, parse_mode: 'HTML' }, function (err) {
    if (err) console.error('Send error to ' + groupId + ': ' + err.message);
    else console.log('Sent to ' + groupId);
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
    if (err) console.error('Lock error ' + groupId + ': ' + err.message);
    else console.log('Locked ' + groupId);
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
    if (err) console.error('Unlock error ' + groupId + ': ' + err.message);
    else console.log('Unlocked ' + groupId);
  });
}

function deleteMessage(chatId, messageId) {
  telegramRequest('deleteMessage', { chat_id: chatId, message_id: messageId }, function (err) {
    if (err) console.error('Delete error: ' + err.message);
    else console.log('Deleted message ' + messageId + ' in ' + chatId);
  });
}

// ─── Admin cache (refreshed every 10 minutes) ────────────────────────────────

var adminCache = {};

function refreshAdmins(chatId) {
  telegramRequest('getChatAdministrators', { chat_id: chatId }, function (err, result) {
    if (err) { console.error('Admin fetch error for ' + chatId + ': ' + err.message); return; }
    adminCache[chatId] = {};
    result.forEach(function (member) { adminCache[chatId][member.user.id] = true; });
    console.log('Admins refreshed for ' + chatId + ': ' + result.length + ' admins');
  });
}

function isAdmin(chatId, userId) {
  return adminCache[chatId] && adminCache[chatId][userId] === true;
}

// Refresh admins for both groups on startup and every 10 mins
function refreshAllAdmins() { refreshAdmins(GROUP_ID); refreshAdmins(GROUP_EN); }
refreshAllAdmins();
setInterval(refreshAllAdmins, 10 * 60 * 1000);

// ─── Banned word / link filter ────────────────────────────────────────────────

var BANNED = [
  // English curses
  'fuck', 'fucking', 'fucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole',
  'ass', 'dick', 'cock', 'pussy', 'cunt', 'whore', 'slut', 'nigger', 'faggot',
  'motherfucker', 'damn', 'crap', 'piss', 'retard', 'idiot', 'moron', 'loser', 'stupid',
  // Scam / fraud
  'scam', 'scammer', 'fraud', 'fraudster', 'hack', 'hacker', 'phishing', 'ponzi',
  'fake', 'cheat', 'cheater', 'steal', 'stolen', 'blackmail', 'sextortion',
  'giveaway', 'doubling', 'free money', 'send me', 'dm me', 'dm for',
  'investment opportunity', 'guaranteed profit', 'get rich',
  // Indonesian curses
  'anjing', 'bangsat', 'babi', 'kontol', 'memek', 'jancok', 'jancuk', 'asu',
  'goblok', 'tolol', 'bodoh', 'brengsek', 'kampret', 'bajingan', 'keparat',
  'tai', 'pantek', 'setan', 'iblis', 'celaka', 'sialan', 'bedebah',
  // Harsh / harassment
  'kill yourself', 'kys', 'die', 'go die', 'shut up', 'stfu'
];

// Link pattern
var LINK_PATTERN = /https?:\/\/|www\.|\.com\/|\.net\/|\.org\/|t\.me\/|bit\.ly|tinyurl/i;

function containsBannedContent(text) {
  if (!text) return false;
  var lower = text.toLowerCase();
  // Check links
  if (LINK_PATTERN.test(text)) return true;
  // Check banned words
  for (var i = 0; i < BANNED.length; i++) {
    var word = BANNED[i];
    // Use word boundary check
    var idx = lower.indexOf(word);
    if (idx !== -1) {
      var before = idx === 0 || /\W/.test(lower[idx - 1]);
      var after = idx + word.length >= lower.length || /\W/.test(lower[idx + word.length]);
      if (before && after) return true;
    }
  }
  return false;
}

// ─── Long polling ─────────────────────────────────────────────────────────────

var offset = 0;

function poll() {
  telegramRequest('getUpdates', { offset: offset, timeout: 30, allowed_updates: ['message'] }, function (err, updates) {
    if (err) {
      console.error('Poll error: ' + err.message);
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
  var userId = msg.from && msg.from.id;
  var text = msg.text || msg.caption || '';

  // Only moderate our two groups
  if (chatId !== String(GROUP_ID) && chatId !== String(GROUP_EN)) return;
  // Skip if sender is admin
  if (isAdmin(chatId, userId)) return;
  // Check message content
  if (containsBannedContent(text)) {
    console.log('Banned content from user ' + userId + ' in ' + chatId + ': ' + text.substring(0, 50));
    deleteMessage(chatId, msg.message_id);
  }
  // Also check forwarded messages and any attached link entities
  if (msg.entities) {
    msg.entities.forEach(function (entity) {
      if (entity.type === 'url' || entity.type === 'text_link') {
        if (!isAdmin(chatId, userId)) deleteMessage(chatId, msg.message_id);
      }
    });
  }
}

// Start polling
poll();
console.log('Auto-moderation polling started.');

// ─── Day helpers ──────────────────────────────────────────────────────────────

var DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
var DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getWatDay() {
  var watDate = new Date(Date.now() + 60 * 60 * 1000);
  return watDate.getDay();
}

// ─── Cron schedule (all UTC = WAT - 1hr) ─────────────────────────────────────

// 5:00 AM WAT = 4:00 AM UTC — Morning unlock + greeting
cron.schedule('0 4 * * *', function () {
  var day = getWatDay();
  unlockGroup(GROUP_ID); unlockGroup(GROUP_EN);
  sendTo(GROUP_ID, '<b>Selamat pagi semua, selamat hari ' + DAYS_ID[day] + '! \uD83C\uDF05\nSemoga hari ini penuh berkah dan profit untuk kita semua.</b>');
  sendTo(GROUP_EN, '<b>Good morning everyone, happy ' + DAYS_EN[day] + '! \uD83C\uDF05\nWishing everyone a blessed and profitable day.</b>');
}, { timezone: 'UTC' });

// 6:40 AM WAT = 5:40 AM UTC — Lock
cron.schedule('40 5 * * *', function () { lockGroup(GROUP_ID); lockGroup(GROUP_EN); }, { timezone: 'UTC' });

// 6:55 AM WAT = 5:55 AM UTC
cron.schedule('55 5 * * *', function () {
  sendTo(GROUP_ID, '<b>Sinyal trading masuk \uD83D\uDEA8\uD83D\uDEA8\nSinyal trading pertama hari ini akan segera dirilis, harap bersiap dan jangan sampai melewatkan sesi trading karena tidak ada kompensasi untuk sinyal yang terlewat</b>');
  sendTo(GROUP_EN, '<b>Incoming trading signal \uD83D\uDEA8\uD83D\uDEA8\nThe first trading signal of the day is about to be released , please be prepared and never miss out on the trade sessions because there\'s no compensation for missed signals</b>');
}, { timezone: 'UTC' });

// 7:00 AM WAT = 6:00 AM UTC
cron.schedule('0 6 * * *', function () {
  sendTo(GROUP_ID, '<b>Sinyal Pertama dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>');
  sendTo(GROUP_EN, '<b>First Signal released\nFollow Order\nExecute each trade accordingly And wait for the 2% profit</b>');
}, { timezone: 'UTC' });

// 7:05 AM WAT = 6:05 AM UTC — Unlock
cron.schedule('5 6 * * *', function () { unlockGroup(GROUP_ID); unlockGroup(GROUP_EN); }, { timezone: 'UTC' });

// 9:40 AM WAT = 8:40 AM UTC — Lock
cron.schedule('40 8 * * *', function () { lockGroup(GROUP_ID); lockGroup(GROUP_EN); }, { timezone: 'UTC' });

// 9:55 AM WAT = 8:55 AM UTC
cron.schedule('55 8 * * *', function () {
  sendTo(GROUP_ID, '<b>Sinyal trading masuk \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nSinyal trading kedua hari ini akan segera dirilis, harap bersiap dan jangan sampai melewatkan sesi trading karena tidak ada kompensasi untuk sinyal yang terlewat</b>');
  sendTo(GROUP_EN, '<b>Incoming trading signal \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nSecond signal of the day is about to be released , please be prepared and never miss out on the trade sessions because there\'s no compensation for missed signals</b>');
}, { timezone: 'UTC' });

// 10:00 AM WAT = 9:00 AM UTC
cron.schedule('0 9 * * *', function () {
  sendTo(GROUP_ID, '<b>Sinyal Kedua dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>');
  sendTo(GROUP_EN, '<b>Second Signal released\nFollow Order\nExecute each trade accordingly And wait for the 2% profit</b>');
}, { timezone: 'UTC' });

// 10:05 AM WAT = 9:05 AM UTC — Unlock
cron.schedule('5 9 * * *', function () { unlockGroup(GROUP_ID); unlockGroup(GROUP_EN); }, { timezone: 'UTC' });

// 12:40 PM WAT = 11:40 AM UTC — Lock
cron.schedule('40 11 * * *', function () { lockGroup(GROUP_ID); lockGroup(GROUP_EN); }, { timezone: 'UTC' });

// 12:55 PM WAT = 11:55 AM UTC
cron.schedule('55 11 * * *', function () {
  sendTo(GROUP_ID, '<b>Sinyal VIP akan segera hadir \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nSinyal VIP akan dirilis dalam 5 menit ke depan. Harap bersiap dan jangan lewatkan sesi trading apapun, karena tidak ada sinyal yang terlewat</b>');
  sendTo(GROUP_EN, '<b>VIP Signals are coming soon \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nVIP signals will be released in the next 5 minutes. Please be prepared and don\'t miss any trading sessions, as no signals are missed</b>');
}, { timezone: 'UTC' });

// 1:00 PM WAT = 12:00 PM UTC
cron.schedule('0 12 * * *', function () {
  sendTo(GROUP_ID, '<b>Sinyal VIP dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>');
  sendTo(GROUP_EN, '<b>VIP Signal released\nFollow Order\nExecute each trade accordingly And wait for the 2% profit</b>');
}, { timezone: 'UTC' });

// 1:05 PM WAT = 12:05 PM UTC — Unlock
cron.schedule('5 12 * * *', function () { unlockGroup(GROUP_ID); unlockGroup(GROUP_EN); }, { timezone: 'UTC' });

// 5:00 PM WAT = 4:00 PM UTC — Night lock + goodnight
cron.schedule('0 16 * * *', function () {
  lockGroup(GROUP_ID); lockGroup(GROUP_EN);
  sendTo(GROUP_ID, '<b>Selamat malam semua anggota! \uD83C\uDF19\nIstirahat yang baik, tidur nyenyak, dan semoga bermimpi indah. Sampai jumpa besok dengan sinyal-sinyal menguntungkan!</b>');
  sendTo(GROUP_EN, '<b>Good night to all members! \uD83C\uDF19\nRest well, sleep tight, and have a wonderful dream. See you tomorrow with more profitable signals!</b>');
}, { timezone: 'UTC' });

console.log('Bot fully started. Scheduler + auto-moderation active.');

'use strict';
const cron = require('node-cron');
const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUPS = [
  process.env.TELEGRAM_GROUP_1_ID,
  process.env.TELEGRAM_GROUP_2_ID
].filter(Boolean);
const PORT = process.env.PORT || 3000;

// Health check server required by Render
require('http').createServer(function (req, res) {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT, function () {
  console.log('Health server on port ' + PORT);
});

// --- Telegram API helpers ---

function telegramRequest(method, payload, callback) {
  var body = JSON.stringify(payload);
  var options = {
    hostname: 'api.telegram.org',
    path: '/bot' + BOT_TOKEN + '/' + method,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };
  var req = https.request(options, function (res) {
    var data = '';
    res.on('data', function (chunk) { data += chunk; });
    res.on('end', function () {
      var parsed = JSON.parse(data);
      if (parsed.ok) {
        callback(null, parsed.result);
      } else {
        callback(new Error(parsed.description));
      }
    });
  });
  req.on('error', callback);
  req.write(body);
  req.end();
}

function sendMessage(groupId, text, callback) {
  telegramRequest('sendMessage', {
    chat_id: groupId,
    text: text,
    parse_mode: 'HTML'
  }, callback);
}

function lockGroup(groupId, callback) {
  telegramRequest('setChatPermissions', {
    chat_id: groupId,
    permissions: {
      can_send_messages: false,
      can_send_audios: false,
      can_send_documents: false,
      can_send_photos: false,
      can_send_videos: false,
      can_send_video_notes: false,
      can_send_voice_notes: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false
    }
  }, callback);
}

function unlockGroup(groupId, callback) {
  telegramRequest('setChatPermissions', {
    chat_id: groupId,
    permissions: {
      can_send_messages: true,
      can_send_audios: true,
      can_send_documents: true,
      can_send_photos: true,
      can_send_videos: true,
      can_send_video_notes: true,
      can_send_voice_notes: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true
    }
  }, callback);
}

function broadcastMessage(text) {
  GROUPS.forEach(function (groupId) {
    sendMessage(groupId, text, function (err) {
      if (err) console.error('Failed to send to ' + groupId + ': ' + err.message);
      else console.log('Sent to ' + groupId);
    });
  });
}

function broadcastLock() {
  GROUPS.forEach(function (groupId) {
    lockGroup(groupId, function (err) {
      if (err) console.error('Failed to lock ' + groupId + ': ' + err.message);
      else console.log('Locked group ' + groupId);
    });
  });
}

function broadcastUnlock() {
  GROUPS.forEach(function (groupId) {
    unlockGroup(groupId, function (err) {
      if (err) console.error('Failed to unlock ' + groupId + ': ' + err.message);
      else console.log('Unlocked group ' + groupId);
    });
  });
}

// --- Scheduled messages (all times UTC = WAT - 1hr) ---

// 6:55 AM WAT = 5:55 AM UTC
cron.schedule('55 5 * * *', function () {
  console.log('Sending: 6:55 AM WAT');
  broadcastMessage('<b>Incoming trading signal \uD83D\uDEA8\uD83D\uDEA8\nThe first trading signal of the day is about to be released , please be prepared and never miss out on the trade sessions because there\'s no compensation for missed signals</b>');
}, { timezone: 'UTC' });

// 7:00 AM WAT = 6:00 AM UTC
cron.schedule('0 6 * * *', function () {
  console.log('Sending: 7:00 AM WAT');
  broadcastMessage('<b>First Signal released\nFollow Order\nExecute each trade accordingly And wait for the 2% profit</b>');
}, { timezone: 'UTC' });

// 9:55 AM WAT = 8:55 AM UTC
cron.schedule('55 8 * * *', function () {
  console.log('Sending: 9:55 AM WAT');
  broadcastMessage('<b>Incoming trading signal \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nSecond signal of the day is about to be released , please be prepared and never miss out on the trade sessions because there\'s no compensation for missed signals</b>');
}, { timezone: 'UTC' });

// 10:00 AM WAT = 9:00 AM UTC
cron.schedule('0 9 * * *', function () {
  console.log('Sending: 10:00 AM WAT');
  broadcastMessage('<b>Second Signal released\nFollow Order\nExecute each trade accordingly And wait for the 2% profit</b>');
}, { timezone: 'UTC' });

// 12:55 PM WAT = 11:55 AM UTC
cron.schedule('55 11 * * *', function () {
  console.log('Sending: 12:55 PM WAT');
  broadcastMessage('<b>VIP Signals are coming soon \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nVIP signals will be released in the next 5 minutes. Please be prepared and don\'t miss any trading sessions, as no signals are missed</b>');
}, { timezone: 'UTC' });

// 1:00 PM WAT = 12:00 PM UTC
cron.schedule('0 12 * * *', function () {
  console.log('Sending: 1:00 PM WAT');
  broadcastMessage('<b>VIP Signal released\nFollow Order\nExecute each trade accordingly And wait for the 2% profit</b>');
}, { timezone: 'UTC' });

// --- Lock / Unlock windows (UTC = WAT - 1hr) ---

// Lock 6:40 AM WAT = 5:40 AM UTC
cron.schedule('40 5 * * *', function () {
  console.log('Locking groups at 6:40 AM WAT');
  broadcastLock();
}, { timezone: 'UTC' });

// Unlock 7:05 AM WAT = 6:05 AM UTC
cron.schedule('5 6 * * *', function () {
  console.log('Unlocking groups at 7:05 AM WAT');
  broadcastUnlock();
}, { timezone: 'UTC' });

// Lock 9:40 AM WAT = 8:40 AM UTC
cron.schedule('40 8 * * *', function () {
  console.log('Locking groups at 9:40 AM WAT');
  broadcastLock();
}, { timezone: 'UTC' });

// Unlock 10:05 AM WAT = 9:05 AM UTC
cron.schedule('5 9 * * *', function () {
  console.log('Unlocking groups at 10:05 AM WAT');
  broadcastUnlock();
}, { timezone: 'UTC' });

// Lock 12:40 PM WAT = 11:40 AM UTC
cron.schedule('40 11 * * *', function () {
  console.log('Locking groups at 12:40 PM WAT');
  broadcastLock();
}, { timezone: 'UTC' });

// Unlock 1:05 PM WAT = 12:05 PM UTC
cron.schedule('5 12 * * *', function () {
  console.log('Unlocking groups at 1:05 PM WAT');
  broadcastUnlock();
}, { timezone: 'UTC' });

console.log('Bot running. ' + GROUPS.length + ' group(s). 6 messages + 3 lock/unlock windows per day.');

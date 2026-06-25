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
      if (parsed.ok) { callback(null, parsed.result); }
      else { callback(new Error(parsed.description)); }
    });
  });
  req.on('error', callback);
  req.write(body);
  req.end();
}

function sendTo(groupId, text, callback) {
  telegramRequest('sendMessage', { chat_id: groupId, text: text, parse_mode: 'HTML' }, callback || function (err) {
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
    if (err) console.error('Lock error for ' + groupId + ': ' + err.message);
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
    if (err) console.error('Unlock error for ' + groupId + ': ' + err.message);
    else console.log('Unlocked ' + groupId);
  });
}

// --- Day names ---
var DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
var DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getWatDay() {
  // WAT = UTC+1, job fires at 4:00 AM UTC = 5:00 AM WAT
  var now = new Date();
  var watDate = new Date(now.getTime() + 60 * 60 * 1000);
  return watDate.getDay();
}

// ===================== CRON SCHEDULE =====================
// All times UTC (WAT = UTC + 1hr)

// 5:00 AM WAT = 4:00 AM UTC — Morning unlock + greeting
cron.schedule('0 4 * * *', function () {
  var day = getWatDay();
  console.log('Morning unlock + greeting');
  unlockGroup(GROUP_ID);
  unlockGroup(GROUP_EN);
  sendTo(GROUP_ID, '<b>Selamat pagi semua, selamat hari ' + DAYS_ID[day] + '! \uD83C\uDF05\nSemoga hari ini penuh berkah dan profit untuk kita semua.</b>');
  sendTo(GROUP_EN, '<b>Good morning everyone, happy ' + DAYS_EN[day] + '! \uD83C\uDF05\nWishing everyone a blessed and profitable day.</b>');
}, { timezone: 'UTC' });

// 6:40 AM WAT = 5:40 AM UTC — Lock
cron.schedule('40 5 * * *', function () {
  console.log('Lock 6:40 AM WAT');
  lockGroup(GROUP_ID);
  lockGroup(GROUP_EN);
}, { timezone: 'UTC' });

// 6:55 AM WAT = 5:55 AM UTC — Signal 1 warning
cron.schedule('55 5 * * *', function () {
  console.log('Sending: 6:55 AM WAT');
  sendTo(GROUP_ID, '<b>Sinyal trading masuk \uD83D\uDEA8\uD83D\uDEA8\nSinyal trading pertama hari ini akan segera dirilis, harap bersiap dan jangan sampai melewatkan sesi trading karena tidak ada kompensasi untuk sinyal yang terlewat</b>');
  sendTo(GROUP_EN, '<b>Incoming trading signal \uD83D\uDEA8\uD83D\uDEA8\nThe first trading signal of the day is about to be released , please be prepared and never miss out on the trade sessions because there\'s no compensation for missed signals</b>');
}, { timezone: 'UTC' });

// 7:00 AM WAT = 6:00 AM UTC — Signal 1 released
cron.schedule('0 6 * * *', function () {
  console.log('Sending: 7:00 AM WAT');
  sendTo(GROUP_ID, '<b>Sinyal Pertama dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>');
  sendTo(GROUP_EN, '<b>First Signal released\nFollow Order\nExecute each trade accordingly And wait for the 2% profit</b>');
}, { timezone: 'UTC' });

// 7:05 AM WAT = 6:05 AM UTC — Unlock
cron.schedule('5 6 * * *', function () {
  console.log('Unlock 7:05 AM WAT');
  unlockGroup(GROUP_ID);
  unlockGroup(GROUP_EN);
}, { timezone: 'UTC' });

// 9:40 AM WAT = 8:40 AM UTC — Lock
cron.schedule('40 8 * * *', function () {
  console.log('Lock 9:40 AM WAT');
  lockGroup(GROUP_ID);
  lockGroup(GROUP_EN);
}, { timezone: 'UTC' });

// 9:55 AM WAT = 8:55 AM UTC — Signal 2 warning
cron.schedule('55 8 * * *', function () {
  console.log('Sending: 9:55 AM WAT');
  sendTo(GROUP_ID, '<b>Sinyal trading masuk \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nSinyal trading kedua hari ini akan segera dirilis, harap bersiap dan jangan sampai melewatkan sesi trading karena tidak ada kompensasi untuk sinyal yang terlewat</b>');
  sendTo(GROUP_EN, '<b>Incoming trading signal \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nSecond signal of the day is about to be released , please be prepared and never miss out on the trade sessions because there\'s no compensation for missed signals</b>');
}, { timezone: 'UTC' });

// 10:00 AM WAT = 9:00 AM UTC — Signal 2 released
cron.schedule('0 9 * * *', function () {
  console.log('Sending: 10:00 AM WAT');
  sendTo(GROUP_ID, '<b>Sinyal Kedua dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>');
  sendTo(GROUP_EN, '<b>Second Signal released\nFollow Order\nExecute each trade accordingly And wait for the 2% profit</b>');
}, { timezone: 'UTC' });

// 10:05 AM WAT = 9:05 AM UTC — Unlock
cron.schedule('5 9 * * *', function () {
  console.log('Unlock 10:05 AM WAT');
  unlockGroup(GROUP_ID);
  unlockGroup(GROUP_EN);
}, { timezone: 'UTC' });

// 12:40 PM WAT = 11:40 AM UTC — Lock
cron.schedule('40 11 * * *', function () {
  console.log('Lock 12:40 PM WAT');
  lockGroup(GROUP_ID);
  lockGroup(GROUP_EN);
}, { timezone: 'UTC' });

// 12:55 PM WAT = 11:55 AM UTC — VIP warning
cron.schedule('55 11 * * *', function () {
  console.log('Sending: 12:55 PM WAT');
  sendTo(GROUP_ID, '<b>Sinyal VIP akan segera hadir \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nSinyal VIP akan dirilis dalam 5 menit ke depan. Harap bersiap dan jangan lewatkan sesi trading apapun, karena tidak ada sinyal yang terlewat</b>');
  sendTo(GROUP_EN, '<b>VIP Signals are coming soon \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nVIP signals will be released in the next 5 minutes. Please be prepared and don\'t miss any trading sessions, as no signals are missed</b>');
}, { timezone: 'UTC' });

// 1:00 PM WAT = 12:00 PM UTC — VIP released
cron.schedule('0 12 * * *', function () {
  console.log('Sending: 1:00 PM WAT');
  sendTo(GROUP_ID, '<b>Sinyal VIP dirilis\nIkuti Perintah\nEksekusi setiap trade sesuai dan tunggu keuntungan 2%</b>');
  sendTo(GROUP_EN, '<b>VIP Signal released\nFollow Order\nExecute each trade accordingly And wait for the 2% profit</b>');
}, { timezone: 'UTC' });

// 1:05 PM WAT = 12:05 PM UTC — Unlock
cron.schedule('5 12 * * *', function () {
  console.log('Unlock 1:05 PM WAT');
  unlockGroup(GROUP_ID);
  unlockGroup(GROUP_EN);
}, { timezone: 'UTC' });

// 5:00 PM WAT = 4:00 PM UTC — Night lock + goodnight message
cron.schedule('0 16 * * *', function () {
  console.log('Night lock + goodnight message');
  lockGroup(GROUP_ID);
  lockGroup(GROUP_EN);
  sendTo(GROUP_ID, '<b>Selamat malam semua anggota! \uD83C\uDF19\nIstirahat yang baik, tidur nyenyak, dan semoga bermimpi indah. Sampai jumpa besok dengan sinyal-sinyal menguntungkan!</b>');
  sendTo(GROUP_EN, '<b>Good night to all members! \uD83C\uDF19\nRest well, sleep tight, and have a wonderful dream. See you tomorrow with more profitable signals!</b>');
}, { timezone: 'UTC' });

console.log('Bot running. Group 1 (Indonesian): ' + GROUP_ID + ' | Group 2 (English): ' + GROUP_EN);

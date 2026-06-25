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

var MESSAGES = [
  {
    cron: '55 5 * * *',
    label: '6:55 AM WAT',
    text: 'Incoming trading signal \uD83D\uDEA8\uD83D\uDEA8\nThe first trading signal of the day is about to be released , please be prepared and never miss out on the trade sessions because there\'s no compensation for missed signals'
  },
  {
    cron: '0 6 * * *',
    label: '7:00 AM WAT',
    text: 'First Signal released\nFollow Order\nExecute each trade accordingly And wait for the 2% profit'
  },
  {
    cron: '55 8 * * *',
    label: '9:55 AM WAT',
    text: 'Incoming trading signal \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nSecond signal of the day is about to be released , please be prepared and never miss out on the trade sessions because there\'s no compensation for missed signals'
  },
  {
    cron: '0 9 * * *',
    label: '10:00 AM WAT',
    text: 'Second Signal released\nFollow Order\nExecute each trade accordingly And wait for the 2% profit'
  },
  {
    cron: '55 11 * * *',
    label: '12:55 PM WAT',
    text: 'VIP Signals are coming soon \uD83D\uDEA8\uD83D\uDEA8\uD83D\uDEA8\nVIP signals will be released in the next 5 minutes. Please be prepared and don\'t miss any trading sessions, as no signals are missed'
  },
  {
    cron: '0 12 * * *',
    label: '1:00 PM WAT',
    text: 'VIP Signal released\nFollow Order\nExecute each trade accordingly And wait for the 2% profit'
  }
];

function sendMessage(groupId, text, callback) {
  var body = JSON.stringify({ chat_id: groupId, text: text });
  var options = {
    hostname: 'api.telegram.org',
    path: '/bot' + BOT_TOKEN + '/sendMessage',
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
        console.log('Sent to ' + groupId);
        callback(null);
      } else {
        callback(new Error(parsed.description));
      }
    });
  });
  req.on('error', callback);
  req.write(body);
  req.end();
}

MESSAGES.forEach(function (msg) {
  cron.schedule(msg.cron, function () {
    console.log('Sending: ' + msg.label);
    GROUPS.forEach(function (groupId) {
      sendMessage(groupId, msg.text, function (err) {
        if (err) console.error('Failed to send to ' + groupId + ': ' + err.message);
      });
    });
  }, { timezone: 'UTC' });
  console.log('Scheduled: ' + msg.label + ' (' + msg.cron + ')');
});

console.log('Bot running. Sending to ' + GROUPS.length + ' group(s).');

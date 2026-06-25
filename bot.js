'use strict';
const cron = require('node-cron');
const axios = require('axios');
const http = require('http');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUPS = [process.env.TELEGRAM_GROUP_1_ID, process.env.TELEGRAM_GROUP_2_ID].filter(Boolean);
const PORT = process.env.PORT || 3000;

// Health check server for Render
const server = http.createServer(function(req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('OK');
});
server.listen(PORT, function() {
  console.log('Health server listening on port ' + PORT);
});

const MESSAGES = [
  { cron: '55 5 * * *', label: '6:55 AM WAT', text: 'Incoming trading signal 🚨🚨
The first trading signal of the day is about to be released , please be prepared and never miss out on the trade sessions because there's no compensation for missed signals' },
  { cron: '0 6 * * *',  label: '7:00 AM WAT', text: 'First Signal released
Follow Order
Execute each trade accordingly And wait for the 2% profit' },
  { cron: '55 8 * * *', label: '9:55 AM WAT', text: 'Incoming trading signal 🚨🚨🚨
Second signal of the day is about to be released , please be prepared and never miss out on the trade sessions because there's no compensation for missed signals' },
  { cron: '0 9 * * *',  label: '10:00 AM WAT', text: 'Second Signal released
Follow Order
Execute each trade accordingly And wait for the 2% profit' },
  { cron: '55 11 * * *',label: '12:55 PM WAT', text: 'VIP Signals are coming soon 🚨🚨🚨
VIP signals will be released in the next 5 minutes. Please be prepared and don't miss any trading sessions, as no signals are missed' },
  { cron: '0 12 * * *', label: '1:00 PM WAT',  text: 'VIP Signal released
Follow Order
Execute each trade accordingly And wait for the 2% profit' },
];

async function sendMessage(groupId, text) {
  await axios.post('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    chat_id: groupId,
    text: text
  });
}

MESSAGES.forEach(function(msg) {
  cron.schedule(msg.cron, async function() {
    console.log('Sending:', msg.label);
    for (var i = 0; i < GROUPS.length; i++) {
      try {
        await sendMessage(GROUPS[i], msg.text);
        console.log('Sent to group', GROUPS[i]);
      } catch(err) {
        console.error('Failed to send to', GROUPS[i], err.message);
      }
    }
  }, { timezone: 'UTC' });
  console.log('Scheduled:', msg.label);
});

console.log('Bot started. Sending to', GROUPS.length, 'group(s).');

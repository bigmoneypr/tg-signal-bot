import cron from 'node-cron';
import axios from 'axios';
import http from 'http';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUPS = [process.env.TELEGRAM_GROUP_1_ID, process.env.TELEGRAM_GROUP_2_ID].filter(Boolean);
const PORT = process.env.PORT || 3000;

// Minimal HTTP server for Render health checks
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Telegram signal bot is running');
}).listen(PORT, () => console.log('Health server on port', PORT));

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
  { cron: '0 12 * * *', label: '1:00 PM WAT', text: 'VIP Signal released
Follow Order
Execute each trade accordingly And wait for the 2% profit' },
];

async function send(groupId, text) {
  await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { chat_id: groupId, text });
}

for (const msg of MESSAGES) {
  cron.schedule(msg.cron, async () => {
    console.log('Sending scheduled message:', msg.label);
    for (const g of GROUPS) {
      try { await send(g, msg.text); console.log('Sent to', g); }
      catch(e) { console.error('Failed to send to', g, e.message); }
    }
  }, { timezone: 'UTC' });
  console.log('Scheduled:', msg.label, '(', msg.cron, ')');
}

console.log('Bot running — 6 messages/day to', GROUPS.length, 'groups');

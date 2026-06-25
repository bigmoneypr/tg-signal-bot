import cron from 'node-cron';
import axios from 'axios';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUPS = [process.env.TELEGRAM_GROUP_1_ID, process.env.TELEGRAM_GROUP_2_ID].filter(Boolean);

const MESSAGES = [
  { cron: '55 5 * * *', text: 'Incoming trading signal 🚨🚨
The first trading signal of the day is about to be released , please be prepared and never miss out on the trade sessions because there's no compensation for missed signals' },
  { cron: '0 6 * * *',  text: 'First Signal released
Follow Order
Execute each trade accordingly And wait for the 2% profit' },
  { cron: '55 8 * * *', text: 'Incoming trading signal 🚨🚨🚨
Second signal of the day is about to be released , please be prepared and never miss out on the trade sessions because there's no compensation for missed signals' },
  { cron: '0 9 * * *',  text: 'Second Signal released
Follow Order
Execute each trade accordingly And wait for the 2% profit' },
  { cron: '55 11 * * *',text: 'VIP Signals are coming soon 🚨🚨🚨
VIP signals will be released in the next 5 minutes. Please be prepared and don't miss any trading sessions, as no signals are missed' },
  { cron: '0 12 * * *', text: 'VIP Signal released
Follow Order
Execute each trade accordingly And wait for the 2% profit' },
];

async function send(groupId, text) {
  await axios.post(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { chat_id: groupId, text });
}

for (const msg of MESSAGES) {
  cron.schedule(msg.cron, async () => {
    console.log('Sending:', msg.cron);
    for (const g of GROUPS) {
      try { await send(g, msg.text); console.log('Sent to', g); }
      catch(e) { console.error('Failed to send to', g, e.message); }
    }
  }, { timezone: 'UTC' });
  console.log('Scheduled:', msg.cron);
}

console.log('Bot running — 6 messages/day to', GROUPS.length, 'groups');

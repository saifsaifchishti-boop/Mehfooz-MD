// .setdp  -> kisi photo par reply karke likhein: bot menu aur welcome ki DP badal jati hai.
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

module.exports = [
  {
    name: 'setdp',
    alias: ['changedp', 'menudp', 'setmenudp'],
    desc: 'Change the menu DP (reply to a photo)',
    ownerOnly: true,
    execute: async ({ sock, m, reply, prefix }) => {
      const ctx = m.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;
      const imgMsg = quoted?.imageMessage || m.message?.imageMessage;
      if (!imgMsg) return reply(`\u26A0\uFE0F Kisi photo par reply karke likhein: *${prefix || '.'}setdp*`);
      try {
        const stream = await downloadContentFromMessage(imgMsg, 'image');
        let buf = Buffer.from([]);
        for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
        const dir = path.join(__dirname, '..', 'media');
        fs.mkdirSync(dir, { recursive: true });
        for (const f of ['menu.png', 'menu.jpeg']) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} }
        fs.writeFileSync(path.join(dir, 'menu.jpg'), buf);
        await reply('\u2705 DP badal di gayi! Ab *.menu* likh kar dekhein.');
      } catch (e) {
        await reply('\u274C DP save nahi ho saki, dobara try karein.');
      }
    }
  }
];

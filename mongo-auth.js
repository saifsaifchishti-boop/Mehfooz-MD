// ─── MongoDB session storage ───
// Heroku ka disk har restart par saaf ho jata hai, isliye WhatsApp sessions
// MongoDB me save hote hain. MONGODB_URI set na ho to purana file-based
// tareeqa hi chalta hai (local testing ke liye).
const fs = require('fs');
const { proto, BufferJSON, initAuthCreds, useMultiFileAuthState } = require('@whiskeysockets/baileys');

let col = null;
const URI = process.env.MONGODB_URI || '';

async function connectMongo() {
    if (!URI) { console.log('[DB] MONGODB_URI not set — using local files (sessions will reset on Heroku restart)'); return false; }
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000 });
    await client.connect();
    col = client.db(process.env.MONGODB_DB || 'mehfooz').collection('wa_sessions');
    await col.createIndex({ sid: 1 });
    console.log('[DB] MongoDB connected');
    return true;
}

async function useAuth(sessionId, dir) {
    if (!col) return useMultiFileAuthState(dir);

    const id = (k) => `${sessionId}:${k}`;
    const write = (k, v) => col.replaceOne({ _id: id(k) }, { sid: sessionId, data: JSON.stringify(v, BufferJSON.replacer) }, { upsert: true });
    const read = async (k) => {
        const d = await col.findOne({ _id: id(k) });
        return d ? JSON.parse(d.data, BufferJSON.reviver) : null;
    };

    const creds = (await read('creds')) || initAuthCreds();
    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const out = {};
                    const docs = await col.find({ _id: { $in: ids.map(i => id(`${type}-${i}`)) } }).toArray();
                    const map = {};
                    docs.forEach(d => { map[d._id] = d.data; });
                    ids.forEach(i => {
                        const raw = map[id(`${type}-${i}`)];
                        if (!raw) return;
                        let v = JSON.parse(raw, BufferJSON.reviver);
                        if (type === 'app-state-sync-key' && v) v = proto.Message.AppStateSyncKeyData.fromObject(v);
                        out[i] = v;
                    });
                    return out;
                },
                set: async (data) => {
                    const ops = [];
                    for (const type in data) {
                        for (const i in data[type]) {
                            const v = data[type][i];
                            const _id = id(`${type}-${i}`);
                            if (v) ops.push({ replaceOne: { filter: { _id }, replacement: { sid: sessionId, data: JSON.stringify(v, BufferJSON.replacer) }, upsert: true } });
                            else ops.push({ deleteOne: { filter: { _id } } });
                        }
                    }
                    if (ops.length) await col.bulkWrite(ops, { ordered: false });
                }
            }
        },
        saveCreds: () => write('creds', creds)
    };
}

// Disconnect / logout par session ka sab data (disk + MongoDB) delete
async function removeSessionData(sessionId, dir) {
    try { if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    if (col) { try { await col.deleteMany({ sid: sessionId }); } catch (e) { console.error('[DB] delete failed', e.message); } }
}

async function listStoredSessionIds() {
    if (!col) return [];
    try { return await col.distinct('sid', { _id: /:creds$/ }); } catch (e) { return []; }
}

module.exports = { connectMongo, useAuth, removeSessionData, listStoredSessionIds };

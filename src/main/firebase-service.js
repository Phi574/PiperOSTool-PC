const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, getApps } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFirestore, doc, setDoc, serverTimestamp } = require('firebase/firestore');

class FirebaseService {
  constructor(userDataPath, resourcesPath) {
    this.userDataPath = userDataPath;
    this.resourcesPath = resourcesPath;
    this.app = null;
  }
  loadConfig() {
    const candidates = [
      path.join(this.resourcesPath, 'firebase-config.json'),
      path.join(process.cwd(), 'resources', 'firebase-config.json')
    ];
    const configPath = candidates.find(fs.existsSync);
    if (!configPath) throw new Error('Thiếu resources/firebase-config.json. Sao chép từ firebase-config.example.json rồi điền cấu hình Firebase.');
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  auth() {
    if (!this.app) this.app = getApps()[0] || initializeApp(this.loadConfig());
    return getAuth(this.app);
  }
  async login(email, password) {
    const result = await signInWithEmailAndPassword(this.auth(), email, password);
    const user = result.user;
    const db = getFirestore(this.app);
    await setDoc(doc(db, 'pcSessions', user.uid, 'devices', require('node:os').hostname()), {
      platform: 'Windows', app: 'PiperOS Tool PC', version: '3.2.3.beta', updatedAt: serverTimestamp()
    }, { merge: true });
    return { uid: user.uid, email: user.email || email };
  }
  async logout() { await signOut(this.auth()); }
}

module.exports = { FirebaseService };

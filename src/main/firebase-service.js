const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, getApps } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, signOut, updateCurrentUser } = require('firebase/auth');
const { UserImpl } = require('@firebase/auth/internal');
const { getFirestore, doc, setDoc, updateDoc } = require('firebase/firestore');
const { safeStorage } = require('electron');
const os = require('node:os');
const crypto = require('node:crypto');

class FirebaseService {
  constructor(userDataPath, resourcesPath) {
    this.userDataPath = userDataPath;
    this.resourcesPath = resourcesPath;
    this.app = null;
    this.session = null;
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
  statePath() { return path.join(this.userDataPath, 'firebase-session.bin'); }
  devicePath() { return path.join(this.userDataPath, 'device-id.txt'); }
  deviceId() {
    if (fs.existsSync(this.devicePath())) return fs.readFileSync(this.devicePath(), 'utf8').trim();
    const id = crypto.randomUUID();
    fs.mkdirSync(this.userDataPath, { recursive: true });
    fs.writeFileSync(this.devicePath(), id, 'utf8');
    return id;
  }
  storeUser(user) {
    if (!safeStorage.isEncryptionAvailable()) return;
    fs.mkdirSync(this.userDataPath, { recursive: true });
    fs.writeFileSync(this.statePath(), safeStorage.encryptString(JSON.stringify(user.toJSON())));
  }
  async restore() {
    if (!fs.existsSync(this.statePath()) || !safeStorage.isEncryptionAvailable()) return null;
    try {
      const auth = this.auth();
      const serializedUser = JSON.parse(safeStorage.decryptString(fs.readFileSync(this.statePath())));
      await updateCurrentUser(auth, UserImpl._fromJSON(auth, serializedUser));
      const user = this.auth().currentUser;
      if (!user) return null;
      await user.reload();
      await this.startSession(user, false);
      return { uid: user.uid, email: user.email };
    } catch (_) {
      fs.rmSync(this.statePath(), { force: true });
      return null;
    }
  }
  async startSession(user, fresh) {
    const sessionId = fresh || !this.session || this.session.uid !== user.uid ? crypto.randomUUID() : this.session.sessionId;
    this.session = { uid: user.uid, sessionId };
    const now = Date.now();
    await setDoc(doc(getFirestore(this.app), 'users', user.uid, 'deviceSessions', sessionId), {
      sessionId, deviceId: this.deviceId(), deviceName: `${os.hostname()} (Windows)`,
      manufacturer: 'PC', model: os.hostname(), platform: 'Windows', windowsVersion: os.release(), architecture: os.arch(),
      app: 'PiperOS Tool PC', appVersion: '3.2.4.beta', loginAt: now, lastSeenAt: now, updatedAt: now,
      active: true, revoked: false, status: 'active'
    }, { merge: true });
  }
  async login(email, password) {
    const result = await signInWithEmailAndPassword(this.auth(), email, password);
    const user = result.user;
    await this.startSession(user, true);
    this.storeUser(user);
    return { uid: user.uid, email: user.email || email };
  }
  async logout() {
    const user = this.auth().currentUser;
    if (user && this.session?.uid === user.uid) {
      await updateDoc(doc(getFirestore(this.app), 'users', user.uid, 'deviceSessions', this.session.sessionId), {
        active: false, status: 'signed_out', signedOutAt: Date.now(), lastSeenAt: Date.now()
      }).catch(() => {});
    }
    this.session = null;
    fs.rmSync(this.statePath(), { force: true });
    await signOut(this.auth());
  }
}

module.exports = { FirebaseService };

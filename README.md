# 🤖 Kiri Bot (Yeşil Gölet Discord Botu)

Bu proje, Yeşil Gölet Discord sunucusu için geliştirilmiş bağımsız, yapay zeka destekli seviye ve eğlence botudur.

---

## 🚀 Başlatma & Çalıştırma

```bash
# Bağımlılıkları yükleme
npm install

# Botu başlatma
npm start

# Geliştirici modu (otomatik yeniden başlatma)
npm run dev
```

---

## 📁 Dosya Yapısı
- **`bot.js`**: Discord Client, Slash komut yönlendirmeleri (`/xray`, `/ship`, `/rank`, `/top`), Google Gemini AI ve MongoDB Atlas bağlantıları.
- **`levelSystem.js`**: Sesli ve yazılı XP hesaplama motoru, anti-AFK ses takipçisi, otomatik kurbağa seviye rolleri, liderlik tablosu ve MongoDB yedekleme.
- **`.env`**: Bot tokeni, MongoDB Atlas URI'si ve Gemini API anahtarları.
- **`.gemini/rules.md`**: Antigravity IDE bağlam ve sunucu hafızası.

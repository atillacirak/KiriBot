<div align="center">

# 🐸 Kur Bot • Yeşil Gölet Discord Botu & Web Dashboard

[![Discord.js](https://img.shields.io/badge/Discord.js-v14.27.0-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.js.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![MongoDB Atlas](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/atlas)
[![Google Gemini AI](https://img.shields.io/badge/Google_Gemini-2.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-Modern_UI-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![AWS EC2](https://img.shields.io/badge/AWS-EC2_24%2F7-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/ec2/)

**Yeşil Gölet Discord Topluluğu için geliştirilmiş yapay zeka destekli, gerçek zamanlı seviye motoruna, analitik hub'ına ve modern yönetim paneline sahip Discord botu.**

[🌿 Yeşil Gölet Sunucusuna Katıl](https://discord.gg/MMJDt9Ymb3) • [🌐 Canlı Web Dashboard](https://yesilgolet.duckdns.org)

</div>

---

## 🌟 Öne Çıkan Özellikler

### 1. ⚡ Gelişmiş Seviye & XP Motoru
- **Sesli Sohbet XP (Dakika Başına):** Ses kanallarında geçirilen süreye göre her 60 saniyede otomatik XP dağıtımı.
- **Anti-AFK & Bot Koruması:** Tek başına odada duranlar, sağırlaştırılmış kullanıcılar ve odada sadece bot veya `@roBOT` rolüne sahip hesaplar bulunan üyeler XP kazanamaz.
- **Yazılı Sohbet XP & Cooldown:** Kanallarda atılan mesajlara dinamik XP dağıtımı (20 saniyelik anti-spam korumasıyla).
- **Zaman Dilimi Sıralamaları:** Günlük, haftalık, aylık ve tüm zamanlar kategorilerinde otomatik sıfırlanan aktiflik takibi.
- **Otomatik Kurbağa Rolleri:**
  - 🐸 **Seviye 25:** `@kurbağa`
  - 🌿 **Seviye 50:** `@göl müdavimi kurbağa`
  - 👑 **Seviye 80:** `@bu direkt göl olmuş`

### 2. 🤖 Google Gemini AI Kişilik & Uyum Analizi
- **`/xray`:** Kullanıcının sunucudaki geçmiş mesajlarını analiz ederek MBTI kişilik tipini, aura rengini, toksisite seviyesini ve guilty pleasure alışkanlıklarını çıkartır.
- **`/ship`:** İki sunucu üyesinin sohbet dinamiklerine göre aşk/arkadaşlık uyumunu hesaplar.
- **`/ruh-ikizi`:** Mesaj tarzına göre sunucudaki kozmik ruh ikizini bulur.

### 3. 🌐 Modern Web Dashboard & Liderlik Tablosu
- **Top 3 Kürsü (Podium) & Filtreler:** Genel XP, Sesli XP, Yazılı XP, Günlük, Haftalık ve Aylık liderlik sıralamaları.
- **Kullanıcı Profil Sayfaları (`/#u/<userId>`):**
  - Doğrudan URL yönlendirme ve tek tıkla profil linki kopyalama.
  - Seviye ilerleme çubuğu, sonraki kurbağa rolüne kalan seviye/XP bilgisi.
  - Orijinal Discord yetki rozetleri (👑 Chio, 🛡️ Admin, ⚔️ Moderatör, 🎬 Animatör, 🎨 İçerik Üreticisi vb.).

### 4. 🛠️ Gizli Admin Paneli (`/#kiriadmin`)
- Sadece `/#kiriadmin` gizli hash'i ve şifre doğrulaması ile erişilebilir.
- **ProBot Tarzı Kategori Bazlı Kanal Seçici:** Kanalları kategorilerine göre listeler, XP devre dışı (Blacklist) kanalları rozetlerle yönetir.
- **Arama Destekli Rol Eşleştirici:** Discord'un orijinal rol renkleri ve ikonlarıyla seviye ödüllerini canlı düzenler.
- **Hızlı Üye Yöneticisi:** Tek tıkla herhangi bir üyenin seviyesini ayarlama, XP ekleme/çıkarma veya sıfırlama.

### 5. 📊 Sunucu İstatistikleri, Büyüme & Tutundurma (Retention & Cohort)
- **Zaman Filtreleri:** Bugün, Bu Hafta, Bu Ay ve Tüm Zamanlar.
- **Sesli & Yazılı Metrikler:** Aktif tekil kullanıcı sayıları, toplam konuşma saatleri, aktiflik oranları.
- **Büyüme & Net Değişim (+/-):** Sunucuya gelen, ayrılan ve net üye artış/azalış takibi.
- **Gelen Kullanıcı Tutundurma (Cohort Analizi):** Katılan üyelerin aktif katılımcıya dönüşme, 1-2 mesaj atıp bırakma ve hayalet (0 mesaj) kalma oranları.
- **Son Üye Hareketleri Akışı & En Aktif Kanallar Sıralaması.**

---

## 📜 Discord Slash Komutları Rehberi

| Komut | Açıklama | Yetki |
| :--- | :--- | :---: |
| `/rank [kullanici]` | Kişisel seviye kartını, sıralamasını ve XP dağılımını gösterir | Herkes |
| `/top [kategori]` | Sunucunun en aktif ilk 10 üyesini madalyalarla listeler | Herkes |
| `/xray [kullanici]` | Gemini AI destekli MBTI, Aura ve Toksisite analizi yapar | Herkes |
| `/ship <kisi1> <kisi2>` | İki üyenin geçmiş sohbet dinamiklerine göre uyumunu ölçer | Herkes |
| `/ruh-ikizi` | Sunucudaki gizli kozmik ruh ikizini bulur | Herkes |
| `/dashboard` | Canlı web sitesi ve liderlik tablosu linkini görüntüler | Herkes |
| `/seviye-ayarla <kullanici> <seviye>` | Bir üyenin seviyesini doğrudan belirler | Admin |
| `/xp-ekle <kullanici> <miktar>` | Bir üyeye özel XP ekler | Admin |
| `/xp-sil <kullanici> <miktar>` | Bir üyeden XP düşer | Admin |
| `/seviye-sifirla <kullanici>` | Bir üyenin tüm seviye verisini sıfırlar | Admin |

---

## 🚀 Kurulum & Çalıştırma

### 1. Gereksinimler
- **Node.js:** v18.0.0 veya üzeri
- **MongoDB:** MongoDB Atlas bağlantı dizesi (URI)
- **Discord Bot Token:** [Discord Developer Portal](https://discord.com/developers/applications) üzerinden `Message Content` ve `Server Members` intentleri açık olmalıdır.
- **Google Gemini API Key:** [Google AI Studio](https://ai.google.dev/) üzerinden ücretsiz alınabilir.

### 2. Projeyi Klonlama ve Bağımlılıkları Yükleme
```bash
git clone https://github.com/your-username/KurBot.git
cd KurBot
npm install
```

### 3. Ortam Değişkenlerini Yapılandırma (`.env`)
`.env.example` dosyasını `.env` olarak kopyalayın ve kendi bilgilerinizi girin:
```bash
cp .env.example .env
```

```env
DISCORD_BOT_TOKEN=your_bot_token
GEMINI_API_KEY=your_gemini_key
MONGODB_URI=mongodb+srv://...
PORT=3000
ADMIN_PASSWORD=yesilgolet2026
```

### 4. Başlatma
```bash
# Prodüksiyon modu
npm start

# Geliştirici modu (canlı izleme)
npm run dev
```

---

## ☁️ Canlı Sunucu (AWS EC2 & PM2)

Proje AWS EC2 üzerinde **Ubuntu 24.04 LTS** ve **PM2** process manager ile 7/24 kesintisiz çalışmaktadır.

```bash
# PM2 Durumu
pm2 status

# Canlı Loglar
pm2 logs kiribot

# Yeniden Başlatma
pm2 restart kiribot
```

---

## 📁 Proje Dizin Yapısı

```
KurBot/
├── public/                 # Web Dashboard & SPA
│   ├── index.html          # TailwindCSS & Glassmorphism Arayüzü
│   └── ...
├── bot.js                  # Discord Client & Slash Komut Yönlendirici
├── levelSystem.js          # XP Motoru, Anti-AFK & Seviye Mantığı
├── analyticsManager.js     # Sunucu İstatistikleri, Büyüme & Cohort Takibi
├── dashboard.js            # Express API & REST Uç Noktaları
├── package.json            # Proje Bağımlılıkları
├── .env.example            # Örnek Yapılandırma Şablonu
└── README.md               # Detaylı Dokümantasyon
```

---

<div align="center">
  <b>Yeşil Gölet Topluluğu için Sevgiyle Geliştirildi 🐸🌿</b>
</div>

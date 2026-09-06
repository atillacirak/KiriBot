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
- **Sesli & Yazılı Sohbet XP:** Ses kanallarında geçirilen süreye ve yazılı sohbet aktivitesine dayalı adil, otomatik XP dağıtımı.
- **Anti-AFK & Güvenlik Korumaları:** Yalnızca tek başına odada kalan, kendisi/kulaklığı sağırlaştırılmış olan veya sadece bot bulunan kanallarda XP kazanımını engelleyen anti-AFK mekanizması.
- **Dinamik Zaman Dilimi Sıralamaları:** Günlük, haftalık, aylık ve tüm zamanlar bazında otomatik güncellenen aktiflik tabloları.
- **Akıllı Rol Yönetimi & Otomatik Değişim:** Üyeler seviye atladıkça kazanılan yeni kurbağa rollerinin (ör. Seviye 25, 50, 80) otomatik tanımlanması ve alt seviye rollerinin temizlenerek rol kirliliğinin önlenmesi.
- **Yüksek Kaliteli Özel Canvas Kartları (`@napi-rs/canvas`):** Discord istemcisinde görsel şölen sunan kişiselleştirilmiş avatar, derece, seviye ve durum göstergelerine sahip rank kartları.

### 2. 🤖 Google Gemini AI Kişilik & Uyum Analizi
- **`/xray`:** Kullanıcının sunucudaki geçmiş mesajlarını analiz ederek MBTI kişilik tipini, aura rengini, toksisite seviyesini ve alışkanlıklarını çıkaran derinlemesine analiz.
- **`/ship`:** İki sunucu üyesinin sohbet dinamiklerine göre aşk ve arkadaşlık uyumunu değerlendiren yapay zeka analizi.
- **`/ruh-ikizi`:** Mesaj tarzı ve sunucu etkileşimlerine dayanarak üyenin sunucudaki kozmik ruh ikizini eşleştiren eğlenceli analiz.

### 3. 🌐 Modern Web Dashboard & Liderlik Tablosu
- **Top 3 Kürsü & Filtreleme:** Genel XP, Sesli XP, Yazılı XP, Günlük, Haftalık ve Aylık kategorilerinde anlık liderlik sıralaması.
- **Gelişmiş Kullanıcı Profil Sayfaları (`/#u/<userId>`):**
  - Profil bağlantısını kolayca kopyalama ve paylaşma.
  - Seviye ilerlemesi, kalan XP ve hedeflenen kurbağa rolü detayları.
  - Discord sunucu rollerinin orijinal renk ve ikonlarıyla rozet formatında sergilenmesi.
  - Özel DM/Sistem Bildirimleri geçmişi sekmesi ("Seviye/Sistem 🎖️").
- **Tek Parça Modern Glassmorphism Arayüz:** Kullanıcı dostu ve estetik web tasarımı.

### 4. 🛠️ Gelişmiş Admin Paneli (`/#kiriadmin`) & Sistem Analitiği
- **Güvenli & Oturum Korumalı Erişim:** 7 günlük kalıcı şifreli oturum yönetimi ve inaktivite zaman aşımı koruması.
- **Canlı Sunucu & Donanım İstatistikleri:** EC2 sunucusunun anlık CPU kullanımı, RAM doluluğu, çalışma süresi (Uptime) ve bot belleği takibi.
- **Kategori Bazlı Kanal Seçici & Kara Liste:** XP kazanımına kapalı (Blacklist) kanalları kategorilerine göre yönetme.
- **Rol & Ödül Eşleme:** Seviye ödüllerini Discord rolleriyle anlık olarak bağlama ve yönetme.
- **Üye Seviye/XP Yöneticisi:** Üyelerin XP ve seviyelerini canlı olarak düzenleme veya sıfırlama.

### 5. 📊 Büyüme, Tutundurma & Cohort Analizleri
- **Zaman Dilimi Analitikleri:** Bugün, Bu Hafta, Bu Ay ve Tüm Zamanlar bazında filtreleme.
- **Aktiflik Metrikleri:** Tekil aktif kullanıcı sayıları, toplam sesli görüşme süreleri ve yazılı aktivite hacmi.
- **Büyüme & Net Değişim:** Sunucuya yeni katılan, ayrılan ve net üye grafik takibi.
- **Gelen Kullanıcı Tutundurma (Cohort Analizi):** Katılan üyelerin aktif topluluk üyesine dönüşme, az mesaj atanlar ve hayalet kullanıcı kalma oranlarının analizi.

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
- **Google Gemini API Key:** [Google AI Studio](https://ai.google.dev/) üzerinden alınabilir.

### 2. Projeyi Klonlama ve Bağımlılıkları Yükleme
```bash
git clone https://github.com/atillacirak/KiriBot.git
cd KiriBot
npm install
```

### 3. Ortam Değişkenlerini Yapılandırma (`.env`)
`.env.example` dosyasını `.env` olarak kopyalayın ve bilgilerinizi girin:
```bash
cp .env.example .env
```

```env
DISCORD_BOT_TOKEN=your_bot_token
GEMINI_API_KEY=your_gemini_key
MONGODB_URI=mongodb+srv://...
PORT=3000
ADMIN_PASSWORD=your_admin_password
```

### 4. Başlatma
```bash
# Prodüksiyon modu
npm start

# Geliştirici modu (canlı izleme)
npm run dev
```

---

## ☁️ Canlı Sunucu Yönetimi (AWS EC2 & PM2)

Proje AWS EC2 üzerinde **Ubuntu 24.04 LTS** ve **PM2** süreç yöneticisi ile 7/24 kesintisiz çalışmaktadır.

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
KiriBot/
├── public/                 # Web Dashboard & SPA (HTML, CSS, JS)
│   ├── index.html          # TailwindCSS & Glassmorphism Arayüzü
│   └── ...
├── bot.js                  # Discord Client & Slash Komut Yönlendirici
├── levelSystem.js          # XP Motoru, Anti-AFK & Seviye Mantığı
├── analyticsManager.js     # Sunucu İstatistikleri, Büyüme & Cohort Takibi
├── dashboard.js            # Express API, Admin Paneli & REST Uç Noktaları
├── package.json            # Proje Bağımlılıkları
├── .env.example            # Örnek Yapılandırma Şablonu
└── README.md               # Proje Dokümantasyonu
```

---

<div align="center">
  <b>Yeşil Gölet Topluluğu için Sevgiyle Geliştirildi 🐸🌿</b>
</div>

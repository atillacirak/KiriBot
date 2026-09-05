# 🧠 Kiri Bot • Proje Hafızası ve Kuralları (Antigravity Memory)

Bu dosya, Kiri Bot projesinin tüm hafızasını, sunucu yapılandırmalarını, rol ve kanal ID'lerini ve geliştirme geçmişini içerir. Antigravity bu projeyi açtığında tüm bu bağlamı otomatik olarak hatırlar.

---

## 🏰 1. Sunucu Bilgileri & Ana Yapı
- **Ana Sunucu Adı:** Yeşil Gölet (ID: `1315029372519846039`)
- **Diğer Sunucular:** Seacord (ID: `330105508935499778`), kichicord (ID: `1267783104584482876`)
- **Bot Adı & ID:** Kiri Bot#2895 (ID: `1545168260230553630`)
- **Özel Renk Paleti:**
  - Ana Yeşil (Tema): `#5EA454` (RGB: 94, 164, 84)
  - Canlı Turuncu: `#F79F36` (RGB: 247, 159, 54)
  - Açık Krem (Fırça): `#FFF0B8`

---

## 📜 2. Yeşil Gölet Rol ID Listesi

### 🐸 Seviye & Aktiflik Rolleri (Amari/Kiri XP Sistemi):
- **Seviye 10:** `1439005386886742117` $\rightarrow$ `<@&1439005386886742117>` *(mini kurbağa)*
- **Seviye 25:** `1439006338402484305` $\rightarrow$ `<@&1439006338402484305>` *(kurbağa)*
- **Seviye 50:** `1439006370769666140` $\rightarrow$ `<@&1439006370769666140>` *(göl müdavimi kurbağa)*
- **Seviye 80:** `1439006516282785964` $\rightarrow$ `<@&1439006516282785964>` *(bu direkt göl olmuş)*

### 🛡️ Yönetim & Yetkili Rolleri:
- **ADMIN:** `1315029510672089129` $\rightarrow$ `<@&1315029510672089129>`
- **Morderatör:** `1315047438267973652` $\rightarrow$ `<@&1315047438267973652>`
- **Yetkili:** `1439002771557974139` $\rightarrow$ `<@&1439002771557974139>`
- **Teknin Destek:** `1439009602506326108` $\rightarrow$ `<@&1439009602506326108>`
- **V.I.P:** `1439010384215408733` $\rightarrow$ `<@&1439010384215408733>`
- **arkadas yaka kartı:** `1439010064110452928` $\rightarrow$ `<@&1439010064110452928>`

### 🎨 Yetenek & Sanat Rolleri:
- **Ressam:** `1439018465682788529` $\rightarrow$ `<@&1439018465682788529>`
- **Müzisyen:** `1439018585761648773` $\rightarrow$ `<@&1439018585761648773>`
- **Teknisyen:** `1439019982414545019` $\rightarrow$ `<@&1439019982414545019>`
- **Ses Sanatçısı:** `1439018744406999121` $\rightarrow$ `<@&1439018744406999121>`
- **Tasarımcı/Editör:** `1439018506061352991` $\rightarrow$ `<@&1439018506061352991>`
- **Multi Language:** `1439018532837789866` $\rightarrow$ `<@&1439018532837789866>`
- **3D Artist:** `1439018398494490665` $\rightarrow$ `<@&1439018398494490665>`
- **Animatör:** `1459305221896409203` $\rightarrow$ `<@&1459305221896409203>`

### ⚠️ Ceza Rolleri:
- **uyarı 1:** `1439018944940740730`
- **uyarı 2:** `1439018981024469152`
- **cezalı:** `1439019001186353263`
- **şartlı tahliye:** `1439019095046754426`

---

## 💬 3. Önemli Kanal ID Listesi
- `#📜rol` *(Rol Başvuru):* `<#1315035676735045663>`
- `#📜kurallar` *(Kurallar Kanalı):* `<#1315035457934856364>`
- `#🎨resim`: `<#1315037271183069294>`
- `#💖fan-art`: `<#1315037343253528627>`
- `#🎨sanat-yardım`: `<#1439009290903093462>`
- `#yetkili-chat`: `<#1439019849849245907>`
- `#🎫ticket` & `#🚨| yardım`: `<#1315045741038931998>` / `<#1315034674791321601>`
- **Sesli Çağrı Merkezleri:**
  - `📞 Çağrı Merkezi`: `<#1315050263555473460>`
  - `📞 Çağrı Merkezi 2`: `<#1315050295381721188>`
  - `📞 Çağrı Merkezi 2.5`: `<#1439013744599629935>`
- **XP'den Muaf Tutulan Kanallar:**
  - `#🤖bot-komut` (`1439038727644250346`)
  - `#🚪oda-komut` (`1315051073781895168`)
  - `#spam` (`1439016893322100746`)

---

## ⚙️ 4. Bot Özellikleri & Komutlar
1. **`/rank` `[üye]`**: Kişinin Yeşil Gölet temalı seviye kartını, sıralamasını, yazılı ve sesli XP dağılımını gösterir.
2. **`/top`**: Sunucunun en aktif ilk 10 üyesini madalyalı liderlik tablosunda listeler.
3. **`/xray` `[üye]`**: Google Gemini AI destekli üye kişilik, MBTI, toksisite ve aura analizi yapar.
4. **`/ship` `[kişi1] [kişi2]`**: İki üyenin sohbet uyumunu hesaplar.
5. **`/ruh-ikizi`**: Kozmik ruh ikizi kehaneti üretir.
6. **Seviye ve XP Motoru (`levelSystem.js`):**
   - Yazılı mesaj: 60 saniye arayla 15-25 XP.
   - Sesli sohbet: Dakikada 15 XP (en az 2 kişi ve undeafened şartı).
   - Otomatik Seviye Rolleri: Seviye 10, 25, 50, 80 baremlerinde otomatik atanır.
   - Veritabanı: In-memory cache + MongoDB Atlas (`user_levels` koleksiyonu) + yerel JSON yedek.

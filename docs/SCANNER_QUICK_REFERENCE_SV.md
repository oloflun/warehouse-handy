# Scanner Snabbguide

## 📱 Så Scannar Du En Etikett

1. **Öppna Scanner** från huvudmenyn
2. **Kameran startar automatiskt**
3. **Centrera etiketten** i rutan
4. **Tryck på "Scanna"** knappen
5. **Vänta** på analys (1-2 sekunder)
6. **Välj produkt** om flera matchningar

## ✅ Tips För Bästa Resultat

### Ljus
- ☀️ Använd bra belysning
- 🚫 Undvik skuggor
- 🚫 Undvik bländning från reflexer

### Avstånd
- ✅ 15-30 cm från etiketten
- 🚫 Inte för nära (suddig)
- 🚫 Inte för långt (inte läsbar)

### Vinkel
- ✅ Håll telefonen rakt
- ⚠️ Max 30° lutning OK
- 🚫 Mer än 30° = svårt att läsa

### Stabilitet
- ✅ Håll telefonen stilla
- ⏱️ Vänta tills bilden är skarp
- 🤚 Vila handen mot något

## 🔄 Om Scanning Misslyckas

### Automatisk Återförsök
Systemet försöker automatiskt 3 gånger:
1. Första försöket
2. Väntar 0.5 sekunder → Försök 2
3. Väntar 1 sekund → Försök 3
4. Om det fortfarande misslyckas → manuell inmatning

### Manuell Inmatning
1. Scrolla ner till "Eller ange artikelnummer"
2. Skriv in artikelnumret
3. Tryck Enter eller "Sök"

## 📊 Tillförlitlighetsindikatorer

När scannern läser etiketten ser du:

| Symbol | Betydelse | Vad Du Ska Göra |
|--------|-----------|-----------------|
| ✅ | Hög tillförlitlighet | Fortsätt med confidence |
| ℹ️ | Medel tillförlitlighet | Kolla artikelnumret |
| ⚠️ | Låg tillförlitlighet | Dubbelkolla eller ta om bilden |

## 🚨 Vanliga Problem

### "Kunde inte hitta artikelnummer"
**Lösning:**
1. Ta om bilden med bättre ljus
2. Gå närmare etiketten
3. Håll telefonen rakare
4. Rengör kameralinsen

### "Fel artikelnummer"
**Exempel:** Scannrade "149216" men fick "149126"

**Lösning:**
1. Ta om bilden med skarpare fokus
2. Se till att alla siffror är tydliga
3. Använd manuell inmatning om problemet kvarstår

### Kameran Stängs När Jag Lutar Telefonen
**Status:** ✅ Fixat i v2.0
- Kameran stannar aktiv även när du lutar telefonen
- Bra för långa/vertikala etiketter

### Långsam Scanning (>3 sekunder)
**Möjliga Orsaker:**
- Dålig nätverksanslutning
- Systemet försöker flera gånger automatiskt

**Lösning:**
- Vänta på återförsök (automatiskt)
- Kolla nätverkssignal (4G/5G/WiFi)
- Stäng andra appar

## 📋 Följesedel Scanning

### Så Gör Du
1. **Fotografera hela följesedeln**
2. **Se till att alla rader är synliga**
3. **Använd liggande läge** för breda dokument
4. **Tryck "Fånga bild"**

### Efter Scanning
- Alla artiklar visas i en lista
- ✅ Checkboxar för att bocka av
- **Godsmärke** visas om det finns (inte telefonnummer!)
- Scanna individuella etiketter för att checka av automatiskt

### Godsmärke (Cargo Marking)
**Vad visas:**
- "031-68" ✅ (från Godsmärkning rad)
- "24 22" ✅ (från följesedel)
- "MR" → Inget godsmärke ✅
- "010-220 43 00" 🚫 (telefonnummer ignoreras nu)

## ⚡ Snabbtips

- **Scanna snabbt:** Systemet är optimerat för <2s
- **Flera försök:** 3 automatiska återförsök vid problem
- **Alltid ett alternativ:** Manuell inmatning om AI inte fungerar
- **Följesedel först:** Scanna följesedeln först, sedan individuella artiklar

## 🎯 Godkänd Produktivitet

Med v2.0 förbättringar:
- ✅ 98% noggrannhet på tydliga etiketter
- ✅ <2 sekunder för 90% av scanningarna
- ✅ Ingen data går förlorad (automatiska återförsök)
- ✅ Tydliga felmeddelanden med tips

## 📞 Hjälp Behövs?

1. **Kolla denna guide först**
2. **Försök manuell inmatning**
3. **Rapportera återkommande problem** till IT
4. **Ta en bild** av problematisk etikett för felsökning

---

**Version:** 2.0  
**Senast uppdaterad:** 2025-11-11  
**Support:** IT-avdelningen

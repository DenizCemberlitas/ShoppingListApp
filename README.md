# 🛒 Gemeinsame Einkaufsliste

Eine einfache Web-App für eine gemeinsame Einkaufsliste in Echtzeit – entwickelt als kleines Hilfsmittel für den Familien-Spätkauf.

> 💡 Dieses Projekt wurde mit Unterstützung von KI (Claude von Anthropic) entwickelt.

---

## ✨ Features

- **Echtzeit-Sync** – Änderungen sind sofort auf allen Geräten sichtbar
- **Google Login** – sicherer Zugang über Google-Account
- **Mehrere Listen** – z. B. verschiedene Listen pro Laden oder Anlass
- **Kategorien & Läden** – Produkte werden nach Laden und Kategorie gruppiert
- **Abhaken** – Produkte als erledigt markieren
- **Drag & Drop** – Reihenfolge per Drag & Drop anpassen
- **Undo** – versehentlich gelöschte Einträge rückgängig machen
- **Dark / Light Mode** – umschaltbares Design
- **Mobil-optimiert** – funktioniert auf dem Handy genauso wie im Browser

---

## 🛠️ Tech Stack

| Technologie | Verwendung |
|---|---|
| HTML / CSS / JavaScript | Frontend |
| Firebase Auth | Google Login |
| Cloud Firestore | Echtzeit-Datenbank |
| Firebase Hosting | Deployment |

---

## 🚀 Setup

### Voraussetzungen
- [Node.js](https://nodejs.org/) installiert
- Ein [Firebase-Projekt](https://console.firebase.google.com/) angelegt
- Firebase Authentication (Google) und Firestore aktiviert

### Installation

```bash
# Repository klonen
git clone https://github.com/DenizCemberlitas/ShoppingListApp.git
cd ShoppingListApp

# Abhängigkeiten installieren
npm install
```

### Firebase konfigurieren

```bash
# Beispiel-Konfiguration kopieren
cp public/firebase-config.example.js public/firebase-config.js
```

Dann `public/firebase-config.js` öffnen und mit den eigenen Firebase-Projektdaten befüllen (zu finden in der Firebase Console unter Projekteinstellungen).

### Starten

```bash
npm start
# oder direkt mit Firebase CLI:
firebase serve
```

---

## 📁 Projektstruktur

```
ShoppingListApp/
├── public/
│   ├── index.html                  # Haupt-HTML
│   ├── app.js                      # App-Logik
│   ├── style.css                   # Styling
│   ├── firebase-config.js          # Geheim – nicht im Repo! (→ .gitignore)
│   └── firebase-config.example.js  # Vorlage für die Konfiguration
├── .gitignore
├── package.json
└── README.md
```

---

## 🔒 Sicherheitshinweis

Die Datei `firebase-config.js` enthält den API-Key und ist über `.gitignore` vom Repository ausgeschlossen. Niemals in ein öffentliches Repository committen. Die Datei `firebase-config.example.js` dient als Vorlage.

---

## 👨‍💻 Entwicklung

Entwickelt von [DenizCemberlitas](https://github.com/DenizCemberlitas) – als privates Familienprojekt für den Alltag im Spätkauf, mit KI-Unterstützung durch [Claude (Anthropic)](https://claude.ai).

// ============================================================
// app.js – Shopping List App (Firebase v10, ES Modules)
// ============================================================
// Diese Datei ist das komplette „Gehirn" der App.
// Sie kümmert sich um:
//   1. Firebase-Verbindung (Auth + Firestore)
//   2. Login/Logout per Google
//   3. Mehrere Listen anlegen/wechseln/löschen
//   4. Artikel hinzufügen, abhaken, löschen, neu ordnen (Drag & Drop)
//   5. Theme (Dark/Light) per localStorage speichern
//   6. Undo-Snackbar nach dem Löschen eines Artikels
// ============================================================


// ── IMPORTS ─────────────────────────────────────────────────
// Firebase v10 nutzt „tree-shakeable" ESM-Imports.
// Das heißt: Wir importieren nur genau die Funktionen, die wir brauchen.
// Vorteil: Kleineres Bundle, kein großes globales Firebase-Objekt.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
// initializeApp: Verbindet die App mit dem Firebase-Projekt anhand der Config.

import {
  getAuth,              // Gibt das Auth-Objekt zurück (Singleton pro App)
  GoogleAuthProvider,   // Konfiguriert Google als Login-Anbieter
  signInWithPopup,      // Öffnet ein Popup-Fenster zum Google-Login
  signOut,              // Loggt den aktuellen User aus
  onAuthStateChanged,   // Listener: Wird aufgerufen, wenn sich der Login-Status ändert
  setPersistence,       // Legt fest, wie lange die Session gespeichert wird
  browserLocalPersistence, // Wert für setPersistence: Session bleibt im localStorage erhalten
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,     // Gibt die Firestore-Datenbankinstanz zurück
  collection,       // Referenz auf eine Firestore-Collection (Ordner mit Dokumenten)
  doc,              // Referenz auf ein einzelnes Dokument in einer Collection
  addDoc,           // Fügt ein neues Dokument mit auto-generierter ID hinzu
  deleteDoc,        // Löscht ein einzelnes Dokument
  updateDoc,        // Aktualisiert einzelne Felder eines Dokuments
  orderBy,          // Sortieroption für Queries
  query,            // Erstellt eine Datenbankabfrage mit Filtern/Sortierungen
  onSnapshot,       // Echtzeit-Listener: Wird aufgerufen, sobald sich Daten ändern
  getDocs,          // Einmaliges Lesen einer Collection (kein Echtzeit-Listener)
  setDoc,           // Schreibt ein Dokument mit einer selbst gewählten ID
                    // (überschreibt oder merged, je nach Option)
  getDoc,           // Liest einmalig ein einzelnes Dokument
  serverTimestamp,  // Setzt den Timestamp auf dem Firebase-Server (nicht auf dem Client!)
                    // → verhindert Probleme durch unterschiedliche Uhrzeiten
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";
// firebaseConfig ist eine separate Datei mit den API-Schlüsseln (apiKey, projectId, etc.).
// Sie ist in .gitignore eingetragen, damit die Zugangsdaten nicht öffentlich auf GitHub landen.
// Im Repo liegt stattdessen eine firebase-config.example.js als Vorlage.


// ── KATEGORIEN ──────────────────────────────────────────────
// Zentrale Liste aller möglichen Produktkategorien + zugehöriger Emoji.
// Wird an mehreren Stellen genutzt: für das Select-Menü und beim Rendern der Liste.
const CATEGORIES = [
  { value: "Getränke",      emoji: "🥤" },
  { value: "Bier",          emoji: "🍺" },
  { value: "Snacks",        emoji: "🥨" },
  { value: "Tiefkühl",      emoji: "🧊" },
  { value: "Tabakwaren",    emoji: "🚬" },
  { value: "Tabak Zubehör", emoji: "🚬" },
  { value: "Spirituosen",   emoji: "🍾" },
  { value: "Sonstiges",     emoji: "🧺" },
];

// Hilfsfunktion: Gibt den passenden Emoji zu einer Kategorie zurück.
// Der ?.-Operator (optional chaining) verhindert einen Fehler, falls die Kategorie nicht gefunden wird.
// ?? "🛒" ist der Fallback-Wert, falls find() nichts zurückgibt.
function getCategoryEmoji(category) {
  return CATEGORIES.find(c => c.value === category)?.emoji ?? "🛒";
}


// ── WARTEN BIS DAS HTML GELADEN IST ─────────────────────────
// Alles ab hier wird erst ausgeführt, wenn der Browser das komplette HTML geparst hat.
// Das ist nötig, weil wir auf DOM-Elemente (Buttons, Inputs etc.) zugreifen.
document.addEventListener("DOMContentLoaded", () => {

  // ── FIREBASE INITIALISIEREN ────────────────────────────────
  const app = initializeApp(firebaseConfig);
  // app ist das Firebase-App-Objekt – Grundlage für alle anderen Firebase-Dienste.

  const auth = getAuth(app);
  // auth = Auth-Instanz: zuständig für Login/Logout und den aktuellen User.

  const db = getFirestore(app);
  // db = Firestore-Instanz: unsere Datenbank.
  // Datenstruktur: lists/{listId}/items/{itemId}
  //   - lists: Collection mit allen Listen (z.B. "familie", "lager")
  //   - items: Sub-Collection jeder Liste mit den einzelnen Artikeln

  const provider = new GoogleAuthProvider();
  // provider = sagt Firebase, dass wir Google als Login-Methode nutzen wollen.


  // ── DOM-ELEMENTE EINSAMMELN ────────────────────────────────
  // Wir holen uns alle HTML-Elemente, mit denen wir interagieren wollen.
  // getElementById gibt null zurück wenn das Element nicht existiert → daher überall ?. oder ?.
  const loginBtn       = document.getElementById("loginBtn");
  const logoutBtn      = document.getElementById("logoutBtn");
  const userInfo       = document.getElementById("userInfo");

  const form           = document.getElementById("itemForm");       // Formular zum Hinzufügen
  const input          = document.getElementById("itemInput");      // Texteingabe für den Artikel
  const categorySelect = document.getElementById("itemCategory");   // Kategorie-Dropdown
  const storeSelect    = document.getElementById("itemStore");      // Laden-Dropdown
  const listEl         = document.getElementById("itemList");       // Die Artikel-Liste im HTML
  const clearBtn       = document.getElementById("clearAllBtn");    // "Alles löschen"-Button

  const toggleSidebar  = document.getElementById("toggleSidebar"); // Hamburger-Menü-Button
  const sidebar        = document.getElementById("sidebar");        // Seitenleiste
  const closeSidebar   = document.getElementById("closeSidebar");  // Sidebar schließen

  const themeToggle    = document.getElementById("themeToggle");   // Dark/Light-Mode-Button

  const listChips      = document.getElementById("listChips");     // Bereich für Listen-Chips (Tabs)
  const newListForm    = document.getElementById("newListForm");   // Formular für neue Liste
  const newListNameInp = document.getElementById("newListName");  // Eingabe für Listen-Namen
  const deleteListBtn  = document.getElementById("deleteListBtn"); // Aktuelle Liste löschen


  // ── KATEGORIE-DROPDOWN DYNAMISCH BEFÜLLEN ─────────────────
  // Statt die <option>-Tags hart in index.html zu schreiben, erzeugen wir sie per JS
  // aus dem CATEGORIES-Array oben. Vorteil: Nur eine Stelle zum Pflegen.
  CATEGORIES.forEach(({ value, emoji }) => {
    const opt = document.createElement("option"); // Neues <option>-Element erstellen
    opt.value = value;                            // value-Attribut: wird gespeichert
    opt.textContent = `${emoji} ${value}`;        // Angezeigter Text im Dropdown
    categorySelect?.appendChild(opt);             // Ins Dropdown einhängen
  });


  // ── APP STATE (Zustandsvariablen) ──────────────────────────
  // Diese Variablen beschreiben den aktuellen Zustand der App.

  let items = [];
  // Lokale Kopie aller Artikel der aktiven Liste.
  // Wird bei jedem Firestore-Update (onSnapshot) neu befüllt.

  let unsubscribeItems = null;
  // Firestore-Listener können deregistriert werden.
  // onSnapshot gibt eine Funktion zurück, die man aufrufen kann um den Listener zu stoppen.
  // Das ist wichtig, wenn man die Liste wechselt – sonst hört man noch auf die alte Liste!

  let currentItemsRef = null;
  // Referenz auf die items-Sub-Collection der aktuell aktiven Liste.
  // z.B. collection(doc(db, "lists", "familie"), "items")

  let currentListId = localStorage.getItem("currentListId") || "familie";
  // Welche Liste ist gerade aktiv? Wird im localStorage gespeichert,
  // damit die Auswahl nach einem Browser-Reload erhalten bleibt.
  // Fallback: "familie" wenn noch nichts gespeichert ist.

  let lastCategory = localStorage.getItem("lastCategory") || "";
  let lastStore    = localStorage.getItem("lastStore") || "";
  // Speichert die zuletzt gewählte Kategorie/Laden, damit das Formular
  // beim nächsten Artikel schon vorausgewählt ist – spart Zeit beim Einkaufen.


  // ── THEME (DARK/LIGHT MODE) ────────────────────────────────
  const savedTheme = localStorage.getItem("theme") || "dark";
  applyTheme(savedTheme);
  // Beim Start direkt den gespeicherten Theme anwenden. Default: Dark.

  themeToggle?.addEventListener("click", () => {
    // Toggle-Logik: Wenn gerade "light" aktiv → wechsle zu "dark" und umgekehrt.
    const next = document.body.classList.contains("light") ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem("theme", next); // Speichern damit es beim Reload bleibt
  });

  function applyTheme(mode) {
    if (mode === "light") {
      document.body.classList.add("light");          // CSS-Klasse setzt helles Theme
      themeToggle && (themeToggle.textContent = "☀️ Light");
    } else {
      document.body.classList.remove("light");       // Kein "light" = dunkles Theme
      themeToggle && (themeToggle.textContent = "🌙 Dark");
    }
  }


  // ── SIDEBAR ────────────────────────────────────────────────
  toggleSidebar.addEventListener("click", () => {
    sidebar.classList.toggle("open"); // "open"-Klasse an/aus → CSS zeigt/versteckt Sidebar
    // sidebar-open auf body verhindert scrollen wenn Sidebar offen (in CSS geregelt)
    document.body.classList.toggle("sidebar-open", sidebar.classList.contains("open"));
  });

  closeSidebar.addEventListener("click", () => {
    sidebar.classList.remove("open");
    document.body.classList.remove("sidebar-open");
  });


  // ── AUTH – LOGIN / LOGOUT ──────────────────────────────────

  loginBtn?.addEventListener("click", async () => {
    try {
      // Zuerst Persistenz setzen: browserLocalPersistence = Session bleibt nach Tab-Schließen.
      // Alternativ: browserSessionPersistence (weg nach Tab-Schließen) oder inMemoryPersistence.
      await setPersistence(auth, browserLocalPersistence);
      // Dann Google-Login-Popup öffnen. await wartet bis der User fertig ist.
      await signInWithPopup(auth, provider);
      // Nach erfolgreichem Login feuert onAuthStateChanged automatisch.
    } catch (err) {
      console.error("Login fehlgeschlagen:", err);
      alert("Login fehlgeschlagen: " + (err?.message || ""));
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      await signOut(auth); // Firebase-Session beenden
      listEl && (listEl.innerHTML = ""); // UI sofort leeren
      // onAuthStateChanged feuert danach automatisch und räumt den Rest auf.
    } catch (err) {
      console.error("Logout-Fehler:", err);
    }
  });

  // ── AUTH STATE LISTENER ────────────────────────────────────
  // Dieser Listener ist das Herzstück der Authentifizierung.
  // Er wird AUTOMATISCH aufgerufen:
  //   - beim Start der App (mit dem aktuellen Login-Status)
  //   - nach jedem Login
  //   - nach jedem Logout
  // So muss man nie manuell prüfen ob jemand eingeloggt ist.
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // user ist ein Firebase-User-Objekt (hat .displayName, .email, .uid, etc.)
      loginBtn && (loginBtn.style.display = "none");
      logoutBtn && (logoutBtn.style.display = "inline-block");
      userInfo && (userInfo.textContent = `👤 Eingeloggt als: ${user.displayName || user.email}`);
      input && input.focus(); // Direkt in das Eingabefeld springen

      await renderListChips(); // Listen-Tabs im Sidebar aufbauen
      initSharedList();        // Echtzeit-Listener für die aktive Liste starten
    } else {
      // Kein User eingeloggt → UI aufräumen
      loginBtn && (loginBtn.style.display = "inline-block");
      logoutBtn && (logoutBtn.style.display = "none");
      userInfo && (userInfo.textContent = "");
      listEl && (listEl.innerHTML = "");

      // Alten Listener stoppen! Sonst läuft er weiter obwohl niemand eingeloggt ist.
      if (typeof unsubscribeItems === "function") {
        unsubscribeItems();
        unsubscribeItems = null;
      }
    }
  });


  // ── LISTEN-VERWALTUNG ──────────────────────────────────────

  // Neue Liste anlegen
  newListForm?.addEventListener("submit", async (e) => {
    e.preventDefault(); // Standard-Formular-Submit verhindern (würde Seite neu laden)
    const raw = (newListNameInp?.value || "").trim();
    if (!raw) return; // Leer → nichts tun

    const id = slugify(raw); // Aus "Meine Liste!" wird z.B. "meine-liste" (URL-sicher)
    try {
      // setDoc mit merge:true: Wenn das Dokument schon existiert → merge statt überschreiben.
      // Wenn nicht existiert → neu anlegen.
      await setDoc(doc(db, "lists", id), { name: raw, createdAt: serverTimestamp() }, { merge: true });
      newListNameInp.value = ""; // Eingabe leeren
      switchList(id);            // Direkt zur neuen Liste wechseln
    } catch (err) {
      console.error("Neue Liste fehlgeschlagen:", err);
      alert("Konnte Liste nicht anlegen: " + (err?.message || err));
    }
  });

  // Aktuelle Liste löschen
  deleteListBtn?.addEventListener("click", async () => {
    // Busy-Guard: Verhindert Doppelklicks während der async-Operation läuft.
    if (deleteListBtn.dataset.busy === "1") return;
    deleteListBtn.dataset.busy = "1";
    deleteListBtn.disabled = true;

    try {
      // Namen der Liste aus Firestore holen (für den Bestätigungsdialog)
      const snap = await getDoc(doc(db, "lists", currentListId));
      const name = snap.exists() ? (snap.data()?.name || currentListId) : currentListId;

      if (!confirm(`„${name}" und alle enthaltenen Einträge wirklich löschen?`)) return;

      // Alle anderen Listen merken (ohne die zu löschende)
      const allBefore = await getDocs(collection(db, "lists"));
      const remaining = allBefore.docs.map(d => d.id).filter(id => id !== currentListId);

      // Echtzeit-Listener stoppen bevor wir löschen (sonst gibt's Fehler)
      if (typeof unsubscribeItems === "function") {
        unsubscribeItems();
        unsubscribeItems = null;
      }
      currentItemsRef = null;
      listEl && (listEl.innerHTML = "");

      // Liste + alle Artikel darin löschen (deep delete, s.u.)
      await deleteListDeep(db, currentListId);

      await renderListChips(); // Sidebar aktualisieren

      // Zur nächsten verfügbaren Liste wechseln
      let nextId = remaining[0];
      if (!nextId) {
        // Keine Liste mehr übrig → Fallback "familie" neu anlegen
        await setDoc(doc(db, "lists", "familie"), { name: "Familie", createdAt: serverTimestamp() }, { merge: true });
        nextId = "familie";
      }

      currentListId = nextId;
      localStorage.setItem("currentListId", currentListId);
      initSharedList();

    } catch (err) {
      console.error("Liste löschen fehlgeschlagen:", err);
      alert("Konnte die Liste nicht löschen: " + (err?.message || err));
    } finally {
      // finally läuft IMMER, egal ob try oder catch ausgeführt wurde.
      // → Button immer wieder freigeben.
      deleteListBtn.dataset.busy = "0";
      deleteListBtn.disabled = false;
    }
  });

  // Listen-Chips (Tabs) im Sidebar rendern
  async function renderListChips() {
    if (!listChips) return;
    listChips.innerHTML = ""; // Alte Chips löschen bevor neue gerendert werden

    // Alle Dokumente aus der "lists"-Collection einmalig lesen
    const snap = await getDocs(collection(db, "lists"));
    const lists = [];
    snap.forEach(d => lists.push({ id: d.id, name: d.data()?.name || d.id }));

    // Fallback: Wenn keine Liste existiert, "Familie" anlegen
    if (lists.length === 0) {
      await setDoc(doc(db, "lists", "familie"), { name: "Familie", createdAt: serverTimestamp() }, { merge: true });
      lists.push({ id: "familie", name: "Familie" });
    }

    lists.sort((a, b) => a.name.localeCompare(b.name)); // Alphabetisch sortieren

    lists.forEach(({ id, name }) => {
      const chip = document.createElement("button");
      chip.type = "button";
      // Aktive Liste bekommt extra CSS-Klasse "active" → visuell hervorgehoben
      chip.className = "list-chip" + (id === currentListId ? " active" : "");
      chip.textContent = name;
      chip.addEventListener("click", () => {
        if (id !== currentListId) switchList(id); // Nur wenn andere Liste angeklickt
      });
      listChips.appendChild(chip);
    });
  }

  // Zu einer anderen Liste wechseln
  function switchList(listId) {
    currentListId = listId;
    localStorage.setItem("currentListId", currentListId); // Speichern
    listEl && (listEl.innerHTML = ""); // UI leeren
    renderListChips();   // Chips neu rendern (aktive Hervorhebung aktualisieren)
    initSharedList();    // Neuen Echtzeit-Listener für neue Liste starten
  }

  // Hilfsfunktion: Einen beliebigen String in eine URL-sichere ID umwandeln
  // Beispiel: "Meine Einkaufsliste!" → "meine-einkaufsliste"
  function slugify(name) {
    return (
      name
        .toLowerCase()
        .normalize("NFD")                      // Unicode-Normalisierung (ä → a + combining ̈)
        .replace(/[\u0300-\u036f]/g, "")       // Combining-Zeichen entfernen (die Umlaute-Punkte)
        .replace(/[^a-z0-9]+/g, "-")           // Alles außer a-z und 0-9 → Bindestrich
        .replace(/(^-|-$)+/g, "")              // Führende/nachfolgende Bindestriche entfernen
        .slice(0, 50) || "liste"               // Max. 50 Zeichen, Fallback "liste"
    );
  }


  // ── ECHTZEIT-LISTENER FÜR AKTIVE LISTE ────────────────────
  function initSharedList() {
    // Alten Listener stoppen bevor ein neuer gestartet wird
    if (typeof unsubscribeItems === "function") {
      unsubscribeItems();
      unsubscribeItems = null;
    }

    // Referenz aufbauen: lists/{currentListId}/items
    const listDocRef = doc(collection(db, "lists"), currentListId);
    currentItemsRef  = collection(listDocRef, "items");

    // Query: Artikel nach dem "order"-Feld sortieren (für Drag & Drop-Reihenfolge)
    const q = query(currentItemsRef, orderBy("order"));

    // Zuletzt genutzte Kategorie/Laden im Formular vorauswählen
    if (lastCategory) categorySelect && (categorySelect.value = lastCategory);
    if (lastStore)    storeSelect && (storeSelect.value = lastStore);

    // onSnapshot = Echtzeit-Listener.
    // Die Callback-Funktion wird aufgerufen:
    //   - sofort beim Start (mit den aktuellen Daten)
    //   - jedes Mal wenn sich etwas in Firestore ändert
    // unsubscribeItems = die Funktion zum Beenden des Listeners
    unsubscribeItems = onSnapshot(q, (snapshot) => {
      // snapshot.docs = alle Dokumente als Array
      // Wir wandeln sie in einfache JS-Objekte um: { id, text, category, store, checked, order, ... }
      items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderItems(currentItemsRef); // UI neu aufbauen
    });
  }


  // ── ARTIKEL HINZUFÜGEN ─────────────────────────────────────
  form?.addEventListener("submit", async (e) => {
    e.preventDefault(); // Kein Seiten-Reload
    if (!currentItemsRef) return; // Sicherheitscheck

    const text = (input?.value || "").trim();
    const category = categorySelect?.value || "";
    const store = storeSelect?.value || "";
    if (!text || !category || !store) return; // Alle Felder müssen ausgefüllt sein

    // order-Wert: Timestamp + Zufallsanteil.
    // Der Zufallsanteil verhindert Konflikte, wenn zwei User gleichzeitig etwas hinzufügen.
    const order = Date.now() + Math.random();

    // addDoc: Neues Dokument mit auto-generierter ID in der items-Collection anlegen
    await addDoc(currentItemsRef, {
      text,
      category,
      store,
      checked: false,       // Artikel ist noch nicht abgehakt
      timestamp: Date.now(),
      order,
    });

    // Letzte Auswahl speichern (localStorage + lokale Variable)
    localStorage.setItem("lastCategory", category);
    localStorage.setItem("lastStore", store);
    lastCategory = category;
    lastStore = store;

    input.value = ""; // Eingabefeld leeren
    input.focus();    // Fokus zurück ins Eingabefeld für schnelle Mehrfach-Eingabe
  });

  // ── ALLE ARTIKEL LÖSCHEN ───────────────────────────────────
  clearBtn?.addEventListener("click", async () => {
    if (!currentItemsRef) return;
    if (!confirm("Wirklich alle Einträge dieser Liste löschen?")) return;

    const snap = await getDocs(currentItemsRef);
    // Promise.all: Alle Lösch-Operationen PARALLEL starten (schneller als nacheinander)
    const deletions = snap.docs.map(d => deleteDoc(doc(currentItemsRef, d.id)));
    await Promise.all(deletions);
    // onSnapshot feuert danach automatisch → Liste wird leer gerendert
  });


  // ── RENDERING ──────────────────────────────────────────────
  // Baut die komplette Artikel-Liste im HTML neu auf.
  // Wird jedes Mal aufgerufen, wenn onSnapshot neue Daten liefert.
  function renderItems(itemsRef) {
    listEl.innerHTML = ""; // Alten Inhalt komplett löschen

    // Artikel nach Laden → Kategorie gruppieren.
    // Ergebnis: { "Lidl": { "Getränke": [item1, item2], "Snacks": [item3] }, "Aldi": { ... } }
    const grouped = {};
    for (const it of items) {
      grouped[it.store] ??= {};              // Laden anlegen falls noch nicht vorhanden
      grouped[it.store][it.category] ??= []; // Kategorie anlegen falls noch nicht vorhanden
      grouped[it.store][it.category].push(it);
    }

    // Für jeden Laden eine Sektion mit Header + Kategorien erzeugen
    Object.keys(grouped).forEach((store) => {
      // Container für Laden-Header und Löschen-Button (nebeneinander mit Flexbox)
      const headerWrap = document.createElement("div");
      headerWrap.style.display = "flex";
      headerWrap.style.alignItems = "center";
      headerWrap.style.gap = "10px";

      const storeHeader = document.createElement("h2");
      storeHeader.textContent = "🏬 " + store;
      storeHeader.style.margin = "1rem 0";

      // Button zum Löschen aller Artikel eines bestimmten Ladens
      const deleteStoreBtn = document.createElement("button");
      deleteStoreBtn.className = "icon-btn danger";
      deleteStoreBtn.title = `"${store}" löschen`;
      const img = document.createElement("img");
      img.src = "https://img.icons8.com/ios-filled/24/ffffff/trash.png";
      img.alt = "Ladenliste löschen";
      deleteStoreBtn.appendChild(img);

      deleteStoreBtn.addEventListener("click", async () => {
        if (!confirm(`Alle Produkte aus "${store}" wirklich löschen?`)) return;
        const toDelete = items.filter((it) => it.store === store);
        const ops = toDelete.map(it => deleteDoc(doc(itemsRef, it.id)));
        await Promise.all(ops); // Alle parallel löschen
      });

      headerWrap.appendChild(storeHeader);
      headerWrap.appendChild(deleteStoreBtn);
      listEl.appendChild(headerWrap);

      // Für jede Kategorie innerhalb des Ladens einen Unterabschnitt erzeugen
      const categories = grouped[store];
      Object.keys(categories).forEach((category) => {
        const categoryHeader = document.createElement("h3");
        categoryHeader.textContent = getCategoryEmoji(category) + " " + category;
        listEl.appendChild(categoryHeader);

        const ul = document.createElement("ul");

        // Jeden Artikel als <li> rendern
        categories[category].forEach((item) => {
          const li = document.createElement("li");
          if (item.checked) li.classList.add("checked"); // Abgehakte Artikel visuell markieren

          // ── DRAG & DROP ────────────────────────────────────
          li.setAttribute("draggable", "true"); // HTML5 Drag & Drop aktivieren
          li.dataset.itemId = item.id;          // ID als data-Attribut speichern

          li.addEventListener("dragstart", (e) => {
            // Beim Start des Ziehens: ID des gezogenen Elements speichern.
            // dataTransfer ist die „Zwischenablage" für Drag & Drop.
            e.dataTransfer.setData("text/plain", item.id);
          });

          li.addEventListener("dragover", (e) => {
            e.preventDefault(); // WICHTIG: Nur so wird drop erlaubt (Browser-Default verbietet es)
            li.classList.add("drag-over"); // Visuelles Feedback: Ziel-Element hervorheben
          });

          li.addEventListener("dragleave", () => {
            li.classList.remove("drag-over"); // Hervorhebung entfernen wenn Maus weggeht
          });

          li.addEventListener("drop", async (e) => {
            e.preventDefault();
            li.classList.remove("drag-over");

            const draggedId = e.dataTransfer.getData("text/plain"); // ID des gezogenen Elements
            const arr = categories[category]; // Lokales Array der Kategorie

            const draggedIndex = arr.findIndex(i => i.id === draggedId);
            const targetIndex  = arr.findIndex(i => i.id === item.id);
            if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return;

            // Array neu ordnen: gezogenes Element aus altem Index entfernen, an neuem einfügen
            const moved = arr.splice(draggedIndex, 1)[0]; // splice: Element entfernen und zurückgeben
            arr.splice(targetIndex, 0, moved);            // An neuer Position einfügen

            // Neue Reihenfolge in Firestore speichern: jedem Element seinen Index als "order" geben
            try {
              await Promise.all(arr.map((itm, idx) => updateDoc(doc(itemsRef, itm.id), { order: idx })));
            } catch (err) {
              console.error("Reihenfolge-Update fehlgeschlagen:", err);
            }
          });

          // Artikel-Text → Klick zum Abhaken
          const span = document.createElement("span");
          span.textContent = item.text;
          span.addEventListener("click", async () => {
            // checked-Status umkehren (Toggle)
            await updateDoc(doc(itemsRef, item.id), { checked: !item.checked });
            // onSnapshot bemerkt die Änderung und rendert automatisch neu
          });

          // Löschen-Button für einzelnen Artikel
          const delBtn = document.createElement("button");
          delBtn.textContent = "❌";
          delBtn.addEventListener("click", async (e) => {
            e.stopPropagation(); // Verhindert, dass der Klick auf den Span weitergeleitet wird
            const deletedItem = { ...item }; // Kopie des Items für die Undo-Funktion
            await deleteDoc(doc(itemsRef, item.id));
            showUndoSnackbar(deletedItem, itemsRef); // Undo-Möglichkeit anzeigen
          });

          li.appendChild(span);
          li.appendChild(delBtn);
          ul.appendChild(li);
        });

        listEl.appendChild(ul);
      });
    });
  }

  // ── UNDO-SNACKBAR ──────────────────────────────────────────
  // Zeigt eine kurze Benachrichtigung nach dem Löschen mit "Rückgängig"-Button.
  // Verschwindet nach 4 Sekunden automatisch.
  function showUndoSnackbar(deletedItem, itemsRef) {
    // Snackbar-Element holen oder neu erstellen (lazy creation)
    let bar = document.getElementById("snackbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "snackbar";
      document.body.appendChild(bar);
    }

    // innerHTML mit escapeHtml absichern (verhindert XSS wenn der Artikelname HTML enthält)
    bar.innerHTML = `
      🗑️ "${escapeHtml(deletedItem.text)}" gelöscht.
      <button id="undoBtn">Rückgängig</button>
    `;
    bar.className = "show"; // CSS-Klasse "show" blendet die Snackbar ein

    const undoBtn = document.getElementById("undoBtn");
    undoBtn?.addEventListener("click", async () => {
      // Gelöschten Artikel mit denselben Daten wieder hinzufügen
      await addDoc(itemsRef, {
        text: deletedItem.text,
        category: deletedItem.category,
        store: deletedItem.store,
        checked: deletedItem.checked,
        timestamp: deletedItem.timestamp || Date.now(),
        order: typeof deletedItem.order === "number" ? deletedItem.order : Date.now(),
      });
      bar.className = bar.className.replace("show", ""); // Snackbar verstecken
    });

    // Nach 4 Sekunden automatisch ausblenden
    setTimeout(() => {
      bar.className = bar.className.replace("show", "");
    }, 4000);
  }

  // ── XSS-SCHUTZ ────────────────────────────────────────────
  // XSS = Cross-Site Scripting: Angreifer schleust HTML/JS über Benutzereingaben ein.
  // Diese Funktion ersetzt gefährliche HTML-Sonderzeichen durch harmlose Entities.
  // Beispiel: "<script>" wird zu "&lt;script&gt;" und wird nicht als HTML interpretiert.
  function escapeHtml(s = "") {
    return s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

}); // ← Ende von DOMContentLoaded


// ── HILFSFUNKTION: LISTE TIEF LÖSCHEN ─────────────────────
// Diese Funktion ist AUSSERHALB von DOMContentLoaded, weil sie keine DOM-Elemente braucht.
// Sie löscht zuerst alle Artikel einer Liste, dann das Listen-Dokument selbst.
//
// Warum "tief löschen"? Firestore löscht Sub-Collections NICHT automatisch mit!
// Wenn man nur das Listen-Dokument löscht, bleiben alle items-Dokumente unsichtbar
// aber trotzdem in der DB – das kostet Speicher und Geld.
async function deleteListDeep(db, listId) {
  const itemsRef = collection(doc(db, "lists", listId), "items");
  const itemsSnap = await getDocs(itemsRef);                          // Alle Artikel lesen
  const deletions = itemsSnap.docs.map(d => deleteDoc(doc(itemsRef, d.id))); // Lösch-Promises
  await Promise.all(deletions);               // Alle Artikel parallel löschen
  await deleteDoc(doc(db, "lists", listId)); // Dann das Listen-Dokument selbst löschen
}
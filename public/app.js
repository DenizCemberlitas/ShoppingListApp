// app.js  (ESM)
// --- Firebase v10 modular ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  orderBy,
  query,
  onSnapshot,
  getDocs,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

console.log("✅ app.js geladen");

document.addEventListener("DOMContentLoaded", () => {
  /* -------------------- Firebase -------------------- */
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();

  /* -------------------- DOM -------------------- */
  const loginBtn       = document.getElementById("loginBtn");
  const logoutBtn      = document.getElementById("logoutBtn");
  const userInfo       = document.getElementById("userInfo");

  const form           = document.getElementById("itemForm");
  const input          = document.getElementById("itemInput");
  const categorySelect = document.getElementById("itemCategory");
  const storeSelect    = document.getElementById("itemStore");
  const listEl         = document.getElementById("itemList");
  const clearBtn       = document.getElementById("clearAllBtn");

  const toggleSidebar  = document.getElementById("toggleSidebar");
  const sidebar        = document.getElementById("sidebar");
  const closeSidebar   = document.getElementById("closeSidebar");

  const themeToggle    = document.getElementById("themeToggle");

  const listChips      = document.getElementById("listChips");
  const newListForm    = document.getElementById("newListForm");
  const newListNameInp = document.getElementById("newListName");
  const deleteListBtn  = document.getElementById("deleteListBtn");

  /* -------------------- App State -------------------- */
  let items = [];
  let unsubscribeItems = null;
  let currentItemsRef = null;              // <- zentrale Referenz auf die aktive Items-Subcollection
  let currentListId = localStorage.getItem("currentListId") || "familie";

  // Auswahl merken
  let lastCategory = localStorage.getItem("lastCategory") || "";
  let lastStore    = localStorage.getItem("lastStore") || "";

  /* -------------------- Theme -------------------- */
  const savedTheme = localStorage.getItem("theme") || "dark";
  applyTheme(savedTheme);

  themeToggle?.addEventListener("click", () => {
    const next = document.body.classList.contains("light") ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem("theme", next);
  });

  function applyTheme(mode) {
    if (mode === "light") {
      document.body.classList.add("light");
      themeToggle && (themeToggle.textContent = "☀️ Light");
    } else {
      document.body.classList.remove("light");
      themeToggle && (themeToggle.textContent = "🌙 Dark");
    }
  }

  /* -------------------- Sidebar -------------------- */
  toggleSidebar.addEventListener("click", () => {
  console.log("toggleSidebar clicked");
  sidebar.classList.toggle("open");
  document.body.classList.toggle("sidebar-open", sidebar.classList.contains("open"));
});

closeSidebar.addEventListener("click", () => {
  console.log("closeSidebar clicked");
  sidebar.classList.remove("open");
  document.body.classList.remove("sidebar-open");
});

  /* -------------------- Auth -------------------- */
  loginBtn?.addEventListener("click", async () => {
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login fehlgeschlagen:", err);
      alert("Login fehlgeschlagen: " + (err?.message || ""));
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      await signOut(auth);
      listEl && (listEl.innerHTML = "");
    } catch (err) {
      console.error("Logout-Fehler:", err);
    }
  });

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      loginBtn && (loginBtn.style.display = "none");
      logoutBtn && (logoutBtn.style.display = "inline-block");
      userInfo && (userInfo.textContent = `👤 Eingeloggt als: ${user.displayName || user.email}`);
      input && input.focus();

      await renderListChips();   // Listenauswahl aufbauen
      initSharedList();          // aktive Liste verbinden
    } else {
      loginBtn && (loginBtn.style.display = "inline-block");
      logoutBtn && (logoutBtn.style.display = "none");
      userInfo && (userInfo.textContent = "");
      listEl && (listEl.innerHTML = "");

      // Abo lösen
      if (typeof unsubscribeItems === "function") {
        unsubscribeItems();
        unsubscribeItems = null;
      }
    }
  });

  /* -------------------- Listen (Chips / CRUD) -------------------- */
  newListForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = (newListNameInp?.value || "").trim();
    if (!raw) return;

    const id = slugify(raw);
    try {
      await setDoc(doc(db, "lists", id), { name: raw, createdAt: serverTimestamp() }, { merge: true });
      newListNameInp.value = "";
      switchList(id);
    } catch (err) {
      console.error("Neue Liste fehlgeschlagen:", err);
      alert("Konnte Liste nicht anlegen: " + (err?.message || err));
    }
  });

 deleteListBtn?.addEventListener("click", async () => {
  // Doppelklicks blocken
  if (deleteListBtn.dataset.busy === "1") return;
  deleteListBtn.dataset.busy = "1";
  deleteListBtn.disabled = true;

  try {
    const snap = await getDoc(doc(db, "lists", currentListId));
    const name = snap.exists() ? (snap.data()?.name || currentListId) : currentListId;

    if (!confirm(`„${name}“ und alle enthaltenen Einträge wirklich löschen?`)) return;

    // 1) Kandidaten für die nächste Liste bestimmen (ohne die aktuelle)
    const allBefore = await getDocs(collection(db, "lists"));
    const remaining = allBefore.docs.map(d => d.id).filter(id => id !== currentListId);

    // 2) Aktuelles Abo lösen & UI entkoppeln
    if (typeof unsubscribeItems === "function") {
      unsubscribeItems();
      unsubscribeItems = null;
    }
    currentItemsRef = null;
    listEl && (listEl.innerHTML = "");

    // 3) Tief löschen
    await deleteListDeep(db, currentListId);

    // 4) Chips neu aufbauen (gelöschte Liste verschwindet visuell)
    await renderListChips();

    // 5) Nächste Liste festlegen (oder Default anlegen)
    let nextId = remaining[0];
    if (!nextId) {
      await setDoc(doc(db, "lists", "familie"), { name: "Familie", createdAt: serverTimestamp() }, { merge: true });
      nextId = "familie";
    }

    // 6) Umschalten & erst dann wieder initialisieren
    currentListId = nextId;
    localStorage.setItem("currentListId", currentListId);
    initSharedList();

  } catch (err) {
    console.error("Liste löschen fehlgeschlagen:", err);
    alert("Konnte die Liste nicht löschen: " + (err?.message || err));
  } finally {
    deleteListBtn.dataset.busy = "0";
    deleteListBtn.disabled = false;
  }
});



  async function renderListChips() {
    if (!listChips) return;
    listChips.innerHTML = "";

    const snap = await getDocs(collection(db, "lists"));
    const lists = [];
    snap.forEach(d => lists.push({ id: d.id, name: d.data()?.name || d.id }));

    if (lists.length === 0) {
      await setDoc(doc(db, "lists", "familie"), { name: "Familie", createdAt: serverTimestamp() }, { merge: true });
      lists.push({ id: "familie", name: "Familie" });
    }

    lists.sort((a, b) => a.name.localeCompare(b.name));

    lists.forEach(({ id, name }) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "list-chip" + (id === currentListId ? " active" : "");
      chip.textContent = name;
      chip.addEventListener("click", () => {
        if (id !== currentListId) switchList(id);
      });
      listChips.appendChild(chip);
    });
  }

  function switchList(listId) {
    currentListId = listId;
    localStorage.setItem("currentListId", currentListId);

    // UI reset
    listEl && (listEl.innerHTML = "");

    // Chips aktualisieren
    renderListChips();

    // aktive Liste neu verbinden
    initSharedList();
  }

  function slugify(name) {
    return (
      name
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "")
        .slice(0, 50) || "liste"
    );
  }

  async function ensureListDoc(listId, displayName) {
    const ref = doc(db, "lists", listId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { name: displayName || listId, createdAt: serverTimestamp() }, { merge: true });
    }
  }

  /* -------------------- Aktive Liste verbinden -------------------- */
  function initSharedList() {
    // altes Snapshot-Abo lösen
    if (typeof unsubscribeItems === "function") {
      unsubscribeItems();
      unsubscribeItems = null;
    }

    const listDocRef = doc(collection(db, "lists"), currentListId);
    currentItemsRef  = collection(listDocRef, "items");
    const q = query(currentItemsRef, orderBy("order"));

    

    // letzte Auswahl wiederherstellen
    if (lastCategory) categorySelect && (categorySelect.value = lastCategory);
    if (lastStore)    storeSelect && (storeSelect.value = lastStore);

    // Live-Abo der Items
    unsubscribeItems = onSnapshot(q, (snapshot) => {
      items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderItems(currentItemsRef);
    });
  }

  /* -------------------- EINMAL: Submit & Clear (verwenden currentItemsRef) -------------------- */
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentItemsRef) return;

    const text = (input?.value || "").trim();
    const category = categorySelect?.value || "";
    const store = storeSelect?.value || "";
    if (!text || !category || !store) return;

    await addDoc(currentItemsRef, {
      text,
      category,
      store,
      checked: false,
      timestamp: Date.now(),
      order: Date.now(),
    });

    localStorage.setItem("lastCategory", category);
    localStorage.setItem("lastStore", store);
    lastCategory = category;
    lastStore = store;

    input.value = "";
    input.focus();
  });

  clearBtn?.addEventListener("click", async () => {
    if (!currentItemsRef) return;
    if (!confirm("Wirklich alle Einträge dieser Liste löschen?")) return;

    const snap = await getDocs(currentItemsRef);
    const deletions = snap.docs.map(d => deleteDoc(doc(currentItemsRef, d.id)));
    await Promise.all(deletions);
  });

  /* -------------------- Rendering -------------------- */
  function renderItems(itemsRef) {
    listEl.innerHTML = "";

    // Gruppieren nach Store -> Category
    const grouped = {};
    for (const it of items) {
      grouped[it.store] ??= {};
      grouped[it.store][it.category] ??= [];
      grouped[it.store][it.category].push(it);
    }

    Object.keys(grouped).forEach((store) => {
      // Store Header
      const headerWrap = document.createElement("div");
      headerWrap.style.display = "flex";
      headerWrap.style.alignItems = "center";
      headerWrap.style.gap = "10px";

      const storeHeader = document.createElement("h2");
      storeHeader.textContent = "🏬 " + store;
      storeHeader.style.margin = "1rem 0";

      // kleines Icon zum kompletten Löschen des Stores
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
        await Promise.all(ops);
      });

      headerWrap.appendChild(storeHeader);
      headerWrap.appendChild(deleteStoreBtn);
      listEl.appendChild(headerWrap);

      // Kategorien des Stores
      const categories = grouped[store];
      Object.keys(categories).forEach((category) => {
        const categoryHeader = document.createElement("h3");
        categoryHeader.textContent = getCategoryEmoji(category) + " " + category;
        listEl.appendChild(categoryHeader);

        const ul = document.createElement("ul");

        categories[category].forEach((item) => {
          const li = document.createElement("li");
          if (item.checked) li.classList.add("checked");

          // Drag & Drop
          li.setAttribute("draggable", "true");
          li.dataset.itemId = item.id;

          li.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", item.id);
          });
          li.addEventListener("dragover", (e) => {
            e.preventDefault();
            li.classList.add("drag-over");
          });
          li.addEventListener("dragleave", () => {
            li.classList.remove("drag-over");
          });
          li.addEventListener("drop", async (e) => {
            e.preventDefault();
            li.classList.remove("drag-over");

            const draggedId = e.dataTransfer.getData("text/plain");
            const arr = categories[category];
            const draggedIndex = arr.findIndex(i => i.id === draggedId);
            const targetIndex  = arr.findIndex(i => i.id === item.id);
            if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return;

            const moved = arr.splice(draggedIndex, 1)[0];
            arr.splice(targetIndex, 0, moved);

            try {
              await Promise.all(arr.map((itm, idx) => updateDoc(doc(itemsRef, itm.id), { order: idx })));
            } catch (err) {
              console.error("Reihenfolge-Update fehlgeschlagen:", err);
            }
          });

          // Toggle checked
          const span = document.createElement("span");
          span.textContent = item.text;
          span.addEventListener("click", async () => {
            await updateDoc(doc(itemsRef, item.id), { checked: !item.checked });
          });

          // Delete + Undo
          const delBtn = document.createElement("button");
          delBtn.textContent = "❌";
          delBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const deletedItem = { ...item };
            await deleteDoc(doc(itemsRef, item.id));
            showUndoSnackbar(deletedItem, itemsRef);
          });

          li.appendChild(span);
          li.appendChild(delBtn);
          ul.appendChild(li);
        });

        listEl.appendChild(ul);
      });
    });
  }

  function showUndoSnackbar(deletedItem, itemsRef) {
    let bar = document.getElementById("snackbar");
    if (!bar) {
      // Fallback: Snackbar dynamisch anlegen, falls nicht im HTML vorhanden
      bar = document.createElement("div");
      bar.id = "snackbar";
      document.body.appendChild(bar);
    }

    bar.innerHTML = `
      🗑️ "${escapeHtml(deletedItem.text)}" gelöscht.
      <button id="undoBtn">Rückgängig</button>
    `;
    bar.className = "show";

    const undoBtn = document.getElementById("undoBtn");
    undoBtn?.addEventListener("click", async () => {
      await addDoc(itemsRef, {
        text: deletedItem.text,
        category: deletedItem.category,
        store: deletedItem.store,
        checked: deletedItem.checked,
        timestamp: deletedItem.timestamp || Date.now(),
        order: typeof deletedItem.order === "number" ? deletedItem.order : Date.now(),
      });
      bar.className = bar.className.replace("show", "");
    });

    setTimeout(() => {
      bar.className = bar.className.replace("show", "");
    }, 4000);
  }

  function escapeHtml(s = "") {
    return s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function getCategoryEmoji(category) {
    switch (category) {
      case "Getränke": return "🥤";
      case "Bier": return "🍺";
      case "Snacks": return "🥨";
      case "Tiefkühl": return "🧊";
      case "Tabakwaren": return "🚬";
      case "Tabak Zubehör": return "🚬";
      case "Spirituosen": return "🍾";
      case "Sonstiges": return "🧺";
      default: return "🛒";
    }
  }
}); // DOMContentLoaded Ende

/* -------------------- Hilfsfunktion: Liste tief löschen -------------------- */
// keine Abhängigkeiten aus dem oberen Scope; db wird übergeben
async function deleteListDeep(db, listId) {
  const itemsRef = collection(doc(db, "lists", listId), "items");
  const itemsSnap = await getDocs(itemsRef);
  const deletions = itemsSnap.docs.map(d => deleteDoc(doc(itemsRef, d.id)));
  await Promise.all(deletions);
  await deleteDoc(doc(db, "lists", listId));
}

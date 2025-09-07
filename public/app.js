// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
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
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

document.addEventListener("DOMContentLoaded", () => {
  // ---- UI-Elemente holen
  const loginBtn = document.getElementById("loginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const userInfo = document.getElementById("userInfo");
  const form = document.getElementById("itemForm");
  const input = document.getElementById("itemInput");
  const categorySelect = document.getElementById("itemCategory");
  const storeSelect = document.getElementById("itemStore");
  const list = document.getElementById("itemList");
  const clearBtn = document.getElementById("clearAllBtn");
  const toggleSidebar = document.getElementById("toggleSidebar");
  const sidebar = document.getElementById("sidebar");
  const closeSidebar = document.getElementById("closeSidebar");

  // Defensive: Falls ein Element fehlt, loggen (damit Sidebar sicher funktioniert)
  if (!toggleSidebar || !sidebar || !closeSidebar) {
    console.warn("Sidebar-Elemente nicht gefunden:", {
      toggleSidebar: !!toggleSidebar,
      sidebar: !!sidebar,
      closeSidebar: !!closeSidebar
    });
  }

  // ---- Sidebar öffnen/schließen
  if (toggleSidebar) {
    toggleSidebar.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
  }
  if (closeSidebar) {
    closeSidebar.addEventListener("click", () => {
      sidebar.classList.remove("open");
    });
  }

  // ---- Firebase init
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();

  let items = [];
  let initialized = false;

  // ---- Auth / UI
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await signOut(auth);
        list.innerHTML = "";
      } catch (error) {
        console.error("Fehler beim Logout:", error);
      }
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithPopup(auth, provider);
      } catch (err) {
        console.error("Login fehlgeschlagen:", err);
        alert("Login fehlgeschlagen: " + err.message);
      }
    });
  }

  onAuthStateChanged(auth, (user) => {
    if (user) {
      if (loginBtn) loginBtn.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "inline-block";
      if (userInfo) userInfo.textContent = `👤 Eingeloggt als: ${user.displayName || user.email}`;
      initSharedList();
    } else {
      if (loginBtn) loginBtn.style.display = "inline-block";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (userInfo) userInfo.textContent = "";
      if (list) list.innerHTML = "";
    }
  });

  // ---- Firestore Liste
  function initSharedList() {
    if (initialized) return;
    initialized = true;

    const listRef = collection(doc(collection(db, "lists"), "familie"), "items");
    const q = query(listRef, orderBy("order"));

    // 🔹 Letzte Auswahl laden (aus localStorage)
    let lastCategory = localStorage.getItem("lastCategory") || "";
    let lastStore = localStorage.getItem("lastStore") || "";

    if (lastCategory) categorySelect.value = lastCategory;
    if (lastStore) storeSelect.value = lastStore;


    onSnapshot(q, (snapshot) => {
      items = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...docSnap.data(), id: docSnap.id });
      });
      renderItems(listRef);
    });

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        const category = categorySelect.value;
        const store = storeSelect.value;
        if (!text || !category || !store) return;

        // 🔹 Item in Firestore speichern
        await addDoc(listRef, {
          text,
          category,
          store,
          checked: false,
          timestamp: Date.now(),
          order: Date.now()
        });

        // 🔹 Letzte Auswahl merken
        localStorage.setItem("lastCategory", category);
        localStorage.setItem("lastStore", store);

        // 🔹 Nur Textfeld zurücksetzen & Cursor wieder rein
        input.value = "";
        input.focus();
      });

    }

    if (clearBtn) {
      clearBtn.addEventListener("click", async () => {
        if (confirm("Wirklich alles löschen?")) {
          for (let item of items) {
            await deleteDoc(doc(listRef, item.id));
          }
        }
      });
    }
  }

  function renderItems(listRef) {
    list.innerHTML = "";

    // nach Store und Kategorie gruppieren
    const grouped = {};
    items.forEach((item) => {
      if (!grouped[item.store]) grouped[item.store] = {};
      if (!grouped[item.store][item.category]) grouped[item.store][item.category] = [];
      grouped[item.store][item.category].push(item);
    });

    Object.keys(grouped).forEach((store) => {
      const storeHeader = document.createElement("h2");
      storeHeader.textContent = "🏬 " + store;

      // gesamten Store löschen
      const deleteStoreBtn = document.createElement("button");
      deleteStoreBtn.textContent = "🗑️ Ladenliste löschen";
      deleteStoreBtn.style.marginLeft = "1rem";
      deleteStoreBtn.addEventListener("click", async () => {
        if (confirm(`Alle Produkte aus "${store}" wirklich löschen?`)) {
          const toDelete = items.filter((item) => item.store === store);
          for (let item of toDelete) {
            await deleteDoc(doc(listRef, item.id));
          }
        }
      });

      const storeHeaderWrapper = document.createElement("div");
      storeHeaderWrapper.style.display = "flex";
      storeHeaderWrapper.style.alignItems = "center";
      storeHeaderWrapper.appendChild(storeHeader);
      storeHeaderWrapper.appendChild(deleteStoreBtn);
      list.appendChild(storeHeaderWrapper);

      // Kategorien
      const categories = grouped[store];
      Object.keys(categories).forEach((category) => {
        const categoryHeader = document.createElement("h3");
        categoryHeader.textContent = getCategoryEmoji(category) + " " + category;
        list.appendChild(categoryHeader);

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
            const draggedIndex = categories[category].findIndex((i) => i.id === draggedId);
            const targetIndex = categories[category].findIndex((i) => i.id === item.id);

            if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return;

            // neu anordnen
            const movedItem = categories[category].splice(draggedIndex, 1)[0];
            categories[category].splice(targetIndex, 0, movedItem);

            // Reihenfolge speichern
            const updates = categories[category].map((itm, idx) =>
              updateDoc(doc(listRef, itm.id), { order: idx })
            );
            try {
              await Promise.all(updates);
            } catch (error) {
              console.error("Fehler beim Aktualisieren der Reihenfolge:", error);
            }
          });

          // Klick zum Abhaken
          const span = document.createElement("span");
          span.textContent = item.text;
          span.addEventListener("click", async () => {
            await updateDoc(doc(listRef, item.id), { checked: !item.checked });
          });

          // Löschen-Button
          const deleteBtn = document.createElement("button");
          deleteBtn.textContent = "❌";
          deleteBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await deleteDoc(doc(listRef, item.id));
          });

          li.appendChild(span);
          li.appendChild(deleteBtn);
          ul.appendChild(li);
        });

        list.appendChild(ul);
      });
    });
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
});

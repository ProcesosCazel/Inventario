/*
Proyecto: Sistema de Inventario EOAT
Autor:
  Ing. José Antonio Guzmán Trujillo
  Becario de Procesos | Industrias Cazel
  tecnicosprocesos@cazel.mx
  2026
*/

"use strict";

/* =================================================
   REFERENCIAS DEL DOM (UI ELEMENTS)
   ================================================= */

/* Buscador */

const searchInput = document.getElementById("eoat-search");
const resultsTable = document.getElementById("results-table");
const resultsCounter = document.getElementById("results-counter");
const resultsTableBody = document.querySelector("#results-table tbody");
const printBtn = document.getElementById("print-btn");

/* Popup */

const detailsPopup = document.getElementById("details-popup");
const popupContent = document.getElementById("popup-content");
const closePopupBtn = document.getElementById("close-popup-btn");

/* Pantallas */

const screens = document.querySelectorAll(".screen");

const searchScreenBtn = document.getElementById("search-screen-btn");
const mapScreenBtn = document.getElementById("map-screen-btn");
const inboxScreenBtn = document.getElementById("inbox-screen-btn");
const helpScreenBtn = document.getElementById("help-screen-btn");
const navButtons = document.querySelectorAll(".navbar .btn");

/* Buzon */

const inboxForm = document.getElementById("inbox-form");
const tipoSelect = document.getElementById("tipo");
const eoatInput = document.getElementById("eoat-numero");
const mensajeInput = document.getElementById("mensaje");

/* =================================================
   SISTEMA DE SFX
   ================================================= */

const errorSound = new Audio("./assets/SFX/error.mp3");
const popupSound = new Audio("./assets/SFX/popup.mp3");

function playErrorSound() {
  errorSound.currentTime = 0;
  errorSound.play().catch(() => {});
}

function playPopupSound() {
  popupSound.currentTime = 0;
  popupSound.play().catch(() => {});
}

function vibrate(ms) {
  if (navigator.vibrate) {
    navigator.vibrate(ms);
  }
}

/* =================================================
   VARIABLES GLOBALES
   ================================================= */

// Base de datos

let eoatDatabase = [];

/* =================================================
   CARGAR BASE DE DATOS
   ================================================= */

async function loadDatabase() {
  try {
    const response = await fetch("./data/eoat_data.json");
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    eoatDatabase = await response.json();

    console.log("EOAT cargados:", eoatDatabase.length);
  } catch (error) {
    console.error("Error cargando la base de datos:", error);
    playErrorSound();
    alert("No se pudo cargar la base de datos EOAT.");
  }
}

/* =================================================
   NAVEGACIÓN ENTRE PANTALLAS
   ================================================= */

function setActiveButton(activeId) {
  navButtons.forEach((btn) => btn.classList.remove("active"));
  document.getElementById(activeId).classList.add("active");
}

function showScreen(screenId) {
  if (!detailsPopup.classList.contains("hidden")) closePopup();

  screens.forEach((screen) => {
    screen.classList.add("hidden");
  });

  const targetScreen = document.getElementById(screenId);

  if (!targetScreen) return;

  targetScreen.classList.remove("hidden");

  window.scrollTo(0, 0);
}

/* =================================================
   BUSCADOR EOAT
   ================================================= */

function searchEOAT(query) {
  if (!eoatDatabase.length) return;
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery === "") {
    resultsTableBody.innerHTML = "";
    resultsTable.classList.add("hidden");
    resultsCounter.textContent = "";
    printBtn.disabled = true;

    return;
  }

  const results = eoatDatabase.filter((item) =>
    item.id.toLowerCase().includes(normalizedQuery),
  );

  renderResults(results);
}

/* =================================================
   RENDERIZAR RESULTADOS
   ================================================= */

function renderResults(results) {
  resultsTableBody.innerHTML = "";

  if (results.length === 0) {
    resultsCounter.textContent = "Sin resultados";
    resultsTable.classList.add("hidden");
    printBtn.disabled = true;
    return;
  }
  resultsCounter.textContent = `${results.length} resultado(s)`;

  results.forEach((eoat) => {
    const row = document.createElement("tr");
    const naveClass = `nave-${eoat.nave}`;

    row.innerHTML = `
    <td>${eoat.id}</td>
    <td class="${naveClass}">N${eoat.nave}</td>
    <td>${eoat.columna}</td>
    <td>${eoat.fila}</td>
    <td>
      <button class="info-btn">ℹ️</button>
    </td>
  `;

    const infoBtn = row.querySelector(".info-btn");

    infoBtn.addEventListener("click", () => {
      openPopup(eoat);
    });

    resultsTableBody.appendChild(row);
  });

  resultsTable.classList.remove("hidden");
  printBtn.disabled = false;
}

/* =================================================
   POPUP DETALLES EOAT
   ================================================= */

function openPopup(eoat) {
  const imageFile = eoat.imagen ? eoat.imagen : "no-image.svg";
  const imagePath = `./assets/EOAT/${imageFile}`;
  const naveMap = {
    1: { colorClass: "nave-1" },
    2: { colorClass: "nave-2" },
    3: { colorClass: "nave-3" },
  };

  const naveData = naveMap[eoat.nave] || {
    colorClass: "",
  };

  popupContent.innerHTML = `
    
    <h3>${eoat.id}</h3>

    <img 
      src="${imagePath}" 
      alt="Foto EOAT ${eoat.id}" 
      class="eoat-image"
      loading="lazy"
      onerror="this.src='./assets/EOAT/no-image.svg'"
    >

    <p><strong>Nave:</strong>
    <span class="${naveData.colorClass} no-bg">
    N${eoat.nave}
    </span>
    </p>
    <p><strong>Columna:</strong> ${eoat.columna}</p>
    <p><strong>Fila:</strong> ${eoat.fila}</p>
    <p><strong>Estado:</strong> ${eoat.estado || "No especificado"}</p>

  `;

  detailsPopup.classList.remove("hidden");
  playPopupSound();
}

function closePopup() {
  if (!detailsPopup.classList.contains("hidden")) {
    detailsPopup.classList.add("hidden");
    playPopupSound();
  }
}

/* =================================================
   BUZON
   ================================================= */

if (inboxForm) {
  inboxForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const tipo = tipoSelect.value;
    const eoat = eoatInput.value.trim();
    const mensaje = mensajeInput.value.trim();

    if (!mensaje) {
      playErrorSound();
      alert("Por favor escribe un mensaje.");
      return;
    }

    let body = `Tipo de mensaje: ${tipo}\n`;

    if (eoat !== "") {
      body += `EOAT: ${eoat}\n`;
    }

    body += `\nMensaje:\n${mensaje}`;

    const fecha = new Date().toLocaleString("es-MX");

    body += `\n\nFecha: ${fecha}`;
    body += `\nDispositivo: ${navigator.userAgent}`;

    const subject = encodeURIComponent("Reporte Sistema EOAT");
    const emailBody = encodeURIComponent(body);

    const mailtoLink = `mailto:tecnicosprocesos@cazel.mx?subject=${subject}&body=${emailBody}`;

    window.location.href = mailtoLink;
  });
}

eoatInput.addEventListener("input", () => {
  eoatInput.value = eoatInput.value.toUpperCase();
});

/* --- ESTO VA AL FINAL DEL SCRIPT --- */

/* =================================================
   EVENT LISTENERS
   ================================================= */

searchInput.addEventListener("input", (event) => {
  searchEOAT(event.target.value);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === "Search") {
    e.preventDefault();
    searchInput.blur();
  }
});

closePopupBtn.addEventListener("click", closePopup);

detailsPopup.addEventListener("click", (event) => {
  if (event.target === detailsPopup) {
    closePopup();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePopup();
  }
});

searchScreenBtn.addEventListener("click", () => {
  showScreen("search-screen");
  vibrate(100);
  setActiveButton("search-screen-btn");
});

mapScreenBtn.addEventListener("click", () => {
  showScreen("map-screen");
  vibrate(100);
  setActiveButton("map-screen-btn");
});

inboxScreenBtn.addEventListener("click", () => {
  showScreen("inbox-screen");
  vibrate(100);
  setActiveButton("inbox-screen-btn");
});

helpScreenBtn.addEventListener("click", () => {
  showScreen("help-screen");
  vibrate(100);
  setActiveButton("help-screen-btn");
});

printBtn.addEventListener("click", () => {
  closePopup();
  window.print();
});

/* =================================================
   INICIALIZACIÓN (DOM CONTENT LOADED)
   ================================================= */

document.addEventListener("DOMContentLoaded", () => {
  loadDatabase();
  errorSound.load();
  popupSound.load();
  setActiveButton("search-screen-btn");
});

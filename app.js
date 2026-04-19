// ── CONFIG — remplacer avec votre adresse de contrat déployé ────────────────
const CONTRACT_ADDRESS = "0x0015eF51ea4E54fB946159dba755310dbF75B66b";

const ABI = [
  "function certify(bytes32 docHash, string calldata metadata) external",
  "function verify(bytes32 docHash) external view returns (address issuer, uint256 timestamp, string memory metadata, bool revoked)",
  "function isValid(bytes32 docHash) external view returns (bool)"
];

// ── State ─────────────────────────────────────────────────────────────────────
let provider        = null;
let signer          = null;
let currentCertHash = null;
let currentVerHash  = null;

// ── Wallet ────────────────────────────────────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask n'est pas installé. Veuillez l'installer pour certifier des documents.");
    return;
  }
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    provider = new ethers.BrowserProvider(window.ethereum);
    signer   = await provider.getSigner();
    const addr = await signer.getAddress();

    document.getElementById("networkDot").className   = "network-dot connected";
    document.getElementById("networkLabel").textContent = "Sepolia";
    document.getElementById("walletBtn").className    = "wallet-btn connected";
    document.getElementById("walletLabel").textContent = addr.slice(0, 6) + "…" + addr.slice(-4);

    updateBlockNumber();
  } catch (e) {
    document.getElementById("networkDot").className = "network-dot error";
  }
}

async function updateBlockNumber() {
  if (!provider) return;
  try {
    const block = await provider.getBlockNumber();
    document.getElementById("statBlock").textContent = "#" + block.toLocaleString();
  } catch (e) {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(b) {
  if (b < 1024)    return b + " o";
  if (b < 1048576) return (b / 1024).toFixed(1) + " Ko";
  return (b / 1048576).toFixed(1) + " Mo";
}

async function hashFile(file) {
  const buf = await file.arrayBuffer();
  return ethers.keccak256(new Uint8Array(buf));
}

async function getReadContract() {
  if (!provider) {
    if (!window.ethereum) throw new Error("MetaMask non détecté");
    provider = new ethers.BrowserProvider(window.ethereum);
  }
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
}

async function getWriteContract() {
  if (!signer) await connectWallet();
  if (!signer) throw new Error("Wallet non connecté");
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
}

function showResult(elId, type, title, rows) {
  const el = document.getElementById(elId);

  const icons = {
    success: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    warning: `<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    loading: `<div class="spinner"></div>`
  };

  let rowsHtml = "";
  if (rows) {
    rowsHtml = '<div class="result-grid" style="margin-top:0.75rem">';
    for (const [k, v, mono] of rows) {
      rowsHtml += `<div class="result-key">${k}</div><div class="result-val ${mono === false ? "normal" : ""}">${v}</div>`;
    }
    rowsHtml += "</div>";
  }

  el.className = `result-panel show ${type}`;
  el.innerHTML = `
    <div class="result-header">
      <div class="result-icon">${icons[type]}</div>
      <div class="result-title">${title}</div>
    </div>
    ${rowsHtml}
  `;
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  btn.classList.add("active");
}

// ── Certify flow ──────────────────────────────────────────────────────────────
async function onCertFileSelected(input) {
  const file = input.files[0];
  if (!file) return;

  document.getElementById("certFileName").textContent = file.name;
  document.getElementById("certFileSize").textContent = formatBytes(file.size);
  document.getElementById("certFileInfo").classList.add("show");
  document.getElementById("certHashPreview").classList.add("show");
  document.getElementById("certHashValue").textContent = "Calcul en cours…";
  document.getElementById("certBtn").disabled = true;

  const hash = await hashFile(file);
  currentCertHash = hash;
  document.getElementById("certHashValue").textContent = hash;
  document.getElementById("certBtn").disabled = false;
}

async function certify() {
  const meta = document.getElementById("certMeta").value.trim();
  const btn  = document.getElementById("certBtn");

  if (!currentCertHash) { showResult("certResult", "error", "Aucun fichier sélectionné"); return; }
  if (!meta)            { showResult("certResult", "error", "Description obligatoire"); return; }

  btn.disabled  = true;
  btn.innerHTML = `<div class="spinner"></div> <span class="loading-dots">En cours</span>`;
  showResult("certResult", "loading", "Connexion au wallet…", null);

  try {
    const contract = await getWriteContract();
    showResult("certResult", "loading", "En attente de signature MetaMask…", null);

    const tx = await contract.certify(currentCertHash, meta);
    showResult("certResult", "loading", "Transaction envoyée — confirmation en cours…", [
      ["Tx Hash", `<a class="tx-link" href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank">${tx.hash.slice(0, 18)}…${tx.hash.slice(-8)}</a>`]
    ]);

    const receipt = await tx.wait();
    const blk = receipt.blockNumber;

    showResult("certResult", "success", "Document certifié avec succès", [
      ["Hash doc",    currentCertHash, true],
      ["Description", meta, false],
      ["Émetteur",    await signer.getAddress(), true],
      ["Bloc",        "#" + blk, true],
      ["Tx",          `<a class="tx-link" href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank">${tx.hash.slice(0, 14)}…${tx.hash.slice(-6)} ↗</a>`]
    ]);

    updateBlockNumber();
  } catch (e) {
    const msg = e.reason || (e.message.includes("Already certified")
      ? "Ce document est déjà certifié"
      : e.message.slice(0, 120));
    showResult("certResult", "error", "Erreur : " + msg);
  }

  btn.disabled  = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Certifier sur la blockchain`;
}

function resetCertify() {
  currentCertHash = null;
  document.getElementById("certFile").value    = "";
  document.getElementById("certMeta").value    = "";
  document.getElementById("certFileInfo").classList.remove("show");
  document.getElementById("certHashPreview").classList.remove("show");
  document.getElementById("certBtn").disabled  = true;
  document.getElementById("certResult").className = "result-panel";
  document.getElementById("certResult").innerHTML  = "";
}

// ── Verify flow ───────────────────────────────────────────────────────────────
async function onVerFileSelected(input) {
  const file = input.files[0];
  if (!file) return;

  document.getElementById("verFileName").textContent = file.name;
  document.getElementById("verFileSize").textContent = formatBytes(file.size);
  document.getElementById("verFileInfo").classList.add("show");
  document.getElementById("verHashPreview").classList.add("show");
  document.getElementById("verHashValue").textContent = "Calcul en cours…";
  document.getElementById("verBtn").disabled = true;

  const hash = await hashFile(file);
  currentVerHash = hash;
  document.getElementById("verHashValue").textContent = hash;
  document.getElementById("verBtn").disabled = false;
}

async function verifyDoc() {
  if (!currentVerHash) { showResult("verResult", "error", "Aucun fichier sélectionné"); return; }

  const btn = document.getElementById("verBtn");
  btn.disabled  = true;
  btn.innerHTML = `<div class="spinner"></div> <span class="loading-dots">Interrogation</span>`;
  showResult("verResult", "loading", "Interrogation de la blockchain…", null);

  try {
    const contract = await getReadContract();
    const [issuer, timestamp, metadata, revoked] = await contract.verify(currentVerHash);
    const date = new Date(Number(timestamp) * 1000).toLocaleString("fr-FR", {
      day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });

    if (revoked) {
      showResult("verResult", "warning", "Certificat révoqué", [
        ["Hash",        currentVerHash, true],
        ["Description", metadata, false],
        ["Émetteur",    issuer, true],
        ["Certifié le", date, false],
        ["Statut",      "RÉVOQUÉ par l'émetteur", false]
      ]);
    } else {
      showResult("verResult", "success", "Document authentique — certifié sur la blockchain", [
        ["Hash",        currentVerHash, true],
        ["Description", metadata, false],
        ["Émetteur",    issuer, true],
        ["Certifié le", date, false],
        ["Statut",      "VALIDE", false]
      ]);
    }
  } catch (e) {
    if (e.message.includes("not certified") || e.message.includes("Not certified")) {
      showResult("verResult", "error", "Document non certifié — introuvable sur la blockchain", [
        ["Hash calculé", currentVerHash, true],
        ["Conclusion",   "Ce fichier n'a jamais été certifié, ou a été modifié.", false]
      ]);
    } else {
      showResult("verResult", "error", "Erreur : " + (e.reason || e.message.slice(0, 120)));
    }
  }

  btn.disabled  = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> Vérifier l'authenticité`;
}

function resetVerify() {
  currentVerHash = null;
  document.getElementById("verFile").value    = "";
  document.getElementById("verFileInfo").classList.remove("show");
  document.getElementById("verHashPreview").classList.remove("show");
  document.getElementById("verBtn").disabled  = true;
  document.getElementById("verResult").className = "result-panel";
  document.getElementById("verResult").innerHTML  = "";
}

// ── Drag-and-drop ─────────────────────────────────────────────────────────────
["certDropzone", "verDropzone"].forEach(id => {
  const el = document.getElementById(id);

  el.addEventListener("dragover", e => {
    e.preventDefault();
    el.classList.add("drag-over");
  });

  el.addEventListener("dragleave", () => {
    el.classList.remove("drag-over");
  });

  el.addEventListener("drop", e => {
    e.preventDefault();
    el.classList.remove("drag-over");
    const input = el.querySelector("input[type=file]");
    if (e.dataTransfer.files.length) {
      const dt = new DataTransfer();
      dt.items.add(e.dataTransfer.files[0]);
      input.files = dt.files;
      input.dispatchEvent(new Event("change"));
    }
  });
});

// ── Auto-connect if already authorized ───────────────────────────────────────
window.addEventListener("load", async () => {
  if (window.ethereum) {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts.length) connectWallet();
  }
});
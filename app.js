import { auth, db } from './firebase-config.js';
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    deleteDoc,
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Data Management
let transactions = [];
let budget = 5000;
let userUID = null;
let currentMode = localStorage.getItem('expenseTrackerMode') || 'daily';

// Elements
const balanceEl = document.getElementById('total-balance');
const incomeEl = document.getElementById('total-income');
const expenseEl = document.getElementById('total-expense');
const transactionListEl = document.getElementById('transaction-list');
const transactionForm = document.getElementById('transaction-form');
const budgetEl = document.getElementById('budget-val');
const dateDisplayEl = document.getElementById('date-display');

// =============================================
// MODE / TAB HELPERS
// =============================================

const MONTHS_FULL = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                      'Jul','Aug','Sep','Oct','Nov','Dec'];

/** Switch the active mode, update UI, and re-render */
function setMode(mode) {
    currentMode = mode;
    localStorage.setItem('expenseTrackerMode', mode);

    // Toggle active tab button
    document.querySelectorAll('.mode-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    updateDateDisplay();
    updateSummary();
    renderTransactions();

    // Also re-render full list if on transactions page
    if (typeof window.renderFullList === 'function') {
        window.renderFullList(transactions);
    }
}
window.setMode = setMode;

/** Update the date-display text based on currentMode */
function updateDateDisplay() {
    if (!dateDisplayEl) return;
    const now = new Date();
    let text = '';

    if (currentMode === 'daily') {
        text = MONTHS_FULL[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();
    } else if (currentMode === 'weekly') {
        const day = now.getDay();
        const diffToMon = (day === 0 ? -6 : 1 - day);
        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMon);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        text = MONTHS_SHORT[monday.getMonth()] + ' ' + monday.getDate()
             + ' \u2013 '
             + MONTHS_SHORT[sunday.getMonth()] + ' ' + sunday.getDate()
             + ', ' + sunday.getFullYear();
    } else {
        text = MONTHS_FULL[now.getMonth()] + ' ' + now.getFullYear();
    }
    dateDisplayEl.textContent = text;
}

/** Return { start, end } Date objects for the given mode */
function getDateRange(mode) {
    const now = new Date();
    let start, end;

    if (mode === 'daily') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (mode === 'weekly') {
        const day = now.getDay();
        const diffToMon = (day === 0 ? -6 : 1 - day);
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
    } else {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }
    return { start, end };
}

/** Parse a transaction's date string into a Date object */
function parseTransactionDate(dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d)) return d;
    return null;
}

/** Return only the transactions that fall within the current mode's date range */
function getFilteredTransactions() {
    const { start, end } = getDateRange(currentMode);
    return transactions.filter(t => {
        const d = parseTransactionDate(t.date);
        if (!d) return false;
        return d >= start && d <= end;
    });
}

// =============================================
// CORE FUNCTIONS
// =============================================

function init() {
    updateDateDisplay();
    updateSummary();
    renderTransactions();
    if (budgetEl) budgetEl.innerText = `$${budget.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

/** Update Summary Cards — uses filtered transactions for the active mode */
function updateSummary() {
    const filtered = getFilteredTransactions();
    const total = filtered.reduce((acc, item) => acc + item.amount, 0);
    const income = filtered
        .filter(item => item.amount > 0)
        .reduce((acc, item) => acc + item.amount, 0);
    const expense = filtered
        .filter(item => item.amount < 0)
        .reduce((acc, item) => acc + item.amount, 0) * -1;

    if (balanceEl) balanceEl.innerText = `$${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    if (incomeEl) incomeEl.innerText = `$${income.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    if (expenseEl) expenseEl.innerText = `$${expense.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    if (expense > budget) {
        sessionStorage.setItem('budgetWarningShown', 'true');
    }
}

/** Render Transactions — uses filtered transactions for the active mode */
function renderTransactions() {
    if (!transactionListEl) return;
    transactionListEl.innerHTML = '';

    const filtered = getFilteredTransactions();
    const displayList = filtered.slice(0, 5);

    if (displayList.length === 0) {
        const modeLabel = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
        transactionListEl.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No ${modeLabel.toLowerCase()} transactions yet.</p>`;
        return;
    }

    displayList.forEach(transaction => {
        const sign = transaction.amount < 0 ? '-' : '+';
        const colorClass = transaction.amount < 0 ? 'expense-text' : 'income-text';
        const icon = getCategoryIcon(transaction.category);

        const item = document.createElement('div');
        item.classList.add('transaction-item');
        item.innerHTML = `
            <div class="t-info">
                <div class="t-icon">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="t-details">
                    <h4>${transaction.description}</h4>
                    <p>${transaction.category} • ${transaction.date}</p>
                </div>
            </div>
            <div class="t-amount ${colorClass}">
                ${sign}$${Math.abs(transaction.amount).toFixed(2)}
            </div>
        `;
        transactionListEl.appendChild(item);
    });
}

function getCategoryIcon(cat) {
    const icons = {
        'Food': 'fa-utensils',
        'Travel': 'fa-plane',
        'Shopping': 'fa-shopping-cart',
        'Bills': 'fa-file-invoice',
        'Others': 'fa-ellipsis-h',
        'Salary': 'fa-money-bill-wave'
    };
    return icons[cat] || 'fa-dollar-sign';
}

// =============================================
// ADD TRANSACTION
// =============================================

async function saveTransactionCloud() {
    console.log("Save button clicked");

    if (!userUID) {
        const currentUser = auth.currentUser;
        if (currentUser) {
            userUID = currentUser.uid;
            console.log("Recovered userUID from auth.currentUser:", userUID);
        } else {
            console.error("No user logged in. userUID is null and auth.currentUser is null.");
            alert("Error: You must be logged in to save transactions.");
            return;
        }
    }

    const descEl = document.getElementById('desc');
    const amountEl = document.getElementById('amount');
    const typeEl = document.getElementById('type');
    const categoryEl = document.getElementById('category');
    const dateEl = document.getElementById('date');

    if (!descEl.value || !amountEl.value || !dateEl.value) {
        alert("Please fill in all required fields.");
        return;
    }

    const desc = descEl.value;
    const amountRaw = amountEl.value;
    const type = typeEl.value;
    const category = categoryEl.value;
    const dateRaw = dateEl.value;

    const dateObj = new Date(dateRaw);
    const formattedDate = dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

    const amountValue = Number(amountRaw);
    const amount = type === 'expense' ? -Math.abs(amountValue) : Math.abs(amountValue);

    const newExpense = {
        description: desc,
        amount: amount,
        category: category,
        date: formattedDate,
        createdAt: new Date()
    };

    console.log("Saving to Firestore path:", `users/${userUID}/transactions`);
    console.log("Data:", newExpense);

    try {
        const docRef = await addDoc(collection(db, 'users', userUID, 'transactions'), newExpense);
        console.log("SUCCESS: Transaction saved with ID:", docRef.id);

        if (transactionForm) transactionForm.reset();
        document.getElementById('date').valueAsDate = new Date();
        closeModal('add-modal');
    } catch (error) {
        console.error("FIRESTORE ERROR:", error.code, error.message);
        if (error.code === 'permission-denied') {
            alert("Permission Denied: Please check your Firestore Security Rules and ensure you are logged in correctly.\n\nCurrent UID: " + userUID);
        } else {
            alert("Error saving transaction: " + error.message);
        }
    }
}
window.saveTransactionCloud = saveTransactionCloud;

// =============================================
// MODAL HANDLERS
// =============================================

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

// =============================================
// AUTH & DATA SYNC
// =============================================

onAuthStateChanged(auth, async (user) => {
    const path = window.location.pathname;
    const isLandingPage = path === '/' || path.endsWith('index.html');
    const isAuthPage = path.endsWith('auth.html');

    if (user) {
        userUID = user.uid;
        if (isAuthPage) window.location.href = 'dashboard.html';

        // Sync Transactions
        const q = query(collection(db, 'users', userUID, 'transactions'), orderBy('createdAt', 'desc'));
        onSnapshot(q, (snapshot) => {
            transactions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            updateSummary();
            if (typeof window.renderFullList === 'function') {
                window.renderFullList(transactions);
            } else {
                renderTransactions();
            }

            // Expose filtering helpers for transactions page
            window._expenseTrackerData = {
                transactions: transactions,
                getDateRange: getDateRange,
                parseTransactionDate: parseTransactionDate,
                getCurrentMode: () => currentMode
            };

            if (typeof window.renderCharts === 'function') window.renderCharts(transactions);
        });

        // Fetch Budget Settings
        const settingsDoc = await getDoc(doc(db, 'users', userUID, 'settings', 'general'));
        if (settingsDoc.exists()) {
            budget = settingsDoc.data().budget || 5000;
        } else {
            await setDoc(doc(db, 'users', userUID, 'settings', 'general'), { budget: 5000 });
        }

        init();
    } else {
        if (!isLandingPage && !isAuthPage) {
            window.location.href = 'auth.html';
        }
    }
});

async function logout() {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error("Logout failed: ", error);
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

async function saveBudget(val) {
    try {
        budget = parseFloat(val);
        await setDoc(doc(db, 'users', userUID, 'settings', 'general'), { budget: budget });
        updateSummary();
        if (typeof window.renderCharts === 'function') window.renderCharts(transactions);
        return true;
    } catch (error) {
        console.error("Error saving budget: ", error);
        return false;
    }
}

// Expose functions to window for onclick attributes
window.logout = logout;
window.openModal = openModal;
window.closeModal = closeModal;
window.toggleSidebar = toggleSidebar;
window.init = init;
window.saveBudget = saveBudget;
window.deleteTransaction = async (id) => {
    if (confirm('Delete this transaction?')) {
        try {
            await deleteDoc(doc(db, 'users', userUID, 'transactions', id));
        } catch (error) {
            console.error("Error deleting transaction: ", error);
        }
    }
};

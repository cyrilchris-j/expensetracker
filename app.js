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

// Elements
const balanceEl = document.getElementById('total-balance');
const incomeEl = document.getElementById('total-income');
const expenseEl = document.getElementById('total-expense');
const transactionListEl = document.getElementById('transaction-list');
const transactionForm = document.getElementById('transaction-form');
const budgetEl = document.getElementById('budget-val');

// Initialize Dashboard
function init() {
    updateSummary();
    renderTransactions();
    if (budgetEl) budgetEl.innerText = `$${budget.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

// Update Summary Cards
function updateSummary() {
    const total = transactions.reduce((acc, item) => acc + item.amount, 0);
    const income = transactions
        .filter(item => item.amount > 0)
        .reduce((acc, item) => acc + item.amount, 0);
    const expense = transactions
        .filter(item => item.amount < 0)
        .reduce((acc, item) => acc + item.amount, 0) * -1;

    if (balanceEl) balanceEl.innerText = `$${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    if (incomeEl) incomeEl.innerText = `$${income.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    if (expenseEl) expenseEl.innerText = `$${expense.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    // Check budget
    if (expense > budget) {
        sessionStorage.setItem('budgetWarningShown', 'true');
    }
}

// Render Transactions (Dashboard View)
function renderTransactions() {
    if (!transactionListEl) return;
    transactionListEl.innerHTML = '';

    const displayList = transactions.slice().slice(0, 5); // Firebase query already handles order

    if (displayList.length === 0) {
        transactionListEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No transactions yet.</p>';
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

// Add Transaction
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

        // Reset and close
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

// Modal Handlers
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

// Auth Check & Data Sync
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

            if (typeof window.renderCharts === 'function') window.renderCharts(transactions);
        });

        // Fetch Budget Settings
        const settingsDoc = await getDoc(doc(db, 'users', userUID, 'settings', 'general'));
        if (settingsDoc.exists()) {
            budget = settingsDoc.data().budget || 5000;
        } else {
            // Initialize budget in Firestore if it doesn't exist
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

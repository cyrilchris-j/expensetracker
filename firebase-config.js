// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDCloyWqHDdUnEXcMsk_yWY6gXnifJ58eQ",
    authDomain: "expensetracker-1e632.firebaseapp.com",
    projectId: "expensetracker-1e632",
    storageBucket: "expensetracker-1e632.firebasestorage.app",
    messagingSenderId: "710595552108",
    appId: "1:710595552108:web:6fa9724987cd2c56090949",
    measurementId: "G-9KNTHRJ5EX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);
